/**
 * src/components/ProtectedRoute.js
 * Multi-Role Client Route Guards & Strict Access Control
 * 
 * Enforces profile separation, completely eliminates unauthenticated administrative
 * escape hatches, protects the Platform Control Plane (/admin/master-control),
 * and strictly preserves the Hospitality Invariant (zero-login guest QR ordering).
 */

import { isSuperAdmin, ROLES } from '../auth.js';

/**
 * Check if the active store session or user profile is a verified Master Admin
 * @param {object} storeOrUser 
 * @returns {boolean}
 */
export function isMasterAdmin(storeOrUser) {
  if (!storeOrUser) return false;

  const user = storeOrUser.currentUser || (storeOrUser.role ? storeOrUser : null);
  const staff = storeOrUser.currentStaff;

  // 1. Strict tenant profile separation: Cafe Admins, Staff, and any venue-scoped users are NEVER Master Admins
  if (user && (user.cafe_id || user.role === 'cafe_admin' || user.system_role === 'cafe_admin' || (user.role || '').toLowerCase() === 'admin' || (user.role || '').toLowerCase() === 'shift_manager')) {
    return false;
  }
  if (staff && (staff.cafe_id || staff.role === 'cafe_admin' || staff.system_role === 'cafe_admin' || (staff.role || '').toLowerCase() === 'admin' || (staff.role || '').toLowerCase() === 'shift_manager')) {
    return false;
  }
  if (storeOrUser.cafe_id || storeOrUser.role === 'cafe_admin' || storeOrUser.system_role === 'cafe_admin') {
    return false;
  }

  // 2. If user is explicitly master_admin / super_admin without cafe_id
  if (user && !user.cafe_id && (user.role === 'master_admin' || user.system_role === 'master_admin' || user.role === ROLES.SUPER_ADMIN || user.role === 'Super Admin')) {
    return true;
  }

  // 3. If ReactiveStore instance passed with active master session
  if (storeOrUser.isSuperAdmin && typeof storeOrUser.isSuperAdmin === 'function') {
    if (storeOrUser.isSuperAdmin()) return true;
  }

  // 4. If superAdmin session object present and strictly matches user (or no conflicting user)
  if (storeOrUser.superAdmin && !storeOrUser.superAdmin.cafe_id && isSuperAdmin(storeOrUser.superAdmin)) {
    if (user && user.email && storeOrUser.superAdmin.email && user.email.toLowerCase() !== storeOrUser.superAdmin.email.toLowerCase()) {
      return false;
    }
    return true;
  }

  // 5. If user object passed directly
  if (isSuperAdmin(storeOrUser) && !storeOrUser.cafe_id) return true;
  if ((storeOrUser.role === 'master_admin' || storeOrUser.system_role === 'master_admin') && !storeOrUser.cafe_id) return true;

  return false;
}

/**
 * Check if the active session is a registered Café Admin (Owner)
 * @param {object} storeOrUser 
 * @returns {boolean}
 */
export function isCafeAdmin(storeOrUser) {
  if (!storeOrUser) return false;
  const user = storeOrUser.currentUser || storeOrUser.currentStaff || storeOrUser;
  return (
    user.role === 'cafe_admin' || 
    user.system_role === 'cafe_admin' || 
    user.role === ROLES.ADMIN ||
    user.role === 'Admin'
  );
}

/**
 * Check if the active session is a Shift Manager or Floor Cashier
 * @param {object} storeOrUser 
 * @returns {boolean}
 */
export function isShiftStaff(storeOrUser) {
  if (!storeOrUser) return false;
  const staff = storeOrUser.currentStaff || storeOrUser.currentUser || storeOrUser;
  return (
    staff.role === ROLES.MANAGER || 
    staff.role === ROLES.CASHIER || 
    staff.role === ROLES.SERVER || 
    staff.role === ROLES.BARTENDER ||
    staff.role === 'shift_manager' ||
    staff.system_role === 'shift_manager'
  );
}

/**
 * Master Admin Route Guard
 * Strictly restricts /admin/master-control and platform-admin to master_admin profiles.
 * Non-master sessions are redirected to /login with access-denied triage.
 * 
 * @param {object} store - ReactiveStore
 * @param {object} [options={}] - { onDeny, redirectUrl }
 * @returns {boolean} True if allowed, false if redirected
 */
export function MasterAdminGuard(store, { onDeny, redirectUrl = '/login?redirect=platform-admin' } = {}) {
  const allowed = isMasterAdmin(store);
  if (!allowed) {
    if (typeof onDeny === 'function') {
      onDeny(redirectUrl, 'Access Denied: Platform Control Plane requires Master Admin credentials');
    }
    return false;
  }
  return true;
}

/**
 * Café Admin Route Guard
 * Enforces that user is either cafe_admin or master_admin.
 * 
 * @param {object} store - ReactiveStore
 * @param {object} [options={}] - { onDeny, redirectUrl }
 * @returns {boolean}
 */
export function CafeAdminGuard(store, { onDeny, redirectUrl = '/login' } = {}) {
  const allowed = isCafeAdmin(store) || isMasterAdmin(store);
  if (!allowed) {
    if (typeof onDeny === 'function') {
      onDeny(redirectUrl, 'Access Denied: Cafe Admin credentials required');
    }
    return false;
  }
  return true;
}

/**
 * Staff Operational Route Guard
 * Guards staff-only views (floorplan, pos, kds, analytics, stock).
 * 
 * @param {object} store - ReactiveStore
 * @param {object} [options={}] - { onDeny, redirectUrl }
 * @returns {boolean}
 */
export function StaffGuard(store, { onDeny, redirectUrl = '/login' } = {}) {
  // If store is uninitialized, redirect to Cafe Signup
  if (store && typeof store.isUninitialized === 'function' && store.isUninitialized()) {
    if (typeof onDeny === 'function') {
      onDeny('/signup?type=cafe', 'Please register your Café to start');
    }
    return false;
  }

  // Check if locked or unauthenticated
  const hasStaff = Boolean(store?.currentStaff || store?.currentUser);
  const isLocked = Boolean(store?.isLocked);

  if (!hasStaff || isLocked) {
    if (typeof onDeny === 'function') {
      onDeny(redirectUrl, 'Please sign in to access staff tools');
    }
    return false;
  }

  return true;
}

/**
 * Comprehensive Route Evaluator
 * Maps any target route to permission outcome and redirect target
 * 
 * @param {string} route - target view or pathname
 * @param {object} store - ReactiveStore
 * @returns {{ allowed: boolean, redirect: string | null, reason: string | null }}
 */
export function evaluateRouteGuard(route, store) {
  const normalized = (route || '').toLowerCase().replace(/^\//, '');

  // 1. HOSPITALITY INVARIANT: Customer Dine-In ALWAYS allowed without login
  if (normalized === 'customer' || normalized.startsWith('customer') || normalized.startsWith('t/')) {
    return { allowed: true, redirect: null, reason: null };
  }

  // 2. Public auth portals
  if (normalized === 'login' || normalized.startsWith('login') || normalized === 'signup' || normalized.startsWith('signup')) {
    return { allowed: true, redirect: null, reason: null };
  }

  // 3. Sovereign Master Admin Platform Control Plane
  if (normalized === 'platform-admin' || normalized === 'master-control' || normalized === 'admin/master-control') {
    if (!isMasterAdmin(store)) {
      return {
        allowed: false,
        redirect: '/login?redirect=platform-admin',
        reason: 'Platform Control Plane is strictly restricted to verified Master Super-Admins.'
      };
    }
    return { allowed: true, redirect: null, reason: null };
  }

  // 4. Operational Staff Views
  if (store && typeof store.isUninitialized === 'function' && store.isUninitialized()) {
    return {
      allowed: false,
      redirect: '/signup?type=cafe',
      reason: 'First-run setup required. Please register your Café.'
    };
  }

  return { allowed: true, redirect: null, reason: null };
}
