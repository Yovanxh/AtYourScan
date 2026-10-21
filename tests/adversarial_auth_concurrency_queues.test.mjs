/**
 * tests/adversarial_auth_concurrency_queues.test.mjs
 * 
 * Milestone 1 Adversarial Store Auth, Concurrency, and Offline Queue Stress Suite
 * Challenger 2 (Store Concurrency, Offline Queues & Stress Testing)
 * 
 * Challenge Dimensions:
 * 1. Concurrent staff switching & lock/unlock cycles under rapid sequential and asynchronous calls.
 * 2. Audit log queue boundaries: 500-entry rolling buffer, unsynced (PENDING) retention vs SYNCED pruning.
 * 3. Offline partition simulation: navigator.onLine = false, staff PIN logins, manager overrides, persistence.
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';
import {
  ROLES,
  PERMISSIONS,
  SEED_STAFF,
  hashPIN,
  verifyPIN
} from '../src/auth.js';
import { store } from '../src/store.js';

setupTestEnvironment();

export const suite = createTestSuite('M1 Challenger 2: Store Auth Concurrency & Offline Queues Stress Suite');

// Helper to set navigator.onLine safely in Node.js
function setNetworkOnline(online) {
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { onLine: online };
  } else {
    try {
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: online,
        configurable: true,
        writable: true
      });
    } catch {
      globalThis.navigator.onLine = online;
    }
  }
}

// Helper to reset store and local storage
function resetStoreClean() {
  localStorage.clear();
  setNetworkOnline(true);
  store.resetDemoData();
}

// ============================================================================
// 1. CONCURRENT STAFF SWITCHING & LOCK/UNLOCK CYCLES
// ============================================================================

suite.test('ADV-AUTH-01: Rapid sequential staff switching across 5 roles maintains session & audit log integrity', async () => {
  resetStoreClean();
  
  const staffSequence = [
    { pin: '1234', name: 'Dev Anand', role: ROLES.ADMIN },
    { pin: '9999', name: 'Anand Kumar', role: ROLES.MANAGER },
    { pin: '1111', name: 'Rohan Verma', role: ROLES.CASHIER },
    { pin: '2222', name: 'Priya Sharma', role: ROLES.SERVER },
    { pin: '3333', name: 'Alex D’Souza', role: ROLES.BARTENDER }
  ];

  const initialLogCount = store.auditLogs.length;
  const cycles = 10; // 10 cycles * 5 staff = 50 sequential switches

  for (let c = 0; c < cycles; c++) {
    for (const member of staffSequence) {
      const res = await store.switchStaff(member.pin);
      assert.equal(res.success, true, `Switch to ${member.name} must succeed`);
      assert.equal(store.currentStaff.role, member.role, `Current role must be ${member.role}`);
      assert.equal(store.currentStaff.name, member.name, `Current name must be ${member.name}`);
      assert.equal(store.isLocked, false, 'Terminal must not be locked after switch');
    }
  }

  // Verify that all 50 staff switch events were recorded in audit logs
  const switchLogs = store.auditLogs.filter(l => l.action === 'STAFF_SWITCH');
  assert.equal(switchLogs.length, cycles * staffSequence.length, 'Every staff switch must produce an audit log');
  
  // Verify localStorage persistence of latest staff
  const persistedStaff = JSON.parse(localStorage.getItem('ays_current_staff'));
  assert.equal(persistedStaff.name, 'Alex D’Souza');
  assert.equal(persistedStaff.role, ROLES.BARTENDER);
});

suite.test('ADV-AUTH-02: Parallel asynchronous staff switching (contention race) yields consistent valid state', async () => {
  resetStoreClean();

  const candidates = [
    { pin: '1234', name: 'Dev Anand', role: ROLES.ADMIN },
    { pin: '9999', name: 'Anand Kumar', role: ROLES.MANAGER },
    { pin: '1111', name: 'Rohan Verma', role: ROLES.CASHIER },
    { pin: '2222', name: 'Priya Sharma', role: ROLES.SERVER },
    { pin: '3333', name: 'Alex D’Souza', role: ROLES.BARTENDER }
  ];

  // Fire 20 parallel switch requests concurrently
  const parallelCalls = Array.from({ length: 20 }, (_, i) => {
    const candidate = candidates[i % candidates.length];
    return store.switchStaff(candidate.pin);
  });

  const results = await Promise.all(parallelCalls);

  // All 20 calls must return success: true
  assert.equal(results.length, 20);
  assert.ok(results.every(r => r.success === true), 'All parallel switch calls must succeed');

  // Terminal state must be valid and non-null
  assert.ok(store.currentStaff, 'Current staff must exist');
  assert.ok(candidates.some(c => c.name === store.currentStaff.name), 'Current staff must match one of valid candidates');
  assert.equal(store.isLocked, false, 'Terminal must remain unlocked');

  // Verify store.currentStaff matches localStorage
  const persisted = JSON.parse(localStorage.getItem('ays_current_staff'));
  assert.equal(persisted.id, store.currentStaff.id, 'LocalStorage staff matches store staff');
});

suite.test('ADV-AUTH-03: Rapid lock and unlock cycles preserve consistent terminal state', async () => {
  resetStoreClean();

  // 50 rapid sequential cycles of lock -> verify -> unlock -> verify
  for (let i = 0; i < 50; i++) {
    store.lockScreen();
    assert.equal(store.isLocked, true, `Cycle ${i}: store.isLocked must be true after lockScreen()`);
    assert.equal(localStorage.getItem('ays_is_locked'), 'true', `Cycle ${i}: localStorage must be true`);

    const unlockRes = await store.unlockScreen('1111'); // Cashier PIN
    assert.equal(unlockRes.success, true, `Cycle ${i}: unlock must succeed`);
    assert.equal(store.isLocked, false, `Cycle ${i}: store.isLocked must be false after unlockScreen()`);
    assert.equal(localStorage.getItem('ays_is_locked'), 'false', `Cycle ${i}: localStorage must be false`);
  }
});

suite.test('ADV-AUTH-04: Concurrent unlock contention with mixed valid and invalid PINs', async () => {
  resetStoreClean();

  store.lockScreen();
  assert.equal(store.isLocked, true);

  // 10 concurrent unlock attempts: 5 invalid, 5 valid PINs
  const attempts = [
    { pin: '0000', expected: false },
    { pin: '9999', expected: true },  // Manager
    { pin: 'wrong', expected: false },
    { pin: '1111', expected: true },  // Cashier
    { pin: '8888', expected: false },
    { pin: '1234', expected: true },  // Admin
    { pin: '12', expected: false },
    { pin: '2222', expected: true },  // Server
    { pin: '9999999', expected: false },
    { pin: '3333', expected: true }   // Bartender
  ];

  const results = await Promise.all(attempts.map(a => store.unlockScreen(a.pin)));

  for (let i = 0; i < attempts.length; i++) {
    assert.equal(results[i].success, attempts[i].expected, `Attempt with PIN ${attempts[i].pin} should be ${attempts[i].expected}`);
  }

  // Final terminal state must be unlocked with a valid staff member
  assert.equal(store.isLocked, false, 'Terminal must be unlocked after valid unlock attempts');
  assert.ok(store.currentStaff, 'Current staff must be set');
});

suite.test('ADV-AUTH-05: Unlocking with different staff PIN switches session and updates permissions', async () => {
  resetStoreClean();

  // Active user starts as Cashier Rohan Verma
  await store.loginWithPIN('1111');
  assert.equal(store.currentStaff.role, ROLES.CASHIER);
  assert.equal(store.hasPermission(PERMISSIONS.ORDER_VOID_ACTIVE), false, 'Cashier lacks void permission');

  // Lock terminal
  store.lockScreen();
  assert.equal(store.isLocked, true);

  // Manager Anand unlocks with '9999'
  const unlockRes = await store.unlockScreen('9999');
  assert.equal(unlockRes.success, true);
  assert.equal(store.isLocked, false);
  assert.equal(store.currentStaff.name, 'Anand Kumar', 'Session switched to Manager Anand');
  assert.equal(store.currentStaff.role, ROLES.MANAGER);
  assert.equal(store.hasPermission(PERMISSIONS.ORDER_VOID_ACTIVE), true, 'Manager has void permission');
});

suite.test('ADV-AUTH-06: Permission checks during screen lock state', () => {
  resetStoreClean();

  // Manager Anand is logged in
  store.currentStaff = SEED_STAFF.find(s => s.role === ROLES.MANAGER);
  store.lockScreen();
  assert.equal(store.isLocked, true);

  // Document behavior: store.hasPermission evaluates role permissions
  // Note whether it evaluates or blocks on lock
  const hasVoid = store.hasPermission(PERMISSIONS.ORDER_VOID_ACTIVE);
  assert.equal(hasVoid, true, 'hasPermission reflects currentStaff permissions matrix');
});

// ============================================================================
// 2. AUDIT LOG QUEUE BOUNDARIES & 500-ENTRY ROLLING BUFFER PRUNING
// ============================================================================

suite.test('ADV-QUEUE-01: Audit log queue caps at 500 entries on buffer overflow', () => {
  resetStoreClean();
  store.auditLogs = [];

  // Generate 550 log entries
  for (let i = 0; i < 550; i++) {
    store.recordAuditLog({
      action: `TEST_ACTION_${i}`,
      actionLabel: `Test Action ${i}`,
      targetItem: `Item-${i}`,
      isOffline: false
    });
  }

  assert.equal(store.auditLogs.length, 500, 'Audit log length must be strictly capped at 500');
  
  // Verify localStorage persistence also capped at 500
  const persisted = JSON.parse(localStorage.getItem('ays_audit_logs'));
  assert.equal(persisted.length, 500, 'LocalStorage audit log count must be capped at 500');
});

suite.test('ADV-QUEUE-02: Rolling buffer pruning MUST retain unsynced (PENDING) logs while pruning older SYNCED logs', () => {
  resetStoreClean();
  store.auditLogs = [];

  // Step 1: Pre-populate buffer with 10 critical unsynced (PENDING) audit logs (e.g. offline voids/discounts)
  const pendingLogs = [];
  for (let i = 0; i < 10; i++) {
    const entry = store.recordAuditLog({
      id: `critical-pending-${i}`,
      action: PERMISSIONS.ORDER_VOID_ACTIVE,
      actionLabel: `Critical Offline Void #${i}`,
      targetItem: `Order #${i}`,
      isOffline: true
    });
    // Ensure sync_status is PENDING
    assert.equal(entry.sync_status, 'PENDING');
    pendingLogs.push(entry.id);
  }
  assert.equal(store.auditLogs.length, 10);

  // Step 2: Now flood the store with 500 SYNCED audit logs
  for (let i = 0; i < 500; i++) {
    // Manually push/record synced logs
    const log = {
      id: `synced-routine-${i}`,
      venue_id: store.venue.id,
      terminal_sin: 'SIN-POS-01',
      action: 'ROUTINE_EVENT',
      action_label: `Routine Event #${i}`,
      target_item: 'N/A',
      initiator_staff_name: 'Cashier',
      initiator_role: 'Cashier',
      metadata: {},
      is_offline: false,
      timestamp: new Date().toISOString(),
      sync_status: 'SYNCED'
    };
    store.auditLogs.unshift(log);
    
    // Check pruning logic in store
    if (store.auditLogs.length > 500) {
      // Look at what store.js does:
      // In src/store.js lines 1676-1678:
      // if (this.auditLogs.length > 500) {
      //   this.auditLogs = this.auditLogs.slice(0, 500);
      // }
      const oldestSyncedIdx = store.auditLogs.findIndex(l => l.sync_status === 'SYNCED');
      // If store does not prioritize pruning SYNCED, pending logs will be sliced off at the tail!
    }
  }

  // Now test store's actual recordAuditLog behavior directly:
  // Reset store.auditLogs to exact state: 495 SYNCED logs, plus 10 PENDING logs at the tail
  store.auditLogs = [];
  // Add 10 PENDING logs first (at tail)
  for (let i = 0; i < 10; i++) {
    store.auditLogs.push({
      id: `test-pending-must-survive-${i}`,
      action: 'CRITICAL_OFFLINE_VOID',
      sync_status: 'PENDING'
    });
  }
  // Add 490 SYNCED logs at front
  for (let i = 0; i < 490; i++) {
    store.auditLogs.unshift({
      id: `test-synced-routine-${i}`,
      action: 'ROUTINE_EVENT',
      sync_status: 'SYNCED'
    });
  }
  assert.equal(store.auditLogs.length, 500);

  // Now call store.recordAuditLog to add 5 more SYNCED logs
  for (let i = 0; i < 5; i++) {
    store.recordAuditLog({
      action: `NEW_SYNCED_${i}`,
      isOffline: false
    });
  }

  // Buffer length must remain 500
  assert.equal(store.auditLogs.length, 500, 'Audit log length must be 500');

  // CRITICAL REQUIREMENT CHECK:
  // "verify that unsynced (PENDING) logs are never discarded while older synced logs are pruned."
  const survivingPending = store.auditLogs.filter(l => l.id.startsWith('test-pending-must-survive-'));
  
  // Did store.recordAuditLog discard the pending logs at the tail?
  console.log(`    [QUEUE CHECK] Surviving PENDING logs count: ${survivingPending.length} / 10`);
  assert.equal(
    survivingPending.length, 
    10, 
    `UNSYNCED LOG LOSS DEFECT: ${10 - survivingPending.length} PENDING logs were discarded while SYNCED logs were retained! store.recordAuditLog() uses slice(0, 500) which evicts from the tail regardless of sync_status!`
  );
});

suite.test('ADV-QUEUE-03: Buffer pruning under all-PENDING log saturation', () => {
  resetStoreClean();
  store.auditLogs = [];

  // Flooding buffer with 520 PENDING logs
  for (let i = 0; i < 520; i++) {
    store.recordAuditLog({
      id: `audit-offline-${i}`,
      action: 'OFFLINE_ORDER',
      isOffline: true
    });
  }

  assert.equal(store.auditLogs.length, 500, 'Buffer length clamped to 500');
  assert.ok(store.auditLogs.every(l => l.sync_status === 'PENDING'), 'All remaining logs are PENDING');
});

// ============================================================================
// 3. OFFLINE PARTITION SIMULATION (navigator.onLine = false)
// ============================================================================

suite.test('ADV-OFFLINE-01: Offline partition: staff PIN logins succeed with zero network access', async () => {
  resetStoreClean();

  // Simulate offline network partition
  setNetworkOnline(false);

  // All 5 staff members must be able to log in offline via cached PIN hashes
  const staffToTest = [
    { pin: '1111', role: ROLES.CASHIER, name: 'Rohan Verma' },
    { pin: '2222', role: ROLES.SERVER, name: 'Priya Sharma' },
    { pin: '3333', role: ROLES.BARTENDER, name: 'Alex D’Souza' },
    { pin: '9999', role: ROLES.MANAGER, name: 'Anand Kumar' },
    { pin: '1234', role: ROLES.ADMIN, name: 'Dev Anand' }
  ];

  for (const st of staffToTest) {
    const res = await store.loginWithPIN(st.pin);
    assert.equal(res.success, true, `Offline login for ${st.name} must succeed`);
    assert.equal(store.currentStaff.role, st.role);
    assert.equal(store.currentStaff.name, st.name);
    assert.equal(store.isLocked, false);
  }

  // Restore network online
  setNetworkOnline(true);
});

suite.test('ADV-OFFLINE-02: Offline partition: Manager Override rejects unauthorized role and approves manager', async () => {
  resetStoreClean();

  setNetworkOnline(false);

  // Current active staff is Cashier Rohan
  await store.loginWithPIN('1111');
  assert.equal(store.currentStaff.role, ROLES.CASHIER);

  // Attempt sensitive order void override with Cashier PIN '1111' -> MUST REJECT
  const cashierReject = await store.verifyManagerOverride({
    pin: '1111',
    actionType: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Void Active Order #AYS-801',
    targetItem: 'Order #AYS-801 (₹1,070)',
    initiator: store.currentStaff
  });

  assert.equal(cashierReject.success, false, 'Cashier PIN must NOT authorize manager override');
  assert.ok(cashierReject.error.includes('Manager or Admin PIN required'), 'Rejection error message is descriptive');

  // Attempt sensitive order void override with Manager PIN '9999' -> MUST APPROVE
  const managerApprove = await store.verifyManagerOverride({
    pin: '9999',
    actionType: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Void Active Order #AYS-801',
    targetItem: 'Order #AYS-801 (₹1,070)',
    initiator: store.currentStaff
  });

  assert.equal(managerApprove.success, true, 'Manager PIN must authorize manager override offline');
  assert.equal(managerApprove.authorizer.role, ROLES.MANAGER);
  assert.equal(managerApprove.authorizer.name, 'Anand Kumar');

  setNetworkOnline(true);
});

suite.test('ADV-OFFLINE-03: Offline override produces audit log with is_offline=true and sync_status=PENDING', async () => {
  resetStoreClean();

  setNetworkOnline(false);

  await store.loginWithPIN('1111');

  const res = await store.verifyManagerOverride({
    pin: '9999',
    actionType: PERMISSIONS.ORDER_VOID_ACTIVE,
    actionLabel: 'Void Active Order #AYS-801',
    targetItem: 'Order #AYS-801',
    initiator: store.currentStaff
  });

  assert.equal(res.success, true);
  
  // Check the audit log generated
  const latestLog = store.auditLogs[0];
  assert.ok(latestLog, 'Audit log was created');
  assert.equal(latestLog.is_offline, true, 'Audit log must mark is_offline: true');
  assert.equal(latestLog.sync_status, 'PENDING', 'Audit log must mark sync_status: PENDING');
  assert.equal(latestLog.authorizer_role, ROLES.MANAGER);
  assert.equal(latestLog.initiator_role, ROLES.CASHIER);

  setNetworkOnline(true);
});

suite.test('ADV-OFFLINE-04: Offline partition state persists in LocalStorage and survives browser refresh', async () => {
  resetStoreClean();

  setNetworkOnline(false);

  // Switch to Server Priya
  await store.switchStaff('2222');
  store.lockScreen();

  // Verify persistence in localStorage
  const savedStaff = JSON.parse(localStorage.getItem('ays_current_staff'));
  assert.equal(savedStaff.name, 'Priya Sharma');
  assert.equal(savedStaff.role, ROLES.SERVER);

  const savedLock = localStorage.getItem('ays_is_locked');
  assert.equal(savedLock, 'true');

  const savedLogs = JSON.parse(localStorage.getItem('ays_audit_logs'));
  assert.ok(Array.isArray(savedLogs));
  assert.ok(savedLogs.length > 0);
  assert.equal(savedLogs[0].action, 'STAFF_SWITCH');
  assert.equal(savedLogs[0].is_offline, true);
  assert.equal(savedLogs[0].sync_status, 'PENDING');

  setNetworkOnline(true);
});

suite.test('ADV-OFFLINE-05: Reconnection observation: pending audit logs retain PENDING status until reconciled', () => {
  resetStoreClean();

  // Simulate 3 pending logs recorded while offline
  const pending1 = store.recordAuditLog({ action: 'OFFLINE_VOID_1', isOffline: true });
  const pending2 = store.recordAuditLog({ action: 'OFFLINE_DISCOUNT_1', isOffline: true });

  assert.equal(pending1.sync_status, 'PENDING');
  assert.equal(pending2.sync_status, 'PENDING');

  // Network comes back online
  setNetworkOnline(true);

  // Verify that merely restoring navigator.onLine does NOT mutate existing pending logs
  assert.equal(pending1.sync_status, 'PENDING', 'Pending logs stay PENDING until explicit sync reconciliation');
  assert.equal(pending2.sync_status, 'PENDING');
});

suite.test('ADV-OFFLINE-06: Corrupted or missing staff cache fallback resilience', async () => {
  resetStoreClean();

  // Corrupt ays_cached_staff in localStorage
  localStorage.setItem('ays_cached_staff', 'INVALID_JSON_CORRUPTED_CACHE{{{');

  // Attempt loginWithPIN: store should fall back gracefully or handle error without crashing
  let errorCaught = false;
  try {
    const res = await store.loginWithPIN('1111');
    // If it fell back to SEED_STAFF, success is true
    assert.ok(res.success !== undefined);
  } catch (err) {
    errorCaught = true;
  }
  assert.equal(errorCaught, false, 'store.loginWithPIN must not crash on corrupted localStorage');
});

// Run standalone if executed directly
import { pathToFileURL } from 'node:url';

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].includes('adversarial_auth_concurrency_queues'))) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
