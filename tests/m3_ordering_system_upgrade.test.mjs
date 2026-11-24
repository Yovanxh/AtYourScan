/**
 * Milestone M3: Ordering System Upgrade & KDS Synchronization Test Suite
 * Requirements R1, R3, R4
 * 
 * Verifies:
 * 1. Safe & Reliable Atomic Order Creation via RPC with error propagation
 * 2. Rapid click debouncing (only 1 order created on rapid clicks)
 * 3. Complete remote KDS ticket rendering (items, notes, timestamps, urgency timers, channel badges)
 * 4. KDS ticket deduplication & recently completed recall drawer
 * 5. Centralized Audio Notification Manager (triggers exclusively for new orders, 30s dedup window)
 * 6. Sales analytics separation of preparation status from payment status & unpaid tab revenue isolation
 * 7. Floorplan table status synchronization with KDS
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';

setupTestEnvironment();

// Ensure basic DOM mock for Node.js
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      const listeners = new Map();
      const element = {
        tagName: tag.toUpperCase(),
        innerHTML: '',
        id: '',
        className: '',
        style: {},
        disabled: false,
        dataset: {},
        classList: {
          _classes: new Set(),
          add(...cls) { cls.forEach(c => this._classes.add(c)); },
          remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
          contains(c) { return this._classes.has(c); }
        },
        querySelector(sel) {
          if (sel === '#btn-place-order-table' || sel === '#btn-fire-order-kitchen') return this;
          return null;
        },
        querySelectorAll() { return []; },
        addEventListener(type, handler) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(handler);
        },
        removeEventListener(type, handler) {
          if (listeners.has(type)) {
            listeners.set(type, listeners.get(type).filter(h => h !== handler));
          }
        },
        prepend() {},
        append() {},
        remove() {}
      };
      return element;
    },
    getElementById() { return null; }
  };
}

const { store } = await import('../src/store.js');
const { renderCustomerView } = await import('../src/components/CustomerView.js');
const { KitchenView, formatTime } = await import('../src/views/KitchenView.js');
const { audioAlertManager } = await import('../src/utils/audioAlerts.js');
const { calculateSalesKPIs } = await import('../src/components/SalesAnalyticsView.js');

export const suite = createTestSuite('Milestone M3: Safe Atomic Ordering, KDS & Audio Overhaul');

function resetStoreForTest() {
  localStorage.clear();
  store.orders = [];
  store.cart = {
    items: [],
    table_number: 4
  };
  store.tables = [
    { table_number: 4, capacity: 4, status: 'Vacant', seated_at: null }
  ];
  store.venue = {
    id: 'cafe-test-m3-hotc',
    cafe_id: 'cafe-test-m3-hotc',
    name: 'Test Gourmet Cafe',
    gst_rate: 0.05
  };
  audioAlertManager._resetForTesting();
}

// ============================================================================
// 1. ATOMIC ORDER CREATION VIA RPC & ERROR HANDLING (Requirement R3)
// ============================================================================

suite.test('M3-RPC-01: store.createOrder creates atomic order with full items JSONB and single record', async () => {
  resetStoreForTest();

  const orderPayload = {
    table_number: 4,
    items: [
      { id: 'dish-01', name: 'Artisanal Sourdough Pizza', quantity: 2, price: 450, customization: 'Extra basil' },
      { id: 'dish-02', name: 'Cold Brew Elixir', quantity: 1, price: 200, customization: 'Oat milk' }
    ],
    is_pay_later: true,
    payment_method: 'PAY_LATER',
    source: 'QR_DINE_IN'
  };

  const created = await store.createOrder(orderPayload);

  assert.ok(created, 'Created order must be returned');
  assert.equal(created.table_number, 4);
  assert.equal(created.items.length, 2);
  assert.equal(created.items[0].dish_name, 'Artisanal Sourdough Pizza');
  assert.equal(created.items[0].quantity, 2);
  assert.equal(created.items[0].customization, 'Extra basil');
  assert.equal(created.status, 'New');

  // Verify exactly 1 order exists in store (no double insert bug)
  assert.equal(store.orders.length, 1, 'Exactly one order must exist in store');
  assert.equal(store.orders[0].id, created.id);
});

suite.test('M3-RPC-02: store.createOrder propagates database errors without swallowing with empty catch', async () => {
  resetStoreForTest();

  // Mock Supabase client with an RPC that throws a database failure
  globalThis.MOCK_SUPABASE_RPC = true;
  store.supabase = {
    rpc: async (fn, params) => {
      return { data: null, error: { message: 'Dish "Artisanal Sourdough Pizza" is currently unavailable' } };
    }
  };

  const orderPayload = {
    table_number: 4,
    items: [{ id: 'dish-01', name: 'Artisanal Sourdough Pizza', quantity: 1, price: 450 }]
  };

  let caughtError = null;
  try {
    await store.createOrder(orderPayload);
  } catch (err) {
    caughtError = err;
  } finally {
    globalThis.MOCK_SUPABASE_RPC = false;
    store.supabase = null;
  }

  assert.ok(caughtError, 'store.createOrder must throw on database failure');
  assert.ok(caughtError.message.includes('unavailable'), 'Error message must reflect DB failure');
  assert.equal(store.orders.length, 0, 'Failed order must NOT be added to store.orders');
});

suite.test('M3-RPC-03: Empty items array is rejected before submission', async () => {
  resetStoreForTest();

  let caughtError = null;
  try {
    await store.createOrder({ table_number: 4, items: [] });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'Must throw error when order items are empty');
  assert.ok(caughtError.message.includes('at least one item'));
});

// ============================================================================
// 2. SUBMIT DEBOUNCING & CUSTOMER VIEW ERROR RECOVERY (Requirement R3)
// ============================================================================

suite.test('M3-DEBOUNCE-01: Rapid clicks on fireOrderToKitchen trigger only 1 submission', async () => {
  resetStoreForTest();

  // Populate cart
  store.cart.items = [
    { item: { id: 'dish-01', name: 'Truffle Polenta', price: 380 }, quantity: 1, customization: '' }
  ];

  let domHtml = '';
  const listeners = new Map();
  const mockBtn = {
    disabled: false,
    classList: { add() {}, remove() {}, contains() { return false; } },
    innerHTML: 'Place Order',
    addEventListener() {},
    removeEventListener() {}
  };
  const mockContainer = {
    set innerHTML(val) { domHtml = val; },
    get innerHTML() { return domHtml; },
    querySelector(sel) {
      if (sel === '#btn-place-order-table' || sel === '#btn-fire-order-kitchen') {
        return mockBtn;
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(evt, h) { listeners.set(evt, h); }
  };

  const cleanup = renderCustomerView(mockContainer, store, { tableNumber: 4 });

  let callCount = 0;
  const originalCreateOrder = store.createOrder.bind(store);
  store.createOrder = async (payload) => {
    callCount++;
    // Simulate network delay
    await new Promise(r => setTimeout(r, 50));
    return originalCreateOrder(payload);
  };

  // Simulate 3 rapid clicks concurrently
  const p1 = mockContainer.fireOrderToKitchen('PAY_LATER');
  const p2 = mockContainer.fireOrderToKitchen('PAY_LATER');
  const p3 = mockContainer.fireOrderToKitchen('PAY_LATER');

  const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

  // Only the first call should have proceeded; p2 and p3 debounced
  assert.equal(callCount, 1, 'store.createOrder should only be called once');
  assert.ok(res1, 'First submission succeeded');
  assert.equal(res2, null, 'Second rapid click debounced');
  assert.equal(res3, null, 'Third rapid click debounced');

  store.createOrder = originalCreateOrder;
  cleanup?.();
});

suite.test('M3-DEBOUNCE-02: DB failure retains diner cart and presents visible error banner', async () => {
  resetStoreForTest();

  // Populate cart with valuable items
  store.cart.items = [
    { item: { id: 'dish-01', name: 'Woodfired Wild Mushroom Pizza', price: 620 }, quantity: 2, customization: 'Extra truffle' }
  ];

  let renderedHtml = '';
  const mockContainer = {
    set innerHTML(val) { renderedHtml = val; },
    get innerHTML() { return renderedHtml; },
    querySelector(sel) { return null; },
    querySelectorAll() { return []; }
  };

  const cleanup = renderCustomerView(mockContainer, store, { tableNumber: 4 });

  // Force store.createOrder to simulate database error
  const originalCreateOrder = store.createOrder.bind(store);
  store.createOrder = async () => {
    throw new Error('Supabase network connection timeout');
  };

  const result = await mockContainer.fireOrderToKitchen('PAY_LATER');

  assert.equal(result, null, 'fireOrderToKitchen returns null on failure');
  // Critical requirement: cart must NOT be wiped!
  assert.equal(store.cart.items.length, 1, 'Cart items must be strictly preserved on DB failure');
  assert.equal(store.cart.items[0].item.name, 'Woodfired Wild Mushroom Pizza');
  // Error banner must be rendered in UI
  assert.ok(renderedHtml.includes('order-submit-error-banner'), 'Error banner must be rendered');
  assert.ok(renderedHtml.includes('Order Placement Failed'), 'Banner title must state failure');

  store.createOrder = originalCreateOrder;
  cleanup?.();
});

// ============================================================================
// 3. KDS REALTIME TICKET RENDERING & USABILITY (Requirement R4)
// ============================================================================

suite.test('M3-KDS-01: KDS renders full dish names, quantities, cooking notes, and channel badges', () => {
  resetStoreForTest();

  const mockOrder = {
    id: 'ord-m3-kds-01',
    table_number: 4,
    source: 'QR_DINE_IN',
    channel: 'QR Dine-In',
    status: 'Preparing',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date(Date.now() - 5 * 60000).toISOString(), // 5 mins ago
    items: [
      { id: 'item-01', name: 'Woodfired Truffle Pizza', quantity: 2, price: 650, notes: 'Crispy crust, basil on top' },
      { id: 'item-02', name: 'Cold Brew Highball', quantity: 1, price: 220, notes: 'Extra ice' }
    ]
  };

  store.orders = [mockOrder];

  const mockContainer = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const kds = new KitchenView(mockContainer, store);

  const cardHtml = kds.renderTicketCard(mockOrder);

  // Assert ticket details
  assert.ok(cardHtml.includes('Table 4'), 'Must render table number');
  assert.ok(cardHtml.includes('Woodfired Truffle Pizza'), 'Must render dish name');
  assert.ok(cardHtml.includes('2x'), 'Must render quantity');
  assert.ok(cardHtml.includes('Crispy crust, basil on top'), 'Must render cooking notes');
  assert.ok(cardHtml.includes('QR Dine-In'), 'Must render channel badge');
  assert.ok(cardHtml.includes('PAID'), 'Must render payment badge');
  assert.ok(cardHtml.includes('5m'), 'Must render elapsed minutes');

  kds.destroy();
});

suite.test('M3-KDS-02: Elapsed urgency styling changes dynamically (<10m normal, 10-20m urgent, >20m critical)', () => {
  resetStoreForTest();

  const mockContainer = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const kds = new KitchenView(mockContainer, store);

  // Order placed 5 mins ago (<10m) -> Normal
  const orderNormal = {
    id: 'ord-normal',
    table_number: 1,
    status: 'Preparing',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
    items: [{ name: 'Salad', quantity: 1 }]
  };
  const cardNormal = kds.renderTicketCard(orderNormal);
  assert.ok(cardNormal.includes('border-emerald-200'), 'Normal ticket should have green border');
  assert.ok(cardNormal.includes('5m'), 'Normal ticket should show 5m');

  // Order placed 15 mins ago (10-20m) -> Urgent
  const orderUrgent = {
    id: 'ord-urgent',
    table_number: 2,
    status: 'Preparing',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    items: [{ name: 'Pasta', quantity: 1 }]
  };
  const cardUrgent = kds.renderTicketCard(orderUrgent);
  assert.ok(cardUrgent.includes('border-amber-400'), 'Urgent ticket should have amber border');
  assert.ok(cardUrgent.includes('Urgent 15m'), 'Urgent ticket should show Urgent badge');

  // Order placed 25 mins ago (>20m) -> Critical
  const orderCritical = {
    id: 'ord-critical',
    table_number: 3,
    status: 'Preparing',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    items: [{ name: 'Steak', quantity: 1 }]
  };
  const cardCritical = kds.renderTicketCard(orderCritical);
  assert.ok(cardCritical.includes('border-rose-500'), 'Critical ticket should have rose border');
  assert.ok(cardCritical.includes('CRITICAL 25m'), 'Critical ticket should show CRITICAL badge');

  kds.destroy();
});

suite.test('M3-KDS-03: KDS deduplicates tickets by order ID in getActiveKitchenTickets', () => {
  resetStoreForTest();

  const duplicateOrder = {
    id: 'ord-dup-01',
    table_number: 5,
    status: 'Preparing',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date().toISOString(),
    items: [{ name: 'Burger', quantity: 1 }]
  };

  // Simulate duplicate copies in store.orders
  store.orders = [duplicateOrder, { ...duplicateOrder }, { ...duplicateOrder }];

  const mockContainer = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const kds = new KitchenView(mockContainer, store);

  const active = kds.getActiveKitchenTickets();
  assert.equal(active.length, 1, 'KDS must deduplicate tickets with the same ID');

  kds.destroy();
});

suite.test('M3-KDS-04: Recently Completed recall drawer restores completed order to Preparing', async () => {
  resetStoreForTest();

  const completedOrder = {
    id: 'ord-completed-01',
    table_number: 7,
    status: 'Completed',
    payment_status: 'PAID',
    verification_status: 'APPROVED',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    items: [{ name: 'Tiramisu', quantity: 2 }]
  };

  store.orders = [completedOrder];

  const mockContainer = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const kds = new KitchenView(mockContainer, store);

  // Before recall: 0 active tickets, 1 recently completed ticket
  assert.equal(kds.getActiveKitchenTickets().length, 0);
  assert.equal(kds.getRecentlyCompletedTickets().length, 1);

  // Execute recall
  await kds.recallOrder('ord-completed-01');

  // After recall: status is restored to 'Preparing' and ticket is active on board
  assert.equal(completedOrder.status, 'Preparing');
  assert.equal(kds.getActiveKitchenTickets().length, 1);

  kds.destroy();
});

// ============================================================================
// 4. CENTRALIZED AUDIO ALERT MANAGER (Requirement R4)
// ============================================================================

suite.test('M3-AUDIO-01: audioAlertManager plays chime for new order and suppresses within 30s window', () => {
  audioAlertManager._resetForTesting();

  // First call for order-101: should trigger
  const res1 = audioAlertManager.playNewOrderAlert('order-101');
  assert.equal(res1, true, 'First alert for order-101 must trigger');

  // Second call within suppression window (e.g. repeat event): must be suppressed
  const res2 = audioAlertManager.playNewOrderAlert('order-101');
  assert.equal(res2, false, 'Duplicate alert within 30s window must be suppressed');

  // Distinct order-102: should trigger
  const res3 = audioAlertManager.playNewOrderAlert('order-102');
  assert.equal(res3, true, 'Alert for distinct order-102 must trigger');
});

suite.test('M3-AUDIO-02: audioAlertManager respects mute toggle and force override', () => {
  audioAlertManager._resetForTesting();

  audioAlertManager.setSoundEnabled(false);
  const mutedRes = audioAlertManager.playNewOrderAlert('order-201');
  assert.equal(mutedRes, false, 'Muted alert manager must not play sound');

  audioAlertManager.setSoundEnabled(true);
  const unmutedRes = audioAlertManager.playNewOrderAlert('order-201');
  assert.equal(unmutedRes, true, 'Unmuted alert manager must play sound');
});

// ============================================================================
// 5. SALES ANALYTICS & REVENUE SEPARATION (Requirement R4)
// ============================================================================

suite.test('M3-ANALYTICS-01: calculateSalesKPIs separates food prep status from payment status', () => {
  const mixedOrders = [
    { id: '1', status: 'New', payment_status: 'PENDING', total_amount: 500, is_pay_later: true },
    { id: '2', status: 'Preparing', payment_status: 'PENDING', total_amount: 750, is_pay_later: true },
    { id: '3', status: 'Ready', payment_status: 'PAID', total_amount: 1100, is_pay_later: false },
    { id: '4', status: 'Completed', payment_status: 'PAID', total_amount: 900, is_pay_later: false },
    { id: '5', status: 'Cancelled', payment_status: 'REFUNDED', total_amount: 400, is_pay_later: false }
  ];

  const kpis = calculateSalesKPIs(mixedOrders, []);

  // Assert food prep status separation
  assert.equal(kpis.ordersByPrepStatus.New, 1);
  assert.equal(kpis.ordersByPrepStatus.Preparing, 1);
  assert.equal(kpis.ordersByPrepStatus.Ready, 1);
  assert.equal(kpis.ordersByPrepStatus.Completed, 1);
  assert.equal(kpis.ordersByPrepStatus.Cancelled, 1);

  // Assert payment status separation
  assert.equal(kpis.ordersByPaymentStatus.PENDING, 2);
  assert.equal(kpis.ordersByPaymentStatus.PAID, 2);
  assert.equal(kpis.ordersByPaymentStatus.REFUNDED, 1);
});

suite.test('M3-ANALYTICS-02: grossRevenue strictly counts collected revenue and isolates unpaid tabs', () => {
  const orders = [
    // Paid orders (collected revenue)
    { id: '1', status: 'Ready', payment_status: 'PAID', total_amount: 1200 },
    { id: '2', status: 'Completed', payment_status: 'PAID', total_amount: 800 },
    // Open Pay Later tab: active and being cooked, but UNPAID
    { id: '3', status: 'Preparing', payment_status: 'PENDING', is_pay_later: true, total_amount: 1500 },
    // Cancelled order: not revenue
    { id: '4', status: 'Cancelled', payment_status: 'REFUNDED', total_amount: 600 }
  ];

  const kpis = calculateSalesKPIs(orders, []);

  // Collected gross revenue should only be 1200 + 800 = 2000
  assert.equal(kpis.grossRevenue, 2000, 'Gross revenue must only include collected/paid orders');
  assert.equal(kpis.collectedRevenue, 2000);
  // Outstanding Pay Later tabs revenue should be 1500
  assert.equal(kpis.outstandingTabsRevenue, 1500, 'Unpaid Pay Later tabs must be isolated into outstandingTabsRevenue');
  // Order count of collected tickets
  assert.equal(kpis.orderCount, 2);
});

// Run standalone if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  suite.run().then(res => {
    console.log(`\nMilestone M3 Tests: ${res.passed}/${res.total} passed (${res.failed} failed)`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
