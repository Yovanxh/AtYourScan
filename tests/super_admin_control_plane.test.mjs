/**
 * tests/super_admin_control_plane.test.mjs
 * Test Suite: Super-Admin Global Operations & Diagnostic Command Center ("Platform Control Plane")
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';

import {
  ROLES,
  PERMISSIONS,
  SUPER_ADMIN_ACCOUNTS,
  isSuperAdmin,
  createSuperAdminToken,
  verifySuperAdminToken,
  findSuperAdminByPINSync,
  verifyPINSync,
  hashPINSync
} from '../src/auth.js';
import { store, INITIAL_TENANTS } from '../src/store.js';
import { renderMasterAdminView } from '../src/views/masterAdmin.js';
import { renderNavRail, currentView, switchView, VIEWS } from '../src/main.js';
import { renderCustomerView } from '../src/components/CustomerView.js';
import { renderSuperAdminLoginModal } from '../src/components/SuperAdminLoginModal.js';
import { renderPINKeypad } from '../src/components/PINKeypad.js';

setupTestEnvironment();
export const suite = createTestSuite('Super-Admin Platform Control Plane Suite');

function reset() {
  store.resetDemoData();
  store.superAdminAccounts = [];
  store.tenants = [];
  store.systemLogs = [];
  store.masterAuditLogs = [];
  try {
    localStorage.removeItem('ays_super_admin_accounts');
    localStorage.removeItem('ays_platform_tenants');
    localStorage.removeItem('ays_platform_system_logs');
    localStorage.removeItem('ays_master_audit_logs');
  } catch {}
  SUPER_ADMIN_ACCOUNTS.length = 0;
  store.logoutSuperAdmin();
}

suite.test('SUPER-01: Sovereign Super-Admin Account Provisioning (No Preloaded Accounts)', async () => {
  reset();
  // 1. Invariant: No preloaded / hardcoded super admin accounts
  assert.strictEqual(store.hasSuperAdmin(), false, 'Must start with no preloaded Super-Admin accounts');
  assert.strictEqual(store.getSuperAdminAccounts().length, 0);

  // 2. Uninitialized login attempt requires setup
  const uninitLogin = await store.loginSuperAdmin({ pin: '1234' });
  assert.strictEqual(uninitLogin.success, false);
  assert.strictEqual(uninitLogin.needsSetup, true);

  // 3. User creates their custom Super-Admin account
  const createRes = await store.createSuperAdminAccount({
    name: 'Vikram Seth',
    email: 'owner@mycafe.com',
    pin: '5566',
    confirmPin: '5566'
  });

  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.superAdmin);
  assert.strictEqual(createRes.superAdmin.name, 'Vikram Seth');
  assert.strictEqual(createRes.superAdmin.email, 'owner@mycafe.com');
  assert.strictEqual(createRes.superAdmin.system_role, 'super_admin');
  assert.ok(createRes.token);

  // 4. Cryptographic PIN verification (SHA-256 with unique salt)
  assert.strictEqual(verifyPINSync('5566', createRes.superAdmin.salt, createRes.superAdmin.pin_hash), true);
  assert.strictEqual(verifyPINSync('0000', createRes.superAdmin.salt, createRes.superAdmin.pin_hash), false);

  // 5. isSuperAdmin validation
  assert.strictEqual(isSuperAdmin(createRes.superAdmin), true);
  assert.strictEqual(isSuperAdmin({ role: 'Admin', email: 'admin@copperoak.com' }), false);
  assert.strictEqual(isSuperAdmin({ role: 'Manager', email: 'anand@copperoak.com' }), false);
  assert.strictEqual(isSuperAdmin({ role: 'Cashier', email: 'rohan@copperoak.com' }), false);
  assert.strictEqual(isSuperAdmin(null), false);
  assert.strictEqual(isSuperAdmin({ is_active: false, system_role: 'super_admin' }), false);
});

suite.test('SUPER-02: Master Super-Admin JWT Platform Token Generation and Verification', async () => {
  reset();
  const createRes = await store.createSuperAdminAccount({
    name: 'Vikram Seth',
    email: 'owner@mycafe.com',
    pin: '5566',
    confirmPin: '5566'
  });

  const token = createSuperAdminToken(createRes.superAdmin);
  assert.ok(token && typeof token === 'string');

  const verified = verifySuperAdminToken(token);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.payload.system_role, 'super_admin');
  assert.strictEqual(verified.payload.is_super_admin, true);
  assert.strictEqual(verified.payload.email, 'owner@mycafe.com');
  assert.deepStrictEqual(verified.payload.permissions, ['*']);

  // Non-super-admin token creation must throw
  assert.throws(() => {
    createSuperAdminToken({ id: 'staff-01', role: 'Cashier' });
  }, /Unauthorized/);
});

suite.test('SUPER-03: Super-Admin Authentication via loginSuperAdmin & logoutSuperAdmin', async () => {
  reset();
  // Create the master account first
  await store.createSuperAdminAccount({
    name: 'Vikram Seth',
    email: 'owner@mycafe.com',
    pin: '5566',
    confirmPin: '5566'
  });

  // Logout
  store.logoutSuperAdmin();
  assert.strictEqual(store.isSuperAdmin(), false);

  // Wrong PIN
  const badLogin = await store.loginSuperAdmin({ pin: '0000' });
  assert.strictEqual(badLogin.success, false);
  assert.strictEqual(store.isSuperAdmin(), false);

  // Correct PIN login
  const goodLogin = await store.loginSuperAdmin({ pin: '5566' });
  assert.strictEqual(goodLogin.success, true);
  assert.strictEqual(goodLogin.superAdmin.email, 'owner@mycafe.com');
  assert.ok(goodLogin.token);
  assert.strictEqual(store.isSuperAdmin(), true);
  assert.strictEqual(store.getSuperAdmin().name, 'Vikram Seth');

  // Logout
  store.logoutSuperAdmin();
  assert.strictEqual(store.isSuperAdmin(), false);
  assert.strictEqual(store.getSuperAdmin(), null);
});

suite.test('SUPER-04: Strict Access Gate & UI Invisibility for Non-Super-Admins', async () => {
  reset();
  switchView('analytics');
  // 1. Invisibility: Non-super admin cannot see control plane button in header
  store.logoutSuperAdmin();
  assert.strictEqual(store.isSuperAdmin(), false);

  const mockNav = document.getElementById('top-navigation-rail');
  renderNavRail();
  assert.strictEqual(mockNav.innerHTML.includes('header-super-admin-pill'), false, 'Super-Admin pill must be completely absent from DOM for non-super admins');

  // 2. Control plane view denies access to non-super admin
  const viewContainer = document.createElement('div');
  renderMasterAdminView(viewContainer, store);
  assert.ok(viewContainer.innerHTML.includes('403 Access Denied'), 'Must render 403 Access Denied message');
  assert.strictEqual(viewContainer.innerHTML.includes('platform-control-plane'), false, 'Must NOT mount control plane DOM');

  // 3. When authenticated as Super-Admin, pill and control plane view render
  await store.createSuperAdminAccount({
    name: 'Vikram Seth',
    email: 'owner@mycafe.com',
    pin: '5566',
    confirmPin: '5566'
  });
  assert.strictEqual(store.isSuperAdmin(), true);

  renderNavRail();
  assert.ok(mockNav.innerHTML.includes('header-super-admin-pill'), 'Super-Admin pill must mount when Super-Admin is active');

  renderMasterAdminView(viewContainer, store);
  assert.ok(viewContainer.innerHTML.includes('platform-control-plane'), 'Must mount Platform Control Plane when Super-Admin is active');
});

suite.test('SUPER-05: Dynamic Cafe Onboarding under Super-Admin (No Preloaded Dummy Cafes)', async () => {
  reset();
  // 1. Invariant: Platform starts with ZERO preloaded cafes
  assert.strictEqual(store.tenants.length, 0, 'Must start with 0 preloaded cafes');

  // Authenticate as Super-Admin
  await store.createSuperAdminAccount({
    name: 'Vikram Seth',
    email: 'owner@mycafe.com',
    pin: '5566',
    confirmPin: '5566'
  });

  // 2. Super-Admin onboards the first cafe
  const cafe1 = await store.createTenantCafe({
    name: 'The Copper Oak',
    branch: 'Indiranagar 12th Main',
    city: 'Bengaluru',
    tables_count: 12,
    terminal_sin: 'SIN-POS-01',
    contact_email: 'manager@copperoak.com'
  });

  assert.strictEqual(cafe1.success, true);
  assert.strictEqual(store.tenants.length, 1);
  assert.strictEqual(cafe1.tenant.name, 'The Copper Oak');
  assert.strictEqual(cafe1.tenant.branch, 'Indiranagar 12th Main');
  assert.strictEqual(cafe1.tenant.terminal_sin, 'SIN-POS-01');
  assert.strictEqual(cafe1.tenant.terminal_status, 'ONLINE');

  // 3. Super-Admin onboards second cafe branch
  const cafe2 = await store.createTenantCafe({
    name: 'Brew & Bloom',
    branch: 'Koramangala 4th Block',
    city: 'Bengaluru',
    tables_count: 16,
    terminal_sin: 'SIN-POS-02',
    contact_email: 'ops@brewbloom.com'
  });

  assert.strictEqual(cafe2.success, true);
  assert.strictEqual(store.tenants.length, 2);

  // 4. Master audit trail records cafe creation
  assert.strictEqual(store.masterAuditLogs[0].action, 'TENANT_CAFE_PROVISIONED');

  // 5. Decommission a cafe
  const deleted = store.deleteTenantCafe(cafe2.tenant.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(store.tenants.length, 1);
  assert.strictEqual(store.masterAuditLogs[0].action, 'TENANT_CAFE_DECOMMISSIONED');
});

suite.test('SUPER-06: Live Telemetry & Error Diagnostic Feed (Starts Clean)', () => {
  reset();
  // 1. Invariant: Zero preloaded fake error logs
  assert.strictEqual(store.systemLogs.length, 0, 'System logs must start completely clean');

  // 2. Report a real diagnostic event
  const newLog = store.reportDiagnosticLog({
    tenantId: 'tenant-indiranagar-01',
    severity: 'critical',
    source: 'pos_edge',
    message: 'Network socket dropped during high-load dinner tab checkout',
    details: 'Error: Connection timeout at table 4'
  });
  assert.ok(newLog.id);
  assert.strictEqual(store.systemLogs[0].id, newLog.id);
  assert.strictEqual(store.systemLogs[0].status, 'active');

  // 3. Resolve diagnostic log
  const resolved = store.resolveDiagnosticLog(newLog.id, 'Vikram Seth');
  assert.strictEqual(resolved, true);
  assert.strictEqual(store.systemLogs[0].status, 'resolved');
  assert.strictEqual(store.systemLogs[0].resolved_by, 'Vikram Seth');

  // 4. Purge resolved logs
  store.purgeDiagnosticLogs('resolved');
  assert.strictEqual(store.systemLogs.some(l => l.id === newLog.id), false);
});

suite.test('SUPER-07: God-Mode Emergency Intervention - Remote Staff PIN Reset', async () => {
  reset();
  // Non-super-admin attempt rejected with 403
  store.logoutSuperAdmin();
  const unauth = await store.masterResetStaffPIN({ staffId: 'staff-cashier-01', newPin: '7777' });
  assert.strictEqual(unauth.success, false);
  assert.ok(unauth.error.includes('403 Forbidden'));

  // Provision & Authenticate custom Super-Admin
  const admin = await store.createSuperAdminAccount({
    name: 'Platform Master',
    email: 'master@atyourscan.com',
    pin: '9999',
    confirmPin: '9999'
  });

  // Onboard cafe
  const cafe = await store.createTenantCafe({
    name: 'The Copper Oak',
    branch: 'Indiranagar 12th Main',
    city: 'Bengaluru'
  });

  // Execute remote PIN reset
  const result = await store.masterResetStaffPIN({
    superAdminId: admin.superAdmin.id,
    tenantId: cafe.tenant.id,
    staffId: 'staff-cashier-01',
    newPin: '7777'
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.staffId, 'staff-cashier-01');

  // Cashier can now verify with new PIN
  const cashier = store.cachedStaff.find(s => s.id === 'staff-cashier-01');
  assert.strictEqual(verifyPINSync('7777', cashier.salt, cashier.pin_hash), true);
  assert.strictEqual(verifyPINSync('1111', cashier.salt, cashier.pin_hash), false);

  // Audit log recorded
  const lastAudit = store.masterAuditLogs[0];
  assert.strictEqual(lastAudit.action, 'RESET_STAFF_PIN');
  assert.strictEqual(lastAudit.super_admin_id, admin.superAdmin.id);
});

suite.test('SUPER-08: God-Mode Emergency Intervention - State Repair / Force Table Release', async () => {
  reset();
  // Setup table 2 with active order
  const table2 = store.tables.find(t => t.table_number === 2);
  assert.strictEqual(table2.status, 'Active Ordering');

  // Non-super-admin attempt rejected
  store.logoutSuperAdmin();
  const unauth = await store.masterForceTableRelease({ tableNumber: 2 });
  assert.strictEqual(unauth.success, false);
  assert.ok(unauth.error.includes('403 Forbidden'));

  // Super-Admin force release
  const admin = await store.createSuperAdminAccount({
    name: 'Platform Master',
    email: 'master@atyourscan.com',
    pin: '9999',
    confirmPin: '9999'
  });
  const releaseResult = await store.masterForceTableRelease({
    superAdminId: admin.superAdmin.id,
    tenantId: 'tenant-test-01',
    tableNumber: 2
  });
  assert.strictEqual(releaseResult.success, true);

  // Table state sanitized
  assert.strictEqual(table2.status, 'Vacant');
  assert.strictEqual(table2.party_size, 0);
  assert.strictEqual(table2.seated_at, null);
  assert.strictEqual(table2.active_order_id, null);

  // Dangling order cancelled
  const order = store.orders.find(o => o.table_number === 2);
  assert.strictEqual(order.status, 'Cancelled');

  // Audit log recorded
  assert.strictEqual(store.masterAuditLogs[0].action, 'FORCE_TABLE_RELEASE');
});

suite.test('SUPER-09: God-Mode Emergency Intervention - Tenant Emergency Maintenance Toggle', async () => {
  reset();
  const admin = await store.createSuperAdminAccount({
    name: 'Platform Master',
    email: 'master@atyourscan.com',
    pin: '9999',
    confirmPin: '9999'
  });

  const cafe = await store.createTenantCafe({
    name: 'The Copper Oak',
    branch: 'Indiranagar'
  });

  // Enable maintenance mode
  const toggleOn = await store.masterToggleMaintenance({
    superAdminId: admin.superAdmin.id,
    tenantId: cafe.tenant.id,
    enabled: true
  });
  assert.strictEqual(toggleOn.success, true);
  assert.strictEqual(store.isMaintenanceMode(cafe.tenant.id), true);

  // Render customer view to verify maintenance banner and disabled checkout
  const custContainer = document.createElement('div');
  store.cart.table_number = 4;
  renderCustomerView(custContainer, store, {});

  assert.ok(custContainer.innerHTML.includes('customer-maintenance-banner'), 'Customer view must display maintenance banner');

  // Disable maintenance mode
  await store.masterToggleMaintenance({
    superAdminId: admin.superAdmin.id,
    tenantId: cafe.tenant.id,
    enabled: false
  });
  assert.strictEqual(store.isMaintenanceMode(cafe.tenant.id), false);
});

suite.test('SUPER-10: God-Mode Emergency Intervention - Force Edge Cache Resync', async () => {
  reset();
  const admin = await store.createSuperAdminAccount({
    name: 'Platform Master',
    email: 'master@atyourscan.com',
    pin: '9999',
    confirmPin: '9999'
  });

  const cafe = await store.createTenantCafe({
    name: 'Roast & Toast',
    branch: 'Whitefield',
    terminal_sin: 'SIN-POS-03'
  });

  cafe.tenant.sync_lag_ms = 412;
  cafe.tenant.terminal_status = 'DEGRADED';

  const resyncResult = await store.masterTriggerEdgeResync({
    superAdminId: admin.superAdmin.id,
    tenantId: cafe.tenant.id
  });

  assert.strictEqual(resyncResult.success, true);
  assert.ok(cafe.tenant.sync_lag_ms < 50, 'Latency must be reset to nominal (<50ms)');
  assert.strictEqual(cafe.tenant.terminal_status, 'ONLINE');
  assert.strictEqual(store.masterAuditLogs[0].action, 'TRIGGER_EDGE_RESYNC');
});

suite.test('SUPER-11: Canonical Views Registry invariant & Guest Dine-In Non-Regression', () => {
  reset();
  // Invariant: Canonical navigation views count must strictly stay at 6 for POS staff/customer
  assert.strictEqual(VIEWS.length, 6, 'Canonical navigation views must remain exactly 6');

  // Customer dine-in view remains 100% resilient
  store.logoutSuperAdmin();
  const guestContainer = document.createElement('div');
  renderCustomerView(guestContainer, store, {});

  assert.ok(guestContainer.innerHTML.includes('customer-app'), 'Customer view mounts without regression');
});

suite.test('SUPER-12: Super-Admin Sovereign Password / PIN Reset Logic', async () => {
  reset();
  const admin = await store.createSuperAdminAccount({
    name: 'Sovereign Master',
    email: 'admin@platform.com',
    pin: '1234',
    confirmPin: '1234'
  });

  // Attempt reset with invalid mismatch
  const mismatchRes = await store.resetSuperAdminPIN({
    email: 'admin@platform.com',
    newPin: '5678',
    confirmPin: '9999'
  });
  assert.strictEqual(mismatchRes.success, false);
  assert.ok(mismatchRes.error.includes('do not match'));

  // Attempt reset with unknown email
  const unknownRes = await store.resetSuperAdminPIN({
    email: 'unknown@platform.com',
    newPin: '5678',
    confirmPin: '5678'
  });
  assert.strictEqual(unknownRes.success, false);
  assert.ok(unknownRes.error.includes('No Super-Admin account found'));

  // Valid reset
  const resetRes = await store.resetSuperAdminPIN({
    email: 'admin@platform.com',
    newPin: '5678',
    confirmPin: '5678'
  });
  assert.strictEqual(resetRes.success, true);
  assert.strictEqual(resetRes.superAdmin.email, 'admin@platform.com');

  // Verify that old PIN is rejected and new PIN is accepted
  const oldLogin = await store.loginSuperAdmin({ email: 'admin@platform.com', pin: '1234' });
  assert.strictEqual(oldLogin.success, false, 'Old PIN must be rejected');

  const newLogin = await store.loginSuperAdmin({ email: 'admin@platform.com', pin: '5678' });
  assert.strictEqual(newLogin.success, true, 'New PIN must authenticate');
  assert.strictEqual(store.masterAuditLogs[0].action, 'MASTER_SUPER_ADMIN_LOGIN');
});

suite.test('SUPER-13: SuperAdminLoginModal Reset Password UI Flow', async () => {
  reset();
  await store.createSuperAdminAccount({
    name: 'Master Operator',
    email: 'operator@atyourscan.com',
    pin: '4321',
    confirmPin: '4321'
  });

  const modalContainer = document.createElement('div');
  let unlockedAdmin = null;

  const cleanup = renderSuperAdminLoginModal(modalContainer, store, {
    onSuccess: (admin) => { unlockedAdmin = admin; }
  });

  // Verify 'Forgot PIN / Reset Password?' button is rendered in login mode
  const resetBtn = modalContainer.querySelector('#btn-switch-to-reset');
  assert.ok(resetBtn, 'Forgot PIN / Reset Password? button must be visible in login view');

  // Click Forgot PIN to switch to reset mode
  resetBtn.click();
  assert.ok(modalContainer.querySelector('#form-reset-super-admin'), 'Form reset super admin must be mounted');

  // Fill in new PIN
  const emailInput = modalContainer.querySelector('#super-reset-email');
  const pinInput = modalContainer.querySelector('#super-reset-pin');
  const confirmInput = modalContainer.querySelector('#super-reset-confirm-pin');

  emailInput.value = 'operator@atyourscan.com';
  emailInput.dispatchEvent(new Event('input'));
  pinInput.value = '8888';
  pinInput.dispatchEvent(new Event('input'));
  confirmInput.value = '8888';
  confirmInput.dispatchEvent(new Event('input'));

  // Submit reset form
  const form = modalContainer.querySelector('#form-reset-super-admin');
  form.dispatchEvent(new Event('submit'));

  // Allow promise tick for crypto hashing and unlock
  await new Promise(resolve => setTimeout(resolve, 1000));

  assert.ok(unlockedAdmin, 'Master admin must unlock after successful PIN reset');
  assert.strictEqual(unlockedAdmin.email, 'operator@atyourscan.com');
  cleanup();
});

suite.test('SUPER-14: Physical Keyboard & Numpad Accessibility in SuperAdminLoginModal', async () => {
  reset();
  await store.createSuperAdminAccount({
    name: 'Hardware Master',
    email: 'hardware@atyourscan.com',
    pin: '2580',
    confirmPin: '2580'
  });

  const modalContainer = document.createElement('div');
  let loggedIn = null;

  const cleanup = renderSuperAdminLoginModal(modalContainer, store, {
    onSuccess: (admin) => { loggedIn = admin; }
  });

  // Test typing digits from both top row and Numpad: '2', '5', '8', '0'
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', code: 'Numpad5' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '8', code: 'Numpad8' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', code: 'Numpad0' }));

  // Allow promise tick for auto-submit
  await new Promise(resolve => setTimeout(resolve, 100));

  assert.ok(loggedIn, 'Physical keyboard & numpad typing must authenticate super admin');
  assert.strictEqual(loggedIn.email, 'hardware@atyourscan.com');
  cleanup();
});

suite.test('SUPER-15: PINKeypad Physical Keyboard & Numpad Accessibility with Forgot PIN trigger', async () => {
  reset();
  const container = document.createElement('div');
  let authenticatedStaff = null;

  const cleanup = renderPINKeypad(container, store, {
    mode: 'modal',
    onSuccess: (staff) => { authenticatedStaff = staff; }
  });

  // Verify 'Forgot PIN?' trigger is rendered
  const forgotBtn = container.querySelector('#btn-pin-forgot');
  assert.ok(forgotBtn, 'Forgot PIN? action must be available in PIN keypad');

  forgotBtn.click();
  assert.ok(container.innerHTML.includes('Forgot PIN? Contact Floor Manager'), 'Displays guidance on forgot PIN');

  // Test numpad keys: staff default pin '1111'
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Numpad1' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Numpad1' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'NumpadEnter' }));

  await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(authenticatedStaff, 'Staff authenticated via physical keyboard / numpad keys');
  cleanup();
});

suite.test('SUPER-16: Onboard Cafe Button opens modal and successfully provisions new cafe', async () => {
  reset();
  await store.createSuperAdminAccount({
    name: 'Platform Sovereign',
    email: 'sovereign@atyourscan.com',
    pin: '9876',
    confirmPin: '9876'
  });
  await store.loginSuperAdmin({ email: 'sovereign@atyourscan.com', pin: '9876' });

  const container = document.createElement('div');
  renderMasterAdminView(container, store, {});

  // Modal must not be open initially
  assert.strictEqual(container.querySelector('#modal-create-cafe-backdrop'), null, 'Modal backdrop must be absent initially');

  // Trigger Onboard Cafe button
  const onboardBtn = container.querySelector('#btn-open-create-cafe-modal') || container.querySelector('#btn-empty-create-cafe');
  assert.ok(onboardBtn, 'Onboard cafe button must exist in master admin UI');
  onboardBtn.click();

  // Modal must now be visible in DOM
  const modalBackdrop = container.querySelector('#modal-create-cafe-backdrop');
  assert.ok(modalBackdrop, 'Clicking onboard cafe button must open the modal');

  // Fill in cafe details
  const nameInput = container.querySelector('#input-new-cafe-name');
  const branchInput = container.querySelector('#input-new-cafe-branch');
  const cityInput = container.querySelector('#input-new-cafe-city');
  const tablesInput = container.querySelector('#input-new-cafe-tables');
  assert.ok(nameInput && branchInput && tablesInput, 'Modal form inputs must exist');

  nameInput.value = 'Roastery Coffee House';
  branchInput.value = 'Koramangala 80ft Road';
  cityInput.value = 'Bengaluru';
  tablesInput.value = '18';

  // Submit form
  const form = container.querySelector('#form-onboard-cafe');
  assert.ok(form, 'Onboard form must exist in modal');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify cafe was created in store
  assert.strictEqual(store.tenants.length, 1, 'Cafe must be registered in store.tenants');
  assert.strictEqual(store.tenants[0].name, 'Roastery Coffee House');
  assert.strictEqual(store.tenants[0].tables_count, 18);

  // Modal should now be closed and tenant rendered in fleet table
  assert.strictEqual(container.querySelector('#modal-create-cafe-backdrop'), null, 'Modal should close after successful onboarding');
  assert.ok(container.innerHTML.includes('Roastery Coffee House'), 'New cafe must be visible in Master Admin fleet directory');
});

