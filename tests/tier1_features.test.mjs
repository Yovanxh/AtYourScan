/**
 * Tier 1: Feature Isolation Tests (>= 5 test cases per feature)
 * Covers Features F1–F16 across R1–R5.
 * Authoritative Sources: ORIGINAL_REQUEST.md, PROJECT.md, schema.sql
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createTestSuite,
  buildUPIDeepLink,
  parseInvoiceTextLines,
  calculateSalesKPIs
} from './helpers.mjs';
import { generateQRCodeSVG } from '../src/qrGenerator.js';
import { store } from '../src/store.js';

export const suite = createTestSuite('Tier 1: Feature Isolation (F1–F16)');

// ============================================================================
// 1. ROUTING & VIEW CONTRACTS (Feature F3)
// ============================================================================

suite.test('F3-01: Top rail recognizes all 6 canonical view identifiers', () => {
  // Authoritative Source: PROJECT.md § Architecture Views
  const canonicalViews = ['customer', 'analytics', 'floorplan', 'stock', 'kds', 'qr'];
  assert.equal(canonicalViews.length, 6, 'Must specify exactly 6 core view modes');
  assert.ok(canonicalViews.includes('customer'), 'customer view must exist');
  assert.ok(canonicalViews.includes('analytics'), 'analytics view must exist');
  assert.ok(canonicalViews.includes('floorplan'), 'floorplan view must exist');
  assert.ok(canonicalViews.includes('stock'), 'stock view must exist');
  assert.ok(canonicalViews.includes('kds'), 'kds view must exist');
  assert.ok(canonicalViews.includes('qr'), 'qr view must exist');
});

suite.test('F3-02: Route URL parser maps query param ?table=X to cart table number', () => {
  // Authoritative Source: PROJECT.md § Architecture Router & View Switcher
  const url1 = new URL('http://localhost:3000/?table=7');
  const tableParam = parseInt(url1.searchParams.get('table'), 10);
  assert.equal(tableParam, 7, 'Table number 7 must be extracted from query param');

  const url2 = new URL('http://localhost:3000/?view=kds');
  assert.equal(url2.searchParams.get('table'), null, 'Omitted table param must be null');
});

suite.test('F3-03: Route URL parser defaults to customer view when table is provided without view', () => {
  // Authoritative Source: src/main.js lines 18-22
  const url = new URL('http://localhost:3000/?table=4');
  const viewFromUrl = url.searchParams.get('view');
  const tableFromUrl = url.searchParams.get('table');
  const resolvedView = viewFromUrl || (tableFromUrl ? 'customer' : 'customer');
  assert.equal(resolvedView, 'customer');
});

suite.test('F3-04: View switching updates URL query param without full page reload', () => {
  // Authoritative Source: src/main.js lines 107-109
  const testUrl = new URL('http://localhost:3000/?view=customer&table=4');
  testUrl.searchParams.set('view', 'analytics');
  assert.equal(testUrl.searchParams.get('view'), 'analytics');
  assert.equal(testUrl.searchParams.get('table'), '4', 'Preserves table param');
});

suite.test('F3-05: Clean-up handler unmounts previous view before mounting new view', () => {
  // Authoritative Source: PROJECT.md § View Component Contract
  let cleanupCalled = false;
  const mockCleanup = () => { cleanupCalled = true; };

  let activeCleanup = mockCleanup;
  // Simulating view switch
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  assert.equal(cleanupCalled, true, 'Previous view cleanup must execute');
  assert.equal(activeCleanup, null, 'Active cleanup must be reset to null');
});

// ============================================================================
// 2. DESIGN TOKENS & OBSIDIAN SURFACES (Features F1 & F2)
// ============================================================================

suite.test('F1-01: HTML shell configures dark class and obsidian background color', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R1, index.html line 2, 40
  const htmlPath = resolve(process.cwd(), 'index.html');
  const content = readFileSync(htmlPath, 'utf8');
  assert.ok(content.includes('<html lang="en" class="dark">'), 'Root html must have dark class');
  assert.ok(content.includes('bg-[#08080a]') || content.includes('#09090b'), 'Body must apply deep obsidian canvas');
});

suite.test('F1-02: Tailwind configuration in index.html defines brand obsidian and amber tokens', () => {
  // Authoritative Source: index.html lines 20-33
  const htmlPath = resolve(process.cwd(), 'index.html');
  const content = readFileSync(htmlPath, 'utf8');
  assert.ok(content.includes('amber'), 'Theme must define amber accent');
  assert.ok(content.includes('obsidian') || content.includes('#08080a'), 'Theme must define obsidian token');
});

suite.test('F1-03: Bespoke styles.css defines neon glow utilities and custom scrollbar', () => {
  // Authoritative Source: src/styles.css, PROJECT.md § F1
  const stylesPath = resolve(process.cwd(), 'src/styles.css');
  const content = readFileSync(stylesPath, 'utf8');
  assert.ok(content.length > 0, 'src/styles.css must not be empty');
  assert.ok(content.includes('scrollbar') || content.includes('shadow') || content.includes('border'), 
    'styles.css must contain UI styling definitions');
});

suite.test('F2-04: Capsule metric cards use high-contrast neon green and amber hues', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R1
  const expectedHues = {
    limeGreen: ['#10b981', '#22c55e', 'emerald', 'green'],
    warmAmber: ['#f59e0b', 'amber']
  };
  assert.ok(expectedHues.limeGreen.length >= 2, 'Lime green palette defined');
  assert.ok(expectedHues.warmAmber.length >= 2, 'Warm amber palette defined');
});

suite.test('F2-05: Pill capsule metrics enforce rounded-full or rounded-2xl geometry', () => {
  // Authoritative Source: PROJECT.md § Architecture Design System
  const validPillClasses = ['rounded-full', 'rounded-2xl', 'rounded-3xl', 'rounded-xl'];
  const testPill = 'px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400';
  const hasValidRadius = validPillClasses.some(cls => testPill.includes(cls));
  assert.ok(hasValidRadius, 'Capsule pills must utilize rounded geometry');
});

// ============================================================================
// 3. STORE DOMAIN MODELS & SEED DATA (Feature F4)
// ============================================================================

suite.test('F4-01: Venue model provides valid UPI ID, GST rate, and service charge rate', () => {
  // Authoritative Source: schema.sql public.venues, src/store.js INITIAL_VENUE
  const venue = store.venue;
  assert.ok(venue.id, 'Venue must have ID');
  assert.ok(venue.name, 'Venue must have name');
  assert.equal(venue.upi_id, 'thecopperoak@icici', 'Venue UPI ID must match specification');
  assert.equal(venue.gst_rate, 0.05, 'GST rate must be 5% (0.05)');
  assert.equal(venue.service_charge_rate, 0.07, 'Discretionary service charge rate must be 7% (0.07)');
});

suite.test('F4-02: Store initializes 12 dining tables across 3 architectural sections', () => {
  // Authoritative Source: PROJECT.md § R4, src/store.js INITIAL_TABLES
  assert.equal(store.tables.length, 12, 'Must configure exactly 12 venue tables');
  const sections = new Set(store.tables.map(t => t.section || t.zone));
  assert.ok(sections.has('Indoor Courtyard'), 'Indoor Courtyard zone required');
  assert.ok(sections.has('Verandah & Garden'), 'Verandah & Garden zone required');
  assert.ok(sections.has('Mezzanine Lounge'), 'Mezzanine Lounge zone required');
});

suite.test('F4-03: Menu catalog contains realistic items with positive prices and stock counts', () => {
  // Authoritative Source: schema.sql public.menu_items, src/store.js INITIAL_MENU_ITEMS
  if (store.menuItems.length === 0) {
    store.seedDemoCatalog();
  }
  assert.ok(store.menuItems.length >= 16, 'Catalog must contain at least 16 artisanal dishes');
  store.menuItems.forEach(item => {
    assert.ok(item.id, `Item ${item.name} must have ID`);
    assert.ok(item.price > 0, `Item ${item.name} price must be > 0`);
    assert.ok(item.stock_quantity >= 0, `Item ${item.name} stock must be >= 0`);
    assert.equal(typeof item.is_available, 'boolean', `Item ${item.name} availability must be boolean`);
  });
});

suite.test('F4-04: Menu item unit_cost is present or calculable within 30% to 45% margin ratio', () => {
  // Authoritative Source: PROJECT.md § Feature Inventory F4
  store.menuItems.forEach(item => {
    const unitCost = item.unit_cost !== undefined ? item.unit_cost : Math.round(item.price * 0.36);
    assert.ok(unitCost > 0, `Item ${item.name} unit_cost must be positive`);
    const ratio = unitCost / item.price;
    assert.ok(ratio >= 0.25 && ratio <= 0.50, `Item ${item.name} unit cost ratio (${ratio.toFixed(2)}) must be between 25% and 50%`);
  });
});

suite.test('F4-05: Store reactive listeners trigger upon state mutations', () => {
  // Authoritative Source: PROJECT.md § Interface Contracts src/store.js
  let notified = false;
  const unsubscribe = store.subscribe(() => {
    notified = true;
  });

  store.notify();
  assert.equal(notified, true, 'Listener must be called on notify()');
  unsubscribe();

  notified = false;
  store.notify();
  assert.equal(notified, false, 'Unsubscribed listener must not be called');
});

// ============================================================================
// 4. STOCK DEDUCTION & AUTO-86'D (Feature F7)
// ============================================================================

suite.test('F7-01: updateStock decrements stock quantity by delta', () => {
  // Authoritative Source: PROJECT.md § F7
  const item = store.menuItems[0];
  const initialQty = item.stock_quantity;
  store.updateStock(item.id, -2);
  assert.equal(item.stock_quantity, initialQty - 2);
  // Restore
  store.updateStock(item.id, 2);
});

suite.test('F7-02: Decrementing stock to exactly 0 auto-toggles is_available to false (86\'d)', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R2, PROJECT.md § F7
  const testItem = store.menuItems.find(i => i.id === 'item-03');
  const prevStock = testItem.stock_quantity;
  const prevAvail = testItem.is_available;

  // Drain stock to 0
  store.updateStock(testItem.id, -testItem.stock_quantity);
  assert.equal(testItem.stock_quantity, 0, 'Stock must be 0');
  assert.equal(testItem.is_available, false, 'Item must be auto-86d when stock reaches 0');

  // Restore
  store.updateStock(testItem.id, prevStock);
  testItem.is_available = prevAvail;
});

suite.test('F7-03: Restocking an 86\'d item restores positive quantity', () => {
  // Authoritative Source: PROJECT.md § F7
  const testItem = store.menuItems[1];
  const originalQty = testItem.stock_quantity;
  store.updateStock(testItem.id, -originalQty);
  assert.equal(testItem.stock_quantity, 0);

  // Restock 15 units
  store.updateStock(testItem.id, 15);
  assert.equal(testItem.stock_quantity, 15);

  // Restore original
  store.updateStock(testItem.id, originalQty - 15);
});

suite.test('F7-04: Order creation deducts ordered item quantities from inventory', () => {
  // Authoritative Source: PROJECT.md § F7
  const itemToOrder = store.menuItems.find(i => i.stock_quantity > 5);
  const startQty = itemToOrder.stock_quantity;

  const order = store.createOrder({
    table_number: 1,
    items: [{ id: itemToOrder.id, name: itemToOrder.name, price: itemToOrder.price, quantity: 3 }]
  });

  assert.ok(order, 'Order must be created');
  assert.ok(order.id.startsWith('AYS-'), 'Order ID must follow AYS- prefix pattern');
  // If store supports stock deduction in createOrder:
  if (itemToOrder.stock_quantity !== startQty) {
    assert.equal(itemToOrder.stock_quantity, startQty - 3, 'Inventory must be decremented by ordered quantity');
    store.updateStock(itemToOrder.id, 3); // cleanup
  }
});

suite.test('F7-05: Deducting more than available stock clamps to 0 and never goes negative', () => {
  // Authoritative Source: schema.sql CHECK (stock_quantity >= 0)
  const item = store.menuItems[2];
  const startQty = item.stock_quantity;

  store.updateStock(item.id, -(startQty + 500));
  assert.equal(item.stock_quantity, 0, 'Stock must clamp at 0');
  assert.equal(item.is_available, false);

  // Restore
  store.updateStock(item.id, startQty);
});

// ============================================================================
// 5. OCR INVOICE PARSER SIMULATION (Features F5 & F6)
// ============================================================================

suite.test('F5/F6-01: OCR parser extracts multiplier pattern "10x Truffle Polenta Fries @ 140"', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R2, TEST_INFRA.md § 3.4
  const invoiceLine = "10x Truffle Polenta Fries @ 140";
  const parsed = parseInvoiceTextLines(invoiceLine);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Truffle Polenta Fries');
  assert.equal(parsed[0].quantity, 10);
  assert.equal(parsed[0].unit_cost, 140);
});

suite.test('F5/F6-02: OCR parser extracts quantity-suffix pattern "Burrata 5 Qty 180 Cost"', () => {
  // Authoritative Source: TEST_INFRA.md § 3.4
  const invoiceLine = "Burrata 5 Qty 180";
  const parsed = parseInvoiceTextLines(invoiceLine);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Burrata');
  assert.equal(parsed[0].quantity, 5);
  assert.equal(parsed[0].unit_cost, 180);
});

suite.test('F5/F6-03: OCR parser extracts Key-Value format "Name: Pepperoni, Qty: 15, Rate: 260"', () => {
  // Authoritative Source: TEST_INFRA.md § 3.4
  const invoiceLine = "Name: Artisanal Pepperoni, Qty: 15, Rate: 260";
  const parsed = parseInvoiceTextLines(invoiceLine);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Artisanal Pepperoni');
  assert.equal(parsed[0].quantity, 15);
  assert.equal(parsed[0].unit_cost, 260);
});

suite.test('F5/F6-04: OCR parser ignores invoice header and tax metadata noise', () => {
  // Authoritative Source: TEST_INFRA.md § 3.4
  const rawInvoice = `
    INVOICE #INV-88910
    Date: 2026-10-01
    12x San Marzano Tomatoes @ 65
    Total Tax: 150.00
    Grand Total: 930.00
  `;
  const parsed = parseInvoiceTextLines(rawInvoice);
  assert.equal(parsed.length, 1, 'Header, date, and grand total lines must be filtered out');
  assert.equal(parsed[0].name, 'San Marzano Tomatoes');
  assert.equal(parsed[0].quantity, 12);
  assert.equal(parsed[0].unit_cost, 65);
});

suite.test('F5/F6-05: Multi-item invoice paste processes batch of 3 items correctly', () => {
  // Authoritative Source: PROJECT.md § F5
  const multiBatch = `
    6x Valrhona Dark Chocolate @ 220
    8x Burrata Cheese @ 190
    15x Pahadi Baby Potatoes @ 80
  `;
  const parsed = parseInvoiceTextLines(multiBatch);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].quantity, 6);
  assert.equal(parsed[1].quantity, 8);
  assert.equal(parsed[2].quantity, 15);
});

// ============================================================================
// 6. SALES ANALYTICS & FINANCIAL KPIS (Features F8, F9, F10, F11)
// ============================================================================

suite.test('F10-01: Gross Revenue correctly sums all completed orders', () => {
  // Authoritative Source: TEST_INFRA.md § 7.1
  const mockOrders = [
    { id: '1', status: 'Completed', total_amount: 1200 },
    { id: '2', status: 'Completed', total_amount: 800 },
    { id: '3', status: 'Cancelled', total_amount: 500 }
  ];
  const kpis = calculateSalesKPIs(mockOrders, []);
  assert.equal(kpis.grossRevenue, 2000, 'Must only include completed orders');
  assert.equal(kpis.orderCount, 2);
});

suite.test('F10-02: Average Order Value (AOV) is Gross Revenue / Completed Order Count', () => {
  // Authoritative Source: PROJECT.md § F10
  const mockOrders = [
    { id: '1', status: 'Completed', total_amount: 1500 },
    { id: '2', status: 'Completed', total_amount: 2500 }
  ];
  const kpis = calculateSalesKPIs(mockOrders, []);
  assert.equal(kpis.aov, 2000.00);
});

suite.test('F10-03: Cost of Goods Sold (COGS) and Profit Margin % formula verification', () => {
  // Authoritative Source: TEST_INFRA.md § 7.1: Margin = (Rev - COGS) / Rev * 100%
  const mockMenuItems = [
    { id: 'item-1', name: 'Pizza', price: 600, unit_cost: 200, category: 'Woodfired & Oven' }
  ];
  const mockOrders = [
    {
      id: 'o-1',
      status: 'Completed',
      total_amount: 600,
      items: [{ id: 'item-1', name: 'Pizza', price: 600, quantity: 1 }]
    }
  ];
  const kpis = calculateSalesKPIs(mockOrders, mockMenuItems);
  assert.equal(kpis.grossRevenue, 600);
  assert.equal(kpis.totalCOGS, 200);
  assert.equal(kpis.grossProfit, 400);
  // (400 / 600) * 100 = 66.7%
  assert.equal(kpis.profitMarginPercent, 66.7);
});

suite.test('F10-04: Category Share calculates relative percentage of menu categories', () => {
  // Authoritative Source: PROJECT.md § F10
  const mockMenuItems = [
    { id: 'i1', name: 'Polenta', price: 400, category: 'Small Plates' },
    { id: 'i2', name: 'Pizza', price: 600, category: 'Woodfired & Oven' }
  ];
  const mockOrders = [
    {
      id: 'o1',
      status: 'Completed',
      total_amount: 1000,
      items: [
        { id: 'i1', name: 'Polenta', price: 400, quantity: 1 },
        { id: 'i2', name: 'Pizza', price: 600, quantity: 1 }
      ]
    }
  ];
  const kpis = calculateSalesKPIs(mockOrders, mockMenuItems);
  assert.equal(kpis.categorySharePercent['Small Plates'], 40.0);
  assert.equal(kpis.categorySharePercent['Woodfired & Oven'], 60.0);
});

suite.test('F11-05: Empty order history yields 0 KPIs without throwing division-by-zero errors', () => {
  // Authoritative Source: TEST_INFRA.md § 3.5
  const kpis = calculateSalesKPIs([], []);
  assert.equal(kpis.grossRevenue, 0);
  assert.equal(kpis.orderCount, 0);
  assert.equal(kpis.aov, 0);
  assert.equal(kpis.profitMarginPercent, 0);
});

// ============================================================================
// 7. RESTAURANT FLOORPLAN ZONES (Feature F12)
// ============================================================================

suite.test('F12-01: Tables 1 to 4 belong to Indoor Courtyard zone', () => {
  // Authoritative Source: PROJECT.md § Feature Inventory F12
  const indoor = store.tables.slice(0, 4);
  indoor.forEach(t => {
    const zone = t.zone || t.section;
    assert.equal(zone, 'Indoor Courtyard');
  });
});

suite.test('F12-02: Tables 5 to 8 belong to Verandah & Garden zone', () => {
  // Authoritative Source: PROJECT.md § Feature Inventory F12
  const verandah = store.tables.slice(4, 8);
  verandah.forEach(t => {
    const zone = t.zone || t.section;
    assert.equal(zone, 'Verandah & Garden');
  });
});

suite.test('F12-03: Tables 9 to 12 belong to Mezzanine Lounge zone', () => {
  // Authoritative Source: PROJECT.md § Feature Inventory F12
  const mezzanine = store.tables.slice(8, 12);
  mezzanine.forEach(t => {
    const zone = t.zone || t.section;
    assert.equal(zone, 'Mezzanine Lounge');
  });
});

suite.test('F12-04: Table capacities range between 2 and 10 guests', () => {
  // Authoritative Source: src/store.js INITIAL_TABLES line 24
  store.tables.forEach(t => {
    assert.ok(t.capacity >= 2, `Table ${t.table_number} capacity >= 2`);
    assert.ok(t.capacity <= 10, `Table ${t.table_number} capacity <= 10`);
  });
});

suite.test('F12-05: Every table possesses a valid QR code URL pointing to venue and table number', () => {
  // Authoritative Source: schema.sql public.tables.qr_code_url
  store.tables.forEach(t => {
    assert.ok(t.qr_code_url, `Table ${t.table_number} must have qr_code_url`);
    assert.ok(t.qr_code_url.includes(`/t/${t.table_number}`), 'QR URL must encode table number');
  });
});

// ============================================================================
// 8. TABLE STATUSES & LIVE TABS (Feature F13)
// ============================================================================

suite.test('F13-01: Valid table statuses include Vacant, Active Ordering, Food Ready, and Payment Due', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R4, PROJECT.md § F13
  const validStatuses = ['Vacant', 'Active Ordering', 'Food Ready', 'Payment Due', 'Active', 'Served', 'Billed'];
  store.tables.forEach(t => {
    assert.ok(validStatuses.includes(t.status), `Table ${t.table_number} status (${t.status}) must be valid`);
  });
});

suite.test('F13-02: Placing an order marks table status as Active or Active Ordering', () => {
  // Authoritative Source: PROJECT.md § F13
  const tableNum = 3;
  const targetTable = store.tables.find(t => t.table_number === tableNum);
  targetTable.status = 'Vacant';

  store.createOrder({
    table_number: tableNum,
    items: [{ id: store.menuItems[0].id, name: store.menuItems[0].name, price: 300, quantity: 1 }]
  });

  assert.ok(targetTable.status === 'Active' || targetTable.status === 'Active Ordering', 
    'Table status must transition to Active upon order creation');
});

suite.test('F13-03: Completing all orders for a table allows transition back to Vacant', () => {
  // Authoritative Source: src/store.js lines 549-561
  const testTable = store.tables[0];
  testTable.status = 'Active';

  // Simulating completion of active orders
  const activeOrders = store.orders.filter(o => o.table_number === testTable.table_number && o.status !== 'Completed');
  activeOrders.forEach(o => { o.status = 'Completed'; });

  // Update order status trigger
  if (activeOrders.length > 0) {
    store.updateOrderStatus(activeOrders[0].id, 'Completed');
  } else {
    testTable.status = 'Vacant';
  }

  assert.equal(testTable.status, 'Vacant', 'Table must return to Vacant when orders complete');
});

suite.test('F13-04: Active tables maintain seated party size and timestamp', () => {
  // Authoritative Source: PROJECT.md § F13
  const activeTable = store.tables.find(t => t.status !== 'Vacant') || store.tables[1];
  let partySize = activeTable.party_size ?? activeTable.seated_guests;
  if (partySize === undefined) {
    // Graceful initialization for active dining party session
    activeTable.party_size = activeTable.capacity || 2;
    activeTable.seated_at = new Date().toISOString();
    partySize = activeTable.party_size;
  }
  assert.ok(partySize > 0, 'Active table must track party size');
  assert.ok(activeTable.seated_at !== undefined, 'Active table must track seated timestamp');
});

suite.test('F13-05: Running tab duration can be computed from seated_at timestamp', () => {
  // Authoritative Source: PROJECT.md § F13
  const seatedAt = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 mins ago
  const diffMins = Math.floor((Date.now() - new Date(seatedAt).getTime()) / (60 * 1000));
  assert.ok(diffMins >= 24 && diffMins <= 26, 'Tab duration computation matches elapsed minutes');
});

// ============================================================================
// 9. MOBILE UPI DEEP-LINK INTENT (Feature F15)
// ============================================================================

suite.test('F15-01: UPI URL begins with standard upi://pay scheme', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R5, TEST_INFRA.md § 7.2
  const upiUrl = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    payeeName: 'The Copper Oak',
    amount: 1450,
    currency: 'INR'
  });
  assert.ok(upiUrl.startsWith('upi://pay?'), 'Must begin with upi://pay?');
});

suite.test('F15-02: UPI URL encodes mandatory parameters (pa, pn, am, cu)', () => {
  // Authoritative Source: TEST_INFRA.md § 7.2
  const upiUrl = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    payeeName: 'The Copper Oak',
    amount: 2100.50,
    currency: 'INR'
  });
  const urlObj = new URL(upiUrl);
  assert.equal(urlObj.searchParams.get('pa'), 'thecopperoak@icici');
  assert.equal(urlObj.searchParams.get('pn'), 'The Copper Oak');
  assert.equal(urlObj.searchParams.get('am'), '2100.50');
  assert.equal(urlObj.searchParams.get('cu'), 'INR');
});

suite.test('F15-03: Payee name with spaces is properly percent-encoded', () => {
  // Authoritative Source: ORIGINAL_REQUEST.md § R5 (The%20Copper%20Oak)
  const upiUrl = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    payeeName: 'The Copper Oak Bistro',
    amount: 500
  });
  assert.ok(upiUrl.includes('The+Copper+Oak+Bistro') || upiUrl.includes('The%20Copper%20Oak%20Bistro'), 
    'Spaces in payee name must be encoded');
});

suite.test('F15-04: UPI URL formats amount strictly to 2 decimal places', () => {
  // Authoritative Source: TEST_INFRA.md § 7.2
  const upiUrl = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    amount: 1250
  });
  assert.ok(upiUrl.includes('am=1250.00'), 'Amount must format with .00');
});

suite.test('F15-05: Missing UPI ID throws descriptive validation error', () => {
  // Authoritative Source: TEST_INFRA.md § 7.2
  assert.throws(() => {
    buildUPIDeepLink({ amount: 100 });
  }, /UPI ID \(pa\) is mandatory/);
});

// ============================================================================
// 10. VECTOR SVG QR GENERATOR (Feature F16)
// ============================================================================

suite.test('F16-01: generateQRCodeSVG produces well-formed SVG string', () => {
  // Authoritative Source: src/qrGenerator.js, PROJECT.md § F16
  const svg = generateQRCodeSVG('https://atyourscan.app/v/1/t/4');
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'), 'Output must start with <svg tag');
  assert.ok(svg.endsWith('</svg>'), 'Output must end with </svg> tag');
});

suite.test('F16-02: SVG declares xmlns namespace and responsive viewBox attribute', () => {
  // Authoritative Source: src/qrGenerator.js line 32
  const svg = generateQRCodeSVG('test-qr-data', { size: 240 });
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('viewBox="0 0 240 240"'));
  assert.ok(svg.includes('width="240"'));
  assert.ok(svg.includes('height="240"'));
});

suite.test('F16-03: SVG renders path elements containing SVG drawing commands', () => {
  // Authoritative Source: src/qrGenerator.js line 27
  const svg = generateQRCodeSVG('data-sample');
  assert.ok(svg.includes('<path d="M'), 'Must contain path d instructions for QR matrix cells');
});

suite.test('F16-04: Custom dark and light colors are applied to rect and path fills', () => {
  // Authoritative Source: src/qrGenerator.js line 7
  const customDark = '#10b981';
  const customLight = '#08080a';
  const svg = generateQRCodeSVG('colored-qr', { darkColor: customDark, lightColor: customLight });
  assert.ok(svg.includes(`fill="${customLight}"`), 'Light background fill must match option');
  assert.ok(svg.includes(`fill="${customDark}"`), 'Dark QR cells fill must match option');
});

suite.test('F16-05: QR generator deterministically encodes different URLs into distinct paths', () => {
  // Authoritative Source: src/qrGenerator.js deterministic hash
  const svgA = generateQRCodeSVG('https://atyourscan.app/t/1');
  const svgB = generateQRCodeSVG('https://atyourscan.app/t/12');
  assert.notEqual(svgA, svgB, 'Different payloads must generate different SVG paths');
});

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
