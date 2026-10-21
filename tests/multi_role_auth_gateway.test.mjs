/**
 * tests/multi_role_auth_gateway.test.mjs
 * Test Suite: Multi-Role Sign-Up & Login Gateway, Strict Route Guards, and Zero Dummy Accounts
 */

import assert from 'node:assert/strict';
import { createTestSuite, setupTestEnvironment } from './helpers.mjs';

import { 
  ROLES, 
  MASTER_BOOTSTRAP_SECRET, 
  SUPER_ADMIN_ACCOUNTS,
  isSuperAdmin 
} from '../src/auth.js';
import { store } from '../src/store.js';
import { renderSignupView } from '../src/views/signupView.js';
import { renderLoginView } from '../src/views/loginView.js';
import { 
  MasterAdminGuard, 
  StaffGuard, 
  evaluateRouteGuard, 
  isMasterAdmin, 
  isCafeAdmin, 
  isShiftStaff 
} from '../src/components/ProtectedRoute.js';
import { renderNavRail, switchView } from '../src/main.js';

setupTestEnvironment();
export const suite = createTestSuite('Multi-Role Sign-Up & Login Gateway Suite');

function reset() {
  store.logoutUser();
  store.cafes = [];
  store.users = [];
  store.superAdminAccounts = [];
  store.tenants = [];
  store.tables = [];
  SUPER_ADMIN_ACCOUNTS.length = 0;
  try {
    localStorage.removeItem('ays_cafes');
    localStorage.removeItem('ays_users');
    localStorage.removeItem('ays_super_admin_accounts');
    localStorage.removeItem('ays_platform_tenants');
    localStorage.removeItem('ays_current_user');
    localStorage.removeItem('ays_current_staff');
  } catch {}
}

suite.test('GATEWAY-01: Zero Dummy Accounts Policy & Clean Database Start', () => {
  reset();
  assert.strictEqual(store.users.length, 0, 'Must start with zero seeded mock users');
  assert.strictEqual(store.cafes.length, 0, 'Must start with zero pre-loaded cafes');
  assert.strictEqual(store.currentUser, null, 'Must start with no active user session');
});

suite.test('GATEWAY-02: Flow A - Café Account Registration (/signup?type=cafe)', async () => {
  reset();

  // 1. Validation: Reject missing required fields
  const missingName = await store.registerCafeAccount({
    cafeName: '',
    email: 'owner@roastedbean.com',
    password: 'Password123!',
    upiId: 'bean@okaxis'
  });
  assert.strictEqual(missingName.success, false);
  assert.ok(missingName.error.includes('Café Commercial Name is required'));

  // 2. Validation: Reject weak password (< 8 chars)
  const weakPass = await store.registerCafeAccount({
    cafeName: 'The Roasted Bean',
    ownerName: 'Aarav Patel',
    email: 'owner@roastedbean.com',
    upiId: 'bean@okaxis',
    password: 'short'
  });
  assert.strictEqual(weakPass.success, false);
  assert.ok(weakPass.error.includes('at least 8 characters'));

  // 3. Valid Registration: Creates Cafe with pending_approval, seeds 12 tables, requires Master Admin authorization
  const res = await store.registerCafeAccount({
    cafeName: 'The Roasted Bean',
    cafeSlug: 'roasted-bean',
    ownerName: 'Aarav Patel',
    email: 'owner@roastedbean.com',
    upiId: 'bean@okaxis',
    password: 'SecurePassword2026!',
    confirmPassword: 'SecurePassword2026!',
    tablesCount: 12
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.cafe);
  assert.strictEqual(res.cafe.name, 'The Roasted Bean');
  assert.strictEqual(res.cafe.slug, 'roasted-bean');
  assert.strictEqual(res.cafe.status, 'pending_approval');
  assert.strictEqual(res.requiresApproval, true);

  // Verify User record created
  assert.ok(res.user);
  assert.strictEqual(res.user.role, 'cafe_admin');
  assert.strictEqual(res.user.cafe_id, res.cafe.id);
  assert.strictEqual(res.user.email, 'owner@roastedbean.com');

  // Verify 12 tables seeded for this specific cafe_id
  assert.strictEqual(store.tables.length, 12);
  assert.strictEqual(store.tables[0].cafe_id, res.cafe.id);
  assert.strictEqual(store.tables[0].status, 'Vacant');

  // Verify unapproved café cannot log in
  const blockedLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@roastedbean.com',
    password: 'SecurePassword2026!'
  });
  assert.strictEqual(blockedLogin.success, false);
  assert.strictEqual(blockedLogin.pendingApproval, true);
  assert.ok(blockedLogin.error.includes('pending review'));

  // Master Admin approves the café
  store.isSuperAdminSession = true;
  store.superAdmin = { id: 'master-sys-01', role: ROLES.SUPER_ADMIN, is_super_admin: true, email: 'master@platform.com' };
  const approveRes = store.approveTenantCafe(res.cafe.id);
  assert.strictEqual(approveRes.success, true);
  assert.strictEqual(approveRes.cafe.status, 'active');
  store.logoutSuperAdmin();

  // Once approved, Café Admin logs in successfully
  const approvedLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@roastedbean.com',
    password: 'SecurePassword2026!'
  });
  assert.strictEqual(approvedLogin.success, true);
  assert.strictEqual(isCafeAdmin(store), true);
  assert.strictEqual(isMasterAdmin(store), false);
  assert.ok(approvedLogin.redirect === '/dashboard' || approvedLogin.redirect === '/menu-builder');

  // Verify Zero Dummy Accounts & Clean Slate Policy for newly registered café
  assert.strictEqual(store.cachedStaff.length, 1, 'Newly registered café roster must ONLY contain the registered owner');
  assert.strictEqual(store.cachedStaff[0].name, 'Aarav Patel');
  assert.strictEqual(store.orders.length, 0, 'Newly registered café must start with 0 active orders');
  assert.strictEqual(store.menuItems.length, 0, 'Newly registered café must start with an empty menu catalog');
  assert.strictEqual(store.tables.length, 12, 'Newly registered café must have exactly 12 tables matching registration');
  assert.strictEqual(store.tables.every(t => t.status === 'Vacant'), true, 'All tables in new café must start clean and Vacant');
});

suite.test('GATEWAY-03: Flow B - Master Admin Genesis Registration (/signup?type=master) Strict Security Gate', async () => {
  reset();

  // 1. Rejects invalid or missing passkey
  const invalidPasskey = await store.registerMasterAdmin({
    name: 'Operator X',
    email: 'operator@atyourscan.com',
    passkey: 'wrong_secret',
    password: 'MasterAdminPass2026!'
  });
  assert.strictEqual(invalidPasskey.success, false);
  assert.ok(invalidPasskey.error.includes('Invalid Master Bootstrap Secret Passkey'));

  // 2. Authorizes registration with valid MASTER_BOOTSTRAP_SECRET
  const validGenesis = await store.registerMasterAdmin({
    name: 'Sovereign Operator',
    email: 'genesis@atyourscan.com',
    passkey: MASTER_BOOTSTRAP_SECRET,
    password: 'MasterAdminPass2026!',
    confirmPassword: 'MasterAdminPass2026!'
  });

  assert.strictEqual(validGenesis.success, true);
  assert.ok(validGenesis.user);
  assert.strictEqual(validGenesis.user.system_role, 'master_admin');
  assert.strictEqual(validGenesis.user.cafe_id, null, 'Master Admin must have cafe_id = NULL');
  assert.ok(validGenesis.token, 'Must return signed platform JWT token');
  assert.strictEqual(validGenesis.redirect, '/admin/master-control');

  // Verify role check
  assert.strictEqual(isMasterAdmin(store), true);
  assert.strictEqual(store.isSuperAdmin(), true);
});

suite.test('GATEWAY-04: Multi-Role Authentication Portal - Café Admin Login', async () => {
  reset();
  // Register a cafe account with pre-approved or approved status
  const reg = await store.registerCafeAccount({
    cafeName: 'Artisan Roast',
    cafeSlug: 'artisan-roast',
    ownerName: 'Devika Ray',
    email: 'owner@artisanroast.com',
    upiId: 'artisan@icici',
    password: 'AdminPassword2026!',
    confirmPassword: 'AdminPassword2026!'
  });

  // Master Admin approves cafe
  store.isSuperAdminSession = true;
  store.superAdmin = { id: 'master-01', role: ROLES.SUPER_ADMIN, is_super_admin: true };
  store.approveTenantCafe(reg.cafe.id);
  store.logoutSuperAdmin();

  // Log out any leftover session
  store.logoutUser();
  assert.strictEqual(store.currentUser, null);

  // Wrong password rejected
  const badLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@artisanroast.com',
    password: 'WrongPassword!'
  });
  assert.strictEqual(badLogin.success, false);
  assert.ok(badLogin.error.includes('Incorrect password'));

  // Correct credentials succeed
  const goodLogin = await store.loginUser({
    type: 'cafe_admin',
    email: 'owner@artisanroast.com',
    password: 'AdminPassword2026!'
  });
  assert.strictEqual(goodLogin.success, true);
  assert.strictEqual(goodLogin.role, 'cafe_admin');
  assert.strictEqual(store.currentUser.email, 'owner@artisanroast.com');
  assert.strictEqual(store.isLocked, false);
});

suite.test('GATEWAY-05: Multi-Role Authentication Portal - Shift Staff PIN Login', async () => {
  reset();
  // Login with staff PIN
  const staffLogin = await store.loginUser({
    type: 'shift_manager',
    pin: '1111'
  });

  assert.strictEqual(staffLogin.success, true);
  assert.strictEqual(staffLogin.role, 'shift_manager');
  assert.ok(staffLogin.staff);
  assert.strictEqual(staffLogin.staff.name, 'Rohan Verma');
  assert.strictEqual(staffLogin.redirect, '/floorplan');
});

suite.test('GATEWAY-06: Multi-Role Authentication Portal - Master Admin Login', async () => {
  reset();
  await store.registerMasterAdmin({
    name: 'Chief Architect',
    email: 'architect@atyourscan.com',
    passkey: MASTER_BOOTSTRAP_SECRET,
    password: 'SovereignPass2026!',
    confirmPassword: 'SovereignPass2026!'
  });

  store.logoutUser();
  assert.strictEqual(store.isSuperAdmin(), false);

  const masterLogin = await store.loginUser({
    type: 'master_admin',
    email: 'architect@atyourscan.com',
    password: 'SovereignPass2026!'
  });

  assert.strictEqual(masterLogin.success, true);
  assert.strictEqual(masterLogin.role, 'master_admin');
  assert.strictEqual(store.isSuperAdmin(), true);
  assert.strictEqual(masterLogin.redirect, '/admin/master-control');
});

suite.test('GATEWAY-07: Strict Access Control & Role Guards - MasterAdminGuard', () => {
  reset();
  let deniedUrl = null;
  let deniedReason = null;

  const onDeny = (url, reason) => {
    deniedUrl = url;
    deniedReason = reason;
  };

  // 1. Unauthenticated session denied
  const unauthCheck = MasterAdminGuard(store, { onDeny });
  assert.strictEqual(unauthCheck, false);
  assert.strictEqual(deniedUrl, '/login?redirect=platform-admin');

  // 2. Route evaluation guard for platform-admin
  const guardRes = evaluateRouteGuard('platform-admin', store);
  assert.strictEqual(guardRes.allowed, false);
  assert.strictEqual(guardRes.redirect, '/login?redirect=platform-admin');

  // 3. UI Invisibility: Header super admin pill is absent
  const mockNav = document.getElementById('top-navigation-rail');
  renderNavRail();
  assert.strictEqual(mockNav.innerHTML.includes('header-super-admin-pill'), false);
  assert.strictEqual(mockNav.innerHTML.includes('Master Login'), false, 'Casual Master Login escape hatch must be eliminated');

  // 4. Cafe Admin session is strictly blocked from Platform Control Plane & button is scrubbed from DOM
  store.currentUser = { id: 'usr-cafe-1', name: 'Cafe Admin', role: 'cafe_admin', system_role: 'cafe_admin', cafe_id: 'cafe-test-01' };
  store.currentStaff = { id: 'usr-cafe-1', name: 'Cafe Admin', role: 'Admin', cafe_id: 'cafe-test-01' };
  assert.strictEqual(store.isSuperAdmin(), false, 'Cafe Admin must never be evaluated as Super-Admin');
  assert.strictEqual(store.isMasterAdmin(), false, 'Cafe Admin must never be evaluated as Master Admin');
  assert.strictEqual(MasterAdminGuard(store, { onDeny }), false, 'Cafe Admin must be blocked by MasterAdminGuard');
  assert.strictEqual(evaluateRouteGuard('platform-admin', store).allowed, false);

  renderNavRail();
  assert.strictEqual(mockNav.innerHTML.includes('header-super-admin-pill'), false, 'Platform Control Plane pill must NEVER be in DOM for cafe_admin');
  assert.strictEqual(mockNav.innerHTML.includes('Platform Control Plane'), false);
  assert.strictEqual(mockNav.innerHTML.includes('header-master-pill'), false);
});

suite.test('GATEWAY-08: Hospitality Invariant Strictly Preserved', () => {
  reset();
  // Customer QR view always allowed without login
  const guestRoute = evaluateRouteGuard('customer', store);
  assert.strictEqual(guestRoute.allowed, true);
  assert.strictEqual(guestRoute.redirect, null);
});

suite.test('GATEWAY-09: Render signupView in DOM & Tab Switching', () => {
  reset();
  const container = document.createElement('div');
  const cleanup = renderSignupView(container, store, {});

  // Mounts cafe form by default
  assert.ok(container.innerHTML.includes('Register Your Café'));
  assert.ok(container.querySelector('#input-cafe-name'));
  assert.ok(container.querySelector('#input-cafe-slug'));

  // Switch to Master Genesis tab
  const masterTabBtn = container.querySelector('#tab-btn-master');
  masterTabBtn.click();

  assert.ok(container.innerHTML.includes('Master Admin Genesis'));
  assert.ok(container.querySelector('#input-master-passkey'));

  cleanup();
});

suite.test('GATEWAY-10: Render loginView in DOM & Segmented Control', () => {
  reset();
  const container = document.createElement('div');
  const cleanup = renderLoginView(container, store, {});

  // Mounts Cafe Portal
  assert.ok(container.innerHTML.includes('Café Portal Sign In'));
  assert.ok(container.querySelector('#input-admin-email'));

  // Switch to Staff PIN sub-mode
  const staffSubBtn = container.querySelector('#btn-sub-staff');
  staffSubBtn.click();
  assert.ok(container.querySelector('#input-staff-pin'));

  // Switch to Master Admin portal
  const masterPortalBtn = container.querySelector('#btn-portal-master');
  masterPortalBtn.click();
  assert.ok(container.innerHTML.includes('Master Admin Portal'));
  assert.ok(container.querySelector('#input-master-email'));

  cleanup();
});
