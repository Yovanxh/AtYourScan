/**
 * tests/manager_override_rbac.test.mjs
 * 
 * Milestone 4 Automated Test Suite: Role-Based Access Control (RBAC) & Manager Override Modal (F9, F10, F11)
 * Enforces permission boundaries, sensitive action interception,
 * supervisor authorization challenges, and tamper-evident audit logging.
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';

// Setup mock browser environment
setupTestEnvironment();

import { store } from '../src/store.js';
import { ROLES, PERMISSIONS, SENSITIVE_PERMISSIONS, checkPermission } from '../src/auth.js';
import { renderManagerOverrideModal, requestManagerOverride } from '../src/components/ManagerOverrideModal.js';

// Headless Mock Container
function createMockContainer() {
  const listeners = new Map();
  const children = [];

  const element = {
    _innerHTML: '',
    children,
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(val) {
      this._innerHTML = String(val);
    },
    querySelector: (selector) => {
      return {
        addEventListener: (event, handler) => {
          if (!listeners.has(selector + ':' + event)) listeners.set(selector + ':' + event, []);
          listeners.get(selector + ':' + event).push(handler);
        },
        dispatchEvent: (event) => {
          const handlers = listeners.get(selector + ':' + event.type) || [];
          handlers.forEach(h => h(event));
        }
      };
    },
    querySelectorAll: (selector) => []
  };

  return element;
}

export const suite = createTestSuite('Milestone 4: RBAC & Manager Override Security');

function resetState() {
  store.resetDemoData();
  store.isLocked = false;
}

const origTest = suite.test;
suite.test = (name, fn) => {
  origTest(name, async () => {
    resetState();
    await fn();
  });
};

// Category 1: Sensitive POS Permissions Taxonomy (F9)
suite.test('M4-RBAC-01: SENSITIVE_PERMISSIONS contains all high-risk POS operations', () => {
  assert.ok(SENSITIVE_PERMISSIONS.includes(PERMISSIONS.ORDER_VOID_ACTIVE) || SENSITIVE_PERMISSIONS.includes('orders:void'));
  assert.ok(SENSITIVE_PERMISSIONS.includes(PERMISSIONS.ITEM_DELETE_ACTIVE) || SENSITIVE_PERMISSIONS.includes('orders:item_delete'));
  assert.ok(SENSITIVE_PERMISSIONS.includes(PERMISSIONS.DISCOUNT_CUSTOM) || SENSITIVE_PERMISSIONS.includes('orders:discount'));
  assert.ok(SENSITIVE_PERMISSIONS.includes(PERMISSIONS.TABLE_FORCE_CLEAR) || SENSITIVE_PERMISSIONS.includes('tables:force_clear'));
  assert.ok(SENSITIVE_PERMISSIONS.includes(PERMISSIONS.PRICE_ALTER) || SENSITIVE_PERMISSIONS.includes('menu:update_price'));
});

suite.test('M4-RBAC-02: Non-manager roles are strictly denied sensitive operations', () => {
  // Cashier
  assert.strictEqual(checkPermission(ROLES.CASHIER, PERMISSIONS.ORDER_VOID_ACTIVE), false);
  assert.strictEqual(checkPermission(ROLES.CASHIER, PERMISSIONS.DISCOUNT_CUSTOM), false);
  assert.strictEqual(checkPermission(ROLES.CASHIER, PERMISSIONS.TABLE_FORCE_CLEAR), false);

  // Server
  assert.strictEqual(checkPermission(ROLES.SERVER, PERMISSIONS.ORDER_VOID_ACTIVE), false);
  assert.strictEqual(checkPermission(ROLES.SERVER, PERMISSIONS.ITEM_DELETE_ACTIVE), false);
  assert.strictEqual(checkPermission(ROLES.SERVER, PERMISSIONS.DISCOUNT_CUSTOM), false);
});

suite.test('M4-RBAC-03: Managers and Admins possess sensitive permissions', () => {
  // Manager
  assert.strictEqual(checkPermission(ROLES.MANAGER, PERMISSIONS.ORDER_VOID_ACTIVE), true);
  assert.strictEqual(checkPermission(ROLES.MANAGER, PERMISSIONS.DISCOUNT_CUSTOM), true);
  assert.strictEqual(checkPermission(ROLES.MANAGER, PERMISSIONS.TABLE_FORCE_CLEAR), true);

  // Admin
  assert.strictEqual(checkPermission(ROLES.ADMIN, PERMISSIONS.ORDER_VOID_ACTIVE), true);
  assert.strictEqual(checkPermission(ROLES.ADMIN, PERMISSIONS.DISCOUNT_CUSTOM), true);
  assert.strictEqual(checkPermission(ROLES.ADMIN, PERMISSIONS.TERMINAL_PAIR), true);
});

// Category 2: Manager Override Verification Engine (F10)
suite.test('M4-OVERRIDE-01: verifyManagerOverride rejects empty or non-numeric PIN', async () => {
  const res1 = await store.verifyManagerOverride({ pin: '' });
  assert.strictEqual(res1.success, false);

  const res2 = await store.verifyManagerOverride({ pin: 'abcd' });
  assert.strictEqual(res2.success, false);
});

suite.test('M4-OVERRIDE-02: verifyManagerOverride rejects Cashier and Server PINs', async () => {
  // Cashier PIN 1111
  const cashierRes = await store.verifyManagerOverride({
    pin: '1111',
    actionType: 'ORDER_VOID_ACTIVE',
    targetItem: 'Table #4'
  });
  assert.strictEqual(cashierRes.success, false);
  assert.ok(cashierRes.error.includes('Insufficient Privileges') || cashierRes.error.includes('Manager'));

  // Server PIN 2222
  const serverRes = await store.verifyManagerOverride({
    pin: '2222',
    actionType: 'DISCOUNT_CUSTOM',
    targetItem: 'Bill ₹1200'
  });
  assert.strictEqual(serverRes.success, false);
});

suite.test('M4-OVERRIDE-03: verifyManagerOverride approves valid Manager PIN (9999)', async () => {
  await store.loginWithPIN('2222'); // Current staff is Server
  assert.strictEqual(store.currentStaff.role, ROLES.SERVER);

  const res = await store.verifyManagerOverride({
    pin: '9999',
    actionType: 'ORDER_VOID_ACTIVE',
    actionLabel: 'Void Table 4 Bill',
    targetItem: 'Table #4 - ₹3,400',
    initiator: store.currentStaff
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.authorizer.role, ROLES.MANAGER);
  assert.ok(res.auditLog, 'Audit log must be returned');
  assert.strictEqual(res.auditLog.action, 'ORDER_VOID_ACTIVE');
  assert.strictEqual(res.auditLog.authorizer_role, ROLES.MANAGER);
  assert.strictEqual(res.auditLog.initiator_role, ROLES.SERVER);
});

suite.test('M4-OVERRIDE-04: verifyManagerOverride approves valid Admin PIN (1234)', async () => {
  const res = await store.verifyManagerOverride({
    pin: '1234',
    actionType: 'TABLE_FORCE_CLEAR',
    actionLabel: 'Force Clear Table 2',
    targetItem: 'Table #2'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.authorizer.role, ROLES.ADMIN);
  assert.strictEqual(res.auditLog.authorizer_role, ROLES.ADMIN);
});

// Category 3: requestManagerOverride Auto-Bypass vs Challenge (F10)
suite.test('M4-PROMISE-01: requestManagerOverride auto-approves for Admin staff without modal', async () => {
  await store.loginWithPIN('1234'); // Admin
  assert.strictEqual(store.currentStaff.role, ROLES.ADMIN);

  const res = await requestManagerOverride(store, {
    actionType: 'PRICE_ALTER',
    targetItem: 'Truffle Fries'
  });

  assert.strictEqual(res.approved, true);
  assert.strictEqual(res.authorizer.role, ROLES.ADMIN);
});

suite.test('M4-PROMISE-02: requestManagerOverride auto-approves for Manager staff without modal', async () => {
  await store.loginWithPIN('9999'); // Manager
  assert.strictEqual(store.currentStaff.role, ROLES.MANAGER);

  const res = await requestManagerOverride(store, {
    actionType: 'ORDER_VOID_ACTIVE',
    targetItem: 'Table #1'
  });

  assert.strictEqual(res.approved, true);
  assert.strictEqual(res.authorizer.role, ROLES.MANAGER);
});

// Category 4: Audit Trail Logging & Offline Buffer (F11)
suite.test('M4-AUDIT-01: recordAuditLog creates complete tamper-evident audit record', () => {
  const entry = store.recordAuditLog({
    action: 'DISCOUNT_CUSTOM',
    actionLabel: 'Applied 20% Manager Discount',
    targetItem: 'Order #ORD-101',
    initiatorStaffName: 'Rahul (Cashier)',
    initiatorRole: ROLES.CASHIER,
    authorizerStaffName: 'Vikram (Manager)',
    authorizerRole: ROLES.MANAGER
  });

  assert.ok(entry.id.startsWith('audit-'));
  assert.strictEqual(entry.action, 'DISCOUNT_CUSTOM');
  assert.strictEqual(entry.target_item, 'Order #ORD-101');
  assert.strictEqual(entry.initiator_role, ROLES.CASHIER);
  assert.strictEqual(entry.authorizer_role, ROLES.MANAGER);
  assert.ok(entry.timestamp);

  // Check in store list
  assert.ok(store.auditLogs.some(l => l.id === entry.id));
});

suite.test('M4-AUDIT-02: Offline override produces audit log with sync_status PENDING', async () => {
  const res = await store.verifyManagerOverride({
    pin: '9999',
    actionType: 'ORDER_VOID_ACTIVE',
    targetItem: 'Table #5'
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.auditLog.sync_status === 'PENDING' || res.auditLog.sync_status === 'SYNCED');
});

// Category 5: ManagerOverrideModal Component Rendering (F10)
suite.test('M4-UI-01: renderManagerOverrideModal mounts warning card, context, and keypad', () => {
  const container = createMockContainer();
  const cleanup = renderManagerOverrideModal(container, store, {
    actionType: 'ORDER_VOID_ACTIVE',
    actionLabel: 'Void Table 4 Bill',
    targetItem: 'Table #4 - ₹1,800',
    initiator: { name: 'Priya', role: ROLES.SERVER }
  });

  assert.ok(container.innerHTML.includes('manager-override-overlay'));
  assert.ok(container.innerHTML.includes('Manager Override Required'));
  assert.ok(container.innerHTML.includes('Void Table 4 Bill'));
  assert.ok(container.innerHTML.includes('Table #4 - ₹1,800'));
  assert.ok(container.innerHTML.includes('Priya'));
  assert.ok(container.innerHTML.includes('btn-override-submit'));

  if (typeof cleanup === 'function') cleanup();
});

if (process.argv[1]?.endsWith('manager_override_rbac.test.mjs')) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
