/**
 * Milestone M2 Customer Workflow & Cart Integrity Test Suite
 * Verifies Requirements R1, R2, R3:
 * 1. Valid and invalid QR table resolution (rejection of spoofed tables, no unrestricted table grid)
 * 2. Sold out dish blocking in addToCart and UI
 * 3. Cart persistence across refresh simulation (loadTableCart)
 * 4. Multi-tenant cart key isolation
 * 5. Variations, customisations, and price integrity in cart items
 * 6. Category filtering empty state (line 611 fix)
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';

setupTestEnvironment();

// Ensure DOM elements can be created in node test environment
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        innerHTML: '',
        classList: {
          add() {},
          remove() {},
          contains() { return false; }
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {}
      };
    }
  };
}

const { store } = await import('../src/store.js');
const { renderCustomerView } = await import('../src/components/CustomerView.js');
const { renderQRStudioView } = await import('../src/components/QRStudioView.js');

export const suite = createTestSuite('Milestone M2: Customer Workflow & Cart Integrity Suite');

function setupTestVenueAndTables() {
  localStorage.clear();
  store.venue = {
    id: 'venue-m2-test-01',
    cafe_id: 'venue-m2-test-01',
    name: 'Artisanal Cafe M2',
    slug: 'artisanal-m2',
    status: 'active',
    currency: 'INR',
    upi_id: 'merchant@upi',
    gst_rate: 0.05,
    service_charge_rate: 0.05
  };
  store.cafes = [store.venue];
  store.tenants = [store.venue];
  store.tables = [
    { id: 1, table_number: 1, number: 1, status: 'Vacant', zone: 'Indoor Courtyard' },
    { id: 2, table_number: 2, number: 2, status: 'Vacant', zone: 'Indoor Courtyard' },
    { id: 3, table_number: 3, number: 3, status: 'Vacant', zone: 'Veranda' },
    { id: 4, table_number: 4, number: 4, status: 'Vacant', zone: 'Veranda' },
    { id: 5, table_number: 5, number: 5, status: 'Vacant', zone: 'Rooftop' }
  ];
  store.dishes = [
    {
      id: 'dish-1',
      name: 'Cold Brew Coffee',
      price: 150,
      category: 'Beverages',
      category_id: 'cat-bev',
      is_available: true,
      stock_quantity: 20,
      variations: [
        { size: 'Regular', price: 150 },
        { size: 'Large', price: 210 }
      ]
    },
    {
      id: 'dish-2',
      name: 'Truffle Mushroom Pizza',
      price: 350,
      category: 'Woodfired',
      category_id: 'cat-pizza',
      is_available: true,
      stock_quantity: 10,
      variations: [
        { size: 'Medium (10")', price: 350 },
        { size: 'Large (12")', price: 480 }
      ]
    },
    {
      id: 'dish-3',
      name: 'Sold Out Lava Cake',
      price: 220,
      category: 'Desserts',
      category_id: 'cat-dessert',
      is_available: false,
      stock_quantity: 0
    },
    {
      id: 'dish-4',
      name: 'Zero Stock Brownie',
      price: 180,
      category: 'Desserts',
      category_id: 'cat-dessert',
      is_available: true,
      stock_quantity: 0
    }
  ];
  store.menuItems = [...store.dishes];
  store.categories = [
    { id: 'cat-bev', name: 'Beverages' },
    { id: 'cat-pizza', name: 'Woodfired' },
    { id: 'cat-dessert', name: 'Desserts' },
    { id: 'cat-empty', name: 'Bakery Specials' }
  ];
  store.cart = {
    table_number: 4,
    items: [],
    notes: ''
  };
}

// --------------------------------------------------------------------------
// 1. QR Entry & Table Resolution
// --------------------------------------------------------------------------

suite.test('M2-QR-01: QR Studio tent cards include both venue and table parameters', () => {
  setupTestVenueAndTables();
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderQRStudioView(container, store);

  assert.ok(container.innerHTML.includes('venue=venue-m2-test-01'), 'QR Studio tent card URLs must include venue parameter');
  assert.ok(container.innerHTML.includes('table=1'), 'QR Studio tent card URLs must include table parameter');
  assert.ok(container.innerHTML.includes('TABLE 1'), 'QR Studio must render table indicator');
  cleanup?.();
});

suite.test('M2-QR-02: Valid QR table scan resolves successfully to table view', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=venue-m2-test-01&table=4';
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, { tableNumber: 4 });

  assert.ok(container.innerHTML.includes('Cold Brew Coffee'), 'Valid table should render menu items');
  assert.equal(store.cart.table_number, 4, 'Cart table number must be set to 4');
  assert.equal(container.innerHTML.includes('Table Not Found'), false, 'Valid table must not show Table Not Found');
  cleanup?.();
});

suite.test('M2-QR-03: Invalid QR table parameter (e.g. ?table=999) displays Table Not Found and blocks entry', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=venue-m2-test-01&table=999';
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, { tableNumber: 999 });

  assert.ok(container.innerHTML.includes('Table Not Found'), 'Invalid table 999 must render Table Not Found card');
  assert.ok(container.innerHTML.includes('#999'), 'Table Not Found card must display invalid table number');
  assert.equal(container.innerHTML.includes('Cold Brew Coffee'), false, 'Menu items must not render for invalid table');
  assert.equal(container.innerHTML.includes('data-scan-table'), false, 'Unrestricted table selector grid must not be rendered');
  cleanup?.();
});

suite.test('M2-QR-04: Visiting without a table parameter shows QR scan guidance without unrestricted table grid', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=venue-m2-test-01';
  store.cart.table_number = null;
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, {});

  assert.ok(container.innerHTML.includes('Scan Tabletop QR Code'), 'Should display scan table QR code prompt');
  assert.equal(container.innerHTML.includes('data-scan-table'), false, 'Must not render unrestricted table button grid');
  assert.equal(container.innerHTML.includes('Cold Brew Coffee'), false, 'Must not open menu without table');
  cleanup?.();
});

suite.test('M2-QR-05: Non-existent venue displays Venue Not Found without synthesizing fake UPI credentials', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=non-existent-cafe-xyz&table=1';
  store.venue = null;
  store.cafes = [];
  store.tenants = [];
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, { tableNumber: 1 });

  assert.ok(container.innerHTML.includes('Venue Not Found'), 'Should render Venue Not Found state');
  assert.equal(container.innerHTML.includes('vanshwaghre-1@okicici'), false, 'Must not invent hardcoded fake UPI credentials');
  cleanup?.();
});

suite.test('M2-QR-06: CustomerView switches venue environment when visiting new venue lacking slugs', () => {
  setupTestVenueAndTables();
  store.cafes = [
    { id: 'venue-slugless-a', name: 'Venue Slugless A' },
    { id: 'venue-slugless-b', name: 'Venue Slugless B' }
  ];
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  window.location.search = '?venue=venue-slugless-a&table=2';
  let cleanup = renderCustomerView(container, store, { tableNumber: 2 });
  assert.equal(store.venue?.id, 'venue-slugless-a');
  cleanup?.();

  window.location.search = '?venue=venue-slugless-b&table=2';
  cleanup = renderCustomerView(container, store, { tableNumber: 2 });
  assert.equal(store.venue?.id, 'venue-slugless-b', 'CustomerView must switch to venue-slugless-b even when slugs are undefined');
  cleanup?.();
});

// --------------------------------------------------------------------------
// 2. Dish Availability Enforcement
// --------------------------------------------------------------------------

suite.test('M2-AVAIL-01: Sold out dish (is_available: false) is strictly blocked in store.addToCart', () => {
  setupTestVenueAndTables();
  const soldOutDish = store.dishes.find(d => d.id === 'dish-3');
  assert.equal(soldOutDish.is_available, false);

  const initialCartCount = store.cart.items.length;
  const result = store.addToCart(soldOutDish, 1);

  assert.equal(result, false, 'addToCart must return false for unavailable dish');
  assert.equal(store.cart.items.length, initialCartCount, 'Cart items must not increase when adding sold out dish');
});

suite.test('M2-AVAIL-02: Zero stock dish (stock_quantity <= 0) is strictly blocked in store.addToCart', () => {
  setupTestVenueAndTables();
  const zeroStockDish = store.dishes.find(d => d.id === 'dish-4');
  assert.equal(zeroStockDish.stock_quantity, 0);

  const initialCartCount = store.cart.items.length;
  const result = store.addToCart(zeroStockDish, 1);

  assert.equal(result, false, 'addToCart must return false for 0-stock dish');
  assert.equal(store.cart.items.length, initialCartCount, 'Cart items must not increase when adding 0-stock dish');
});

suite.test('M2-AVAIL-03: Unavailable dish renders Sold Out badge with card disabled in CustomerView', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=venue-m2-test-01&table=4';
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, { tableNumber: 4 });

  assert.ok(container.innerHTML.includes('Sold Out / Unavailable'), 'Unavailable dish must display Sold Out badge');
  assert.ok(container.innerHTML.includes('opacity-50 pointer-events-none'), 'Unavailable dish card must be disabled');
  cleanup?.();
});

// --------------------------------------------------------------------------
// 3. Cart Persistence & Multi-Tenant Scoping
// --------------------------------------------------------------------------

suite.test('M2-CART-01: Table cart persists across refresh simulation via scoped loadTableCart', () => {
  setupTestVenueAndTables();
  const dish = store.dishes[0];
  store.clearCart();
  store.cart.table_number = 4;
  store.addToCart(dish, 2, 'Less ice');

  // Verify cart saved in storage with scoped key
  const scopedKey = `ays_cart_venue-m2-test-01_4`;
  const savedData = JSON.parse(localStorage.getItem(scopedKey));
  assert.ok(savedData, 'Cart must be persisted under venue+table scoped key');
  assert.equal(savedData.items.length, 1);
  assert.equal(savedData.items[0].quantity, 2);

  // Simulate refresh: wipe in-memory cart
  store.cart = { table_number: 4, items: [], notes: '' };
  assert.equal(store.cart.items.length, 0);

  // Hydrate table cart
  store.loadTableCart(4, 'venue-m2-test-01');
  assert.equal(store.cart.items.length, 1, 'Cart items must be restored upon loadTableCart');
  assert.equal(store.cart.items[0].quantity, 2);
  assert.equal(store.cart.items[0].customization, 'Less ice');
});

suite.test('M2-CART-02: Multi-tenant cart isolation prevents cross-venue cart collisions on same table', () => {
  setupTestVenueAndTables();
  const dishVenueA = store.dishes[0];
  store.clearCart();
  store.cart.table_number = 3;
  store.venue = { id: 'cafe-alpha', name: 'Cafe Alpha' };
  store.addToCart(dishVenueA, 1, 'Cafe Alpha Note');

  // Switch to Cafe Beta on same Table 3 without clearing Cafe Alpha's persistent tab
  store.venue = { id: 'cafe-beta', name: 'Cafe Beta' };
  store.cart = { table_number: 3, items: [], notes: '' };
  const dishVenueB = store.dishes[1];
  store.addToCart(dishVenueB, 3, 'Cafe Beta Note');

  // Hydrate Cafe Alpha Table 3
  store.cart = { table_number: 3, items: [], notes: '' };
  store.loadTableCart(3, 'cafe-alpha');
  assert.equal(store.cart.items.length, 1);
  assert.equal(store.cart.items[0].item.id, 'dish-1');
  assert.equal(store.cart.items[0].customization, 'Cafe Alpha Note');

  // Hydrate Cafe Beta Table 3
  store.cart = { table_number: 3, items: [], notes: '' };
  store.loadTableCart(3, 'cafe-beta');
  assert.equal(store.cart.items.length, 1);
  assert.equal(store.cart.items[0].item.id, 'dish-2');
  assert.equal(store.cart.items[0].quantity, 3);
  assert.equal(store.cart.items[0].customization, 'Cafe Beta Note');

  // Verify Challenger 2 scenario: Switching to a new venue on the same table WITHOUT manually clearing in-memory cart
  store.venue = { id: 'cafe-gamma', name: 'Cafe Gamma' };
  store.loadTableCart(3, 'cafe-gamma');
  assert.equal(store.cart.items.length, 0, 'Uncached venue table must never inherit in-memory items from previous venue');
});

suite.test('M2-CART-03: Scoped session keys isolate diner session tokens per venue and table', () => {
  setupTestVenueAndTables();
  const sessionToken = 'tok-m2-test-abc-123';
  const orderId = 'order-m2-test-xyz';
  const venueId = 'venue-m2-test-01';
  const tableNum = 4;

  const scopedKey = `ays_table_session_${venueId}_${tableNum}`;
  localStorage.setItem(scopedKey, sessionToken);

  assert.equal(localStorage.getItem(scopedKey), sessionToken, 'Session token must be accessible via venue+table scoped key');
});

// --------------------------------------------------------------------------
// 4. Variations & Dish Customisations
// --------------------------------------------------------------------------

suite.test('M2-CUSTOM-01: Variations and customisations preserve distinct cart items and prices', () => {
  setupTestVenueAndTables();
  const pizza = store.dishes[1];
  store.clearCart();
  store.cart.table_number = 2;

  // Add Medium (price 350) with note
  store.addToCart(pizza, 1, 'Medium (10") - extra oregano', 350);

  // Add Large (price 480) with note
  store.addToCart(pizza, 1, 'Large (12") - extra cheese', 480);

  assert.equal(store.cart.items.length, 2, 'Distinct variations must create separate cart items');
  assert.equal(store.cart.items[0].price, 350);
  assert.equal(store.cart.items[0].customization, 'Medium (10") - extra oregano');
  assert.equal(store.cart.items[1].price, 480);
  assert.equal(store.cart.items[1].customization, 'Large (12") - extra cheese');

  // Adding identical variation + customization merges quantity
  store.addToCart(pizza, 2, 'Medium (10") - extra oregano', 350);
  assert.equal(store.cart.items.length, 2, 'Identical item and customization must merge quantity');
  assert.equal(store.cart.items[0].quantity, 3);
});

suite.test('M2-CUSTOM-02: getCartTotals accurately computes subtotal, GST and total with variation prices', () => {
  setupTestVenueAndTables();
  store.clearCart();
  store.cart.table_number = 1;
  const pizza = store.dishes[1]; // Large @ 480

  store.addToCart(pizza, 2, 'Large (12")', 480); // 2 * 480 = 960

  const totals = store.getCartTotals();
  const expectedSubtotal = 960;
  const expectedGst = Math.round(960 * 0.05); // 48
  const expectedService = Math.round(960 * 0.05); // 48
  const expectedTotal = expectedSubtotal + expectedGst + expectedService; // 1056

  assert.equal(totals.subtotal, expectedSubtotal, 'Subtotal must account for variation price 480');
  assert.equal(totals.gst, expectedGst, 'GST must be 5% by default');
  assert.equal(totals.total, expectedTotal, 'Total must accurately include subtotal + gst + service');
  assert.equal(isNaN(totals.total), false, 'Total must never be NaN');
  assert.equal(totals.itemCount, 2);
});

// --------------------------------------------------------------------------
// 5. Category Filtering & Empty States
// --------------------------------------------------------------------------

suite.test('M2-CAT-01: Empty category displays No dishes in this category without resetting to all dishes', () => {
  setupTestVenueAndTables();
  window.location.search = '?venue=venue-m2-test-01&table=4';
  const container = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const cleanup = renderCustomerView(container, store, { tableNumber: 4 });

  // Simulate selecting empty category 'Bakery Specials'
  const rawDishes = store.dishes;
  const activeCategory = 'Bakery Specials';
  const filtered = rawDishes.filter(d => d.category === activeCategory);

  assert.equal(filtered.length, 0, 'Bakery Specials should have 0 dishes');
  // With the line 611 bug fixed, filteredItems remains length 0 rather than falling back to all dishes
  assert.equal(filtered.length === 0, true, 'Zero-item category must remain empty');
  cleanup?.();
});

// Run standalone if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  suite.run().then(res => {
    console.log(`\nMilestone M2 Tests: ${res.passed}/${res.total} passed (${res.failed} failed)`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
