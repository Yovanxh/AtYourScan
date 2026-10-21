/**
 * tests/staff_pin_keypad.test.mjs
 * 
 * Milestone 3 Automated Test Suite: Quick Staff PIN Keypad & Fast User Switching (F6, F7, F8)
 * Verifies numeric touch keypad, 4-6 digit PIN entry, role badge displays,
 * 1-tap screen lock, and seamless staff switching.
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';

// Setup mock browser environment
setupTestEnvironment();

import { store } from '../src/store.js';
import { ROLES, SEED_STAFF } from '../src/auth.js';
import { renderPINKeypad, openPINKeypad, renderLockScreenOverlay, getRoleStyle, ROLE_STYLES } from '../src/components/PINKeypad.js';
import { evaluateAuthGates } from '../src/main.js';

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
      // Basic mock selector for tests
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
    querySelectorAll: (selector) => {
      return [];
    }
  };

  return element;
}

export const suite = createTestSuite('Milestone 3: Staff PIN Keypad & User Switching');

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

// Category 1: Role Badges & Styling (F7)
suite.test('PIN-ROLE-01: Role styles map correctly to all 5 hospitality roles', () => {
  assert.ok(ROLE_STYLES[ROLES.ADMIN], 'Admin role style must exist');
  assert.ok(ROLE_STYLES[ROLES.MANAGER], 'Manager role style must exist');
  assert.ok(ROLE_STYLES[ROLES.CASHIER], 'Cashier role style must exist');
  assert.ok(ROLE_STYLES[ROLES.SERVER], 'Server role style must exist');
  assert.ok(ROLE_STYLES[ROLES.BARTENDER], 'Bartender role style must exist');
});

suite.test('PIN-ROLE-02: getRoleStyle returns custom styles and safe fallback for unknown role', () => {
  const adminStyle = getRoleStyle(ROLES.ADMIN);
  assert.strictEqual(adminStyle.label, 'Master Admin');
  assert.ok(adminStyle.bg.includes('emerald'));

  const unknownStyle = getRoleStyle('Busser');
  assert.strictEqual(unknownStyle.label, 'Busser');
  assert.ok(unknownStyle.bg.includes('zinc'));
});

// Category 2: Staff PIN Authentication & Fast Switching (F8)
suite.test('PIN-AUTH-01: Admin PIN (1234) authenticates master admin session', async () => {
  const res = await store.loginWithPIN('1234');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.staff.role, ROLES.ADMIN);
  assert.strictEqual(store.currentStaff.role, ROLES.ADMIN);
});

suite.test('PIN-AUTH-02: Manager PIN (9999) authenticates floor manager session', async () => {
  const res = await store.loginWithPIN('9999');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.staff.role, ROLES.MANAGER);
  assert.strictEqual(store.currentStaff.role, ROLES.MANAGER);
});

suite.test('PIN-AUTH-03: Cashier PIN (1111) authenticates cashier session', async () => {
  const res = await store.loginWithPIN('1111');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.staff.role, ROLES.CASHIER);
  assert.strictEqual(store.currentStaff.role, ROLES.CASHIER);
});

suite.test('PIN-AUTH-04: Server PIN (2222) authenticates floor server session', async () => {
  const res = await store.loginWithPIN('2222');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.staff.role, ROLES.SERVER);
  assert.strictEqual(store.currentStaff.role, ROLES.SERVER);
});

suite.test('PIN-AUTH-05: switchStaff switches active session and logs audit trail', async () => {
  await store.loginWithPIN('1111'); // Cashier
  assert.strictEqual(store.currentStaff.role, ROLES.CASHIER);

  const switchRes = await store.switchStaff('9999'); // Switch to Manager
  assert.strictEqual(switchRes.success, true);
  assert.strictEqual(store.currentStaff.role, ROLES.MANAGER);

  // Check audit log
  const switchAudit = store.auditLogs.find(l => l.action === 'STAFF_SWITCH');
  assert.ok(switchAudit, 'STAFF_SWITCH audit log must be recorded');
  assert.strictEqual(switchAudit.initiator_role, ROLES.MANAGER);
});

suite.test('PIN-AUTH-06: Invalid PIN fails cleanly without altering current session', async () => {
  await store.loginWithPIN('1234');
  assert.strictEqual(store.currentStaff.role, ROLES.ADMIN);

  const badRes = await store.loginWithPIN('0000');
  assert.strictEqual(badRes.success, false);
  assert.strictEqual(store.currentStaff.role, ROLES.ADMIN); // Unaltered
});

// Category 3: 1-Tap Screen Lock & Unlock (F7, F6)
suite.test('PIN-LOCK-01: lockScreen sets isLocked to true', () => {
  assert.strictEqual(store.isLocked, false);
  store.lockScreen();
  assert.strictEqual(store.isLocked, true);
});

suite.test('PIN-LOCK-02: unlockScreen with valid PIN unlocks screen', async () => {
  await store.loginWithPIN('1234');
  store.lockScreen();
  assert.strictEqual(store.isLocked, true);

  const unlockRes = await store.unlockScreen('1234');
  assert.strictEqual(unlockRes.success, true);
  assert.strictEqual(store.isLocked, false);
});

suite.test('PIN-LOCK-03: unlockScreen with invalid PIN remains locked', async () => {
  await store.loginWithPIN('1234');
  store.lockScreen();

  const unlockRes = await store.unlockScreen('9876');
  assert.strictEqual(unlockRes.success, false);
  assert.strictEqual(store.isLocked, true);
});

suite.test('PIN-LOCK-04: Unlocking with different staff PIN switches active session upon unlock', async () => {
  await store.loginWithPIN('1111'); // Cashier
  store.lockScreen();
  assert.strictEqual(store.isLocked, true);

  // Manager unlocks terminal
  const unlockRes = await store.unlockScreen('9999');
  assert.strictEqual(unlockRes.success, true);
  assert.strictEqual(store.isLocked, false);
  assert.strictEqual(store.currentStaff.role, ROLES.MANAGER);
});

// Category 4: PINKeypad Component Rendering & Mounting (F6)
suite.test('PIN-UI-01: renderPINKeypad mounts 3x4 numeric keypad and display elements', () => {
  const container = createMockContainer();
  const cleanup = renderPINKeypad(container, store, { mode: 'modal' });

  assert.ok(container.innerHTML.includes('pin-keypad-overlay'));
  assert.ok(container.innerHTML.includes('pin-keypad-card'));
  assert.ok(container.innerHTML.includes('data-pin-key="1"'));
  assert.ok(container.innerHTML.includes('data-pin-key="9"'));
  assert.ok(container.innerHTML.includes('data-pin-key="0"'));
  assert.ok(container.innerHTML.includes('btn-pin-submit'));

  if (typeof cleanup === 'function') cleanup();
});

suite.test('PIN-UI-02: renderLockScreenOverlay renders full lockscreen overlay', () => {
  const container = createMockContainer();
  const cleanup = renderLockScreenOverlay(container, store);

  assert.ok(container.innerHTML.includes('POS Terminal Locked'));
  assert.ok(container.innerHTML.includes('pin-keypad-overlay'));

  if (typeof cleanup === 'function') cleanup();
});

// Category 5: Hospitality Preservation during Screen Lock
suite.test('PIN-HOSP-01: Screen lock gates management views', () => {
  store.isLocked = true;
  const gateCheck = evaluateAuthGates('floorplan', store);
  assert.strictEqual(gateCheck.allowed, false);
  assert.strictEqual(gateCheck.gate, 'LOCK_SCREEN');
});

suite.test('PIN-HOSP-02: Screen lock NEVER gates guest dine-in view (Hospitality Preservation)', () => {
  store.isLocked = true;
  const gateCheck = evaluateAuthGates('customer', store);
  assert.strictEqual(gateCheck.allowed, true);
  assert.strictEqual(gateCheck.gate, null);
});

if (process.argv[1]?.endsWith('staff_pin_keypad.test.mjs')) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
