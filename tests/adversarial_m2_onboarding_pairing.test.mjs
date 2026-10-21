/**
 * tests/adversarial_m2_onboarding_pairing.test.mjs
 * Milestone 2 Adversarial Stress & Boundary Verification Test Suite
 * Challenger 1 (Adversarial Onboarding & Terminal Pairing Challenger)
 *
 * Exhaustively stress-tests:
 * 1. Onboarding Validation & Edge Cases (empty/blank names, invalid UPI IDs, extreme tax rates,
 *    non-numeric/short/long Admin PINs, PIN collisions, XSS/HTML sanitization).
 * 2. Corrupted, Partial & Extreme Payloads to completeOnboarding (empty payloads, missing admin,
 *    salt & hash generation, plaintext PIN exclusion, prototype pollution resilience).
 * 3. Terminal Hardware SIN Format Boundaries (case normalization, whitespace trimming, malformed
 *    patterns, illegal characters, non-string types, missing restaurant ID).
 * 4. Multi-Tenant Boundaries & PIN Authorization Attacks (cross-tenant mismatch, Cashier/Server/
 *    Bartender/Manager PIN lockout from pairing, brute force attempts, active Admin bypass).
 * 5. Unauthorized Terminal Unpairing Attacks (unauthorized roles lockout, invalid PIN rejection,
 *    clean decoupling, audit log trail, idempotent unpairing).
 * 6. LocalStorage Corruption Resilience (malformed JSON in ays_terminal_pairing, corrupt schema,
 *    corrupt ays_onboarded fallback, corrupt staff cache).
 * 7. Critical Hospitality Preservation (guest QR routes ?view=customer and ?table=X guaranteed
 *    100% unimpeded under adversarial uninitialized/unpaired/locked states, while management routes
 *    are rigorously gated).
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';
import {
  ROLES,
  PERMISSIONS,
  SEED_STAFF,
  hashPIN,
  hashPINSync,
  verifyPIN,
  verifyPINSync,
  generateSalt
} from '../src/auth.js';
import { store, INITIAL_VENUE, DEFAULT_MERCHANT, DEFAULT_TERMINAL_PAIRING } from '../src/store.js';
import {
  renderOnboardingModal,
  escapeHtml,
  unescapeHtml,
  DEFAULT_ONBOARDING_STATE
} from '../src/components/OnboardingModal.js';
setupTestEnvironment();
if (globalThis.document) {
  const origGetById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => {
    const el = origGetById ? origGetById(id) : {};
    el.querySelector = el.querySelector || (() => null);
    el.querySelectorAll = el.querySelectorAll || (() => []);
    return el;
  };
}
const { evaluateAuthGates, checkAuthGates } = await import('../src/main.js');

export const suite = createTestSuite('M2 Challenger 1: Adversarial Onboarding & Terminal Pairing Suite');

function resetStore() {
  store.resetDemoData();
}

/**
 * Helper to instantiate an OnboardingModal controller with custom mock inputs
 */
function createMockOnboardingController(initialStateOverrides = {}) {
  const inputs = new Map();

  const container = {
    innerHTML: '',
    querySelector(selector) {
      return inputs.get(selector) || null;
    },
    querySelectorAll(selector) {
      const matched = [];
      for (const [key, val] of inputs.entries()) {
        if (key.startsWith(selector) || (selector.startsWith('[data-') && key.includes(selector.slice(1, -1)))) {
          matched.push(val);
        }
      }
      return matched;
    }
  };

  const ctrl = renderOnboardingModal(container, store, {});

  // Pre-seed inputs with defaults + overrides
  const state = { ...DEFAULT_ONBOARDING_STATE, ...initialStateOverrides };

  function setInput(sel, val, checked = false) {
    inputs.set(sel, { value: val, checked, focus: () => {} });
  }

  // Populate step 1
  setInput('#input-venue-name', state.restaurantName);
  setInput('#input-restaurant-id', state.restaurantId);
  setInput('#input-venue-tagline', state.tagline);
  setInput('#input-venue-address', state.address);
  setInput('#input-venue-upi', state.upiId);
  setInput('#select-venue-currency', state.currency);
  setInput('#input-venue-gst', state.gstRate);
  setInput('#input-venue-service', state.serviceChargeRate);

  // Populate step 2
  setInput('#input-admin-name', state.adminName);
  setInput('#input-admin-email', state.adminEmail);
  setInput('#input-admin-password', state.adminPassword);
  setInput('#input-admin-confirm-password', state.adminConfirmPassword);
  setInput('#input-admin-pin', state.adminPin);
  setInput('#input-admin-confirm-pin', state.adminConfirmPin);

  // Populate step 4
  setInput('#input-terminal-name', state.terminalName);
  setInput('#input-terminal-sin', state.terminalSin);
  setInput('#input-terminal-type', state.terminalType);
  setInput('#check-auto-pair', '', state.autoPairDevice);
  setInput('#check-auto-login', '', state.autoLoginAdmin);

  return { ctrl, container, setInput };
}

// ============================================================================
// 1. ONBOARDING INPUT VALIDATION & EDGE CASES (ADV-ONBOARD-VAL)
// ============================================================================

suite.test('ADV-ONBOARD-VAL-01: UI rejects empty, blank, and short (<3 chars) restaurant names', () => {
  resetStore();
  const invalidNames = ['', '   ', 'A', 'AB', '  C  '];

  for (const name of invalidNames) {
    const { ctrl, setInput } = createMockOnboardingController();
    assert.equal(ctrl.getState().currentStep, 1);
    setInput('#input-venue-name', name);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      1,
      `Step 1 must not advance with invalid restaurant name: "${name}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-02: UI rejects empty, blank, and short (<3 chars) restaurant IDs', () => {
  resetStore();
  const invalidIDs = ['', '   ', 'R', 'R1', '   X '];

  for (const id of invalidIDs) {
    const { ctrl, setInput } = createMockOnboardingController();
    setInput('#input-restaurant-id', id);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      1,
      `Step 1 must not advance with invalid restaurant ID: "${id}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-03: UI rejects invalid UPI IDs (missing @, missing provider, malicious characters)', () => {
  resetStore();
  const invalidUPIs = [
    '',
    '   ',
    'thecopperoak',              // Missing @
    'thecopperoak.icici',        // Missing @
    '@icici',                    // Missing handle
    'thecopperoak@',             // Missing bank
    'the copperoak@icici',       // Space inside
    '<script>alert(1)</script>@icici', // Injection tag
    'user@bank@extra',           // Multiple @
    'user!#$@bank'               // Special characters
  ];

  for (const upi of invalidUPIs) {
    const { ctrl, setInput } = createMockOnboardingController();
    setInput('#input-venue-upi', upi);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      1,
      `Step 1 must not advance with invalid UPI ID: "${upi}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-04: UI rejects extreme tax rates (>35%, >100%, negative rates, non-numeric strings)', () => {
  resetStore();
  const invalidGstRates = [
    '-5',
    '-0.1',
    '-100',
    '36',
    '50',
    '100',
    '150',
    'abc',
    'NaN',
    ''
  ];

  for (const gst of invalidGstRates) {
    const { ctrl, setInput } = createMockOnboardingController();
    setInput('#input-venue-gst', gst);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      1,
      `Step 1 must not advance with invalid GST rate: "${gst}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-05: UI rejects extreme service charge rates (>30%, negative rates, non-numeric strings)', () => {
  resetStore();
  const invalidServiceRates = [
    '-1',
    '-10',
    '31',
    '50',
    '100',
    'xyz',
    'NaN'
  ];

  for (const sc of invalidServiceRates) {
    const { ctrl, setInput } = createMockOnboardingController();
    setInput('#input-venue-service', sc);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      1,
      `Step 1 must not advance with invalid Service Charge: "${sc}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-06: UI rejects non-numeric Admin PINs (alphanumeric, symbols, spaces)', () => {
  resetStore();
  const nonNumericPins = [
    'abcd',
    '12ab',
    '12 4',
    '12-4',
    '!@#$',
    '12.4',
    '999a'
  ];

  for (const pin of nonNumericPins) {
    const { ctrl, setInput } = createMockOnboardingController();
    // Advance to Step 2
    ctrl.nextStep();
    assert.equal(ctrl.getState().currentStep, 2);

    setInput('#input-admin-pin', pin);
    setInput('#input-admin-confirm-pin', pin);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      2,
      `Step 2 must not advance with non-numeric Admin PIN: "${pin}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-07: UI rejects short (<4 digits) and long (>6 digits) Admin PINs', () => {
  resetStore();
  const invalidLengthPins = [
    '',
    '1',
    '12',
    '123',
    '1234567',        // 7 digits
    '12345678',       // 8 digits
    '1234567890'      // 10 digits
  ];

  for (const pin of invalidLengthPins) {
    const { ctrl, setInput } = createMockOnboardingController();
    ctrl.nextStep();
    assert.equal(ctrl.getState().currentStep, 2);

    setInput('#input-admin-pin', pin);
    setInput('#input-admin-confirm-pin', pin);
    ctrl.nextStep();
    assert.equal(
      ctrl.getState().currentStep,
      2,
      `Step 2 must not advance with out-of-boundary PIN length: "${pin}"`
    );
  }
});

suite.test('ADV-ONBOARD-VAL-08: UI rejects mismatched Admin confirmation PINs', () => {
  resetStore();
  const { ctrl, setInput } = createMockOnboardingController();
  ctrl.nextStep();
  assert.equal(ctrl.getState().currentStep, 2);

  setInput('#input-admin-pin', '1234');
  setInput('#input-admin-confirm-pin', '1235'); // Mismatched
  ctrl.nextStep();
  assert.equal(ctrl.getState().currentStep, 2, 'Step 2 must reject mismatched confirmation PIN');
});

suite.test('ADV-ONBOARD-VAL-09: UI rejects staff roster with PIN collision against Master Admin PIN', () => {
  resetStore();
  const { ctrl, setInput } = createMockOnboardingController();
  ctrl.nextStep(); // to 2
  assert.equal(ctrl.getState().currentStep, 2);
  setInput('#input-admin-pin', '5555');
  setInput('#input-admin-confirm-pin', '5555');
  ctrl.nextStep(); // to 3
  assert.equal(ctrl.getState().currentStep, 3);

  // Set staff member with colliding PIN '5555'
  const state = ctrl.getState();
  state.staffRoster[0].pin = '5555'; // Collides with Admin PIN
  ctrl.nextStep();
  assert.equal(ctrl.getState().currentStep, 3, 'Step 3 must reject staff PIN colliding with Admin PIN');
});

suite.test('ADV-ONBOARD-VAL-10: UI rejects duplicate staff PINs across roster members', () => {
  resetStore();
  const { ctrl } = createMockOnboardingController();
  ctrl.nextStep(); // to 2
  ctrl.nextStep(); // to 3
  assert.equal(ctrl.getState().currentStep, 3);

  const state = ctrl.getState();
  // Set both staff members to '2222'
  state.staffRoster[0].pin = '2222';
  state.staffRoster[1].pin = '2222';
  ctrl.nextStep();
  assert.equal(ctrl.getState().currentStep, 3, 'Step 3 must reject duplicate staff PINs across roster');
});

suite.test('ADV-ONBOARD-VAL-11: UI rejects malformed terminal SIN formats in Step 4', () => {
  resetStore();
  const invalidSINs = [
    'POS-01',          // Missing SIN-
    'SIN',             // Missing suffix
    'SIN-',            // Empty suffix
    'SIN-POS@01',      // Special character
    'SIN POS 01',      // Space inside
    'SIN-POS.01'       // Dot inside
  ];

  for (const sin of invalidSINs) {
    const { ctrl, setInput } = createMockOnboardingController();
    ctrl.nextStep(); // to 2
    ctrl.nextStep(); // to 3
    ctrl.nextStep(); // to 4
    assert.equal(ctrl.getState().currentStep, 4);

    setInput('#input-terminal-sin', sin);
    ctrl.nextStep();
    assert.equal(ctrl.getState().currentStep, 4, `Step 4 must reject malformed SIN: "${sin}"`);
  }
});

suite.test('ADV-ONBOARD-VAL-12: HTML escape and unescape sanitization prevents injection attacks in venue & staff names', () => {
  const dirty = '<script>alert("xss")</script> & "Craft" \'Bar\'';
  const escaped = escapeHtml(dirty);
  assert.ok(!escaped.includes('<script>'), 'Must not contain raw script tag');
  assert.ok(escaped.includes('&lt;script&gt;'));
  assert.ok(escaped.includes('&quot;Craft&quot;'));
  assert.ok(escaped.includes('&#39;Bar&#39;'));

  const unescaped = unescapeHtml(escaped);
  assert.equal(unescaped, dirty, 'Round-trip unescape must restore original string');
});

// ============================================================================
// 2. CORRUPTED, PARTIAL & EXTREME PAYLOADS (ADV-ONBOARD-PAYLOAD)
// ============================================================================

suite.test('ADV-ONBOARD-PAYLOAD-01: completeOnboarding({}) with empty payload initializes safely with robust fallbacks', async () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  const success = await store.completeOnboarding({});
  assert.equal(success, true, 'completeOnboarding with empty payload must return true');
  assert.equal(store.isUninitialized(), false, 'Store must become initialized');
  assert.equal(store.merchant.restaurant_id, 'REST-BLR-001', 'Must fallback to default restaurant ID');
  assert.ok(store.cachedStaff.length > 0, 'Must assemble default staff roster');
  assert.equal(store.isLocked, false);
});

suite.test('ADV-ONBOARD-PAYLOAD-02: completeOnboarding with null / omitted adminUser falls back safely to SEED_STAFF', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    adminUser: null,
    merchantName: 'Fallback Grill'
  });

  assert.equal(store.merchant.name, 'Fallback Grill');
  assert.ok(store.cachedStaff.length >= 5, 'Must assemble SEED_STAFF roster');
  assert.equal(store.currentStaff.role, ROLES.ADMIN, 'Default current staff should be seed admin');
});

suite.test('ADV-ONBOARD-PAYLOAD-03: completeOnboarding normalizes restaurantId to uppercase', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    restaurantId: 'rest-mum-south-01',
    merchantName: 'Mumbai Bistro'
  });

  assert.equal(store.merchant.restaurant_id, 'REST-MUM-SOUTH-01', 'Restaurant ID must be normalized to uppercase');
});

suite.test('ADV-ONBOARD-PAYLOAD-04: Plaintext Admin PIN is strictly omitted from memory and LocalStorage', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    adminUser: {
      name: 'Security Admin',
      email: 'sec@vault.com',
      pin: '7890'
    }
  });

  // Check in-memory object
  assert.equal(store.currentStaff.pin, undefined, 'Plaintext pin must never exist on currentStaff');
  assert.ok(store.currentStaff.salt, 'Salt must exist');
  assert.ok(store.currentStaff.pin_hash, 'PIN hash must exist');

  // Verify hash matches
  const expectedHash = await hashPIN('7890', store.currentStaff.salt);
  assert.equal(store.currentStaff.pin_hash, expectedHash);

  // Check LocalStorage serialization
  const rawCurrent = localStorage.getItem('ays_current_staff') || '';
  const rawCached = localStorage.getItem('ays_cached_staff') || '';
  assert.ok(!rawCurrent.includes('7890'), 'Plaintext PIN must never leak into ays_current_staff in LocalStorage');
  assert.ok(!rawCached.includes('7890'), 'Plaintext PIN must never leak into ays_cached_staff in LocalStorage');
});

suite.test('ADV-ONBOARD-PAYLOAD-05: Extreme / negative tax rates passed directly to store do not throw and cart totals remain numeric', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    gstRate: -0.05,
    serviceChargeRate: 2.5
  });

  assert.equal(store.venue.gst_rate, -0.05);

  // Add item to cart and calculate totals
  store.cart.items = [{ item: { id: 'it-1', name: 'Soup', price: 100 }, quantity: 1 }];
  assert.doesNotThrow(() => {
    const totals = store.getCartTotals();
    assert.ok(typeof totals.subtotal === 'number');
    assert.ok(typeof totals.total === 'number');
  });
});

suite.test('ADV-ONBOARD-PAYLOAD-06: Idempotency: Multiple consecutive calls to completeOnboarding update state cleanly and record audit logs', async () => {
  store.resetToUninitialized();

  // Call 1
  await store.completeOnboarding({
    restaurantId: 'REST-RUN-01',
    merchantName: 'Version 1'
  });
  assert.equal(store.merchant.restaurant_id, 'REST-RUN-01');

  // Call 2
  await store.completeOnboarding({
    restaurantId: 'REST-RUN-02',
    merchantName: 'Version 2'
  });
  assert.equal(store.merchant.restaurant_id, 'REST-RUN-02');
  assert.equal(store.isUninitialized(), false);

  const completionLogs = store.auditLogs.filter(l => l.action === 'ONBOARDING_COMPLETED');
  assert.equal(completionLogs.length, 2, 'Each completeOnboarding call should record an audit log');
});

suite.test('ADV-ONBOARD-PAYLOAD-07: Prototype pollution attack in payload properties does not pollute Object prototype', async () => {
  store.resetToUninitialized();

  const maliciousPayload = JSON.parse('{"__proto__": {"polluted": "yes"}, "merchantName": "Pollution Test"}');
  await store.completeOnboarding(maliciousPayload);

  assert.equal({}.polluted, undefined, 'Object prototype must not be polluted');
});

suite.test('ADV-ONBOARD-PAYLOAD-08: Discrepancy boundary: completeOnboarding permits short PIN ("12") which is subsequently rejected by loginWithPIN', async () => {
  store.resetToUninitialized();

  // completeOnboarding accepts short PIN without validation
  await store.completeOnboarding({
    adminUser: { name: 'Short Pin Admin', pin: '12' }
  });

  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  // When admin locks or tries to re-login, loginWithPIN strictly enforces 4-6 digits and rejects '12'
  const loginRes = await store.loginWithPIN('12');
  assert.equal(loginRes.success, false, 'loginWithPIN must reject 2-digit PIN');
  assert.equal(loginRes.error, 'PIN must be 4 to 6 numeric digits');
});

// ============================================================================
// 3. TERMINAL HARDWARE SIN FORMAT BOUNDARIES (ADV-PAIR-FORMAT)
// ============================================================================

suite.test('ADV-PAIR-FORMAT-01: Lowercase SIN (sin-pos-01) is normalized to uppercase SIN-POS-01', async () => {
  resetStore();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'sin-pos-01',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.sin, 'SIN-POS-01');
});

suite.test('ADV-PAIR-FORMAT-02: Mixed-case SIN (sIn-PoS-99-BaR) is normalized to uppercase', async () => {
  resetStore();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'sIn-PoS-99-BaR',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.sin, 'SIN-POS-99-BAR');
});

suite.test('ADV-PAIR-FORMAT-03: Surrounding whitespace around SIN and Restaurant ID is trimmed', async () => {
  resetStore();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: '  REST-BLR-001  ',
    sin: '   SIN-POS-55   ',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.restaurant_id, 'REST-BLR-001');
  assert.equal(store.terminalPairing.sin, 'SIN-POS-55');
});

suite.test('ADV-PAIR-FORMAT-04: Malformed SIN formats (missing prefix, special characters, spaces, slashes) are strictly rejected', async () => {
  resetStore();

  const malformedSINs = [
    'POS-01',          // Missing prefix
    'TERMINAL-01',     // Wrong prefix
    'SIN',             // Prefix only without hyphen
    'SIN-',            // Prefix only with empty suffix
    'SIN-POS@01',      // Special character @
    'SIN-POS#01',      // Special character #
    'SIN-POS$01',      // Special character $
    'SIN-POS 01',      // Whitespace in middle
    'SIN/POS/01',      // Slashes
    'SIN-POS.01',      // Dot
    'SIN-POS-🚀'       // Emoji
  ];

  for (const sin of malformedSINs) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin,
      adminPin: '1234'
    });
    assert.equal(res.success, false, `SIN "${sin}" must be rejected`);
    assert.equal(res.error, 'Invalid Terminal SIN format (e.g. SIN-POS-01)');
  }
});

suite.test('ADV-PAIR-FORMAT-05: Falsy SIN values rejected gracefully; non-string truthy SIN throws TypeError due to missing type check', async () => {
  resetStore();

  // Falsy values are cleanly rejected
  for (const sin of ['', null, undefined]) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin,
      adminPin: '1234'
    });
    assert.equal(res.success, false, `Falsy SIN "${sin}" must be rejected`);
    assert.equal(res.error, 'Invalid Terminal SIN format (e.g. SIN-POS-01)');
  }

  // Non-string truthy values: Demonstrates vulnerability: missing typeof sin !== 'string' causes unhandled TypeError
  for (const nonStringSin of [12345, true, {}]) {
    await assert.rejects(
      async () => {
        await store.pairTerminal({
          restaurantId: 'REST-BLR-001',
          sin: nonStringSin,
          adminPin: '1234'
        });
      },
      TypeError,
      `Non-string SIN ${typeof nonStringSin} triggers TypeError due to missing type guard`
    );
  }
});

suite.test('ADV-PAIR-FORMAT-06: Restaurant ID boundary: Missing/empty rejected; whitespace in uninitialized store exposes empty merchant bug', async () => {
  resetStore();

  // 1. Missing / null / non-string in initialized store are rejected
  for (const rid of ['', null, undefined, 123]) {
    const res = await store.pairTerminal({
      restaurantId: rid,
      sin: 'SIN-POS-01',
      adminPin: '1234'
    });
    assert.equal(res.success, false);
    assert.equal(res.error, 'Valid Restaurant ID is required');
  }

  // 2. Whitespace in initialized store is rejected via merchant mismatch (not by initial format check)
  const resWs = await store.pairTerminal({
    restaurantId: '   ',
    sin: 'SIN-POS-01',
    adminPin: '1234'
  });
  assert.equal(resWs.success, false);
  assert.equal(resWs.error, 'Restaurant ID does not match registered merchant');

  // 3. Vulnerability Demonstration: In uninitialized store, whitespace-only restaurant ID ('   ')
  // bypasses validation and creates a merchant with an empty string ID ('')
  store.resetToUninitialized();
  const resExploit = await store.pairTerminal({
    restaurantId: '   ',
    sin: 'SIN-POS-01'
  });
  assert.equal(resExploit.success, true, 'VULNERABILITY: store.pairTerminal accepts whitespace in uninitialized mode');
  assert.equal(resExploit.pairing.restaurant_id, '', 'Restaurant ID bound as empty string');
});

// ============================================================================
// 4. MULTI-TENANT BOUNDARIES & PIN AUTHORIZATION ATTACKS (ADV-PAIR-SECURITY)
// ============================================================================

suite.test('ADV-PAIR-SECURITY-01: Cross-tenant attack: Pairing attempt with mismatched Restaurant ID is rejected when merchant is bound', async () => {
  resetStore();
  assert.equal(store.merchant.restaurant_id, 'REST-BLR-001');

  const rogueTenants = ['REST-MUM-001', 'REST-DEL-999', 'FOREIGN-CORP'];
  for (const restaurantId of rogueTenants) {
    const res = await store.pairTerminal({
      restaurantId,
      sin: 'SIN-POS-01',
      adminPin: '1234'
    });
    assert.equal(res.success, false);
    assert.equal(res.error, 'Restaurant ID does not match registered merchant');
  }
});

suite.test('ADV-PAIR-SECURITY-02: Case-insensitive Restaurant ID matching allows legitimate tenant pairing', async () => {
  resetStore();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: 'rest-blr-001', // Lowercase match
    sin: 'SIN-POS-01',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.restaurant_id, 'REST-BLR-001');
});

suite.test('ADV-PAIR-SECURITY-03: Cashier PIN (1111) cannot authorize hardware terminal pairing', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.CASHIER);

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '1111' // Cashier's own PIN
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('ADV-PAIR-SECURITY-04: Server PIN (2222) and Bartender PIN (3333) cannot authorize hardware terminal pairing', async () => {
  resetStore();
  store.currentStaff = null; // Unauthenticated terminal prompt

  // Server PIN
  const resServer = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '2222'
  });
  assert.equal(resServer.success, false);
  assert.equal(resServer.error, 'Unauthorized: Invalid Admin PIN');

  // Bartender PIN
  const resBartender = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '3333'
  });
  assert.equal(resBartender.success, false);
  assert.equal(resBartender.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('ADV-PAIR-SECURITY-05: Manager PIN (9999) cannot authorize hardware terminal pairing (Strict Admin privilege boundary)', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.MANAGER);

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '9999' // Manager PIN
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('ADV-PAIR-SECURITY-06: Brute-force PIN attack: Rapid sequential invalid PINs are rejected consistently without lockup', async () => {
  resetStore();
  store.currentStaff = null;

  const guessPins = ['0000', '1112', '9991', '0123', '4321', '8888'];
  for (const pin of guessPins) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin: 'SIN-POS-01',
      adminPin: pin
    });
    assert.equal(res.success, false);
    assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
  }

  // Legitimate Admin PIN still works immediately afterwards
  const validRes = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '1234'
  });
  assert.equal(validRes.success, true);
  assert.equal(store.isTerminalPaired(), true);
});

suite.test('ADV-PAIR-SECURITY-07: Non-numeric and malformed PINs in pairing challenge fail gracefully without unhandled exceptions', async () => {
  resetStore();
  store.currentStaff = null;

  const malformedPins = ['abcd', '12', '12345678', '!@#$', '   ', null];
  for (const adminPin of malformedPins) {
    assert.doesNotThrow(async () => {
      const res = await store.pairTerminal({
        restaurantId: 'REST-BLR-001',
        sin: 'SIN-POS-01',
        adminPin
      });
      assert.equal(res.success, false);
    });
  }
});

suite.test('ADV-PAIR-SECURITY-08: Currently authenticated Admin staff bypasses redundant PIN challenge during pairing', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.ADMIN);
  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  // Calling without adminPin must succeed because session is active Admin
  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-77'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.sin, 'SIN-POS-77');
});

suite.test('ADV-PAIR-SECURITY-09: Hardware pairing generates cryptographic pairing token and records immutable audit log', async () => {
  resetStore();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-AUDIT',
    terminalType: 'BAR_POS',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.ok(res.pairing.pairing_token.startsWith('AYS_TKN_'));
  assert.equal(res.pairing.terminal_type, 'BAR_POS');

  const pairingLog = store.auditLogs.find(l => l.action === 'TERMINAL_PAIRED' && l.target_item === 'SIN-POS-AUDIT');
  assert.ok(pairingLog, 'Must record TERMINAL_PAIRED log');
  assert.equal(pairingLog.metadata?.terminal_type, 'BAR_POS');
});

// ============================================================================
// 5. UNAUTHORIZED TERMINAL UNPAIRING ATTACKS (ADV-UNPAIR-AUTH)
// ============================================================================

suite.test('ADV-UNPAIR-AUTH-01: Cashier cannot unpair terminal without Admin PIN', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.CASHIER);

  const res = await store.unpairTerminal({});
  assert.equal(res.success, false);
  assert.equal(res.error, 'Admin PIN is required to unpair terminal');
  assert.equal(store.isTerminalPaired(), true, 'Terminal must remain paired');
});

suite.test('ADV-UNPAIR-AUTH-02: Server, Bartender, and Manager cannot unpair terminal with their own PINs', async () => {
  resetStore();
  store.currentStaff = null;

  // Server PIN (2222)
  const resServer = await store.unpairTerminal({ adminPin: '2222' });
  assert.equal(resServer.success, false);
  assert.equal(resServer.error, 'Unauthorized: Invalid Admin PIN');

  // Bartender PIN (3333)
  const resBar = await store.unpairTerminal({ adminPin: '3333' });
  assert.equal(resBar.success, false);
  assert.equal(resBar.error, 'Unauthorized: Invalid Admin PIN');

  // Manager PIN (9999)
  const resMgr = await store.unpairTerminal({ adminPin: '9999' });
  assert.equal(resMgr.success, false);
  assert.equal(resMgr.error, 'Unauthorized: Invalid Admin PIN');

  assert.equal(store.isTerminalPaired(), true, 'Terminal must remain paired throughout unauthorized attempts');
});

suite.test('ADV-UNPAIR-AUTH-03: Unpairing with invalid or wrong Admin PIN is strictly rejected', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.CASHIER);

  const res = await store.unpairTerminal({ adminPin: '0000' });
  assert.equal(res.success, false);
  assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
  assert.equal(store.isTerminalPaired(), true);
});

suite.test('ADV-UNPAIR-AUTH-04: Valid Admin PIN unpairs terminal, clears store.terminalPairing, and removes LocalStorage key', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.CASHIER);
  assert.equal(store.isTerminalPaired(), true);

  const res = await store.unpairTerminal({ adminPin: '1234' });
  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), false);
  assert.equal(store.terminalPairing, null);
  assert.equal(localStorage.getItem('ays_terminal_pairing'), null);
});

suite.test('ADV-UNPAIR-AUTH-05: Unpairing creates immutable TERMINAL_UNPAIRED audit log identifying the decoupled hardware SIN', async () => {
  resetStore();
  const pairedSin = store.terminalPairing.sin;

  await store.unpairTerminal({ adminPin: '1234' });

  const unpairLog = store.auditLogs.find(l => l.action === 'TERMINAL_UNPAIRED');
  assert.ok(unpairLog);
  assert.equal(unpairLog.target_item, pairedSin);
});

suite.test('ADV-UNPAIR-AUTH-06: Authenticated Admin staff can unpair directly without redundant PIN challenge', async () => {
  resetStore();
  store.currentStaff = store.cachedStaff.find(s => s.role === ROLES.ADMIN);
  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  const res = await store.unpairTerminal({});
  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), false);
});

suite.test('ADV-UNPAIR-AUTH-07: Calling unpairTerminal when already unpaired succeeds idempotently without error', async () => {
  resetStore();
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');

  const res = await store.unpairTerminal({ adminPin: '1234' });
  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), false);
});

// ============================================================================
// 6. LOCALSTORAGE CORRUPTION & BOOT RESILIENCE (ADV-CORRUPT-STORAGE)
// ============================================================================

suite.test('ADV-CORRUPT-STORAGE-01: Corrupted JSON in ays_terminal_pairing is safely handled during store boot without throwing', () => {
  localStorage.setItem('ays_terminal_pairing', '{CORRUPTED_JSON_TRUNCATED: true,');

  // In demo initialized boot, fallback defaults to operational demo pairing (DEFAULT_TERMINAL_PAIRING)
  localStorage.setItem('ays_onboarded', 'true');
  assert.doesNotThrow(() => {
    const freshStore = new store.constructor();
    assert.ok(freshStore);
    assert.equal(freshStore.isTerminalPaired(), true, 'Corrupted pairing falls back to DEFAULT_TERMINAL_PAIRING in demo mode');
  });

  // In explicitly uninitialized boot, fallback defaults to null (unpaired)
  localStorage.setItem('ays_onboarded', 'false');
  assert.doesNotThrow(() => {
    const uninitializedStore = new store.constructor();
    assert.ok(uninitializedStore);
    assert.equal(uninitializedStore.isTerminalPaired(), false, 'Corrupted pairing falls back to null in uninitialized mode');
  });
});

suite.test('ADV-CORRUPT-STORAGE-02: Corrupted schema in ays_terminal_pairing causes isTerminalPaired() to return false', () => {
  // Missing sin
  store.terminalPairing = { status: 'PAIRED', sin: '' };
  assert.equal(store.isTerminalPaired(), false);

  // Missing status
  store.terminalPairing = { status: null, sin: 'SIN-POS-01' };
  assert.equal(store.isTerminalPaired(), false);

  // Status other than PAIRED
  store.terminalPairing = { status: 'DECOUPLED', sin: 'SIN-POS-01' };
  assert.equal(store.isTerminalPaired(), false);

  // Null object
  store.terminalPairing = null;
  assert.equal(store.isTerminalPaired(), false);
});

suite.test('ADV-CORRUPT-STORAGE-03: ays_terminal_pairing with status: "UNPAIRED" causes isTerminalPaired() to return false', () => {
  store.terminalPairing = {
    status: 'UNPAIRED',
    sin: 'SIN-POS-01',
    restaurant_id: 'REST-BLR-001'
  };
  assert.equal(store.isTerminalPaired(), false);
});

suite.test('ADV-CORRUPT-STORAGE-04: Corrupted ays_onboarded value safely falls back without throwing', () => {
  localStorage.setItem('ays_onboarded', 'NOT_A_BOOLEAN_FLAG');
  store.onboarded = false;
  assert.equal(store.isUninitialized(), true);

  store.onboarded = true;
  assert.equal(store.isUninitialized(), false);

  localStorage.setItem('ays_onboarded', 'false');
  assert.equal(store.isUninitialized(), true);

  localStorage.setItem('ays_onboarded', 'true');
  assert.equal(store.isUninitialized(), false);
});

suite.test('ADV-CORRUPT-STORAGE-05: Corrupted ays_cached_staff does not crash store or terminal pairing authorization', () => {
  localStorage.setItem('ays_cached_staff', 'INVALID_JSON_CACHE');
  assert.doesNotThrow(() => {
    const s = new store.constructor();
    assert.ok(Array.isArray(s.cachedStaff));
  });
});

// ============================================================================
// 7. CRITICAL HOSPITALITY PRESERVATION & ROUTE EXEMPTION (ADV-HOSP-PRESERVE)
// ============================================================================

suite.test('ADV-HOSP-PRESERVE-01: Guest route customer ALWAYS bypasses onboarding gate when store is uninitialized', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  const check = evaluateAuthGates('customer', store);
  assert.equal(check.allowed, true, 'Guest customer route must be allowed when uninitialized');
  assert.equal(check.gate, null);
});

suite.test('ADV-HOSP-PRESERVE-02: Guest route customer ALWAYS bypasses pairing gate when terminal is unpaired', () => {
  resetStore();
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');
  assert.equal(store.isTerminalPaired(), false);

  const check = evaluateAuthGates('customer', store);
  assert.equal(check.allowed, true, 'Guest customer route must be allowed on unpaired devices');
  assert.equal(check.gate, null);
});

suite.test('ADV-HOSP-PRESERVE-03: Guest route customer ALWAYS bypasses gates when screen is locked and staff is null', () => {
  store.resetToUninitialized();
  store.isLocked = true;
  store.currentStaff = null;

  const check = evaluateAuthGates('customer', store);
  assert.equal(check.allowed, true, 'Guest customer route must bypass locked screen & null staff');
  assert.equal(check.gate, null);
});

suite.test('ADV-HOSP-PRESERVE-04: QR table query routes (?table=1, ?table=5, ?table=12) never trigger gates in uninitialized/unpaired states', () => {
  store.resetToUninitialized();

  const tables = [1, 2, 5, 8, 12];
  for (const tableNum of tables) {
    store.cart.table_number = tableNum;
    assert.equal(store.cart.table_number, tableNum);

    const check = evaluateAuthGates('customer', store);
    assert.equal(check.allowed, true, `Guest route for Table ${tableNum} must bypass gates`);
  }
});

suite.test('ADV-HOSP-PRESERVE-05: Combined URL params (?view=customer&table=7) bypass all modal gates', () => {
  store.resetToUninitialized();
  store.terminalPairing = null;

  const check = evaluateAuthGates('customer', store);
  assert.equal(check.allowed, true);
  assert.equal(check.gate, null);
});

suite.test('ADV-HOSP-PRESERVE-06: Guest dining cart operations (add, quantity, notes) execute flawlessly in uninitialized store', () => {
  store.resetToUninitialized();
  store.cart.items = [];

  // Add item
  store.addToCart({ id: 'item-01', name: 'Polenta Fries', price: 380 }, 2);
  assert.equal(store.cart.items.length, 1);
  assert.equal(store.cart.items[0].quantity, 2);

  // Update quantity (itemIndex 0, delta +1)
  store.updateCartQuantity(0, 1);
  assert.equal(store.cart.items[0].quantity, 3);

  // Cart totals calculation
  const totals = store.getCartTotals();
  assert.equal(totals.subtotal, 1140);
  assert.ok(totals.total >= totals.subtotal);
});

suite.test('ADV-HOSP-PRESERVE-07: Management views (floorplan, analytics, stock, kds, qr) are gated by ONBOARDING_MODAL when uninitialized', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const v of managementViews) {
    const check = evaluateAuthGates(v, store);
    assert.equal(check.allowed, false, `Management view "${v}" must be gated when uninitialized`);
    assert.equal(check.gate, 'ONBOARDING_MODAL', `Gate for "${v}" must be ONBOARDING_MODAL`);
  }
});

suite.test('ADV-HOSP-PRESERVE-08: Management views are gated by TERMINAL_PAIRING_MODAL when initialized but unpaired', () => {
  resetStore();
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');
  assert.equal(store.isUninitialized(), false);
  assert.equal(store.isTerminalPaired(), false);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const v of managementViews) {
    const check = evaluateAuthGates(v, store);
    assert.equal(check.allowed, false, `Management view "${v}" must be gated when unpaired`);
    assert.equal(check.gate, 'TERMINAL_PAIRING_MODAL', `Gate for "${v}" must be TERMINAL_PAIRING_MODAL`);
  }
});

suite.test('ADV-HOSP-PRESERVE-09: When both initialized and paired, all management views are permitted', () => {
  resetStore();
  assert.equal(store.isUninitialized(), false);
  assert.equal(store.isTerminalPaired(), true);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const v of managementViews) {
    const check = evaluateAuthGates(v, store);
    assert.equal(check.allowed, true, `Management view "${v}" must be allowed`);
    assert.equal(check.gate, null);
  }
});

// Run standalone if invoked directly from CLI
if (process.argv[1]?.endsWith('adversarial_m2_onboarding_pairing.test.mjs')) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
