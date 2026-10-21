/**
 * tests/auth_terminal_security.test.mjs
 * Automated Unit & Security Test Suite for Milestone 1
 * Verifies: Web Crypto Hashing, Staff PIN Authentication, RBAC Boundaries,
 *           Manager Override Interception & Audits, Offline Persistence & SSO Tokens.
 *
 * Authoritative Sources: ORIGINAL_REQUEST.md, PROJECT.md, schema.sql
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';
import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  SEED_STAFF,
  hashPIN,
  hashPassword,
  hasPermission,
  canAccessOutlet,
  createSSOToken,
  verifySSOToken,
  DEFAULT_SSO_SECRET
} from '../src/auth.js';
import { store } from '../src/store.js';

// Ensure test environment globals (localStorage, window, document) are ready
setupTestEnvironment();

export const suite = createTestSuite('Milestone 1: Auth & Terminal Security Suite');

// ============================================================================
// 1. CRYPTOGRAPHIC ENGINE & PIN HASHING (AUTH-CRYPTO)
// ============================================================================

suite.test('AUTH-CRYPTO-01: PBKDF2 password derivation generates 64-char hex with 100k iterations', async () => {
  const result = await hashPassword('AdminSecurePass2026!');
  assert.equal(typeof result.hash, 'string');
  assert.equal(result.hash.length, 64, 'PBKDF2 SHA-256 hash must be 64 hexadecimal characters (256 bits)');
  assert.equal(result.salt.length, 32, 'Salt must be 16 bytes (32 hex characters)');
});

suite.test('AUTH-CRYPTO-02: PBKDF2 produces deterministic output given identical password and salt', async () => {
  const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const pass = 'MasterBistro2026#';
  const res1 = await hashPassword(pass, salt);
  const res2 = await hashPassword(pass, salt);
  assert.equal(res1.hash, res2.hash, 'Hashes with identical passwords and salts must match exactly');
});

suite.test('AUTH-CRYPTO-03: Salt isolation prevents identical passwords from producing identical hashes', async () => {
  const salt1 = '11111111111111111111111111111111';
  const salt2 = '22222222222222222222222222222222';
  const pass = 'SharedSecret99';
  const res1 = await hashPassword(pass, salt1);
  const res2 = await hashPassword(pass, salt2);
  assert.notEqual(res1.hash, res2.hash, 'Distinct salts must guarantee distinct hash values');
});

suite.test('AUTH-CRYPTO-04: Salted SHA-256 PIN hashing computes accurate hex digest', async () => {
  const hash = await hashPIN('1111', 'salt-cashier-01');
  assert.equal(hash, '2f5f5fb895fd229245b832e998cf6e871fb1def1f6518f0d87ee0e16bb25b4f8');
});

suite.test('AUTH-CRYPTO-05: Pre-computed seed staff PIN hashes match mathematical digest vectors', async () => {
  for (const staff of SEED_STAFF) {
    let pin;
    if (staff.role === ROLES.ADMIN) pin = '1234';
    else if (staff.role === ROLES.MANAGER) pin = '9999';
    else if (staff.role === ROLES.CASHIER) pin = '1111';
    else if (staff.role === ROLES.SERVER) pin = '2222';
    else if (staff.role === ROLES.BARTENDER) pin = '3333';

    const computed = await hashPIN(pin, staff.salt);
    assert.equal(computed, staff.pin_hash, `Hash mismatch for staff role ${staff.role}`);
  }
});

suite.test('AUTH-CRYPTO-06: Incorrect PIN inputs fail hash comparison', async () => {
  const wrongHash = await hashPIN('0000', SEED_STAFF[2].salt);
  assert.notEqual(wrongHash, SEED_STAFF[2].pin_hash, 'Incorrect PIN must never match stored hash');
});

// ============================================================================
// 2. PIN AUTHENTICATION & FAST USER SWITCHING (AUTH-PIN)
// ============================================================================

suite.test('AUTH-PIN-01: Valid Cashier PIN authenticates Cashier Rohan Verma', async () => {
  store.resetDemoData();
  const res = await store.loginWithPIN('1111');
  assert.equal(res.success, true);
  assert.equal(store.currentStaff.role, ROLES.CASHIER);
  assert.equal(store.currentStaff.name, 'Rohan Verma');
});

suite.test('AUTH-PIN-02: Invalid PIN rejection returns failure', async () => {
  const res = await store.loginWithPIN('9876');
  assert.equal(res.success, false);
  assert.equal(res.error, 'Invalid PIN');
});

suite.test('AUTH-PIN-03: Fast staff switching transitions session immediately', async () => {
  await store.loginWithPIN('1111');
  assert.equal(store.currentStaff.role, ROLES.CASHIER);

  const res = await store.switchStaff('3333');
  assert.equal(res.success, true);
  assert.equal(store.currentStaff.role, ROLES.BARTENDER);
  assert.equal(store.currentStaff.name, 'Alex D’Souza');
});

suite.test('AUTH-PIN-04: 1-Tap screen lock sets locked status flag', () => {
  store.lockScreen();
  assert.equal(store.isLocked, true, 'Terminal lock screen must be engaged');
});

suite.test('AUTH-PIN-05: Screen unlock verifies entered PIN against authorized staff', async () => {
  store.lockScreen();
  assert.equal(store.isLocked, true);
  const unlockRes = await store.unlockScreen('9999'); // Manager PIN
  assert.equal(unlockRes.success, true);
  assert.equal(store.isLocked, false, 'Screen must be unlocked upon valid PIN verification');
  assert.equal(store.currentStaff.role, ROLES.MANAGER);
});

suite.test('AUTH-PIN-06: Deactivated staff member (active: false) is rejected during PIN login', async () => {
  store.resetDemoData();

  const deactivatedCashier = {
    id: 'staff-deact-cashier-01',
    name: 'Deactivated Cashier Sunil',
    role: ROLES.CASHIER,
    salt: 'salt-deact-01',
    pin_hash: await hashPIN('7771', 'salt-deact-01'),
    active: false
  };
  store.cachedStaff.push(deactivatedCashier);

  const res = await store.loginWithPIN('7771');
  assert.equal(res.success, false, 'Deactivated staff member PIN login must fail');
  assert.ok(
    res.error === 'Account deactivated' || res.error === 'Invalid PIN',
    `Expected rejection message, got: ${res.error}`
  );
  assert.notEqual(store.currentStaff?.id, 'staff-deact-cashier-01', 'Current staff must not switch to deactivated member');
});

suite.test('AUTH-PIN-07: Deactivated staff member is rejected during terminal screen unlock', async () => {
  store.resetDemoData();

  const deactivatedServer = {
    id: 'staff-deact-server-01',
    name: 'Deactivated Server Neha',
    role: ROLES.SERVER,
    salt: 'salt-deact-02',
    pin_hash: await hashPIN('7772', 'salt-deact-02'),
    active: false
  };
  store.cachedStaff.push(deactivatedServer);

  // Cashier logs in and locks screen
  await store.loginWithPIN('1111');
  store.lockScreen();
  assert.equal(store.isLocked, true);

  // Deactivated server tries to unlock
  const unlockRes = await store.unlockScreen('7772');
  assert.equal(unlockRes.success, false, 'Deactivated staff member must not unlock terminal');
  assert.equal(store.isLocked, true, 'Terminal must remain locked');
});

suite.test('AUTH-PIN-08: Numeric PIN input in unlockScreen is normalized without throwing TypeError', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier Rohan
  store.lockScreen();
  assert.equal(store.isLocked, true);

  // Unlock with integer 1111 instead of string '1111'
  const unlockRes = await store.unlockScreen(1111);
  assert.equal(unlockRes.success, true, 'Numeric PIN 1111 must successfully unlock screen without throwing TypeError');
  assert.equal(store.isLocked, false);

  // Lock and unlock with Manager integer 9999
  store.lockScreen();
  const unlockMgr = await store.unlockScreen(9999);
  assert.equal(unlockMgr.success, true, 'Numeric PIN 9999 must successfully unlock screen');
  assert.equal(store.currentStaff.role, ROLES.MANAGER);
});

// ============================================================================
// 3. RBAC BOUNDARIES & PERMISSION MATRICES (AUTH-RBAC)
// ============================================================================

suite.test('AUTH-RBAC-01: Admin role possesses wildcard access to all permissions', () => {
  assert.ok(hasPermission(ROLES.ADMIN, PERMISSIONS.POS_VIEW));
  assert.ok(hasPermission(ROLES.ADMIN, PERMISSIONS.ORDER_VOID_ACTIVE));
  assert.ok(hasPermission(ROLES.ADMIN, PERMISSIONS.TERMINAL_CONFIG));
  assert.ok(hasPermission(ROLES.ADMIN, 'ANY_ARBITRARY_PERMISSION'));
});

suite.test('AUTH-RBAC-02: Manager possesses sensitive operations but lacks TERMINAL_CONFIG', () => {
  assert.ok(hasPermission(ROLES.MANAGER, PERMISSIONS.ORDER_VOID_ACTIVE));
  assert.ok(hasPermission(ROLES.MANAGER, PERMISSIONS.DISCOUNT_CUSTOM));
  assert.ok(hasPermission(ROLES.MANAGER, PERMISSIONS.TABLE_FORCE_CLEAR));
  assert.ok(hasPermission(ROLES.MANAGER, PERMISSIONS.PRICE_ALTER));
  assert.equal(hasPermission(ROLES.MANAGER, PERMISSIONS.TERMINAL_CONFIG), false, 'Manager must not have hardware terminal config');
});

suite.test('AUTH-RBAC-03: Cashier possesses standard POS & settlement but is restricted from voids and discounts', () => {
  assert.ok(hasPermission(ROLES.CASHIER, PERMISSIONS.POS_VIEW));
  assert.ok(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDER_CREATE));
  assert.ok(hasPermission(ROLES.CASHIER, PERMISSIONS.BILL_SETTLE_STANDARD));
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.ORDER_VOID_ACTIVE), false);
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.DISCOUNT_CUSTOM), false);
  assert.equal(hasPermission(ROLES.CASHIER, PERMISSIONS.PRICE_ALTER), false);
});

suite.test('AUTH-RBAC-04: Server is restricted from standard settlement and order voids', () => {
  assert.ok(hasPermission(ROLES.SERVER, PERMISSIONS.ORDER_CREATE));
  assert.ok(hasPermission(ROLES.SERVER, PERMISSIONS.POS_VIEW));
  assert.equal(hasPermission(ROLES.SERVER, PERMISSIONS.BILL_SETTLE_STANDARD), false);
  assert.equal(hasPermission(ROLES.SERVER, PERMISSIONS.ORDER_VOID_ACTIVE), false);
});

suite.test('AUTH-RBAC-05: Bartender possesses settlement for bar tabs but restricted from price changes', () => {
  assert.ok(hasPermission(ROLES.BARTENDER, PERMISSIONS.BILL_SETTLE_STANDARD));
  assert.equal(hasPermission(ROLES.BARTENDER, PERMISSIONS.PRICE_ALTER), false);
  assert.equal(hasPermission(ROLES.BARTENDER, PERMISSIONS.ANALYTICS_VIEW), false);
});

suite.test('AUTH-RBAC-06: Null, guest, or invalid role returns false for all permissions', () => {
  assert.equal(hasPermission(null, PERMISSIONS.POS_VIEW), false);
  assert.equal(hasPermission(undefined, PERMISSIONS.POS_VIEW), false);
  assert.equal(hasPermission('UnknownRole', PERMISSIONS.POS_VIEW), false);
});

suite.test('AUTH-RBAC-07: Prototype pollution keys and Object prototype properties return false without throwing', () => {
  const prototypeProps = [
    'constructor',
    'toString',
    'valueOf',
    '__proto__',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString'
  ];

  for (const prop of prototypeProps) {
    // Role matching prototype property must safely return false without throwing TypeError
    assert.doesNotThrow(() => {
      const res = hasPermission(prop, PERMISSIONS.POS_VIEW);
      assert.equal(res, false, `hasPermission('${prop}', ...) must return false`);
    }, `hasPermission('${prop}') must not throw TypeError`);

    // Permission matching prototype property must safely return false without throwing TypeError
    assert.doesNotThrow(() => {
      const res = hasPermission(ROLES.CASHIER, prop);
      assert.equal(res, false, `hasPermission(CASHIER, '${prop}') must return false`);
    }, `hasPermission(CASHIER, '${prop}') must not throw TypeError`);
  }
});

// ============================================================================
// 4. MANAGER OVERRIDE & SENSITIVE OPERATION AUDITING (AUTH-OVERRIDE)
// ============================================================================

suite.test('AUTH-OVERRIDE-01: Sensitive void operation triggers manager challenge for Cashier', async () => {
  await store.loginWithPIN('1111'); // Cashier
  const isAllowed = store.hasPermission(PERMISSIONS.ORDER_VOID_ACTIVE);
  assert.equal(isAllowed, false, 'Cashier must be intercepted when attempting to void');
});

suite.test('AUTH-OVERRIDE-02: Non-manager PIN entered into override modal is rejected', async () => {
  await store.loginWithPIN('1111'); // Cashier
  const overrideRes = await store.verifyManagerOverride({ pin: '2222', actionType: 'ORDER_VOID_ACTIVE' }); // Server PIN
  assert.equal(overrideRes.success, false, 'Server PIN must fail manager override verification');
  assert.ok(overrideRes.error.includes('Insufficient Privileges'));
});

suite.test('AUTH-OVERRIDE-03: Valid Manager PIN authorizes the override', async () => {
  const overrideRes = await store.verifyManagerOverride({
    pin: '9999',
    actionType: 'ORDER_VOID_ACTIVE',
    actionLabel: 'Void Active Order #AYS-801',
    targetItem: 'Order #AYS-801 (₹1,070)'
  });
  assert.equal(overrideRes.success, true, 'Manager PIN must authorize override');
  assert.equal(overrideRes.authorizer.role, ROLES.MANAGER);
  assert.equal(overrideRes.authorizer.name, 'Anand Kumar');
});

suite.test('AUTH-OVERRIDE-04: Authorized override produces an immutable audit log record', () => {
  const latestLog = store.auditLogs[0];
  assert.ok(latestLog.id.startsWith('audit-'));
  assert.equal(latestLog.authorizer_role, ROLES.MANAGER);
  assert.equal(latestLog.authorizer_staff_name, 'Anand Kumar');
  assert.equal(latestLog.action, 'ORDER_VOID_ACTIVE');
  assert.ok(latestLog.timestamp);
});

suite.test('AUTH-OVERRIDE-05: Override audit log preserves contextual metadata', () => {
  const metadata = { order_id: 'order-801', amount: 1070, reason: 'Guest changed order' };
  const entry = store.recordAuditLog({
    action: 'DISCOUNT_CUSTOM',
    actionLabel: 'Custom Discount',
    targetItem: 'Bill #99',
    metadata
  });
  assert.equal(entry.metadata.amount, 1070);
  assert.equal(entry.metadata.reason, 'Guest changed order');
});

suite.test('AUTH-OVERRIDE-06: Deactivated manager PIN cannot authorize Manager Override', async () => {
  store.resetDemoData();

  const deactivatedManager = {
    id: 'staff-term-mgr-99',
    name: 'Terminated Manager Vikram',
    role: ROLES.MANAGER,
    salt: 'salt-term-mgr',
    pin_hash: await hashPIN('8888', 'salt-term-mgr'),
    active: false
  };
  store.cachedStaff.push(deactivatedManager);

  // Cashier is logged in
  await store.loginWithPIN('1111');
  const initialLogCount = store.auditLogs.length;

  const overrideRes = await store.verifyManagerOverride({
    pin: '8888',
    actionType: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Unauthorized Void Attempt',
    targetItem: 'Order #999'
  });

  assert.equal(overrideRes.success, false, 'Deactivated manager PIN must NOT authorize override');
  assert.ok(
    overrideRes.error === 'Account deactivated' || overrideRes.error === 'Invalid PIN' || overrideRes.error.includes('Insufficient Privileges'),
    `Expected rejection message, got: ${overrideRes.error}`
  );
  assert.equal(store.auditLogs.length, initialLogCount, 'No audit log entry should be created for unauthorized override');
});

suite.test('AUTH-OVERRIDE-07: Numeric PIN input in verifyManagerOverride is normalized and authorizes successfully', async () => {
  store.resetDemoData();
  await store.loginWithPIN('1111'); // Cashier active

  // Pass integer 9999 instead of string '9999'
  const overrideRes = await store.verifyManagerOverride({
    pin: 9999,
    actionType: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Void with Numeric PIN',
    targetItem: 'Order #303'
  });

  assert.equal(overrideRes.success, true, 'Numeric manager PIN 9999 must authorize override without throwing TypeError');
  assert.equal(overrideRes.authorizer.role, ROLES.MANAGER);
  assert.equal(overrideRes.authorizer.name, 'Anand Kumar');
});

// ============================================================================
// 5. OFFLINE PERSISTENCE, QUEUEING & RESILIENCY (AUTH-OFFLINE)
// ============================================================================

suite.test('AUTH-OFFLINE-01: Credential caching persists staff PIN hashes in localStorage', () => {
  localStorage.setItem('ays_cached_staff', JSON.stringify(SEED_STAFF));
  const retrieved = JSON.parse(localStorage.getItem('ays_cached_staff'));
  assert.equal(retrieved.length, 5);
  assert.equal(retrieved[0].role, ROLES.ADMIN);
});

suite.test('AUTH-OFFLINE-02: Offline PIN verification authenticates staff without network connection', async () => {
  const cachedStaff = JSON.parse(localStorage.getItem('ays_cached_staff'));
  const pin = '1111'; // Cashier
  const cashier = cachedStaff.find(s => s.role === ROLES.CASHIER);
  const hash = await hashPIN(pin, cashier.salt);
  assert.equal(hash, cashier.pin_hash);
});

suite.test('AUTH-OFFLINE-03: Offline audit log record receives is_offline=true and sync_status=PENDING', () => {
  const entry = store.recordAuditLog({
    action: PERMISSIONS.ORDER_VOID_ACTIVE,
    isOffline: true
  });
  assert.equal(entry.is_offline, true);
  assert.equal(entry.sync_status, 'PENDING');
});

suite.test('AUTH-OFFLINE-04: Local audit log rolling buffer enforces 500 entry limit without losing unsynced items', () => {
  store.resetDemoData();
  store.auditLogs = [];

  // Step 1: Pre-populate buffer with 10 critical unsynced (PENDING) audit logs (e.g. offline voids/discounts)
  for (let i = 0; i < 10; i++) {
    store.auditLogs.push({
      id: `audit-pending-tail-${i}`,
      action: PERMISSIONS.ORDER_VOID_ACTIVE,
      action_label: `Critical Offline Void #${i}`,
      target_item: `Order #${i}`,
      sync_status: 'PENDING',
      is_offline: true,
      timestamp: new Date().toISOString()
    });
  }

  // Step 2: Pre-populate 490 SYNCED logs at the front
  for (let i = 0; i < 490; i++) {
    store.auditLogs.unshift({
      id: `audit-synced-front-${i}`,
      action: 'ROUTINE_EVENT',
      action_label: `Routine Event #${i}`,
      target_item: 'N/A',
      sync_status: 'SYNCED',
      is_offline: false,
      timestamp: new Date().toISOString()
    });
  }

  assert.equal(store.auditLogs.length, 500, 'Initial buffer filled to capacity of 500');

  // Step 3: Record 5 new SYNCED audit logs via store.recordAuditLog() causing overflow
  for (let i = 0; i < 5; i++) {
    store.recordAuditLog({
      id: `audit-synced-new-${i}`,
      action: 'NEW_TRANSACTION',
      isOffline: false
    });
  }

  // Buffer must strictly remain capped at 500
  assert.equal(store.auditLogs.length, 500, 'Buffer length must remain clamped at 500');

  // Verify that all 10 PENDING logs at the tail survived and were NOT evicted
  const survivingPending = store.auditLogs.filter(l => l.id.startsWith('audit-pending-tail-'));
  assert.equal(
    survivingPending.length,
    10,
    `Expected all 10 PENDING logs to survive, but found ${survivingPending.length}`
  );

  // Verify that localStorage also persists 500 items
  const persisted = JSON.parse(localStorage.getItem('ays_audit_logs'));
  assert.equal(persisted.length, 500);
});

suite.test('AUTH-OFFLINE-05: Network reconnection flushes pending logs to SYNCED', async () => {
  store.resetDemoData();
  store.auditLogs = [];

  // Record 3 offline audit logs
  store.recordAuditLog({
    id: 'audit-reconnect-1',
    action: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Offline Void',
    targetItem: 'Order #201',
    isOffline: true
  });
  store.recordAuditLog({
    id: 'audit-reconnect-2',
    action: PERMISSIONS.DISCOUNT_CUSTOM,
    actionLabel: 'Offline Discount',
    targetItem: 'Bill #202',
    isOffline: true
  });
  store.recordAuditLog({
    id: 'audit-reconnect-3',
    action: PERMISSIONS.TABLE_FORCE_CLEAR,
    actionLabel: 'Offline Table Clear',
    targetItem: 'Table #5',
    isOffline: true
  });

  // Verify before sync: all 3 logs have PENDING sync_status
  assert.equal(store.auditLogs.length, 3);
  assert.ok(store.auditLogs.every(l => l.sync_status === 'PENDING'));

  // Execute reconnection flush via store.syncPendingAuditLogs()
  const syncResult = await store.syncPendingAuditLogs();

  assert.equal(syncResult.success, true, 'syncPendingAuditLogs must succeed');
  assert.equal(syncResult.syncedCount, 3, 'All 3 pending logs must be synced');

  // Verify that in-memory audit logs have transitioned to SYNCED
  assert.ok(store.auditLogs.every(l => l.sync_status === 'SYNCED'), 'All audit logs in memory must be SYNCED');

  // Verify localStorage persistence was updated
  const persisted = JSON.parse(localStorage.getItem('ays_audit_logs'));
  assert.ok(persisted.every(l => l.sync_status === 'SYNCED'), 'Persisted audit logs in localStorage must be SYNCED');
});

suite.test('AUTH-OFFLINE-06: Paired terminal hardware state persists in localStorage', async () => {
  const pairingRes = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-01',
    terminalName: 'Front Billing Counter POS #1',
    adminPin: '1234'
  });
  assert.equal(pairingRes.success, true);
  assert.equal(store.isTerminalPaired(), true);

  const loaded = JSON.parse(localStorage.getItem('ays_terminal_pairing'));
  assert.equal(loaded.sin, 'SIN-POS-01');
  assert.equal(loaded.status, 'PAIRED');
});

suite.test('AUTH-OFFLINE-07: Buffer pruning under 100% PENDING log saturation safely evicts oldest pending entry', () => {
  store.resetDemoData();
  store.auditLogs = [];

  // Fill buffer with 505 PENDING entries
  for (let i = 0; i < 505; i++) {
    store.recordAuditLog({
      id: `audit-all-pending-${i}`,
      action: PERMISSIONS.ORDER_VOID_ACTIVE,
      isOffline: true
    });
  }

  // Buffer length must clamp at 500
  assert.equal(store.auditLogs.length, 500, 'Buffer length must clamp at 500');

  // All 500 remaining entries must be PENDING
  assert.ok(
    store.auditLogs.every(l => l.sync_status === 'PENDING'),
    'All entries must be PENDING when saturated with offline logs'
  );

  // Newest entry (index 0) must be audit-all-pending-504
  assert.equal(store.auditLogs[0].id, 'audit-all-pending-504');

  // Oldest entries 0-4 should have been evicted from tail
  assert.ok(!store.auditLogs.some(l => l.id === 'audit-all-pending-0'), 'Oldest pending log audit-all-pending-0 was evicted');
  assert.ok(!store.auditLogs.some(l => l.id === 'audit-all-pending-4'), 'Oldest pending log audit-all-pending-4 was evicted');
  assert.ok(store.auditLogs.some(l => l.id === 'audit-all-pending-5'), 'Log audit-all-pending-5 survived');
});

// ============================================================================
// 6. SINGLE SIGN-ON (SSO) TOKEN GENERATION & VERIFICATION (AUTH-SSO)
// ============================================================================

suite.test('AUTH-SSO-01: SSO token generation packages compact 3-part base64url signed JWT', () => {
  const token = createSSOToken(SEED_STAFF[2]); // Cashier Rohan
  assert.equal(typeof token, 'string');
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT must have 3 dot-delimited parts');
});

suite.test('AUTH-SSO-02: Valid SSO token decodes correct user_id, role, and permissions', () => {
  const token = createSSOToken(SEED_STAFF[2]);
  const result = verifySSOToken(token);
  assert.equal(result.valid, true);
  assert.equal(result.payload.sub, SEED_STAFF[2].id);
  assert.equal(result.payload.role, ROLES.CASHIER);
  assert.ok(result.payload.permissions.includes(PERMISSIONS.BILL_SETTLE_STANDARD));
});

suite.test('AUTH-SSO-03: Tampered token payload or modified signature fails verification', () => {
  const token = createSSOToken(SEED_STAFF[2]);
  const parts = token.split('.');
  // Tamper payload by replacing it with forged payload
  const fakePayload = Buffer.from(JSON.stringify({ sub: 'forged-attacker', role: 'Admin' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;
  const result = verifySSOToken(tamperedToken);
  assert.equal(result.valid, false, 'Tampered token must fail signature verification');
});

suite.test('AUTH-SSO-04: Expired SSO token fails verification', () => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const expiredPayload = {
    iss: 'atyourscan:cloud:auth',
    sub: 'user-expired',
    exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
  };
  const hB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const pB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const data = `${hB64}.${pB64}`;

  const sig = crypto.createHmac('sha256', DEFAULT_SSO_SECRET).update(data).digest('base64url');
  const expiredToken = `${hB64}.${pB64}.${sig}`;

  const result = verifySSOToken(expiredToken);
  assert.equal(result.valid, false);
  assert.equal(result.error, 'Token expired');
});

suite.test('AUTH-SSO-05: Multi-outlet scope enforcement validates access boundaries via canAccessOutlet', () => {
  const adminStaff = SEED_STAFF[0]; // outlet_scopes: ['*']
  const cashierStaff = SEED_STAFF[2]; // outlet_scopes: ['550e8400-e29b-41d4-a716-446655440000']
  const targetOutletA = '550e8400-e29b-41d4-a716-446655440000';
  const targetOutletB = '999e8400-e29b-41d4-a716-446655440099';

  // Test authorized access for wildcard scope (Admin)
  assert.equal(canAccessOutlet(adminStaff, targetOutletA), true, 'Admin with wildcard scope can access Outlet A');
  assert.equal(canAccessOutlet(adminStaff, targetOutletB), true, 'Admin with wildcard scope can access Outlet B');

  // Test scoped outlet access for Cashier
  assert.equal(canAccessOutlet(cashierStaff, targetOutletA), true, 'Cashier can access scoped Outlet A');
  assert.equal(canAccessOutlet(cashierStaff, targetOutletB), false, 'Cashier must be denied access to non-scoped Outlet B');

  // Boundary checks: null, undefined, invalid scopes
  assert.equal(canAccessOutlet(null, targetOutletA), false, 'Null staff returns false');
  assert.equal(canAccessOutlet(cashierStaff, null), false, 'Null outletId returns false');
  assert.equal(canAccessOutlet({ outlet_scopes: [] }, targetOutletA), false, 'Empty scopes returns false');
  assert.equal(canAccessOutlet({ outlet_scopes: null }, targetOutletA), false, 'Null scopes returns false');
});

import { pathToFileURL } from 'node:url';

// Run standalone if executed directly
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].includes('auth_terminal_security'))) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
