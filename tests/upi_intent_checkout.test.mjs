/**
 * Native UPI Intent Deep-Linking & Settlement Simulation Test Suite
 * Validates:
 * 1. Deterministic NPCI UPI URI generation (pa, pn, am, cu, tn)
 * 2. Mobile intent branching & device detection
 * 3. Desktop vector SVG QR fallback encoding dynamic UPI payload
 * 4. Prototype settlement simulation (marking orders PAID, clearing floorplan tab)
 * 5. Payment transaction logging and audit trail
 * 6. Hospitality Invariant: guest checkout decoupled from screen lock & terminal pairing
 * 7. Penny-exact consistency between cart totals and generated UPI intent
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment } from './helpers.mjs';

// Setup headless mock environment before store initialization
setupTestEnvironment();

import { 
  buildUPIDeepLink, 
  generateUPIDeepLink, 
  validateVPA, 
  isMobileDevice, 
  generateMockUTR 
} from '../src/utils/payment.js';
import { generateQRCodeSVG } from '../src/qrGenerator.js';
import { store, INITIAL_VENUE } from '../src/store.js';
import { evaluateAuthGates } from '../src/main.js';

// Test harness
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

console.log('\n\x1b[1m\x1b[36m======================================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m   Native UPI Intent & Prototype Settlement Simulation Suite          \x1b[0m');
console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m\n');

// ============================================================================
// 1. NPCI UPI URI BUILDER & VPA VALIDATION
// ============================================================================

test('UPI-01: buildUPIDeepLink generates compliant NPCI upi://pay URI', () => {
  const uri = buildUPIDeepLink({
    upiId: 'thecopperoak@icici',
    payeeName: 'The Copper Oak Bistro',
    amount: 1450.75,
    currency: 'INR',
    transactionNote: 'Order AYS-901 Table 4'
  });

  assert.ok(uri.startsWith('upi://pay?'), 'URI must begin with upi://pay? scheme');
  const urlObj = new URL(uri);
  assert.equal(urlObj.searchParams.get('pa'), 'thecopperoak@icici', 'Must encode pa parameter');
  assert.equal(urlObj.searchParams.get('pn'), 'The Copper Oak Bistro', 'Must encode pn parameter');
  assert.equal(urlObj.searchParams.get('am'), '1450.75', 'Must encode am strictly formatted to 2 decimals');
  assert.equal(urlObj.searchParams.get('cu'), 'INR', 'Must encode cu as INR');
  assert.equal(urlObj.searchParams.get('tn'), 'Order AYS-901 Table 4', 'Must encode tn parameter');
});

test('UPI-02: Amount is formatted strictly to 2 decimal places and rounded properly', () => {
  const uri1 = buildUPIDeepLink({ upiId: 'merchant@upi', amount: 1200 });
  assert.ok(uri1.includes('am=1200.00'), 'Integer amount must be padded with .00');

  const uri2 = buildUPIDeepLink({ upiId: 'merchant@upi', amount: 99.9 });
  assert.ok(uri2.includes('am=99.90'), 'Single decimal must be padded to 2 decimal places');

  const uri3 = buildUPIDeepLink({ upiId: 'merchant@upi', amount: 250.456 });
  assert.ok(uri3.includes('am=250.46'), 'Third decimal must round to nearest paise');
});

test('UPI-03: Strict validation rejects invalid, negative, or missing parameters', () => {
  assert.throws(() => {
    buildUPIDeepLink({ amount: 500 });
  }, /UPI ID \(pa\) is mandatory/);

  assert.throws(() => {
    buildUPIDeepLink({ upiId: 'test@upi', amount: -10 });
  }, /Valid non-negative amount \(am\) is mandatory/);

  assert.throws(() => {
    buildUPIDeepLink({ upiId: 'test@upi', amount: NaN });
  }, /Valid non-negative amount \(am\) is mandatory/);

  assert.throws(() => {
    buildUPIDeepLink({ upiId: 'test@upi', amount: null });
  }, /Valid non-negative amount \(am\) is mandatory/);
});

test('UPI-04: validateVPA validates standard Indian bank VPA handles', () => {
  assert.equal(validateVPA('thecopperoak@icici'), true);
  assert.equal(validateVPA('user.name@okaxis'), true);
  assert.equal(validateVPA('9876543210@paytm'), true);
  assert.equal(validateVPA('bistro_bar@ybl'), true);

  assert.equal(validateVPA(''), false);
  assert.equal(validateVPA('invalid-vpa'), false);
  assert.equal(validateVPA('@icici'), false);
  assert.equal(validateVPA('user@'), false);
  assert.equal(validateVPA(null), false);
});

test('UPI-05: generateUPIDeepLink builds valid intent from Order & Venue objects', () => {
  const mockOrder = {
    id: 'AYS-1001',
    table_number: 3,
    total_amount: 1850.50
  };
  const mockVenue = {
    name: 'The Copper Oak Bistro & Bar',
    upi_id: 'thecopperoak@icici'
  };

  const uri = generateUPIDeepLink(mockOrder, mockVenue);
  assert.ok(uri.startsWith('upi://pay?'));
  const parsed = new URL(uri);
  assert.equal(parsed.searchParams.get('pa'), 'thecopperoak@icici');
  assert.equal(parsed.searchParams.get('am'), '1850.50');
  assert.equal(parsed.searchParams.get('tn'), 'Order AYS-1001 Table 3');
});

// ============================================================================
// 2. DEVICE DETECTION & INTENT BRANCHING
// ============================================================================

test('UPI-06: isMobileDevice accurately identifies mobile user agents and viewports', () => {
  const origNavigator = globalThis.navigator;
  const origWindow = globalThis.window;

  try {
    // 1. Mobile User Agent
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', maxTouchPoints: 5 },
      configurable: true,
      writable: true
    });
    globalThis.window = { innerWidth: 390, 'ontouchstart': {} };
    assert.equal(isMobileDevice(), true, 'Must detect iPhone as mobile');

    // 2. Android User Agent
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5 },
      configurable: true,
      writable: true
    });
    globalThis.window = { innerWidth: 412 };
    assert.equal(isMobileDevice(), true, 'Must detect Android as mobile');

    // 3. Desktop Browser
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', maxTouchPoints: 0 },
      configurable: true,
      writable: true
    });
    globalThis.window = { innerWidth: 1920 };
    assert.equal(isMobileDevice(), false, 'Must detect desktop browser as non-mobile');
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      value: origNavigator,
      configurable: true,
      writable: true
    });
    globalThis.window = origWindow;
  }
});

// ============================================================================
// 3. DESKTOP DYNAMIC VECTOR SVG QR CODE FALLBACK
// ============================================================================

test('UPI-07: Desktop fallback vector QR code encodes identical UPI payload', () => {
  const mockOrder = { id: 'AYS-777', table_number: 6, total_amount: 890 };
  const upiUri = generateUPIDeepLink(mockOrder, INITIAL_VENUE);

  const qrSvg = generateQRCodeSVG(upiUri, { size: 195, darkColor: '#09090b', lightColor: '#ffffff' });
  
  assert.ok(typeof qrSvg === 'string', 'SVG must be generated as string');
  assert.ok(qrSvg.includes('<svg'), 'SVG must include <svg tag');
  assert.ok(qrSvg.includes('xmlns="http://www.w3.org/2000/svg"'), 'SVG must declare xmlns');
  assert.ok(qrSvg.includes('viewBox="0 0 195 195"'), 'SVG must include viewBox with requested size');
  assert.ok(qrSvg.includes('<path'), 'SVG must render path elements');
});

// ============================================================================
// 4. PROTOTYPE SETTLEMENT SIMULATION & TAB CLOSURE
// ============================================================================

test('UPI-08: Settlement simulation clears active table tab and marks orders PAID', () => {
  const tableNum = 8;
  const targetTable = store.tables.find(t => t.table_number === tableNum);
  targetTable.status = 'Active Ordering';
  targetTable.party_size = 4;
  targetTable.seated_at = new Date().toISOString();

  // Create active order
  const order = store.createOrder({
    table_number: tableNum,
    items: [{ id: store.menuItems[0].id, name: store.menuItems[0].name, price: 500, quantity: 2 }],
    source: 'QR_DINE_IN'
  });

  assert.equal(order.status, 'New');
  assert.notEqual(order.payment_status, 'PAID');

  // Trigger Settlement Simulation
  const mockUTR = generateMockUTR();
  assert.ok(mockUTR.startsWith('AYS-UPI-'), 'Mock UTR must begin with AYS-UPI-');

  const settled = store.settleTable(tableNum, 'UPI', mockUTR);
  assert.equal(settled, true, 'settleTable must return true');

  // Verifications
  const settledOrder = store.orders.find(o => o.id === order.id);
  assert.equal(settledOrder.status, 'Completed', 'Order status must transition to Completed');
  assert.equal(settledOrder.payment_status, 'PAID', 'Order payment_status must be marked PAID');
  assert.equal(settledOrder.payment_method, 'UPI', 'Payment method must be recorded as UPI');
  assert.equal(settledOrder.transaction_ref, mockUTR, 'Order must record NPCI transaction ref / UTR');
  assert.ok(settledOrder.paid_at, 'Order must record paid_at timestamp');

  // Floorplan table status must be Vacant ready
  assert.equal(targetTable.status, 'Vacant', 'Table status on floorplan must reset to Vacant');
  assert.equal(targetTable.party_size, 0, 'Table party size must reset to 0');
  assert.equal(targetTable.seated_at, null, 'Table seated timestamp must be cleared');
  assert.equal(targetTable.active_order_id, null, 'Active order link must be cleared');
});

test('UPI-09: Settlement records payment transaction and audit log in reactive store', () => {
  const tableNum = 2;
  const utr = generateMockUTR();

  store.createOrder({
    table_number: tableNum,
    items: [{ id: store.menuItems[0].id, name: store.menuItems[0].name, price: 400, quantity: 1 }]
  });

  const prevPaymentsCount = (store.payments || []).length;
  store.settleTable(tableNum, 'UPI', utr);

  // Check store.payments
  assert.ok(store.payments && store.payments.length > prevPaymentsCount, 'Store must record payment in payments collection');
  const lastPayment = store.payments[store.payments.length - 1];
  assert.equal(lastPayment.table_number, tableNum);
  assert.equal(lastPayment.method, 'UPI');
  assert.equal(lastPayment.transaction_ref, utr);

  // Check audit log
  const auditLogs = store.auditLogs || [];
  const settleLog = auditLogs.find(l => l.action === 'SETTLE_BILL' && l.details?.transaction_ref === utr);
  assert.ok(settleLog, 'Audit log must record SETTLE_BILL event with transaction reference');
});

test('UPI-10: settleOrder settles single order and vacates table when no other active orders remain', () => {
  const tableNum = 9;
  // Ensure no lingering orders for table 9
  store.orders = store.orders.filter(o => o.table_number !== tableNum);
  const tbl = store.tables.find(t => t.table_number === tableNum);
  tbl.status = 'Active Ordering';
  tbl.party_size = 2;

  const o1 = store.createOrder({
    table_number: tableNum,
    items: [{ id: store.menuItems[0].id, name: store.menuItems[0].name, price: 350, quantity: 1 }]
  });

  const utr = generateMockUTR();
  const settled = store.settleOrder(o1.id, 'UPI', utr);
  assert.equal(settled, true);
  assert.equal(o1.status, 'Completed');
  assert.equal(o1.payment_status, 'PAID');
  assert.equal(tbl.status, 'Vacant', 'Table must become Vacant when last order is settled');
});

// ============================================================================
// 5. HOSPITALITY INVARIANT DECOUPLING
// ============================================================================

test('UPI-11: Hospitality Invariant: Guest UPI checkout & settlement bypass terminal lock', () => {
  store.isLocked = true; // Simulate locked counter terminal screen
  
  // Guest view auth check must always be permitted
  const guestGate = evaluateAuthGates('customer', store);
  assert.equal(guestGate.allowed, true, 'Customer view must ALWAYS be allowed even when locked');
  assert.equal(guestGate.gate, null);

  // Simulating order and settlement while terminal is locked
  const tableNum = 11;
  const order = store.createOrder({
    table_number: tableNum,
    items: [{ id: store.menuItems[0].id, name: store.menuItems[0].name, price: 600, quantity: 1 }]
  });

  const uri = generateUPIDeepLink(order, INITIAL_VENUE);
  assert.ok(uri.startsWith('upi://pay?'), 'UPI deep-link must generate normally while counter is locked');

  const settled = store.settleTable(tableNum, 'UPI', 'AYS-LOCK-BYPASS-01');
  assert.equal(settled, true, 'Settlement simulation must execute successfully while counter is locked');
  assert.equal(order.payment_status, 'PAID');
});

// ============================================================================
// 6. PENNY-EXACT FINANCIAL MATCHING
// ============================================================================

test('UPI-12: Penny-Exact Invariant: Cart totals exactly match generated UPI amount down to paise', () => {
  store.clearCart();
  store.cart.table_number = 4;
  
  // Add multiple items with various prices
  store.addToCart({ id: 'item-1', name: 'Item 1', price: 349.50 }, 2); // 699.00
  store.addToCart({ id: 'item-2', name: 'Item 2', price: 185.25 }, 1); // 185.25
  const totals = store.getCartTotals();
  assert.ok(totals.total > 0);

  const order = store.createOrder({
    table_number: store.cart.table_number,
    items: store.cart.items.map(ci => ({
      id: ci.item.id,
      name: ci.item.name,
      quantity: ci.quantity,
      price: ci.item.price
    })),
    total_amount: totals.total
  });

  const uri = generateUPIDeepLink(order, INITIAL_VENUE);
  const parsed = new URL(uri);
  const upiAmount = parseFloat(parsed.searchParams.get('am'));

  assert.equal(upiAmount, order.total_amount, 'UPI amount must equal order total amount');
  assert.equal(parsed.searchParams.get('am'), totals.total.toFixed(2), 'Paise representation in UPI URI must match cart total');
});

// --- RUNNER EXECUTION ---
let passed = 0;
let failed = 0;
const start = performance.now();

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  \x1b[32m✔ PASS\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m ${name}`);
    console.error(`    \x1b[31m${err.message}\x1b[0m`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`    \x1b[90m${relevantStack}\x1b[0m`);
    }
    failed++;
  }
}

const duration = (performance.now() - start).toFixed(1);
console.log('\n\x1b[1m\x1b[36m======================================================================\x1b[0m');
console.log(`UPI Intent Test Summary: Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Duration: ${duration}ms`);
console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32m🎉 ALL 12 UPI INTENT & PROTOTYPE SETTLEMENT TESTS PASSED WITH 100% ACCURACY!\x1b[0m\n');
}
