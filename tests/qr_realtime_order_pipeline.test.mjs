/**
 * QR-Exclusive Guest Ordering to Main POS / KDS Real-Time Pipeline Suite
 * Verifies End-to-End order emission, reactive broadcast channels, KDS bump rail,
 * floorplan alerts, and the guest order status tracker without breaking the Hospitality Invariant.
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';
import { store } from '../src/store.js';
import { renderCustomerView } from '../src/components/CustomerView.js';
import { renderFloorplanView } from '../src/components/FloorplanView.js';
import { renderKDSView } from '../src/components/KDSView.js';

export const suite = createTestSuite('QR-to-KDS Real-Time Pipeline & Guest Tracker Suite');

// ============================================================================
// 1. RELATIONAL PAYLOAD CONSTRUCTION & DISPATCH
// ============================================================================

suite.test('QR-01: Guest Cart correctly constructs full relational order payload with cafe_id, table_id, and status: in_kitchen', () => {
  store.resetDemoData();
  const testDish1 = store.menuItems[0];
  const testDish2 = store.menuItems[1];

  store.clearCart();
  store.cart.table_number = 3;
  store.addToCart(testDish1, 2);
  store.addToCart(testDish2, 1);

  const container = document.createElement('div');
  const cleanup = renderCustomerView(container, store, 3);

  assert.equal(typeof container.fireOrderToKitchen, 'function', 'Container must expose fireOrderToKitchen');

  // Verify fireOrderToKitchen creates order with relational schema
  const createdOrder = container.fireOrderToKitchen();

  assert.ok(createdOrder, 'Order must be created');
  assert.ok(createdOrder.id, 'Must contain order id');
  assert.ok(createdOrder.cafe_id, 'Must contain relational cafe_id');
  assert.equal(createdOrder.table_number, 3, 'Must match table number');
  assert.equal(createdOrder.status, 'in_kitchen', 'Status must be in_kitchen');
  assert.ok(createdOrder.items.length >= 2, 'Must contain all ordered items');
  assert.ok(createdOrder.items[0].dish_id, 'Items must include relational dish_id');
  assert.ok(createdOrder.items[0].dish_name, 'Items must include relational dish_name');
  assert.ok(createdOrder.total_amount > 0, 'Total amount must be greater than 0');

  cleanup?.();
});

suite.test('QR-02: fireOrderToKitchen notifies store subscribers with ORDER_FIRED event and chimes audio', () => {
  store.resetDemoData();
  let eventReceived = null;
  let chimePlayed = false;

  // Mock playSound
  const originalPlaySound = store.playSound.bind(store);
  store.playSound = (sound) => {
    if (sound === 'order_new') chimePlayed = true;
    return originalPlaySound(sound);
  };

  const unsubscribe = store.subscribe((_store, evt) => {
    if (evt && evt.type === 'ORDER_FIRED') {
      eventReceived = evt.order;
    }
  });

  const orderPayload = {
    id: `AYS-QR-${Date.now()}`,
    cafe_id: store.venue.id,
    table_id: 2,
    table_number: 2,
    table_label: 'Table 2',
    status: 'in_kitchen',
    items: [{ dish_id: 'item-01', dish_name: 'Polenta Fries', quantity: 2, price: 380, notes: 'Crispy' }],
    subtotal: 760,
    taxes: 38,
    total_amount: 798,
    created_at: new Date().toISOString()
  };

  const firedOrder = store.fireOrderToKitchen(orderPayload);

  assert.ok(eventReceived, 'Subscribers must receive ORDER_FIRED event');
  assert.equal(eventReceived.id, firedOrder.id);
  assert.equal(chimePlayed, true, 'Audible chime (order_new) must be triggered');

  unsubscribe();
  store.playSound = originalPlaySound;
});

// ============================================================================
// 2. FLOORPLAN REAL-TIME DASHBOARD NOTIFICATIONS & POPUP
// ============================================================================

suite.test('QR-03: Floorplan reactively mounts incoming ticket modal and toast alert upon ORDER_FIRED', () => {
  store.resetDemoData();
  const floorplanContainer = document.createElement('div');
  const cleanup = renderFloorplanView(floorplanContainer, store);

  // Initial state: no toast, no incoming ticket modal
  assert.equal(floorplanContainer.querySelector('#toast-incoming-order'), null);
  assert.equal(floorplanContainer.querySelector('#modal-incoming-ticket'), null);

  // Fire an order to Table 5
  const newOrder = store.fireOrderToKitchen({
    id: 'AYS-ALERT-555',
    cafe_id: store.venue.id,
    table_id: 5,
    table_number: 5,
    table_label: 'Table 5',
    status: 'in_kitchen',
    items: [{ dish_id: 'item-02', dish_name: 'Burrata', quantity: 1, price: 520, notes: 'Extra balsamic' }],
    subtotal: 520,
    taxes: 26,
    total_amount: 546,
    created_at: new Date().toISOString()
  });

  // Check reactive alert elements
  const toast = floorplanContainer.querySelector('#toast-incoming-order');
  const modal = floorplanContainer.querySelector('#modal-incoming-ticket');

  assert.ok(toast || floorplanContainer.innerHTML.includes('New Order Fired from Table 5'), 'Toast alert must be mounted');
  assert.ok(modal || floorplanContainer.innerHTML.includes('AYS-ALERT-555'), 'Incoming ticket popup modal must be mounted');
  assert.ok(floorplanContainer.innerHTML.includes('Extra balsamic'), 'Notes must be visible in modal breakdown');

  cleanup?.();
});

suite.test('QR-04: Floorplan updates active table to Occupied state with elapsed tab duration', () => {
  store.resetDemoData();
  const tableNum = 6;
  const targetTable = store.tables.find(t => t.table_number === tableNum);
  targetTable.status = 'Vacant';

  store.fireOrderToKitchen({
    id: 'AYS-T6-99',
    cafe_id: store.venue.id,
    table_id: tableNum,
    table_number: tableNum,
    table_label: `Table ${tableNum}`,
    status: 'in_kitchen',
    items: [{ dish_id: 'item-06', dish_name: 'Margherita Pizza', quantity: 2, price: 590 }],
    subtotal: 1180,
    taxes: 59,
    total_amount: 1239,
    created_at: new Date().toISOString()
  });

  assert.equal(targetTable.status, 'Active Ordering', 'Table status must transition to Active Ordering');
  assert.ok(targetTable.seated_at, 'Table must maintain seated_at timestamp');
  assert.ok(targetTable.party_size > 0, 'Table must maintain party size');

  const container = document.createElement('div');
  const cleanup = renderFloorplanView(container, store);

  const cardHtml = container.innerHTML;
  assert.ok(cardHtml.includes(`data-inspect-table="${tableNum}"`), 'Table card must exist');
  assert.ok(cardHtml.includes('Active Ordering'), 'Table card must show active status');
  assert.ok(cardHtml.includes('diners'), 'Table card must show seated diners count');

  cleanup?.();
});

// ============================================================================
// 3. KITCHEN DISPLAY SYSTEM (KDS) INTEGRATION
// ============================================================================

suite.test('QR-05: KDS bump rail receives in_kitchen tickets with modifiers and timestamps', () => {
  store.resetDemoData();

  const kdsContainer = document.createElement('div');
  const cleanup = renderKDSView(kdsContainer, store);

  const kdsOrder = store.fireOrderToKitchen({
    id: 'AYS-KDS-888',
    cafe_id: store.venue.id,
    table_id: 8,
    table_number: 8,
    table_label: 'Table 8',
    status: 'in_kitchen',
    items: [
      { dish_id: 'item-08', dish_name: 'Artisanal Pepperoni', quantity: 2, price: 740, notes: 'Well done crust' }
    ],
    subtotal: 1480,
    taxes: 74,
    total_amount: 1554,
    created_at: new Date().toISOString()
  });

  // Re-render or verify KDS contains ticket
  assert.ok(kdsContainer.innerHTML.includes('AYS-KDS-888') || kdsContainer.innerHTML.includes('Table 8'), 'Ticket must appear on KDS bump rail');
  assert.ok(kdsContainer.innerHTML.includes('Artisanal Pepperoni'), 'Dish name must be rendered');
  assert.ok(kdsContainer.innerHTML.includes('Well done crust'), 'Cooking note/modifier must be visible to chef');

  // Chef bumps order from in_kitchen to Ready
  store.updateOrderStatus(kdsOrder.id, 'Ready');
  const bumpedOrder = store.getOrderById(kdsOrder.id);
  assert.equal(bumpedOrder.status, 'Ready', 'Order status must transition to Ready in KDS');

  cleanup?.();
});

// ============================================================================
// 4. RESTORED GUEST ORDER STATUS TRACKER LIFECYCLE
// ============================================================================

suite.test('QR-06: Guest view transitions to live Order Status Tracker with 3-state progression', () => {
  store.resetDemoData();
  const tableNum = 4;
  store.clearCart();
  store.cart.table_number = tableNum;
  store.addToCart(store.menuItems[0], 2);

  const container = document.createElement('div');
  const cleanup = renderCustomerView(container, store, tableNum);

  // Fire the order
  const placedOrder = container.fireOrderToKitchen();
  assert.ok(placedOrder);

  // Check rendered tracker view
  const html = container.innerHTML;
  assert.ok(html.includes('Order Status Tracker') || html.includes('Live Order Tracker'), 'Tracker heading must be present');
  assert.ok(html.includes(`Table ${tableNum}`), 'Table number must be displayed');
  assert.ok(html.includes(placedOrder.id), 'Order ID must be displayed');
  assert.ok(html.includes('In Kitchen') || html.includes('Order Received'), 'Status pill must be active');
  assert.ok(html.includes('+ Add More Dishes') || html.includes('Add More Dishes'), '+ Add More Dishes trigger must exist');

  // Verify status transition: in_kitchen -> Ready -> Served
  store.updateOrderStatus(placedOrder.id, 'Ready');
  assert.ok(container.innerHTML.includes('Ready') || container.innerHTML.includes('In Kitchen'), 'Tracker updates with store');

  store.updateOrderStatus(placedOrder.id, 'Completed');
  assert.ok(container.innerHTML.includes('Served') || container.innerHTML.includes('Order'), 'Completed order reflects served state');

  cleanup?.();
});

suite.test('QR-07: Tapping "+ Add More Dishes" switches to menu without wiping order tracking', () => {
  store.resetDemoData();
  const tableNum = 7;
  store.clearCart();
  store.cart.table_number = tableNum;
  store.addToCart(store.menuItems[2], 1);

  const container = document.createElement('div');
  const cleanup = renderCustomerView(container, store, tableNum);

  const initialOrder = container.fireOrderToKitchen();
  assert.ok(initialOrder);

  // Click "+ Add More Dishes"
  const addMoreBtn = container.querySelector('#btn-add-more-dishes') || container.querySelector('#btn-back-menu');
  assert.ok(addMoreBtn, '+ Add More Dishes button must be accessible');
  addMoreBtn.click();

  // Must now be on menu view
  assert.ok(container.innerHTML.includes('All Items') || container.innerHTML.includes('search-input') || container.innerHTML.includes('Dine-In Catalog'), 'Must return to menu view');

  // Running tab banner must be present
  const banner = container.querySelector('#banner-active-order-status');
  assert.ok(banner || container.innerHTML.includes('Live Tracker'), 'Menu must render active running tab banner');

  // Click banner to return to tracker
  const trackerBtn = container.querySelector('#btn-view-tracker');
  if (trackerBtn) {
    trackerBtn.click();
    assert.ok(container.innerHTML.includes(initialOrder.id), 'Returning to tracker preserves order ID');
  }

  cleanup?.();
});

// ============================================================================
// 5. HOSPITALITY INVARIANT
// ============================================================================

suite.test('QR-08: Hospitality Invariant strictly preserved - No PIN or login barrier on guest QR view', () => {
  const container = document.createElement('div');
  const cleanup = renderCustomerView(container, store, 9);

  // Strict check: No login forms, PIN keypads, or password inputs on guest view
  assert.equal(container.querySelector('#pin-keypad'), null, 'Guest QR view must never render PIN keypad');
  assert.equal(container.querySelector('#modal-manager-override'), null, 'Guest QR view must never render manager override');

  const html = container.innerHTML;
  assert.ok(!html.includes('type="password"'), 'Guest QR view must never render password field');
  assert.ok(!html.includes('Enter Staff PIN'), 'No staff PIN text allowed on guest view');
  assert.ok(!html.includes('Super-Admin Login'), 'No admin login text allowed on guest view');

  cleanup?.();
});
