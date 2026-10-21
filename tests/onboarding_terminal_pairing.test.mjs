/**
 * tests/onboarding_terminal_pairing.test.mjs
 * Automated Unit, Security & Integration Test Suite for Milestone 2:
 * First-Run Onboarding Setup, Hardware Terminal SIN Pairing & Hospitality Preservation.
 *
 * Authoritative Sources:
 * - ORIGINAL_REQUEST.md (§ R2: First-Run Onboarding & Terminal SIN Pairing)
 * - PROJECT.md (§ M2: First-Run Onboarding & Terminal SIN Pairing)
 * - src/store.js (isUninitialized, completeOnboarding, isTerminalPaired, pairTerminal, unpairTerminal)
 * - src/auth.js (ROLES, SEED_STAFF, hashPIN, generateSalt)
 * - src/main.js (Hospitality guest route bypass & management gate checks)
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';
import {
  ROLES,
  PERMISSIONS,
  SEED_STAFF,
  hashPIN,
  generateSalt
} from '../src/auth.js';
import { store, INITIAL_VENUE, DEFAULT_MERCHANT, DEFAULT_TERMINAL_PAIRING } from '../src/store.js';

// Initialize global mock DOM and LocalStorage environment
setupTestEnvironment();

export const suite = createTestSuite('Milestone 2: First-Run Onboarding & Terminal SIN Pairing');

/**
 * Gatekeeper Contract Specification for Milestone 2 Root Shell Router
 * Guest QR ordering ('customer') ALWAYS bypasses all gates.
 * Management / counter views ('floorplan', 'analytics', 'stock', 'kds', 'qr') require
 * initialization and terminal pairing.
 */
export function evaluateAuthGates(targetView, storeInstance = store) {
  // CRITICAL HOSPITALITY PRESERVATION: Guest QR ordering bypasses ALL gates
  if (targetView === 'customer') {
    return { allowed: true, gate: null };
  }

  // Gate 1: First-Run Onboarding Setup
  if (storeInstance.isUninitialized()) {
    return { allowed: false, gate: 'ONBOARDING_MODAL' };
  }

  // Gate 2: Hardware Terminal SIN Pairing
  if (!storeInstance.isTerminalPaired()) {
    return { allowed: false, gate: 'TERMINAL_PAIRING_MODAL' };
  }

  // Both gates passed: proceed to staff session / POS view
  return { allowed: true, gate: null };
}

// ============================================================================
// 1. UNINITIALIZED DETECTION & SYSTEM RESET (ONBOARD-INIT)
// ============================================================================

suite.test('ONBOARD-INIT-01: Fresh store default state is initialized in operational demo mode', () => {
  store.resetDemoData();
  assert.equal(store.isUninitialized(), false, 'Default demo state must be initialized');
  assert.equal(store.isTerminalPaired(), true, 'Default demo state must have paired terminal');
  assert.equal(store.merchant?.restaurant_id, 'REST-BLR-001');
  assert.equal(store.terminalPairing?.sin, 'SIN-POS-01');
});

suite.test('ONBOARD-INIT-02: resetToUninitialized() transitions store to uninitialized state', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true, 'Store must report isUninitialized() === true');
  assert.equal(store.onboarded, false, 'Internal onboarded flag must be false');
});

suite.test('ONBOARD-INIT-03: resetToUninitialized() purges merchant, terminal pairing, staff and locks screen', () => {
  store.resetToUninitialized();
  assert.equal(store.merchant, null, 'Merchant entity must be null');
  assert.equal(store.terminalPairing, null, 'Terminal pairing must be null');
  assert.equal(store.isTerminalPaired(), false, 'isTerminalPaired() must return false');
  assert.equal(store.currentStaff, null, 'currentStaff must be null');
  assert.deepEqual(store.cachedStaff, [], 'cachedStaff must be empty array');
  assert.equal(store.isLocked, true, 'Terminal screen must be locked');
});

suite.test('ONBOARD-INIT-04: resetToUninitialized() persists uninitialized flag in LocalStorage', () => {
  store.resetToUninitialized();
  assert.equal(JSON.parse(localStorage.getItem('ays_onboarded')), 'false');
  assert.equal(localStorage.getItem('ays_merchant'), null);
  assert.equal(localStorage.getItem('ays_terminal_pairing'), null);
  assert.equal(localStorage.getItem('ays_current_staff'), null);
  assert.equal(localStorage.getItem('ays_cached_staff'), null);
});

suite.test('ONBOARD-INIT-05: LocalStorage flag ays_onboarded="false" guarantees isUninitialized() is true', () => {
  localStorage.setItem('ays_onboarded', 'false');
  assert.equal(store.isUninitialized(), true);
  localStorage.setItem('ays_onboarded', 'true');
  assert.equal(store.isUninitialized(), false);
});

suite.test('ONBOARD-INIT-06: resetDemoData() successfully restores operational demo mode', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  store.resetDemoData();
  assert.equal(store.isUninitialized(), false);
  assert.equal(store.isTerminalPaired(), true);
  assert.ok(store.cachedStaff.length >= 5, 'Cached staff must contain seed staff');
  assert.equal(store.isLocked, false);
});

// ============================================================================
// 2. FIRST-RUN ONBOARDING WIZARD SUBMISSION (ONBOARD-WIZARD)
// ============================================================================

suite.test('ONBOARD-WIZARD-01: completeOnboarding() updates venue configuration', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    outletName: 'The Highland Craft Bistro',
    upiId: 'highlandcraft@okaxis',
    gstRate: 0.18,
    serviceChargeRate: 0.10
  });

  assert.equal(store.venue.name, 'The Highland Craft Bistro');
  assert.equal(store.venue.upi_id, 'highlandcraft@okaxis');
  assert.equal(store.venue.gst_rate, 0.18);
  assert.equal(store.venue.service_charge_rate, 0.10);

  const savedVenue = JSON.parse(localStorage.getItem('ays_venue'));
  assert.equal(savedVenue.name, 'The Highland Craft Bistro');
  assert.equal(savedVenue.upi_id, 'highlandcraft@okaxis');
});

suite.test('ONBOARD-WIZARD-02: completeOnboarding() establishes merchant entity with uppercase restaurant_id', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    merchantName: 'Highland Hospitality Group',
    restaurantId: 'rest-mum-808'
  });

  assert.ok(store.merchant, 'Merchant entity must exist');
  assert.equal(store.merchant.restaurant_id, 'REST-MUM-808', 'Restaurant ID must be normalized to uppercase');
  assert.equal(store.merchant.name, 'Highland Hospitality Group');

  const savedMerchant = JSON.parse(localStorage.getItem('ays_merchant'));
  assert.equal(savedMerchant.restaurant_id, 'REST-MUM-808');
});

suite.test('ONBOARD-WIZARD-03: Master Admin user is created with ROLES.ADMIN, salt, and PBKDF2/SHA-256 hashed PIN', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    adminUser: {
      name: 'Sarah Connor',
      email: 'sarah@skynet-cafe.com',
      pin: '4321'
    }
  });

  assert.ok(store.currentStaff, 'Current staff must be Master Admin');
  assert.equal(store.currentStaff.name, 'Sarah Connor');
  assert.equal(store.currentStaff.email, 'sarah@skynet-cafe.com');
  assert.equal(store.currentStaff.role, ROLES.ADMIN);
  assert.ok(store.currentStaff.salt, 'Admin user must have unique salt');
  assert.equal(store.currentStaff.salt.length, 32, 'Salt must be 16 bytes (32 hex characters)');

  // Verify PIN hash matches
  const expectedHash = await hashPIN('4321', store.currentStaff.salt);
  assert.equal(store.currentStaff.pin_hash, expectedHash, 'Admin PIN hash must match computed salted hash');
});

suite.test('ONBOARD-WIZARD-04: Plaintext Admin PIN is strictly omitted from memory and LocalStorage', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    adminUser: {
      name: 'Elena Gilbert',
      email: 'elena@mysticgrill.com',
      pin: '9876'
    }
  });

  // Check in-memory object
  assert.equal(store.currentStaff.pin, undefined, 'Plaintext pin must not exist on currentStaff');
  assert.equal(store.cachedStaff[0].pin, undefined, 'Plaintext pin must not exist on cachedStaff');

  // Check localStorage serialization
  const rawCurrent = localStorage.getItem('ays_current_staff');
  const rawCached = localStorage.getItem('ays_cached_staff');
  assert.ok(!rawCurrent.includes('9876'), 'Plaintext PIN must never leak into ays_current_staff localStorage');
  assert.ok(!rawCached.includes('9876'), 'Plaintext PIN must never leak into ays_cached_staff localStorage');
});

suite.test('ONBOARD-WIZARD-05: Staff roster assembly creates custom staff accounts with distinct salts and hashes', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    adminUser: { name: 'Owner Admin', pin: '5555' },
    staffList: [
      { name: 'Kavita Cashier', role: ROLES.CASHIER, pin: '1122' },
      { name: 'Sameer Server', role: ROLES.SERVER, pin: '3344' }
    ]
  });

  assert.equal(store.cachedStaff.length, 3, 'Cached staff must contain Admin + 2 added members');

  const cashier = store.cachedStaff.find(s => s.role === ROLES.CASHIER);
  assert.ok(cashier);
  assert.equal(cashier.name, 'Kavita Cashier');
  assert.equal(cashier.pin, undefined);
  assert.equal(cashier.pin_hash, await hashPIN('1122', cashier.salt));

  const server = store.cachedStaff.find(s => s.role === ROLES.SERVER);
  assert.ok(server);
  assert.equal(server.name, 'Sameer Server');
  assert.equal(server.pin, undefined);
  assert.equal(server.pin_hash, await hashPIN('3344', server.salt));

  // Salts must be distinct
  assert.notEqual(cashier.salt, server.salt, 'Distinct staff must possess distinct cryptographic salts');
});

suite.test('ONBOARD-WIZARD-06: completeOnboarding() falls back to SEED_STAFF roster if adminUser is omitted', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    merchantName: 'Fallback Bistro'
  });

  assert.ok(store.cachedStaff.length >= 5, 'Must assemble SEED_STAFF roster');
  assert.equal(store.currentStaff.role, ROLES.ADMIN, 'Default current staff should be seed admin');
});

suite.test('ONBOARD-WIZARD-07: completeOnboarding() transitions store to initialized and unlocks screen', async () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);
  assert.equal(store.isLocked, true);

  const res = await store.completeOnboarding({
    merchantName: 'Aura Taproom'
  });

  assert.equal(res, true, 'completeOnboarding must return true on success');
  assert.equal(store.isUninitialized(), false, 'Store must no longer be uninitialized');
  assert.equal(store.isLocked, false, 'Terminal screen must be unlocked upon setup completion');
  assert.equal(JSON.parse(localStorage.getItem('ays_onboarded')), 'true');
});

suite.test('ONBOARD-WIZARD-08: completeOnboarding() records immutable ONBOARDING_COMPLETED audit log', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    merchantName: 'Urban Wok',
    restaurantId: 'REST-DEL-101',
    adminUser: { name: 'Chef Li', pin: '8888' }
  });

  const onboardingLog = store.auditLogs.find(l => l.action === 'ONBOARDING_COMPLETED');
  assert.ok(onboardingLog, 'Must record ONBOARDING_COMPLETED audit log');
  assert.equal(onboardingLog.target_item, 'REST-DEL-101');
  assert.equal(onboardingLog.action_label, 'First-Run Setup Completed');
  assert.ok(onboardingLog.timestamp);
});

suite.test('ONBOARD-WIZARD-09: completeOnboarding() registers initial hardware terminal when provided', async () => {
  store.resetToUninitialized();

  await store.completeOnboarding({
    merchantName: 'Zephyr Rooftop',
    restaurantId: 'REST-GOA-007',
    adminUser: { name: 'Goa Admin', pin: '1234' },
    initialTerminal: {
      sin: 'SIN-BAR-01',
      terminalName: 'Main Pool Bar POS',
      terminalType: 'BAR_POS'
    }
  });

  assert.equal(store.isTerminalPaired(), true, 'Terminal must be immediately paired if initialTerminal is supplied');
  assert.equal(store.terminalPairing.sin, 'SIN-BAR-01');
  assert.equal(store.terminalPairing.terminal_name, 'Main Pool Bar POS');
  assert.equal(store.terminalPairing.terminal_type, 'BAR_POS');
  assert.equal(store.terminalPairing.status, 'PAIRED');

  const savedPairing = JSON.parse(localStorage.getItem('ays_terminal_pairing'));
  assert.equal(savedPairing.sin, 'SIN-BAR-01');
});

// ============================================================================
// 3. TERMINAL HARDWARE SIN PAIRING CORE ENGINE (PAIR-CORE)
// ============================================================================

suite.test('PAIR-CORE-01: Fresh uninitialized or reset store has isTerminalPaired() === false', () => {
  store.resetToUninitialized();
  assert.equal(store.isTerminalPaired(), false);
  assert.equal(store.getPairedTerminal(), null);
});

suite.test('PAIR-CORE-02: pairTerminal() successfully pairs valid Restaurant ID and SIN code', async () => {
  store.resetDemoData();
  // Clear existing pairing
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');
  assert.equal(store.isTerminalPaired(), false);

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    terminalName: 'Billing Counter #1',
    terminalType: 'BILLING_POS',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), true);
  assert.equal(store.terminalPairing.restaurant_id, 'REST-BLR-001');
  assert.equal(store.terminalPairing.sin, 'SIN-POS-01');
  assert.equal(store.terminalPairing.status, 'PAIRED');
  assert.ok(store.terminalPairing.pairing_token.startsWith('AYS_TKN_'));
  assert.ok(store.terminalPairing.paired_at);
});

suite.test('PAIR-CORE-03: pairTerminal() normalizes lowercase Restaurant ID and SIN code', async () => {
  store.resetDemoData();
  store.terminalPairing = null;

  const res = await store.pairTerminal({
    restaurantId: 'rest-blr-001',
    sin: 'sin-pos-02',
    adminPin: '1234'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.restaurant_id, 'REST-BLR-001');
  assert.equal(store.terminalPairing.sin, 'SIN-POS-02');
});

suite.test('PAIR-CORE-04: pairTerminal() supports multiple terminal hardware types', async () => {
  store.resetDemoData();

  const types = ['BILLING_POS', 'BAR_POS', 'KDS_TOUCH', 'WAITER_TABLET'];
  for (const type of types) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin: `SIN-${type.substring(0, 3)}-01`,
      terminalType: type,
      adminPin: '1234'
    });
    assert.equal(res.success, true);
    assert.equal(store.terminalPairing.terminal_type, type);
  }
});

suite.test('PAIR-CORE-05: pairTerminal() records immutable TERMINAL_PAIRED audit log', async () => {
  store.resetDemoData();
  const initialLogsCount = store.auditLogs.length;

  await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-09',
    adminPin: '1234'
  });

  const pairingLog = store.auditLogs.find(l => l.action === 'TERMINAL_PAIRED' && l.target_item === 'SIN-POS-09');
  assert.ok(pairingLog, 'Must record TERMINAL_PAIRED audit log');
  assert.equal(pairingLog.action_label, 'Terminal Hardware Paired');
  assert.equal(pairingLog.metadata?.restaurant_id, 'REST-BLR-001');
});

// ============================================================================
// 4. VALIDATION & BOUNDARY STRESS FOR TERMINAL PAIRING (PAIR-VAL)
// ============================================================================

suite.test('PAIR-VAL-01: Rejection of missing, empty, or whitespace-only Restaurant ID', async () => {
  store.resetDemoData();

  const res1 = await store.pairTerminal({ restaurantId: '', sin: 'SIN-POS-01' });
  assert.equal(res1.success, false);
  assert.equal(res1.error, 'Valid Restaurant ID is required');

  const res2 = await store.pairTerminal({ restaurantId: '   ', sin: 'SIN-POS-01' });
  assert.equal(res2.success, false);

  const res3 = await store.pairTerminal({ restaurantId: null, sin: 'SIN-POS-01' });
  assert.equal(res3.success, false);
});

suite.test('PAIR-VAL-02: Rejection of malformed SIN formats', async () => {
  store.resetDemoData();

  const invalidSINs = [
    'POS-01',          // Missing SIN- prefix
    'INVALID',         // No hyphen
    '12345',           // Numeric only
    'SIN',             // Incomplete
    'SIN-',            // Empty suffix
    'SIN-POS@01',      // Illegal special character
    '',                // Empty string
    null,              // Null
    undefined          // Undefined
  ];

  for (const sin of invalidSINs) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin,
      adminPin: '1234'
    });
    assert.equal(res.success, false, `SIN "${sin}" must be rejected`);
    assert.equal(res.error, 'Invalid Terminal SIN format (e.g. SIN-POS-01)');
  }
});

suite.test('PAIR-VAL-03: Valid SIN variations are cleanly accepted', async () => {
  store.resetDemoData();

  const validSINs = [
    'SIN-POS-01',
    'SIN-BAR-99',
    'SIN-KDS-MAIN',
    'SIN-TABLET-100',
    'SIN-OUTLET2-POS3'
  ];

  for (const sin of validSINs) {
    const res = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin,
      adminPin: '1234'
    });
    assert.equal(res.success, true, `SIN "${sin}" must be accepted`);
    assert.equal(store.terminalPairing.sin, sin.toUpperCase());
  }
});

suite.test('PAIR-VAL-04: Rejection when Restaurant ID mismatches registered merchant entity', async () => {
  store.resetDemoData();
  assert.equal(store.merchant.restaurant_id, 'REST-BLR-001');

  // Attempting to pair terminal to a foreign restaurant
  const res = await store.pairTerminal({
    restaurantId: 'REST-MUM-999',
    sin: 'SIN-POS-01',
    adminPin: '1234'
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'Restaurant ID does not match registered merchant');
});

// ============================================================================
// 5. ADMIN PIN AUTHORIZATION & SECURITY CHALLENGES (PAIR-AUTH)
// ============================================================================

suite.test('PAIR-AUTH-01: Pairing requires Admin PIN when active staff is not Admin', async () => {
  store.resetDemoData();
  // Cashier Rohan is active staff
  await store.loginWithPIN('1111');
  assert.equal(store.currentStaff.role, ROLES.CASHIER);

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01'
    // Omit adminPin
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'Admin PIN is required to authorize terminal pairing');
});

suite.test('PAIR-AUTH-02: Pairing rejection when Admin PIN is incorrect', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '9991' // Incorrect PIN
  });

  assert.equal(res.success, false);
  assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('PAIR-AUTH-03: Cashier or Server PIN cannot authorize hardware terminal pairing', async () => {
  store.resetDemoData();
  // Unset current staff
  store.currentStaff = null;

  // Attempt with Cashier PIN
  const resCashier = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '1111' // Cashier Rohan PIN
  });
  assert.equal(resCashier.success, false);
  assert.equal(resCashier.error, 'Unauthorized: Invalid Admin PIN');

  // Attempt with Server PIN
  const resServer = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '2222' // Server Priya PIN
  });
  assert.equal(resServer.success, false);
  assert.equal(resServer.error, 'Unauthorized: Invalid Admin PIN');

  // Attempt with Manager PIN (TERMINAL_CONFIG is strictly Admin-only)
  const resManager = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    adminPin: '9999' // Manager Vikram PIN
  });
  assert.equal(resManager.success, false);
  assert.equal(resManager.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('PAIR-AUTH-04: Valid Admin PIN (1234) successfully authorizes pairing', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-05',
    adminPin: '1234' // Seed Admin PIN
  });

  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), true);
  assert.equal(store.terminalPairing.sin, 'SIN-POS-05');
});

suite.test('PAIR-AUTH-05: Authenticated Admin staff bypasses redundant PIN challenge during pairing', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1234'); // Admin login
  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  // No adminPin provided
  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-06'
  });

  assert.equal(res.success, true);
  assert.equal(store.terminalPairing.sin, 'SIN-POS-06');
});

// ============================================================================
// 6. TERMINAL UNPAIR FLOW & SECURITY BOUNDARY (UNPAIR)
// ============================================================================

suite.test('UNPAIR-01: Unpair flow requires Admin PIN when active staff is not Admin', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier

  const res = await store.unpairTerminal({});
  assert.equal(res.success, false);
  assert.equal(res.error, 'Admin PIN is required to unpair terminal');
});

suite.test('UNPAIR-02: Unpair flow rejects incorrect Admin PIN', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier

  const res = await store.unpairTerminal({ adminPin: '0000' });
  assert.equal(res.success, false);
  assert.equal(res.error, 'Unauthorized: Invalid Admin PIN');
});

suite.test('UNPAIR-03: Valid Admin PIN unpairs terminal, resets state, and removes LocalStorage key', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier
  assert.equal(store.isTerminalPaired(), true);

  const res = await store.unpairTerminal({ adminPin: '1234' });
  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), false);
  assert.equal(store.terminalPairing, null);
  assert.equal(localStorage.getItem('ays_terminal_pairing'), null);
});

suite.test('UNPAIR-04: Unpairing records immutable TERMINAL_UNPAIRED audit log with target SIN', async () => {
  store.resetDemoData();
  const pairedSIN = store.terminalPairing.sin;

  await store.unpairTerminal({ adminPin: '1234' });

  const unpairLog = store.auditLogs.find(l => l.action === 'TERMINAL_UNPAIRED');
  assert.ok(unpairLog, 'Must record TERMINAL_UNPAIRED audit log');
  assert.equal(unpairLog.target_item, pairedSIN);
});

suite.test('UNPAIR-05: Authenticated Admin staff can unpair terminal directly without PIN entry', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1234'); // Admin login
  assert.equal(store.currentStaff.role, ROLES.ADMIN);

  const res = await store.unpairTerminal({});
  assert.equal(res.success, true);
  assert.equal(store.isTerminalPaired(), false);
});

// ============================================================================
// 7. PERSISTENCE & BOOT AUTO-RECOGNITION ACROSS RELOADS (BOOT-PERSIST)
// ============================================================================

suite.test('BOOT-PERSIST-01: Paired terminal metadata is persisted to LocalStorage ays_terminal_pairing', async () => {
  store.resetDemoData();
  await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-77',
    terminalName: 'Express Kiosk',
    terminalType: 'BILLING_POS',
    adminPin: '1234'
  });

  const raw = localStorage.getItem('ays_terminal_pairing');
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.sin, 'SIN-POS-77');
  assert.equal(parsed.status, 'PAIRED');
});

suite.test('BOOT-PERSIST-02: Simulated browser boot recognizes paired terminal without prompting re-pair', () => {
  store.resetDemoData();
  // Ensure pairing is in localStorage
  const currentPairing = {
    restaurant_id: 'REST-BLR-001',
    outlet_id: INITIAL_VENUE.id,
    outlet_name: INITIAL_VENUE.name,
    sin: 'SIN-POS-88',
    terminal_name: 'Patio POS',
    terminal_type: 'BILLING_POS',
    paired_at: new Date().toISOString(),
    pairing_token: 'AYS_TKN_BOOT_TEST',
    status: 'PAIRED'
  };
  localStorage.setItem('ays_terminal_pairing', JSON.stringify(currentPairing));
  localStorage.setItem('ays_onboarded', 'true');

  // Instantiate fresh store instance to simulate browser reload / boot
  const freshStore = new store.constructor();
  assert.equal(freshStore.isUninitialized(), false);
  assert.equal(freshStore.isTerminalPaired(), true);
  assert.equal(freshStore.terminalPairing.sin, 'SIN-POS-88');
  assert.equal(freshStore.terminalPairing.status, 'PAIRED');
});

suite.test('BOOT-PERSIST-03: Corrupted LocalStorage pairing entry is safely handled during store boot', () => {
  localStorage.setItem('ays_terminal_pairing', '{invalid-json');
  localStorage.setItem('ays_onboarded', 'true');

  // Should not throw SyntaxError
  assert.doesNotThrow(() => {
    const recoveredStore = new store.constructor();
    assert.ok(recoveredStore);
  });
});

// ============================================================================
// 8. CRITICAL HOSPITALITY PRESERVATION & ROUTE EXEMPTION (HOSP-BYPASS)
// ============================================================================

suite.test('HOSP-BYPASS-01: Guest ordering route (view=customer) ALWAYS bypasses onboarding gate when uninitialized', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  const evaluation = evaluateAuthGates('customer', store);
  assert.equal(evaluation.allowed, true, 'Guest ordering route MUST be allowed even when uninitialized');
  assert.equal(evaluation.gate, null, 'No modal gate may block guest ordering');
});

suite.test('HOSP-BYPASS-02: Guest table scan route (?table=4) executes unhindered in uninitialized store', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  // Simulate guest scanning QR code at Table 4
  store.cart.table_number = 4;
  assert.equal(store.cart.table_number, 4);

  const evaluation = evaluateAuthGates('customer', store);
  assert.equal(evaluation.allowed, true);
});

suite.test('HOSP-BYPASS-03: Guest ordering route (view=customer) ALWAYS bypasses terminal pairing gate when unpaired', () => {
  store.resetDemoData();
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');
  assert.equal(store.isTerminalPaired(), false);

  const evaluation = evaluateAuthGates('customer', store);
  assert.equal(evaluation.allowed, true, 'Guest ordering route MUST be allowed on unpaired devices (customer phones)');
  assert.equal(evaluation.gate, null);
});

suite.test('HOSP-BYPASS-04: Management views (floorplan, analytics, stock, kds, qr) are gated when uninitialized', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const viewId of managementViews) {
    const evaluation = evaluateAuthGates(viewId, store);
    assert.equal(evaluation.allowed, false, `Management view "${viewId}" must be blocked when uninitialized`);
    assert.equal(evaluation.gate, 'ONBOARDING_MODAL', `Management view "${viewId}" must trigger ONBOARDING_MODAL`);
  }
});

suite.test('HOSP-BYPASS-05: Management views are gated by TERMINAL_PAIRING_MODAL when initialized but unpaired', () => {
  store.resetDemoData();
  store.terminalPairing = null;
  localStorage.removeItem('ays_terminal_pairing');
  assert.equal(store.isUninitialized(), false);
  assert.equal(store.isTerminalPaired(), false);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const viewId of managementViews) {
    const evaluation = evaluateAuthGates(viewId, store);
    assert.equal(evaluation.allowed, false, `Management view "${viewId}" must be blocked when unpaired`);
    assert.equal(evaluation.gate, 'TERMINAL_PAIRING_MODAL', `Management view "${viewId}" must trigger TERMINAL_PAIRING_MODAL`);
  }
});

suite.test('HOSP-BYPASS-06: When fully initialized and paired, all management views are allowed', () => {
  store.resetDemoData();
  assert.equal(store.isUninitialized(), false);
  assert.equal(store.isTerminalPaired(), true);

  const managementViews = ['floorplan', 'analytics', 'stock', 'kds', 'qr'];
  for (const viewId of managementViews) {
    const evaluation = evaluateAuthGates(viewId, store);
    assert.equal(evaluation.allowed, true, `Management view "${viewId}" must be allowed when initialized & paired`);
    assert.equal(evaluation.gate, null);
  }
});

suite.test('HOSP-BYPASS-07: Guest cart operations execute cleanly while system is in uninitialized state', () => {
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  // Guest dining items should be addable to cart
  store.cart.items = [];
  store.addToCart({
    id: 'dish-polenta-1',
    name: 'Truffle Polenta Fries',
    price: 320
  }, 2);

  assert.equal(store.cart.items.length, 1);
  assert.equal(store.cart.items[0].item.name, 'Truffle Polenta Fries');

  // Bill calculation should succeed with zero errors
  const totals = store.getCartTotals();
  assert.equal(totals.subtotal, 640);
  assert.ok(totals.gst > 0);
  assert.ok(totals.total > totals.subtotal);
});

// Run standalone if invoked directly from CLI
if (process.argv[1]?.endsWith('onboarding_terminal_pairing.test.mjs')) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
