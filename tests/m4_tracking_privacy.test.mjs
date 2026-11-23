/**
 * Milestone M4 Customer Order Isolation, Persistence & Realtime Scope Test Suite
 * Verifies Requirements R1, R4, R5, R6:
 * 1. Customer order tracking isolation: Party A's orders are invisible to Party B on same table with different session token
 * 2. Order persistence across page refresh in store and view without flashing "No active orders"
 * 3. Realtime subscription is scoped by venue_id and discards cross-venue broadcasts
 * 4. Realtime cleanup tears down WebSocket listeners cleanly
 * 5. View unmount cleans up event listeners without ReferenceErrors or leaks
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';

setupTestEnvironment();

// DOM mock for container elements in Node.js
function createMockContainer() {
  const listeners = new Map();
  const container = {
    tagName: 'DIV',
    innerHTML: '',
    id: 'customer-app-root',
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); }
    },
    querySelector(selector) {
      if (selector === '#btn-refresh-active-view' || selector === '#btn-back-menu' || selector === '#btn-active-add-more') {
        return {
          addEventListener(type, fn) {
            if (!listeners.has(selector + ':' + type)) listeners.set(selector + ':' + type, []);
            listeners.get(selector + ':' + type).push(fn);
          },
          click() {
            (listeners.get(selector + ':click') || []).forEach(fn => fn({ currentTarget: this }));
          }
        };
      }
      return null;
    },
    querySelectorAll(selector) {
      return [];
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (listeners.has(type)) {
        listeners.set(type, listeners.get(type).filter(h => h !== handler));
      }
    }
  };
  return container;
}

const { store, ReactiveStore } = await import('../src/store.js');
const { renderCustomerView } = await import('../src/components/CustomerView.js');

export const suite = createTestSuite('Milestone M4: Tracking Isolation, Refresh Persistence & Realtime Cleanup Suite');

function setupTestVenue() {
  store.cleanupRealtime();
  localStorage.clear();
  store.venue = {
    id: 'venue-m4-01',
    cafe_id: 'venue-m4-01',
    name: 'Artisanal Cafe M4',
    slug: 'artisanal-m4',
    status: 'active',
    currency: 'INR',
    upi_id: 'merchant-m4@upi',
    gst_rate: 0.05,
    service_charge_rate: 0.05
  };
  store.cafes = [store.venue];
  store.tenants = [store.venue];
  store.tables = [
    { id: 1, table_number: 1, number: 1, status: 'Vacant', zone: 'Indoor' },
    { id: 4, table_number: 4, number: 4, status: 'Vacant', zone: 'Veranda' }
  ];
  store.dishes = [
    {
      id: 'dish-cold-brew',
      name: 'Cold Brew Coffee',
      price: 150,
      category: 'Beverages',
      category_id: 'cat-bev',
      is_available: true,
      stock_quantity: 20
    },
    {
      id: 'dish-pizza',
      name: 'Truffle Mushroom Pizza',
      price: 350,
      category: 'Woodfired',
      category_id: 'cat-pizza',
      is_available: true,
      stock_quantity: 10
    }
  ];
  store.menuItems = [...store.dishes];
  store.categories = [
    { id: 'cat-bev', name: 'Beverages' },
    { id: 'cat-pizza', name: 'Woodfired' }
  ];
  store.orders = [];
  store.cart = {
    table_number: 4,
    items: [],
    notes: ''
  };
}

// -------------------------------------------------------------
// Test 1: Order Isolation - Party A sees their own active order
// -------------------------------------------------------------
suite.test('M4-PRIVACY-01: Party A sees their own active order and items', async () => {
  setupTestVenue();

  const partyAToken = 'session-token-party-a-111';
  const orderA = {
    id: 'AYS-A101',
    venue_id: 'venue-m4-01',
    cafe_id: 'venue-m4-01',
    table_number: 4,
    table_id: 4,
    table_label: 'Table 4',
    status: 'Preparing',
    payment_method: 'PAY_LATER',
    payment_status: 'PENDING',
    verification_status: 'APPROVED',
    is_pay_later: true,
    session_token: partyAToken,
    items: [
      { id: 'dish-pizza', name: 'Truffle Mushroom Pizza', quantity: 2, price: 350, notes: 'Extra crispy' }
    ],
    total_amount: 770,
    created_at: new Date().toISOString()
  };
  store.orders = [orderA];

  // Party A has session token and active order ID in localStorage
  localStorage.setItem('ays_table_session_venue-m4-01_4', partyAToken);
  localStorage.setItem('ays_active_order_id_venue-m4-01_4', 'AYS-A101');

  window.location.search = '?venue=venue-m4-01&table=4';
  const container = createMockContainer();
  const unmount = renderCustomerView(container, store, { tableNumber: 4 });

  // Party A should see their active order
  assert.ok(container.innerHTML.includes('AYS-A101') || container.innerHTML.includes('A101'), 'Party A must see order ID');
  assert.ok(container.innerHTML.includes('Truffle Mushroom Pizza'), 'Party A must see their ordered dishes');
  assert.ok(container.innerHTML.includes('770.00'), 'Party A must see their total bill amount');

  unmount();
});

// -------------------------------------------------------------
// Test 2: Order Isolation - Party B on same table CANNOT see Party A's orders
// -------------------------------------------------------------
suite.test('M4-PRIVACY-02: Party B on same table CANNOT see Party A orders, items, or bill', async () => {
  setupTestVenue();

  const partyAToken = 'session-token-party-a-111';
  const orderA = {
    id: 'AYS-A101',
    venue_id: 'venue-m4-01',
    cafe_id: 'venue-m4-01',
    table_number: 4,
    table_id: 4,
    table_label: 'Table 4',
    status: 'Preparing',
    payment_method: 'PAY_LATER',
    payment_status: 'PENDING',
    verification_status: 'APPROVED',
    is_pay_later: true,
    session_token: partyAToken,
    items: [
      { id: 'dish-pizza', name: 'Truffle Mushroom Pizza', quantity: 2, price: 350, notes: 'Extra crispy' }
    ],
    total_amount: 770,
    created_at: new Date().toISOString()
  };
  store.orders = [orderA];

  // Party B visits on a new device (new distinct session token, or no active order)
  const partyBToken = 'session-token-party-b-999';
  localStorage.setItem('ays_table_session_venue-m4-01_4', partyBToken);
  // Party B does not own order A
  localStorage.removeItem('ays_active_order_id_venue-m4-01_4');
  localStorage.removeItem('ays_active_order_id');

  window.location.search = '?venue=venue-m4-01&table=4';
  const container = createMockContainer();
  const unmount = renderCustomerView(container, store, { tableNumber: 4 });

  // Party B MUST NOT see Party A's order ID, dish name, or bill amount!
  assert.strictEqual(container.innerHTML.includes('AYS-A101'), false, 'Party B must NOT see Party A order ID');
  assert.strictEqual(container.innerHTML.includes('Extra crispy'), false, 'Party B must NOT see Party A cooking notes');
  assert.strictEqual(container.innerHTML.includes('770.00'), false, 'Party B must NOT see Party A bill total');
  assert.strictEqual(container.innerHTML.includes('Orders (1)'), false, 'Party B must NOT see Party A Orders (1) pill');
  assert.strictEqual(container.innerHTML.includes('Live Tracker (1)'), false, 'Party B must NOT see Party A Live Tracker pill');

  // Party B should see the fresh menu to browse and order
  assert.ok(container.innerHTML.includes('Cold Brew Coffee') || container.innerHTML.includes('Explore Menu'), 'Party B should see fresh menu');

  unmount();
});

// -------------------------------------------------------------
// Test 3: Multiple Diners on same table each see only their own orders
// -------------------------------------------------------------
suite.test('M4-PRIVACY-03: Two diners with different session tokens on same table each see only their own orders', async () => {
  setupTestVenue();

  const tokenA = 'session-token-A';
  const tokenB = 'session-token-B';

  const orderA = {
    id: 'AYS-A101',
    venue_id: 'venue-m4-01',
    table_number: 4,
    status: 'Preparing',
    payment_method: 'PAY_LATER',
    session_token: tokenA,
    items: [{ id: 'dish-pizza', name: 'Truffle Mushroom Pizza', quantity: 1, price: 350 }],
    total_amount: 350,
    created_at: new Date().toISOString()
  };

  const orderB = {
    id: 'AYS-B202',
    venue_id: 'venue-m4-01',
    table_number: 4,
    status: 'Preparing',
    payment_method: 'PAY_LATER',
    session_token: tokenB,
    items: [{ id: 'dish-cold-brew', name: 'Cold Brew Coffee', quantity: 3, price: 150 }],
    total_amount: 450,
    created_at: new Date().toISOString()
  };

  store.orders = [orderA, orderB];

  // Check Party A perspective
  localStorage.setItem('ays_table_session_venue-m4-01_4', tokenA);
  localStorage.setItem('ays_active_order_id_venue-m4-01_4', 'AYS-A101');
  const containerA = createMockContainer();
  const unmountA = renderCustomerView(containerA, store, { tableNumber: 4 });

  assert.ok(containerA.innerHTML.includes('AYS-A101') || containerA.innerHTML.includes('A101'), 'Party A sees Order A');
  assert.strictEqual(containerA.innerHTML.includes('AYS-B202'), false, 'Party A does NOT see Order B');
  assert.strictEqual(containerA.innerHTML.includes('450.00'), false, 'Party A does NOT see Party B total');
  unmountA();

  // Check Party B perspective
  localStorage.setItem('ays_table_session_venue-m4-01_4', tokenB);
  localStorage.setItem('ays_active_order_id_venue-m4-01_4', 'AYS-B202');
  const containerB = createMockContainer();
  const unmountB = renderCustomerView(containerB, store, { tableNumber: 4 });

  assert.ok(containerB.innerHTML.includes('AYS-B202') || containerB.innerHTML.includes('B202'), 'Party B sees Order B');
  assert.strictEqual(containerB.innerHTML.includes('AYS-A101'), false, 'Party B does NOT see Order A');
  assert.strictEqual(containerB.innerHTML.includes('350.00'), false, 'Party B does NOT see Party A total');
  unmountB();
});

// -------------------------------------------------------------
// Test 4: Missing Items Fallback Does Not Steal from Other Orders
// -------------------------------------------------------------
suite.test('M4-PRIVACY-04: Active order does not borrow missing items from other orders on same table', async () => {
  setupTestVenue();

  const tokenA = 'session-token-A';
  const tokenB = 'session-token-B';

  const orderWithItems = {
    id: 'AYS-A101',
    venue_id: 'venue-m4-01',
    table_number: 4,
    status: 'Preparing',
    session_token: tokenA,
    items: [{ id: 'dish-pizza', name: 'Secret Pizza Delight', quantity: 1, price: 350 }],
    total_amount: 350,
    created_at: new Date().toISOString()
  };

  const orderWithoutItems = {
    id: 'AYS-B202',
    venue_id: 'venue-m4-01',
    table_number: 4,
    status: 'Preparing',
    session_token: tokenB,
    items: [], // empty items
    total_amount: 100,
    created_at: new Date().toISOString()
  };

  store.orders = [orderWithItems, orderWithoutItems];

  // Party B renders their order without items
  localStorage.setItem('ays_table_session_venue-m4-01_4', tokenB);
  localStorage.setItem('ays_active_order_id_venue-m4-01_4', 'AYS-B202');

  const container = createMockContainer();
  const unmount = renderCustomerView(container, store, { tableNumber: 4 });

  // Party B must NOT see Party A's "Secret Pizza Delight"!
  assert.strictEqual(container.innerHTML.includes('Secret Pizza Delight'), false, 'Must not borrow dishes from other party');
  unmount();
});

// -------------------------------------------------------------
// Test 5: Production Order Persistence Across Store Initialization
// -------------------------------------------------------------
suite.test('M4-REFRESH-01: ReactiveStore preserves orders from localStorage in production without wiping to []', async () => {
  localStorage.clear();
  localStorage.setItem('ays_prod_clean_purge_v5', 'true');

  const savedOrders = [
    {
      id: 'AYS-PROD-999',
      venue_id: 'cafe-hotc',
      table_number: 3,
      status: 'Preparing',
      payment_status: 'PAID',
      items: [{ name: 'Espresso', price: 120, quantity: 1 }],
      total_amount: 120
    }
  ];
  localStorage.setItem('ays_orders', JSON.stringify(savedOrders));

  // Temporarily simulate production environment (isTestEnv = false)
  const prevEnv = process.env.NODE_ENV;
  const prevGlobal = globalThis.IS_TEST_ENV;
  try {
    delete process.env.NODE_ENV;
    globalThis.IS_TEST_ENV = false;

    // Create a new ReactiveStore instance in production mode
    const prodStore = new ReactiveStore();

    // Verify orders were loaded and NOT wiped to []
    assert.ok(Array.isArray(prodStore.orders), 'orders must be an array');
    assert.strictEqual(prodStore.orders.length, 1, 'orders must not be wiped to empty [] in production');
    assert.strictEqual(prodStore.orders[0].id, 'AYS-PROD-999', 'order ID must match cached order');

    // Verify ays_orders in localStorage was not overwritten with []
    const rawStorage = localStorage.getItem('ays_orders');
    assert.ok(rawStorage && rawStorage.includes('AYS-PROD-999'), 'localStorage ays_orders must retain saved orders');
  } finally {
    process.env.NODE_ENV = prevEnv;
    globalThis.IS_TEST_ENV = prevGlobal;
  }
});

// -------------------------------------------------------------
// Test 6: Browser Refresh Immediately Renders Active Order
// -------------------------------------------------------------
suite.test('M4-REFRESH-02: Customer view immediately renders active order on refresh without flashing "No active orders"', async () => {
  setupTestVenue();

  const sessionToken = 'sess-refresh-777';
  const activeOrder = {
    id: 'AYS-REFRESH-1',
    venue_id: 'venue-m4-01',
    table_number: 4,
    status: 'Preparing',
    payment_method: 'PAY_LATER',
    payment_status: 'PENDING',
    verification_status: 'APPROVED',
    session_token: sessionToken,
    items: [{ id: 'dish-cold-brew', name: 'Cold Brew Coffee', quantity: 2, price: 150 }],
    total_amount: 300,
    created_at: new Date().toISOString()
  };

  store.orders = [activeOrder];
  localStorage.setItem('ays_orders', JSON.stringify([activeOrder]));
  localStorage.setItem('ays_table_session_venue-m4-01_4', sessionToken);
  localStorage.setItem('ays_active_order_id_venue-m4-01_4', 'AYS-REFRESH-1');

  window.location.search = '?venue=venue-m4-01&table=4';
  const container = createMockContainer();

  // Render view as if page just reloaded
  const unmount = renderCustomerView(container, store, { tableNumber: 4 });

  // Verify tracker renders immediately with order ID slice and dish items
  assert.ok(container.innerHTML.includes('RESH-1') || container.innerHTML.includes('AYS-REFRESH-1'), 'Must render active order ID');
  assert.ok(container.innerHTML.includes('Cold Brew Coffee'), 'Must render active order dishes');
  assert.strictEqual(container.innerHTML.includes('No Active Orders for Table 4'), false, 'Must NOT flash "No Active Orders"');

  unmount();
});

// -------------------------------------------------------------
// Test 7: Table Occupancy State Persists Across Reload
// -------------------------------------------------------------
suite.test('M4-REFRESH-03: Table occupancy and active_order_id persist across store reload when order is active', async () => {
  localStorage.clear();
  localStorage.setItem('ays_prod_clean_purge_v5', 'true');

  const activeOrders = [
    {
      id: 'AYS-OCC-01',
      venue_id: 'cafe-test',
      table_number: 4,
      status: 'Preparing',
      items: [{ name: 'Pizza', price: 200, quantity: 1 }]
    }
  ];
  localStorage.setItem('ays_orders', JSON.stringify(activeOrders));
  localStorage.setItem('ays_tables', JSON.stringify([
    { id: 4, table_number: 4, status: 'Occupied', active_order_id: 'AYS-OCC-01' }
  ]));

  const prevEnv = process.env.NODE_ENV;
  const prevGlobal = globalThis.IS_TEST_ENV;
  try {
    delete process.env.NODE_ENV;
    globalThis.IS_TEST_ENV = false;

    const prodStore = new ReactiveStore();
    const table4 = prodStore.tables.find(t => t.table_number === 4);
    assert.ok(table4, 'Table 4 must exist');
    assert.strictEqual(table4.status, 'Occupied', 'Table 4 must remain Occupied across reload');
    assert.strictEqual(table4.active_order_id, 'AYS-OCC-01', 'active_order_id must match active order');
  } finally {
    process.env.NODE_ENV = prevEnv;
    globalThis.IS_TEST_ENV = prevGlobal;
  }
});

// -------------------------------------------------------------
// Test 8: Realtime Subscription Scoping with venue_id Filter
// -------------------------------------------------------------
suite.test('M4-REALTIME-01: initRealtimeOrders scopes postgres_changes with venue_id filter', async () => {
  setupTestVenue();

  const channels = new Map();

  function getOrCreateChannel(name) {
    if (!channels.has(name)) {
      channels.set(name, {
        name,
        events: [],
        configs: [],
        callbacks: [],
        on(event, config, callback) {
          this.events.push(event);
          this.configs.push(config);
          this.callbacks.push(callback);
          return this;
        },
        subscribe(fn) {
          if (fn) fn('SUBSCRIBED');
          return this;
        },
        unsubscribe() {
          return this;
        }
      });
    }
    return channels.get(name);
  }

  const mockClient = {
    channel(name) {
      return getOrCreateChannel(name);
    },
    removeChannel(ch) {}
  };

  store.initRealtimeOrders('venue-m4-01', { force: true, client: mockClient });

  const ordersChannel = channels.get('orders-realtime-sync');
  assert.ok(ordersChannel, 'Channel orders-realtime-sync must be created');
  assert.strictEqual(ordersChannel.events[0], 'postgres_changes', 'Must listen to postgres_changes');
  assert.strictEqual(ordersChannel.configs[0].table, 'orders', 'Must target orders table');
  assert.strictEqual(ordersChannel.configs[0].filter, 'venue_id=eq.venue-m4-01', 'Must filter by venue_id=eq.venue-m4-01');

  store.cleanupRealtime();
});

// -------------------------------------------------------------
// Test 9: Realtime Broadcast Multi-Tenant Isolation
// -------------------------------------------------------------
suite.test('M4-REALTIME-02: Realtime callback discards broadcast events for different venue_id', async () => {
  setupTestVenue();

  let ordersRealtimeCallback = null;
  const mockClient = {
    channel(name) {
      return {
        on(event, config, callback) {
          if (name === 'orders-realtime-sync' && config.table === 'orders') {
            ordersRealtimeCallback = callback;
          }
          return this;
        },
        subscribe() { return this; },
        unsubscribe() { return this; }
      };
    },
    removeChannel() {}
  };

  store.initRealtimeOrders('venue-m4-01', { force: true, client: mockClient });
  assert.ok(typeof ordersRealtimeCallback === 'function', 'Orders realtime callback must be registered');

  const initialOrdersCount = store.orders.length;

  // Simulate an event arriving from ANOTHER restaurant (e.g. venue-stranger-99)
  ordersRealtimeCallback({
    eventType: 'INSERT',
    new: {
      id: 'AYS-STRANGER-1',
      venue_id: 'venue-stranger-99',
      table_number: 4,
      total_amount: 999,
      status: 'Preparing',
      items: [{ name: 'Stranger Dish', price: 999, quantity: 1 }]
    }
  });

  // Verify the stranger order was NOT added to store.orders!
  assert.strictEqual(store.orders.length, initialOrdersCount, 'Must discard events for other restaurants');
  assert.strictEqual(store.orders.some(o => o.id === 'AYS-STRANGER-1'), false, 'Stranger order must not exist in store');

  // Simulate an event arriving from the ACTIVE restaurant (venue-m4-01)
  ordersRealtimeCallback({
    eventType: 'INSERT',
    new: {
      id: 'AYS-OWN-1',
      venue_id: 'venue-m4-01',
      table_number: 4,
      total_amount: 250,
      status: 'Preparing',
      items: [{ name: 'Cold Brew', price: 250, quantity: 1 }]
    }
  });

  // Verify the restaurant's own order WAS processed
  assert.ok(store.orders.some(o => o.id === 'AYS-OWN-1'), 'Must accept orders for the active venue');

  store.cleanupRealtime();
});

// -------------------------------------------------------------
// Test 10: Realtime Cleanup Method Tears Down WebSocket Listeners
// -------------------------------------------------------------
suite.test('M4-REALTIME-03: cleanupRealtime unsubscribes and removes channels cleanly', async () => {
  setupTestVenue();

  let unsubscribed = false;
  let removedFromClient = false;

  const mockChannel = {
    on() { return this; },
    subscribe() { return this; },
    unsubscribe() {
      unsubscribed = true;
      return this;
    }
  };
  const mockClient = {
    channel() { return mockChannel; },
    removeChannel(ch) {
      if (ch === mockChannel) removedFromClient = true;
    }
  };

  store.initRealtimeOrders('venue-m4-01', { force: true, client: mockClient });
  assert.ok(store._ordersRealtimeChannel, 'Channel reference must exist');

  store.cleanupRealtime();

  assert.strictEqual(unsubscribed, true, 'Channel unsubscribe must be called');
  assert.strictEqual(removedFromClient, true, 'removeChannel must be called on client');
  assert.strictEqual(store._ordersRealtimeChannel, null, '_ordersRealtimeChannel must be set to null');
  assert.strictEqual(store._realtimeVenueId, null, '_realtimeVenueId must be set to null');
});

// -------------------------------------------------------------
// Test 11: View Unmount Cleans Up Event Listeners without ReferenceError
// -------------------------------------------------------------
suite.test('M4-CLEANUP-01: View unmount cleans up event listeners without ReferenceError: onOrderRejected is not defined', async () => {
  setupTestVenue();

  const registeredListeners = new Map();
  const origAddEventListener = window.addEventListener;
  const origRemoveEventListener = window.removeEventListener;

  window.addEventListener = (type, handler) => {
    if (!registeredListeners.has(type)) registeredListeners.set(type, new Set());
    registeredListeners.get(type).add(handler);
    origAddEventListener.call(window, type, handler);
  };

  window.removeEventListener = (type, handler) => {
    if (registeredListeners.has(type)) {
      registeredListeners.get(type).delete(handler);
    }
    origRemoveEventListener.call(window, type, handler);
  };

  try {
    const container = createMockContainer();
    const unmount = renderCustomerView(container, store, { tableNumber: 4 });

    // Verify listeners were added
    assert.ok(registeredListeners.has('ORDER_REJECTED'), 'ORDER_REJECTED listener was added');
    assert.strictEqual(registeredListeners.get('ORDER_REJECTED').size, 1, 'Exactly 1 ORDER_REJECTED listener registered');

    // Call unmount: must NOT throw ReferenceError: onOrderRejected is not defined!
    let unmountThrew = false;
    let unmountError = null;
    try {
      unmount();
    } catch (err) {
      unmountThrew = true;
      unmountError = err;
    }

    assert.strictEqual(unmountThrew, false, `Unmount threw an error: ${unmountError?.message}`);
    // Verify listeners were removed from window
    assert.strictEqual(registeredListeners.get('ORDER_REJECTED').size, 0, 'ORDER_REJECTED listener was removed on unmount');
    assert.strictEqual(registeredListeners.get('ORDER_STATUS_CHANGED')?.size || 0, 0, 'ORDER_STATUS_CHANGED removed on unmount');
  } finally {
    window.addEventListener = origAddEventListener;
    window.removeEventListener = origRemoveEventListener;
  }
});

// -------------------------------------------------------------
// Test 12: Multiple Renders Do Not Leak Duplicate Window Listeners
// -------------------------------------------------------------
suite.test('M4-CLEANUP-02: Repeated render() calls do not leak duplicate ORDER_REJECTED listeners onto window', async () => {
  setupTestVenue();

  let orderRejectedListenerCount = 0;
  const origAdd = window.addEventListener;
  const origRemove = window.removeEventListener;

  const currentHandlers = new Set();
  window.addEventListener = (type, handler) => {
    if (type === 'ORDER_REJECTED') {
      currentHandlers.add(handler);
      orderRejectedListenerCount = currentHandlers.size;
    }
    origAdd.call(window, type, handler);
  };
  window.removeEventListener = (type, handler) => {
    if (type === 'ORDER_REJECTED') {
      currentHandlers.delete(handler);
      orderRejectedListenerCount = currentHandlers.size;
    }
    origRemove.call(window, type, handler);
  };

  try {
    const container = createMockContainer();
    const unmount = renderCustomerView(container, store, { tableNumber: 4 });

    // Initial render should have exactly 1 listener
    assert.strictEqual(orderRejectedListenerCount, 1, 'Initial render must have 1 ORDER_REJECTED listener');

    // Trigger multiple store notifications / renders (simulating UI interaction)
    store.notify({ type: 'CART_UPDATED' });
    store.notify({ type: 'DISHES_UPDATED' });
    store.notify({ type: 'CART_UPDATED' });

    // Listener count should REMAIN 1, NOT increment to 4!
    assert.strictEqual(orderRejectedListenerCount, 1, 'Repeated renders must NOT leak duplicate event listeners');

    unmount();
    assert.strictEqual(orderRejectedListenerCount, 0, 'Unmount must clean up the listener');
  } finally {
    window.addEventListener = origAdd;
    window.removeEventListener = origRemove;
  }
});

// Run directly if invoked with node
if (process.argv[1] && process.argv[1].endsWith('m4_tracking_privacy.test.mjs')) {
  suite.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}
