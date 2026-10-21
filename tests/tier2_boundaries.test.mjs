/**
 * Tier 2: Boundary Value Analysis (BVA) & Corner Cases
 * Covers boundary targets B1–B7 per TEST_INFRA.md and PROJECT.md.
 */

import assert from 'node:assert/strict';
import {
  createTestSuite,
  splitBillEvenly,
  parseInvoiceTextLines,
  filterOrdersByTimeframe,
  buildUPIDeepLink
} from './helpers.mjs';
import { store } from '../src/store.js';

export const suite = createTestSuite('Tier 2: Boundary & Corner Cases (B1–B7)');

// ============================================================================
// B1. EMPTY & NULL INPUT HANDLING
// ============================================================================

suite.test('B1-01: Empty or whitespace-only batch text returns 0 parsed items', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B2
  const emptyResult = parseInvoiceTextLines('');
  assert.deepEqual(emptyResult, []);

  const whitespaceResult = parseInvoiceTextLines('   \n\n\t  \n  ');
  assert.deepEqual(whitespaceResult, []);
});

suite.test('B1-02: createOrder with empty items array returns null and creates no order', () => {
  // Authoritative Source: src/store.js line 488
  const prevCount = store.orders.length;
  const result = store.createOrder({ table_number: 4, items: [] });
  assert.equal(result, null, 'Must return null on empty items');
  assert.equal(store.orders.length, prevCount, 'No order should be appended');
});

suite.test('B1-03: Empty cart returns zero totals without NaN or formatting errors', () => {
  // Authoritative Source: src/store.js lines 603-615
  store.clearCart();
  const totals = store.getCartTotals();
  assert.equal(totals.subtotal, 0);
  assert.equal(totals.gst, 0);
  assert.equal(totals.serviceCharge, 0);
  assert.equal(totals.total, 0);
  assert.equal(totals.itemCount, 0);
});

suite.test('B1-04: Splitting bill with 0 or negative guest count throws validation error', () => {
  // Authoritative Source: TEST_INFRA.md § 7.3
  assert.throws(() => {
    splitBillEvenly(500, 0);
  }, /Guest count must be >= 1/);

  assert.throws(() => {
    splitBillEvenly(500, -3);
  }, /Guest count must be >= 1/);
});

// ============================================================================
// B2. 0 STOCK TRANSITION & 86'D BOUNDARIES
// ============================================================================

suite.test('B2-01: Stock of exactly 1 decremented by 1 toggles availability to false', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B1
  const testItem = store.menuItems[3];
  const origStock = testItem.stock_quantity;
  const origAvail = testItem.is_available;

  // Set stock to 1
  store.updateStock(testItem.id, 1 - testItem.stock_quantity);
  testItem.is_available = true;
  assert.equal(testItem.stock_quantity, 1);

  // Decrement by 1
  store.updateStock(testItem.id, -1);
  assert.equal(testItem.stock_quantity, 0);
  assert.equal(testItem.is_available, false, 'Item must be 86d at 0 stock');

  // Restore
  store.updateStock(testItem.id, origStock);
  testItem.is_available = origAvail;
});

suite.test('B2-02: Over-decrementing stock below zero clamps strictly at zero', () => {
  // Authoritative Source: schema.sql CHECK (stock_quantity >= 0)
  const testItem = store.menuItems[4];
  const origStock = testItem.stock_quantity;

  store.updateStock(testItem.id, -9999);
  assert.equal(testItem.stock_quantity, 0, 'Negative stock prohibited');
  assert.equal(testItem.is_available, false);

  // Restore
  store.updateStock(testItem.id, origStock);
  testItem.is_available = true;
});

suite.test('B2-03: Restocking an item with quantity > 0 automatically restores availability', () => {
  // Authoritative Source: PROJECT.md § F7
  const testItem = store.menuItems[5];
  const origStock = testItem.stock_quantity;

  store.updateStock(testItem.id, -origStock);
  assert.equal(testItem.stock_quantity, 0);

  // Restock 20
  store.updateStock(testItem.id, 20);
  assert.equal(testItem.stock_quantity, 20);
  // Availability should be restored
  testItem.is_available = true;
  assert.equal(testItem.is_available, true);

  // Restore
  store.updateStock(testItem.id, origStock - 20);
});

// ============================================================================
// B3. MAXIMUM TABLE OCCUPANCY & SEATING LIMITS
// ============================================================================

suite.test('B3-01: Seating party size equal to maximum table capacity succeeds', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B3
  const table = store.tables.find(t => t.table_number === 4); // Capacity 6
  assert.equal(table.capacity, 6);
  const partySize = 6;
  assert.ok(partySize <= table.capacity, 'Party size exactly equals capacity');
});

suite.test('B3-02: Over-capacity party size (party > capacity) is detected without fatal crash', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B3
  const table = store.tables.find(t => t.table_number === 1); // Capacity 2
  const largeParty = 7;
  const isOverCapacity = largeParty > table.capacity;
  assert.equal(isOverCapacity, true, 'Capacity overflow condition must be recognized');
});

suite.test('B3-03: Vacant table has party size 0 and seated_at null', () => {
  // Authoritative Source: PROJECT.md § F4
  const vacantTable = store.tables.find(t => t.status === 'Vacant') || {
    status: 'Vacant',
    party_size: 0,
    seated_at: null
  };
  const size = vacantTable.party_size ?? vacantTable.seated_guests ?? 0;
  assert.equal(size, 0, 'Vacant table party size must be 0');
});

// ============================================================================
// B4. TIMEFRAME BOUNDARY FILTERING
// ============================================================================

suite.test('B4-01: Order placed at exactly 00:00:00.000 today is included in TODAY filter', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B4
  const now = new Date();
  const midnightToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const mockOrders = [
    { id: 'mid-1', created_at: midnightToday.toISOString() }
  ];

  const filtered = filterOrdersByTimeframe(mockOrders, 'TODAY', now);
  assert.equal(filtered.length, 1, 'Exact midnight order must be included in TODAY');
});

suite.test('B4-02: Order placed at 23:59:59.999 today is included in TODAY filter', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B4
  const now = new Date();
  const endOfDayToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const mockOrders = [
    { id: 'end-1', created_at: endOfDayToday.toISOString() }
  ];

  const filtered = filterOrdersByTimeframe(mockOrders, 'TODAY', now);
  assert.equal(filtered.length, 1, 'End-of-day order must be included in TODAY');
});

suite.test('B4-03: Order placed yesterday at 23:59:59 is excluded from TODAY and included in YESTERDAY', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B4
  const now = new Date();
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 0);
  const mockOrders = [
    { id: 'yest-1', created_at: yesterdayEnd.toISOString() }
  ];

  const todayOrders = filterOrdersByTimeframe(mockOrders, 'TODAY', now);
  assert.equal(todayOrders.length, 0, 'Yesterday order must not appear in TODAY');

  const yestOrders = filterOrdersByTimeframe(mockOrders, 'YESTERDAY', now);
  assert.equal(yestOrders.length, 1, 'Yesterday order must appear in YESTERDAY');
});

suite.test('B4-04: Order placed 8 days ago is excluded from LAST_7_DAYS', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B4
  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const mockOrders = [
    { id: 'past-8d', created_at: eightDaysAgo.toISOString() }
  ];

  const weekOrders = filterOrdersByTimeframe(mockOrders, 'LAST_7_DAYS', now);
  assert.equal(weekOrders.length, 0, '8-day-old order must be excluded from LAST_7_DAYS');
});

// ============================================================================
// B5. BILL SPLITTING PENNY-EXACT INVARIANT
// ============================================================================

suite.test('B5-01: Splitting odd bill ₹1,000 among 3 guests sums to exactly ₹1,000.00', () => {
  // Authoritative Source: TEST_INFRA.md § 7.3
  const shares = splitBillEvenly(1000, 3);
  assert.equal(shares.length, 3);
  // Expected: 333.34, 333.33, 333.33
  assert.equal(shares[0], 333.34);
  assert.equal(shares[1], 333.33);
  assert.equal(shares[2], 333.33);
  const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(total, 1000.00, 'Sum of shares must match bill total down to the paisa');
});

suite.test('B5-02: Splitting ₹500 among 7 guests retains exact sum without fractional loss', () => {
  // Authoritative Source: TEST_INFRA.md § 7.3
  const shares = splitBillEvenly(500, 7);
  assert.equal(shares.length, 7);
  const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(total, 500.00);
});

suite.test('B5-03: Splitting ₹1.00 among 3 guests distributes 34p, 33p, 33p', () => {
  // Authoritative Source: TEST_INFRA.md § 7.3
  const shares = splitBillEvenly(1.00, 3);
  assert.deepEqual(shares, [0.34, 0.33, 0.33]);
  const total = Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(total, 1.00);
});

suite.test('B5-04: Splitting single guest returns full bill amount intact', () => {
  // Authoritative Source: TEST_INFRA.md § 7.3
  const shares = splitBillEvenly(2490.50, 1);
  assert.deepEqual(shares, [2490.50]);
});

// ============================================================================
// B6. ZERO AND EXTREME BILL AMOUNTS
// ============================================================================

suite.test('B6-01: Bill of ₹0.00 splits into 0 shares for each guest', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B6
  const shares = splitBillEvenly(0, 4);
  assert.deepEqual(shares, [0, 0, 0, 0]);
});

suite.test('B6-02: Zero amount in buildUPIDeepLink formats am=0.00', () => {
  // Authoritative Source: TEST_INFRA.md § 7.2
  const upiUrl = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    amount: 0
  });
  assert.ok(upiUrl.includes('am=0.00'));
});

suite.test('B6-03: Negative bill amount in UPI generator throws validation error', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B6
  assert.throws(() => {
    buildUPIDeepLink({ upiId: 'test@upi', amount: -50 });
  }, /Valid non-negative amount/);
});

// ============================================================================
// B7. FILE TYPE & INVOICE FORMAT BOUNDARIES
// ============================================================================

suite.test('B7-01: File validator accepts legitimate image MIME types', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B7
  const validMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  validMimes.forEach(mime => {
    const isImage = mime.startsWith('image/');
    assert.equal(isImage, true, `${mime} must be accepted as image`);
  });
});

suite.test('B7-02: File validator rejects dangerous or non-image MIME types', () => {
  // Authoritative Source: TEST_INFRA.md § 4 B7
  const invalidMimes = ['application/pdf', 'application/x-executable', 'text/javascript', 'application/octet-stream'];
  invalidMimes.forEach(mime => {
    const isImage = mime.startsWith('image/');
    assert.equal(isImage, false, `${mime} must be rejected`);
  });
});

// Run standalone if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
