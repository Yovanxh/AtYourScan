/**
 * AtYourScan Application Entry Point
 * Mounts views, handles route parameters (?table=4, ?view=analytics),
 * and renders persistent Dribbble-inspired capsule top navigation rail.
 */

import { store } from './store.js';

if (typeof window !== 'undefined') {
  window.store = store;
}
import { renderCustomerView } from './components/CustomerView.js';
import { renderSalesAnalyticsView } from './components/SalesAnalyticsView.js';
import { renderFloorplanView } from './components/FloorplanView.js';
import { renderStockIngestionView } from './components/StockIngestionView.js';
import { renderKDSView } from './components/KDSView.js';
import { renderPOSView } from './components/POSView.js';
import { renderMenuView } from './components/MenuView.js';
import { renderQRStudioView } from './components/QRStudioView.js';
import { renderOnboardingModal } from './components/OnboardingModal.js';
import { renderTerminalPairingModal } from './components/TerminalPairingModal.js';
import { renderPINKeypad, openPINKeypad, renderLockScreenOverlay, getRoleStyle } from './components/PINKeypad.js';
import { renderManagerOverrideModal, requestManagerOverride } from './components/ManagerOverrideModal.js';
import { renderMasterAccountModal } from './components/MasterAccountModal.js';
import { renderMasterMenuIngestionModal } from './components/MasterMenuIngestionModal.js';
import { renderMasterAdminView } from './views/masterAdmin.js';
import { renderSuperAdminLoginModal } from './components/SuperAdminLoginModal.js';
import { renderSignupView } from './views/signupView.js';
import { renderLoginView } from './views/loginView.js';
import { renderResetPasswordView } from './views/resetPasswordView.js';
import { MasterAdminGuard, CafeAdminGuard, evaluateRouteGuard } from './components/ProtectedRoute.js';
import { supabase } from '../supabase.js';

// Route state
export const getTableFromUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('table')) {
      const parsed = parseInt(params.get('table'), 10);
      if (!isNaN(parsed)) return parsed;
    }
    const match = window.location.pathname.match(/\/(?:t|table)\/(\d+)/i);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
};

export const isGuestTableUrl = () => {
  if (typeof window === 'undefined' || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('table') || params.get('view') === 'customer') return true;
  const p = window.location.pathname.toLowerCase();
  if (p.match(/\/(?:t|table)\/(\d+)/)) return true;
  return false;
};

const getUrlParams = () => {
  if (typeof window !== 'undefined' && window.location) {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams();
};

const urlParams = getUrlParams();
const tableFromUrl = getTableFromUrl();
const rawView = urlParams.get('view');

if (tableFromUrl && store && store.cart) {
  store.cart.table_number = tableFromUrl;
}

// 6 Canonical Navigation Views (F3)
export const VIEWS = [
  { id: 'customer', label: 'Guest Dine-In', icon: '📱', desc: 'Guest Mobile Menu & Instant UPI Checkout' },
  { id: 'analytics', label: 'Sales Analytics', icon: '📊', desc: 'Pill Revenue Charts & Peak Hour Curves' },
  { id: 'floorplan', label: 'Table Floorplan', icon: '🗺️', desc: 'Spatial Dining Zones & Active Table Tabs' },
  { id: 'stock', label: 'Stock Ingestion', icon: '📦', desc: 'OCR Invoices & Batch Catalog Ingestion' },
  { id: 'kds', label: 'Kitchen KDS', icon: '🍳', desc: 'Live Order Prep & Kitchen Bump Rail' },
  { id: 'qr', label: 'QR Tent Studio', icon: '🏷️', desc: 'Printable Acrylic Table Stands' }
];

export const getPathFromUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam) {
      const v = viewParam.toLowerCase();
      if (v === 'pos' || v === 'floorplan') return 'floorplan';
      if (v === 'menu' || v === 'menu-builder' || v === 'stock') return 'stock';
      if (v === 'dashboard' || v === 'analytics') return 'analytics';
      if (v === 'admin/master-control' || v === 'master-control' || v === 'platform-admin') return 'platform-admin';
      if (['customer', 'kds', 'qr', 'signup', 'login', 'reset-password'].includes(v)) return v;
    }
    if (window.location.pathname) {
      const p = window.location.pathname.toLowerCase();
      if (p.includes('/signup')) return 'signup';
      if (p.includes('/login')) return 'login';
      if (p.includes('/reset-password')) return 'reset-password';
      if (p.includes('/admin/master-control') || p.includes('/master-control')) return 'platform-admin';
      if (p.includes('/menu-builder') || p.includes('/stock')) return 'stock';
      if (p.includes('/dashboard') || p.includes('/analytics')) return 'analytics';
      if (p.includes('/floorplan') || p.includes('/pos')) return 'floorplan';
      if (p.includes('/kds')) return 'kds';
      if (p.includes('/qr')) return 'qr';
      if (p.includes('/customer') || p.includes('/dine-in')) return 'customer';
    }
  }
  return null;
};

// GUEST INVARIANT EXCEPTION: Table links bypass authentication completely in zero-auth mode.
// Unauthenticated root navigation defaults to /login.
const pathView = getPathFromUrl();
const isGuest = isGuestTableUrl();
let initialView = isGuest ? 'customer' : (pathView || 'login');
if (rawView) {
  const normalized = rawView === 'pos' ? 'floorplan' : rawView === 'menu' ? 'stock' : rawView;
  if (normalized === 'platform-admin' || normalized === 'master-control') {
    initialView = 'platform-admin';
  } else if (normalized === 'signup' || normalized === 'login' || normalized === 'reset-password') {
    initialView = normalized;
  } else if (VIEWS.some(v => v.id === normalized)) {
    initialView = normalized;
  }
}

export let currentView = initialView;
let cleanupCurrentView = null;

const getNavContainer = () => (typeof document !== 'undefined' ? document.getElementById('top-navigation-rail') : null);
const getViewContainer = () => (typeof document !== 'undefined' ? document.getElementById('app-view-container') : null);

/**
 * Modal layer container resolver (resolving #app-modal-layer with headless test fallback)
 */
export function getModalContainer() {
  if (typeof document === 'undefined') return null;
  let layer = document.getElementById('app-modal-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'app-modal-layer';
    layer.className = 'relative z-50';
    document.body?.appendChild(layer);
  }
  return layer;
}

/**
 * Global modal layer dismissal
 */
export function closeModals() {
  const modalContainer = getModalContainer();
  if (modalContainer) {
    modalContainer.innerHTML = '';
  }
}

/**
 * Gatekeeper Contract: Evaluates whether navigation to targetView is permitted,
 * or if first-run setup / terminal pairing modals must intercept.
 *
 * CRITICAL HOSPITALITY PRESERVATION: Guest QR ordering ('customer') ALWAYS bypasses all gates.
 *
 * @param {string} targetView - view identifier ('customer' | 'analytics' | 'floorplan' | 'stock' | 'kds' | 'qr')
 * @param {object} [storeInstance=store] - store instance
 * @returns {{ allowed: boolean, gate: string | null }}
 */
export function evaluateAuthGates(targetView, storeInstance = store) {
  // CRITICAL HOSPITALITY PRESERVATION: Guest QR ordering bypasses ALL gates
  if (targetView === 'customer') {
    return { allowed: true, gate: null };
  }

  // Guard: Venue Existence & Persisted Completion Flag
  const hasActiveVenue = Boolean(storeInstance?.venue?.id || storeInstance?.venue?.name || (storeInstance?.cafes && storeInstance.cafes.length > 0));
  let isExplicitlyCompleted = false;
  try {
    isExplicitlyCompleted = localStorage.getItem('ays_setup_completed') === 'true';
  } catch {}

  // Gate 1: First-Run Onboarding Setup
  // If an active venue already exists or setup was explicitly completed, NEVER trigger First-Run Wizard
  if (!hasActiveVenue && !isExplicitlyCompleted) {
    if (storeInstance && typeof storeInstance.isUninitialized === 'function' && storeInstance.isUninitialized()) {
      return { allowed: false, gate: 'ONBOARDING_MODAL' };
    }
  }

  // Gate 2: Hardware Terminal SIN Pairing
  if (storeInstance && typeof storeInstance.isTerminalPaired === 'function' && !storeInstance.isTerminalPaired()) {
    return { allowed: false, gate: 'TERMINAL_PAIRING_MODAL' };
  }

  // Gate 3: Terminal Screen Lock
  if (storeInstance && storeInstance.isLocked) {
    return { allowed: false, gate: 'LOCK_SCREEN' };
  }

  // All gates passed: proceed to view
  return { allowed: true, gate: null };
}

export function checkAuthGates(targetView) {
  const gateCheck = evaluateAuthGates(targetView, store);
  if (gateCheck.allowed) {
    closeModals();
    return true;
  }

  if (gateCheck.gate === 'ONBOARDING_MODAL') {
    openOnboardingGate();
    return false;
  }

  if (gateCheck.gate === 'TERMINAL_PAIRING_MODAL') {
    openTerminalPairingGate();
    return false;
  }

  if (gateCheck.gate === 'LOCK_SCREEN') {
    openLockScreenGate();
    return false;
  }

  closeModals();
  return true;
}

export function openLockScreenGate() {
  const container = getModalContainer();
  if (!container) return;
  container.innerHTML = '';

  renderLockScreenOverlay(container, store, {
    onSuccess: (staff) => {
      closeModals();
      renderNavRail();
      switchView(currentView, false);
    }
  });
}

export function openOnboardingGate() {
  const hasActiveVenue = Boolean(store?.venue?.id || store?.venue?.name || (store?.cafes && store.cafes.length > 0));
  let isExplicitlyCompleted = false;
  try {
    isExplicitlyCompleted = localStorage.getItem('ays_setup_completed') === 'true';
  } catch {}

  if (hasActiveVenue || isExplicitlyCompleted) {
    // Suppress First-Run Wizard
    closeModals();
    return;
  }

  const container = getModalContainer();
  if (!container) return;
  container.innerHTML = '';

  renderOnboardingModal(container, store, {
    onComplete: (onboardingData) => {
      try {
        localStorage.setItem('ays_setup_completed', 'true');
        localStorage.setItem('ays_onboarded', 'true');
      } catch {}
      if (store) store.onboarded = true;

      // Re-evaluate pairing state
      if (!store.isTerminalPaired()) {
        openTerminalPairingGate();
      } else {
        closeModals();
        renderNavRail();
        switchView(currentView, false);
      }
    },
    onDismiss: () => {
      try {
        localStorage.setItem('ays_setup_completed', 'true');
      } catch {}
      if (store) store.onboarded = true;
      closeModals();
      switchView(currentView === 'customer' ? 'customer' : currentView, false);
    },
    onCancel: () => {
      try {
        localStorage.setItem('ays_setup_completed', 'true');
      } catch {}
      if (store) store.onboarded = true;
      closeModals();
      switchView(currentView === 'customer' ? 'customer' : currentView, false);
    }
  });
}

export function openTerminalPairingGate() {
  const container = getModalContainer();
  if (!container) return;
  container.innerHTML = '';

  renderTerminalPairingModal(container, store, {
    onSuccess: (pairing) => {
      closeModals();
      renderNavRail();
      switchView(currentView, false);
    },
    onDismiss: () => {
      // Safe fallback: redirect to guest dining
      switchView('customer');
    },
    onClose: () => {
      if (!store.isTerminalPaired()) {
        switchView('customer');
      } else {
        closeModals();
      }
    }
  });
}

/**
 * Render Dribbble-inspired tactile capsule tabs with glowing active pill indicator,
 * neon lime live dot, and real-time order/table count badges.
 */
export function renderNavRail() {
  const navContainer = getNavContainer();
  if (!navContainer) return;

  // The Platform Control Panel is an isolated platform operator console.
  // Suppress the entire Cafe POS upper navigation rail, cafe location name, and shift staff bar.
  if (currentView === 'platform-admin' || currentView === 'master-control') {
    navContainer.innerHTML = '';
    if (navContainer.style) navContainer.style.display = 'none';
    return;
  }
  if (navContainer.style) navContainer.style.display = '';

  // Streamlined Header for Auth Portals (/signup, /login, /reset-password)
  if (currentView === 'signup' || currentView === 'login' || currentView === 'reset-password') {
    navContainer.innerHTML = `
      <div class="w-full max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs select-none">
        <div class="flex items-center space-x-3 cursor-pointer" id="nav-brand-logo">
          <div class="h-9 px-2.5 rounded-xl bg-white flex items-center justify-center shadow-md shadow-orange-500/20 select-none overflow-hidden border border-white/20">
            <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan Logo" class="h-7 w-auto object-contain" />
          </div>
          <div class="leading-tight">
            <span class="text-[9px] font-black tracking-wider text-[#FF7622] uppercase block">
              CAFE & RESTAURANT QR SYSTEM
            </span>
            <span class="font-extrabold text-sm text-white tracking-tight">
              AtYourScan
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${currentView === 'signup' ? `
            <button 
              id="btn-nav-login"
              class="px-4 py-1.5 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-white/10 text-zinc-200 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              Sign In
            </button>
          ` : `
            <button 
              id="btn-nav-signup"
              class="px-4 py-1.5 rounded-full bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-md shadow-orange-500/20"
            >
              Register Café
            </button>
          `}
          <button 
            id="btn-nav-guest"
            class="px-3.5 py-1.5 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
          >
            Guest QR View
          </button>
        </div>
      </div>
    `;

    navContainer.querySelector('#btn-nav-login')?.addEventListener('click', () => switchView('login'));
    navContainer.querySelector('#btn-nav-signup')?.addEventListener('click', () => switchView('signup'));
    navContainer.querySelector('#btn-nav-guest')?.addEventListener('click', () => switchView('customer'));
    navContainer.querySelector('#nav-brand-logo')?.addEventListener('click', () => switchView(currentView));
    return;
  }

  // Streamlined Guest Header when in Customer QR Dine-In Mode
  if (currentView === 'customer') {
    const tableNum = store?.cart?.table_number;
    const cartCount = (store?.cart?.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);

    navContainer.innerHTML = `
      <div class="w-full max-w-md mx-auto px-4 py-2.5 flex items-center justify-between text-xs select-none">
        
        <!-- Left Circular Action Button -->
        <button 
          id="btn-guest-header-menu" 
          title="AtYourScan Menu & Portals"
          class="w-10 h-10 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-white/10 text-zinc-200 flex items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6h16M4 12h10M4 18h7"/>
          </svg>
        </button>

        <!-- Center Deliver to Table Badge -->
        <div class="text-center cursor-pointer" id="btn-nav-table-badge" title="Click to view options">
          <span class="text-[10px] font-extrabold tracking-wider text-[#FF7622] uppercase block">
            DELIVER TO
          </span>
          <span class="text-xs font-bold text-zinc-100 flex items-center justify-center gap-1">
            Table ${tableNum || 4} • ${store?.venue?.name || 'AtYourScan'}
            <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </span>
        </div>

        <!-- Right Side: Circular Cart Badge -->
        <div class="flex items-center gap-2">
          <button 
            id="btn-nav-open-cart-floating"
            title="Open Cart"
            class="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF7622] to-amber-500 hover:from-orange-600 hover:to-[#FF7622] text-white flex items-center justify-center relative shadow-lg shadow-orange-500/25 transition-all active:scale-95 cursor-pointer"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
            </svg>
            ${cartCount > 0 ? `
              <span class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-[#FF7622] text-[10px] font-black flex items-center justify-center shadow-md">
                ${cartCount}
              </span>
            ` : ''}
          </button>
        </div>

      </div>
    `;

    const floatingCartBtn = navContainer.querySelector?.('#btn-nav-open-cart-floating');
    if (floatingCartBtn) {
      floatingCartBtn.addEventListener('click', () => {
        const openCartBtn = document.querySelector('#btn-open-cart');
        if (openCartBtn) openCartBtn.click();
      });
    }

    const openGuestDrawer = () => {
      const modalContainer = getModalContainer();
      if (!modalContainer) return;

      modalContainer.innerHTML = `
        <div id="guest-nav-drawer-backdrop" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-start">
          <div id="guest-nav-drawer-panel" class="w-80 max-w-[85vw] h-full bg-[#111115] border-r border-white/10 text-zinc-100 flex flex-col p-5 shadow-2xl overflow-y-auto">
            
            <!-- Header -->
            <div class="flex items-center justify-between pb-4 border-b border-white/10">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF7622] to-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-orange-500/25">
                  🍽️
                </div>
                <div>
                  <h2 class="text-sm font-extrabold text-white tracking-tight">${store?.venue?.name || 'AtYourScan'}</h2>
                  <p class="text-[10px] text-zinc-400">AtYourScan Smart Dining</p>
                </div>
              </div>
              <button id="btn-close-guest-drawer" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer">
                ✕
              </button>
            </div>

            <!-- Dine-In Table Status Badge -->
            <div class="my-4 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
              <div>
                <span class="text-[10px] font-mono text-[#FF7622] uppercase tracking-wider block font-bold">Active Table</span>
                <span class="text-xs font-bold text-white">Table ${tableNum || 4} • Dine-In Guest</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                QR Active
              </span>
            </div>

            <!-- Navigation Sections -->
            <div class="space-y-4 flex-1">
              <div>
                <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1 font-bold">Portals & Authentication</span>
                <div class="mt-2 space-y-1.5">
                  <button id="drawer-btn-cafe-admin" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs bg-[#16161d] hover:bg-[#20202a] border border-white/5 hover:border-white/10 transition-all text-zinc-200 hover:text-white cursor-pointer group">
                    <span class="text-base p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">👤</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-zinc-100 flex items-center justify-between">
                        <span>Café Owner Login</span>
                        <span class="text-[9px] text-amber-400 font-mono font-bold">Admin</span>
                      </div>
                      <div class="text-[10px] text-zinc-400 truncate">Owner Email + Password sign in</div>
                    </div>
                  </button>

                  <button id="drawer-btn-staff-pin" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs bg-[#16161d] hover:bg-[#20202a] border border-white/5 hover:border-white/10 transition-all text-zinc-200 hover:text-white cursor-pointer group">
                    <span class="text-base p-1.5 rounded-lg bg-orange-500/10 text-[#FF7622] group-hover:scale-110 transition-transform">🔐</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-zinc-100 flex items-center justify-between">
                        <span>Staff PIN Sign In</span>
                        <span class="text-[9px] text-[#FF7622] font-mono font-bold">Staff</span>
                      </div>
                      <div class="text-[10px] text-zinc-400 truncate">Enter 4-digit PIN for Waiter/Cashier/POS</div>
                    </div>
                  </button>

                  ${store?.currentUser?.role === 'master_admin' && !store?.currentUser?.cafe_id ? `
                  <button id="drawer-btn-master-admin" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs bg-[#16161d] hover:bg-[#20202a] border border-white/5 hover:border-white/10 transition-all text-zinc-200 hover:text-white cursor-pointer group">
                    <span class="text-base p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-110 transition-transform">🛡️</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-zinc-100 flex items-center justify-between">
                        <span>Master Admin Portal</span>
                        <span class="text-[9px] text-rose-400 font-mono font-bold">Platform</span>
                      </div>
                      <div class="text-[10px] text-zinc-400 truncate">Platform telemetry & diagnostics</div>
                    </div>
                  </button>
                  ` : ''}

                  <button id="drawer-btn-signup" class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs bg-[#16161d] hover:bg-[#20202a] border border-white/5 hover:border-white/10 transition-all text-zinc-200 hover:text-white cursor-pointer group">
                    <span class="text-base p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">🚀</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-zinc-100">Register New Café</div>
                      <div class="text-[10px] text-zinc-400 truncate">Create an account for your outlet</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1 font-bold">Restaurant Operations</span>
                <div class="mt-2 space-y-1">
                  <button id="drawer-btn-floorplan" class="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left text-xs bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 hover:text-white transition-all cursor-pointer">
                    <span>🗺️</span>
                    <span class="font-medium">Table Floorplan & POS</span>
                  </button>
                  <button id="drawer-btn-kds" class="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left text-xs bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 hover:text-white transition-all cursor-pointer">
                    <span>🍳</span>
                    <span class="font-medium">Kitchen Display (KDS)</span>
                  </button>
                  <button id="drawer-btn-menu-stock" class="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left text-xs bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 hover:text-white transition-all cursor-pointer">
                    <span>📦</span>
                    <span class="font-medium">Menu Catalog & Stock</span>
                  </button>
                  <button id="drawer-btn-analytics" class="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left text-xs bg-white/[0.02] hover:bg-white/[0.06] text-zinc-300 hover:text-white transition-all cursor-pointer">
                    <span>📊</span>
                    <span class="font-medium">Sales Analytics</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="pt-4 border-t border-white/10 text-center">
              <p class="text-[10px] text-zinc-500 font-mono">AtYourScan v2.4</p>
            </div>

          </div>
        </div>
      `;

      const closeDrawer = () => {
        closeModals();
      };

      modalContainer.querySelector('#btn-close-guest-drawer')?.addEventListener('click', closeDrawer);
      modalContainer.querySelector('#guest-nav-drawer-backdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'guest-nav-drawer-backdrop') closeDrawer();
      });

      modalContainer.querySelector('#drawer-btn-cafe-admin')?.addEventListener('click', () => {
        closeDrawer();
        switchView('login');
      });

      modalContainer.querySelector('#drawer-btn-staff-pin')?.addEventListener('click', () => {
        closeDrawer();
        openPINKeypad(store, {
          title: 'Staff / Cashier PIN',
          subtitle: 'Enter 4-6 digit staff PIN to unlock terminal',
          onSuccess: () => {
            renderNavRail();
            switchView('floorplan');
          }
        });
      });

      modalContainer.querySelector('#drawer-btn-master-admin')?.addEventListener('click', () => {
        closeDrawer();
        if (typeof window !== 'undefined' && window.location && window.history) {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('portal', 'master');
            window.history.replaceState({}, '', url);
          } catch {}
        }
        switchView('login');
      });

      modalContainer.querySelector('#drawer-btn-signup')?.addEventListener('click', () => {
        closeDrawer();
        switchView('signup');
      });

      modalContainer.querySelector('#drawer-btn-floorplan')?.addEventListener('click', () => {
        closeDrawer();
        switchView('floorplan');
      });

      modalContainer.querySelector('#drawer-btn-kds')?.addEventListener('click', () => {
        closeDrawer();
        switchView('kds');
      });

      modalContainer.querySelector('#drawer-btn-menu-stock')?.addEventListener('click', () => {
        closeDrawer();
        switchView('stock');
      });

      modalContainer.querySelector('#drawer-btn-analytics')?.addEventListener('click', () => {
        closeDrawer();
        switchView('analytics');
      });
    };

    const guestMenuBtn = navContainer.querySelector?.('#btn-guest-header-menu');
    if (guestMenuBtn) {
      guestMenuBtn.addEventListener('click', openGuestDrawer);
    }

    const tableBadgeBtn = navContainer.querySelector?.('#btn-nav-table-badge');
    if (tableBadgeBtn) {
      tableBadgeBtn.addEventListener('click', openGuestDrawer);
    }

    return;
  }

  // Ensure table occupancy and orders are strictly synchronized across all modules
  if (store && typeof store.syncTableStates === 'function') {
    store.syncTableStates();
  }

  const activeOrdersCount = (store.orders || []).filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length;
  const activeTablesCount = (store.tables || []).filter(t => t.status && t.status !== 'Vacant' && t.status !== 'Available').length;
  const isPaired = typeof store.isTerminalPaired === 'function' ? store.isTerminalPaired() : false;
  const pairedTerminal = typeof store.getPairedTerminal === 'function' ? store.getPairedTerminal() : null;
  const pairedSin = pairedTerminal?.sin || 'SIN-POS-01';
  const pairedName = pairedTerminal?.terminal_name || 'Front Counter POS';
  const currentStaff = store?.currentStaff;
  const roleStyle = getRoleStyle(currentStaff?.role);
  const isMaster = typeof store.isMasterAdmin === 'function' ? store.isMasterAdmin() : false;
  const isSuper = typeof store.isSuperAdmin === 'function' ? store.isSuperAdmin() : false;

  navContainer.innerHTML = `
    <div class="w-full px-4 sm:px-6 py-2 flex items-center justify-between gap-2 lg:gap-4 flex-nowrap select-none">
      
      <!-- Brand & Location Dropdown (Matching Obsidian Dark Design System) -->
      <div class="flex items-center space-x-3 flex-shrink-0">
        <div class="flex items-center space-x-2.5 cursor-pointer group" id="nav-brand-logo" title="AtYourScan - Return to Overview">
          <div class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#FF7622] to-amber-500 text-white flex items-center justify-center font-bold text-base shadow-md shadow-orange-500/25 group-hover:scale-105 transition-transform select-none">
            🍽️
          </div>
          <div class="leading-tight">
            <span class="text-[9px] font-extrabold tracking-wider text-[#FF7622] uppercase block">
              LOCATION
            </span>
            <span class="font-bold text-xs text-zinc-100 flex items-center gap-1 group-hover:text-white transition-colors">
              ${store?.venue?.name || 'AtYourScan'}
              <svg class="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
              </svg>
            </span>
          </div>
        </div>

        <!-- Live Sync Pulse Dot -->
        <div class="hidden sm:flex items-center space-x-2 pl-3 border-l border-white/10 text-[11px] font-medium text-zinc-400 select-none">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Synced</span>
        </div>
      </div>

      <!-- Tactile Capsule Navigation Tabs (Obsidian Glass Capsule) -->
      <nav class="flex items-center gap-1 bg-[#121218]/90 border border-white/10 p-1 rounded-full shadow-inner shadow-black/50 backdrop-blur-md overflow-x-auto no-scrollbar flex-shrink min-w-0" aria-label="Main Navigation">
        ${VIEWS.filter(v => v.id !== 'customer').map(v => {
          const isActive = currentView === v.id;
          const isKds = v.id === 'kds';
          const isFloorplan = v.id === 'floorplan';
          const showKdsBadge = isKds && activeOrdersCount > 0;
          const showFloorplanBadge = isFloorplan && activeTablesCount > 0;

          return `
            <button 
              data-switch-view="${v.id}"
              title="${v.desc}"
              class="group relative px-3 sm:px-3.5 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 transition-all duration-200 select-none whitespace-nowrap active:scale-95 ${
                isActive 
                  ? 'bg-gradient-to-r from-[#FF7622] to-[#FF8C42] text-white shadow-md shadow-[#FF7622]/30 ring-1 ring-orange-400/40' 
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]'
              }"
            >
              <!-- Live Dot on Active Tab -->
              ${isActive ? `
                <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              ` : ''}

              <!-- Tab Icon -->
              <span class="text-xs transition-transform group-hover:scale-110">${v.icon}</span>

              <!-- Tab Label -->
              <span class="hidden md:inline">${v.label}</span>

              <!-- KDS Active Orders Count Badge -->
              ${showKdsBadge ? `
                <span class="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none transition-all ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : 'bg-[#FF7622]/20 text-[#FF7622] border border-[#FF7622]/30'
                }">
                  ${activeOrdersCount}
                </span>
              ` : ''}

              <!-- Floorplan Active Tables Count Badge -->
              ${showFloorplanBadge ? `
                <span class="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none transition-all ${
                  isActive 
                    ? 'bg-white/20 text-white' 
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }">
                  ${activeTablesCount}
                </span>
              ` : ''}
            </button>
          `;
        }).join('')}
      </nav>

      <!-- Right Action Rail: Menu & BOM Launcher, Terminal Hardware Pairing & Staff Auth -->
      <div class="flex items-center gap-2 flex-shrink-0" id="nav-actions-container">
        <!-- AI Menu Auto-Import Button (Visible for all Cafe Accounts & Admins) -->
        <button 
          id="nav-master-ai-menu-btn" 
          title="AI Menu Auto-Import (OCR & Instant Dish Extraction)"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md shadow-emerald-600/25 active:scale-95 cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          <span class="hidden sm:inline">AI Menu Import</span>
        </button>

        <button 
          id="nav-menu-catalog-btn" 
          title="Open Dynamic Menu Management & Bill of Materials (BOM)"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-[#FF7622]/40 hover:border-[#FF7622]/70 text-[#FF7622] text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          <span>🍱</span>
          <span class="hidden sm:inline">Menu & BOM</span>
        </button>

        ${isPaired ? `
          <button 
            id="nav-terminal-pairing-pill" 
            title="Hardware Terminal Paired: ${pairedSin} (${pairedName}) - Click to inspect or unpair"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="tracking-wide font-mono">${pairedSin}</span>
          </button>
        ` : `
          <button 
            id="nav-terminal-pairing-pill" 
            title="Terminal Hardware Unpaired - Click to pair physical terminal"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#16161d] hover:bg-[#20202a] border border-[#FF7622]/30 hover:border-[#FF7622]/60 text-[#FF7622] text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <span class="w-2 h-2 rounded-full bg-[#FF7622] animate-pulse"></span>
            <span class="hidden sm:inline">Pair Terminal</span>
          </button>
        `}

        <!-- Header Auth Container (Strictly Cafe Admin Display, No Staff Switching) -->
        <div id="header-staff-container" class="flex items-center gap-1.5 pl-2 border-l border-white/10">
          <!-- Platform Control Panel Pill (Strictly conditionally rendered ONLY for master_admin / super_admin) -->
          ${(store?.isSuperAdmin?.()) ? `
            <button 
              id="header-super-admin-pill"
              title="Platform Control Panel (Master Admin Active) - Click to launch Global Operations"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-black shadow-xs active:scale-95 cursor-pointer"
            >
              <span>🛡️</span>
              <span class="hidden xl:inline text-[11px]">Platform Control Panel</span>
            </button>
          ` : ''}

          <!-- Master Admin Pill (Only visible when active master session and not a cafe admin) -->
          ${(isMaster && !store?.currentUser?.cafe_id && store?.currentUser?.role !== 'cafe_admin') ? `
            <button 
              id="header-master-pill"
              title="Master Admin Active (Supabase Cloud Connected) - Click to manage Master Account"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer bg-amber-500/15 border border-amber-500/40 text-amber-300 font-black shadow-xs"
            >
              <span>👑</span>
              <span class="hidden xl:inline text-[11px]">Master Admin</span>
            </button>
          ` : ''}

          <!-- Cafe Admin Name Display (No Staff PIN Switching) -->
          <div 
            id="header-staff-pill"
            title="Active Café Admin: ${store?.currentUser?.name || currentStaff?.name || 'Café Admin'}"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#16161d] border border-amber-500/30 text-xs font-medium select-none shadow-xs"
          >
            <div class="w-5 h-5 rounded-full bg-gradient-to-tr from-[#FF7622] to-amber-500 text-white flex items-center justify-center font-bold text-[10px]">
              ${(store?.currentUser?.name || currentStaff?.name || 'C').charAt(0).toUpperCase()}
            </div>
            <span class="font-bold text-zinc-100">${store?.currentUser?.name || currentStaff?.name || 'Café Admin'}</span>
            <span class="text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
              Café Admin
            </span>
          </div>

          <!-- Screen Lock Button -->
          <button 
            id="header-btn-lock"
            title="Lock Terminal Screen"
            class="p-2 rounded-full bg-[#16161d] hover:bg-[#22222b] border border-white/10 text-zinc-300 hover:text-white transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        </div>

      </div>

    </div>
  `;

  // Bind Brand click to primary analytics view
  const brandLogo = navContainer.querySelector?.('#nav-brand-logo');
  if (brandLogo) {
    brandLogo.addEventListener('click', () => switchView('analytics'));
  }

  // Bind terminal pairing pill click
  const terminalPill = navContainer.querySelector?.('#nav-terminal-pairing-pill');
  if (terminalPill) {
    terminalPill.addEventListener('click', () => {
      renderTerminalPairingModal(getModalContainer(), store, {
        onSuccess: () => {
          closeModals();
          renderNavRail();
        },
        onUnpair: () => {
          renderNavRail();
          if (currentView !== 'customer') {
            checkAuthGates(currentView);
          }
        },
        onClose: () => {
          closeModals();
        }
      });
    });
  }

  // Bind Menu & BOM Catalog button
  const menuCatalogBtn = navContainer.querySelector?.('#nav-menu-catalog-btn');
  if (menuCatalogBtn) {
    menuCatalogBtn.addEventListener('click', () => {
      switchView('stock');
    });
  }

  // Bind Master Admin AI Menu Ingestion button
  const masterAiMenuBtn = navContainer.querySelector?.('#nav-master-ai-menu-btn');
  if (masterAiMenuBtn) {
    masterAiMenuBtn.addEventListener('click', () => {
      const activeStore = (typeof store !== 'undefined' && store) || (typeof window !== 'undefined' ? window.store : null) || {
        isAdmin: () => true,
        venue: { id: 'cafe-first-way-cafe-hotc', name: 'First Way Cafe' },
        dishes: [],
        categories: [],
        save: () => {},
        load: () => null
      };
      const modalLayer = getModalContainer();
      renderMasterMenuIngestionModal(modalLayer, activeStore, {
        onComplete: (summary) => {
          renderNavRail();
          switchView('stock');
          if (modalLayer && typeof modalLayer.remove === 'function') modalLayer.remove();
        },
        onClose: () => {
          if (modalLayer && typeof modalLayer.remove === 'function') modalLayer.remove();
        }
      });
    });
  }

  // Bind Super-Admin Platform Control Plane Pill
  const superAdminPill = navContainer.querySelector?.('#header-super-admin-pill');
  if (superAdminPill) {
    superAdminPill.addEventListener('click', () => {
      switchView('platform-admin');
    });
  }

  // Bind Master Admin Account Pill
  const masterPill = navContainer.querySelector?.('#header-master-pill');
  if (masterPill) {
    masterPill.addEventListener('click', () => {
      renderMasterAccountModal(getModalContainer(), store, {
        onSuccess: () => {
          renderNavRail();
        },
        onClose: () => {
          renderNavRail();
        }
      });
    });
  }

  // Bind Staff Login / Switch button
  const staffLoginBtn = navContainer.querySelector?.('#header-btn-login');
  if (staffLoginBtn) {
    staffLoginBtn.addEventListener('click', () => {
      switchView('login');
    });
  }

  const staffSwitchBtn = navContainer.querySelector?.('#header-btn-switch-staff');
  if (staffSwitchBtn) {
    staffSwitchBtn.addEventListener('click', () => {
      openPINKeypad(store, {
        title: 'Switch Staff Session',
        subtitle: 'Select staff member or enter 4-6 digit PIN',
        onSuccess: () => {
          renderNavRail();
        }
      });
    });
  }

  // Bind 1-Tap Screen Lock button
  const lockBtn = navContainer.querySelector?.('#header-btn-lock');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      store.lockScreen();
    });
  }

  // Bind view switchers
  navContainer.querySelectorAll?.('[data-switch-view]')?.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetView = e.currentTarget.dataset.switchView;
      switchView(targetView);
    });
  });
}

/**
 * Fallback Stub: Sales Analytics (F8, F9, F10, F11 - Milestone 3)
 */
function renderAnalyticsStub(container, store) {
  const orders = store.orders || [];
  const completedOrders = orders.filter(o => o.status !== 'Cancelled');
  const grossRevenue = completedOrders.reduce((acc, o) => acc + (o.total_amount || 0), 0);
  const totalOrders = completedOrders.length;
  const aov = totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;
  const estimatedMargin = 64.5;

  container.innerHTML = `
    <div class="analytics-stub min-h-screen bg-[#08080a] text-zinc-100 p-6 max-w-7xl mx-auto space-y-6">
      
      <!-- View Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div class="flex items-center space-x-2.5">
            <span class="text-2xl">📊</span>
            <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Sales Analytics Dashboard</h1>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
              Milestone 3 Pipeline
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-1">Dribbble obsidian capsule metrics, sales velocity heatmaps, and peak hour distribution.</p>
        </div>

        <div class="flex items-center gap-2">
          <button id="btn-analytics-to-kds" class="px-3.5 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-white/[0.08] transition-all flex items-center gap-1.5 active:scale-95">
            <span>🍳 View Live KDS</span>
          </button>
        </div>
      </div>

      <!-- Capsule Metric Cards Grid (F2 Dribbble dark aesthetic) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Metric 1: Gross Revenue -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Gross Revenue</span>
            <span class="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]"></span>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-zinc-100">₹${grossRevenue.toLocaleString('en-IN')}</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">+14.2%</span>
          </div>
          <p class="text-[10px] text-zinc-500 mt-1">Live from ${totalOrders} recorded orders</p>
        </div>

        <!-- Metric 2: Total Orders -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Order Volume</span>
            <span class="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]"></span>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-zinc-100">${totalOrders}</span>
            <span class="text-xs text-zinc-400">tickets</span>
          </div>
          <p class="text-[10px] text-zinc-500 mt-1">Contactless QR + Walk-ins</p>
        </div>

        <!-- Metric 3: Average Order Value -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Avg Order Value (AOV)</span>
            <span class="text-xs font-mono text-emerald-400">₹</span>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-zinc-100">₹${aov}</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Optimal</span>
          </div>
          <p class="text-[10px] text-zinc-500 mt-1">Per seated customer tab</p>
        </div>

        <!-- Metric 4: Gross Margin -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-amber-500/30 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Gross Margin</span>
            <span class="text-xs font-mono text-amber-400">%</span>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold font-mono text-zinc-100">${estimatedMargin}%</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Target 65%</span>
          </div>
          <p class="text-[10px] text-zinc-500 mt-1">COGS margin estimation</p>
        </div>
      </div>

      <!-- Preview Capsule Pill Bar Chart (F8 Dribbble Reference Design) -->
      <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-6 shadow-2xl space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Hourly Sales Velocity & Pill Curve</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.06] text-zinc-400">Peak Curve</span>
            </h2>
            <p class="text-xs text-zinc-400">Tactile pill bar indicators styled after Dribbble hospitality references</p>
          </div>
          <div class="flex items-center gap-1.5 bg-[#16161d] p-1 rounded-full border border-white/[0.06] text-xs">
            <span class="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-950 font-semibold text-[11px]">Today</span>
            <span class="px-2.5 py-0.5 rounded-full text-zinc-400 text-[11px]">Last 7D</span>
            <span class="px-2.5 py-0.5 rounded-full text-zinc-400 text-[11px]">MTD</span>
          </div>
        </div>

        <!-- Pill Bar Visuals -->
        <div class="h-44 pt-6 flex items-end justify-between gap-2 px-2 border-b border-white/[0.06]">
          ${[
            { h: '35%', hour: '12 PM', val: '₹1.8k' },
            { h: '60%', hour: '1 PM', val: '₹4.2k' },
            { h: '85%', hour: '2 PM', val: '₹7.6k', peak: true },
            { h: '45%', hour: '3 PM', val: '₹2.9k' },
            { h: '25%', hour: '4 PM', val: '₹1.2k' },
            { h: '40%', hour: '5 PM', val: '₹2.4k' },
            { h: '75%', hour: '6 PM', val: '₹6.1k' },
            { h: '95%', hour: '7 PM', val: '₹9.4k', peak: true },
            { h: '100%', hour: '8 PM', val: '₹11.2k', peak: true },
            { h: '80%', hour: '9 PM', val: '₹7.8k' },
            { h: '50%', hour: '10 PM', val: '₹3.6k' },
            { h: '20%', hour: '11 PM', val: '₹900' }
          ].map(bar => `
            <div class="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
              <span class="text-[9px] font-mono text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">${bar.val}</span>
              <div class="w-full max-w-[28px] rounded-full bg-zinc-800/80 group-hover:bg-zinc-700 transition-all flex items-end p-0.5 h-32">
                <div 
                  class="w-full rounded-full transition-all duration-500 ${
                    bar.peak 
                      ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                      : 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                  }" 
                  style="height: ${bar.h};"
                ></div>
              </div>
              <span class="text-[10px] font-mono text-zinc-400">${bar.hour}</span>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;

  const btnKds = container.querySelector?.('#btn-analytics-to-kds');
  if (btnKds) {
    btnKds.addEventListener('click', () => switchView('kds'));
  }

  return () => {};
}

/**
 * Fallback Stub: Table Floorplan (F12, F13, F14 - Milestone 4)
 */
function renderFloorplanStub(container, store) {
  const tables = store.tables || [];
  const totalTables = tables.length;
  const activeTables = tables.filter(t => t.status && t.status !== 'Vacant' && t.status !== 'Available').length;
  const vacantTables = totalTables - activeTables;

  container.innerHTML = `
    <div class="floorplan-stub min-h-screen bg-[#08080a] text-zinc-100 p-6 max-w-7xl mx-auto space-y-6">
      
      <!-- View Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div class="flex items-center space-x-2.5">
            <span class="text-2xl">🗺️</span>
            <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Interactive Table Floorplan</h1>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
              Milestone 4 Pipeline
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-1">Spatial dining zones, table occupancy states, running tab timers, and inspection actions.</p>
        </div>

        <div class="flex items-center gap-2">
          <button id="btn-launch-pos" class="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all flex items-center gap-1.5 active:scale-95">
            <span>🖥️ Launch Floor POS Console</span>
          </button>
        </div>
      </div>

      <!-- Table Status Pill Metrics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-zinc-400 uppercase">Total Tables</span>
          <div class="text-2xl font-bold font-mono text-zinc-100 mt-1">${totalTables}</div>
          <span class="text-[10px] text-zinc-500">Across 3 dining zones</span>
        </div>
        <div class="bg-[#111115] border border-emerald-500/20 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-emerald-400 uppercase">Active Seated</span>
          <div class="text-2xl font-bold font-mono text-emerald-300 mt-1">${activeTables}</div>
          <span class="text-[10px] text-zinc-500">Running guest orders</span>
        </div>
        <div class="bg-[#111115] border border-zinc-800 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-zinc-400 uppercase">Vacant Ready</span>
          <div class="text-2xl font-bold font-mono text-zinc-300 mt-1">${vacantTables}</div>
          <span class="text-[10px] text-zinc-500">Available for seating</span>
        </div>
        <div class="bg-[#111115] border border-amber-500/20 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-amber-400 uppercase">Occupancy Rate</span>
          <div class="text-2xl font-bold font-mono text-amber-300 mt-1">${totalTables > 0 ? Math.round((activeTables / totalTables) * 100) : 0}%</div>
          <span class="text-[10px] text-zinc-500">Real-time capacity</span>
        </div>
      </div>

      <!-- Spatial Restaurant Zones Preview -->
      <div class="space-y-4">
        <h2 class="text-sm font-semibold text-zinc-200">Spatial Dining Zones</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Zone 1: Indoor Courtyard -->
          <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl space-y-3">
            <div class="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span class="text-xs font-semibold text-zinc-200">🌿 Indoor Courtyard</span>
              <span class="text-[10px] font-mono text-zinc-400">Tables 1–4</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${tables.filter(t => (t.zone ? t.zone.includes('Courtyard') : (t.table_number || t.id) <= 4)).map(t => {
                const isOcc = t.status && t.status !== 'Vacant' && t.status !== 'Available';
                return `
                  <div class="p-3 rounded-xl border ${
                    isOcc ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                  } flex flex-col justify-between">
                    <div class="flex justify-between items-center text-xs font-bold">
                      <span>T-${t.table_number || t.number || t.id}</span>
                      <span class="w-2 h-2 rounded-full ${isOcc ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-zinc-600'}"></span>
                    </div>
                    <div class="text-[10px] font-mono mt-2">${t.status || 'Vacant'} • ${t.party_size || t.capacity || 4}p</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Zone 2: Verandah & Garden -->
          <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl space-y-3">
            <div class="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span class="text-xs font-semibold text-zinc-200">🍃 Verandah & Garden</span>
              <span class="text-[10px] font-mono text-zinc-400">Tables 5–6</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${tables.filter(t => (t.zone ? t.zone.includes('Verandah') : ((t.table_number || t.id) === 5 || (t.table_number || t.id) === 6))).map(t => {
                const isOcc = t.status && t.status !== 'Vacant' && t.status !== 'Available';
                return `
                  <div class="p-3 rounded-xl border ${
                    isOcc ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                  } flex flex-col justify-between">
                    <div class="flex justify-between items-center text-xs font-bold">
                      <span>T-${t.table_number || t.number || t.id}</span>
                      <span class="w-2 h-2 rounded-full ${isOcc ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-zinc-600'}"></span>
                    </div>
                    <div class="text-[10px] font-mono mt-2">${t.status || 'Vacant'} • ${t.party_size || t.capacity || 4}p</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Zone 3: Mezzanine Lounge -->
          <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl space-y-3">
            <div class="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span class="text-xs font-semibold text-zinc-200">🍸 Mezzanine Lounge</span>
              <span class="text-[10px] font-mono text-zinc-400">Tables 7–8</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${tables.filter(t => (t.zone ? t.zone.includes('Mezzanine') : (t.table_number || t.id) >= 7)).map(t => {
                const isOcc = t.status && t.status !== 'Vacant' && t.status !== 'Available';
                return `
                  <div class="p-3 rounded-xl border ${
                    isOcc ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400'
                  } flex flex-col justify-between">
                    <div class="flex justify-between items-center text-xs font-bold">
                      <span>T-${t.table_number || t.number || t.id}</span>
                      <span class="w-2 h-2 rounded-full ${isOcc ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' : 'bg-zinc-600'}"></span>
                    </div>
                    <div class="text-[10px] font-mono mt-2">${t.status || 'Vacant'} • ${t.party_size || t.capacity || 6}p</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

  const btnPos = container.querySelector?.('#btn-launch-pos');
  if (btnPos) {
    btnPos.addEventListener('click', () => {
      container.innerHTML = '';
      cleanupCurrentView = renderPOSView(container, store);
    });
  }

  return () => {};
}

/**
 * Fallback Stub: Stock Ingestion (F5, F6, F7 - Milestone 2)
 */
function renderStockStub(container, store) {
  const items = store.menuItems || [];
  const totalItems = items.length;
  const outOfStock = items.filter(i => !i.is_available).length;
  const inStock = totalItems - outOfStock;
  const lowStock = items.filter(i => i.is_available && (i.stock_quantity ?? 10) <= 5).length;

  container.innerHTML = `
    <div class="stock-stub min-h-screen bg-[#08080a] text-zinc-100 p-6 max-w-7xl mx-auto space-y-6">
      
      <!-- View Header -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div class="flex items-center space-x-2.5">
            <span class="text-2xl">📦</span>
            <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Smart Stock & Inventory Ingestion</h1>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
              Milestone 2 Pipeline
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-1">Multi-line text batch intake and camera/invoice OCR preview with automatic 86'd status sync.</p>
        </div>

        <div class="flex items-center gap-2">
          <button id="btn-open-menu-mgmt" class="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.35)] transition-all flex items-center gap-1.5 active:scale-95">
            <span>📋 Manage Menu & 86'd Items</span>
          </button>
        </div>
      </div>

      <!-- Stock Status Pills -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-zinc-400 uppercase">Catalog Items</span>
          <div class="text-2xl font-bold font-mono text-zinc-100 mt-1">${totalItems}</div>
          <span class="text-[10px] text-zinc-500">Live menu entries</span>
        </div>
        <div class="bg-[#111115] border border-emerald-500/20 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-emerald-400 uppercase">Available</span>
          <div class="text-2xl font-bold font-mono text-emerald-300 mt-1">${inStock}</div>
          <span class="text-[10px] text-zinc-500">Ready to order</span>
        </div>
        <div class="bg-[#111115] border border-rose-500/20 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-rose-400 uppercase">86'd Sold Out</span>
          <div class="text-2xl font-bold font-mono text-rose-300 mt-1">${outOfStock}</div>
          <span class="text-[10px] text-zinc-500">Hidden from guest menu</span>
        </div>
        <div class="bg-[#111115] border border-amber-500/20 rounded-2xl p-4 shadow-xl">
          <span class="text-[11px] font-mono text-amber-400 uppercase">Low Stock (≤5)</span>
          <div class="text-2xl font-bold font-mono text-amber-300 mt-1">${lowStock}</div>
          <span class="text-[10px] text-zinc-500">Replenishment alert</span>
        </div>
      </div>

      <!-- OCR & Batch Ingestion Dropzone Preview -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Text Batch Mode -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-3">
          <h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <span>📝 Quick Batch Text Ingestion</span>
            <span class="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">F5</span>
          </h3>
          <p class="text-xs text-zinc-400">Paste tabular data (Item Name, Quantity, Unit Cost) for bulk catalog updates.</p>
          <div class="bg-[#09090d] border border-zinc-800 rounded-xl p-3 font-mono text-xs text-zinc-500 h-28 flex items-center justify-center text-center">
            Pecorino Cheese, 10, ₹140<br/>San Marzano Tomatoes, 25, ₹95<br/>Truffle Oil, 4, ₹450
          </div>
        </div>

        <!-- Image OCR Dropzone -->
        <div class="bg-[#111115] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-3">
          <h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <span>📷 Smart Invoice & Receipt OCR</span>
            <span class="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">F6</span>
          </h3>
          <p class="text-xs text-zinc-400">Drag & drop supplier invoices or handwritten stock slips for instant item parsing.</p>
          <div class="border-2 border-dashed border-zinc-700/80 hover:border-emerald-500/50 rounded-xl p-4 h-28 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-zinc-900/30">
            <span class="text-xl">📥</span>
            <span class="text-xs font-semibold text-zinc-300 mt-1">Drop supplier invoice image here</span>
            <span class="text-[10px] text-zinc-500">PNG, JPG, WebP supported</span>
          </div>
        </div>
      </div>

    </div>
  `;

  const btnMenu = container.querySelector?.('#btn-open-menu-mgmt');
  if (btnMenu) {
    btnMenu.addEventListener('click', () => {
      container.innerHTML = '';
      cleanupCurrentView = renderMenuView(container, store);
    });
  }

  return () => {};
}

/**
 * View Switcher Router
 * Manages clean view unmounting, URL query sync, and mount of canonical views / stubs.
 */
export function switchView(viewId, updateHistory = true) {
  // Normalize legacy and alias routes
  if (viewId === 'pos') viewId = 'floorplan';
  if (viewId === 'menu') viewId = 'stock';
  if (viewId === 'menu-builder') viewId = 'stock';
  if (viewId === 'dashboard') viewId = 'analytics';

  // Synchronize floor occupancy and table states across modules
  if (store && typeof store.syncTableStates === 'function') {
    store.syncTableStates();
  }

  // Handle Signup Portal Route
  if (viewId === 'signup') {
    if (cleanupCurrentView) {
      try { cleanupCurrentView(); } catch (err) { console.warn('Error during view cleanup:', err); }
      cleanupCurrentView = null;
    }

    currentView = 'signup';
    const viewContainer = getViewContainer();
    if (viewContainer) {
      viewContainer.className = 'flex-1 flex flex-col w-full bg-[#08080a]';
      viewContainer.innerHTML = '';
      cleanupCurrentView = renderSignupView(viewContainer, store, {
        onNavigate: (targetView, opts) => {
          if (targetView === 'signup' && opts?.type) {
            if (typeof window !== 'undefined' && window.location && window.history) {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set('type', opts.type);
                window.history.replaceState({}, '', url);
              } catch {}
            }
          }
          switchView(targetView, updateHistory);
        }
      });
    }

    if (updateHistory && typeof window !== 'undefined' && window.location && window.history) {
      try {
        const href = window.location.href || (window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.search || ''}` : String(window.location));
        const newUrl = new URL(href);
        newUrl.searchParams.set('view', 'signup');
        window.history.replaceState({}, '', newUrl);
      } catch {}
    }

    renderNavRail();
    return;
  }

  // Handle Login Portal Route
  if (viewId === 'login') {
    if (cleanupCurrentView) {
      try { cleanupCurrentView(); } catch (err) { console.warn('Error during view cleanup:', err); }
      cleanupCurrentView = null;
    }

    currentView = 'login';
    const viewContainer = getViewContainer();
    if (viewContainer) {
      viewContainer.className = 'flex-1 flex flex-col w-full bg-[#08080a]';
      viewContainer.innerHTML = '';
      cleanupCurrentView = renderLoginView(viewContainer, store, {
        onNavigate: (targetView, opts) => {
          if (targetView === 'signup' && opts?.type) {
            if (typeof window !== 'undefined' && window.location && window.history) {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set('type', opts.type);
                window.history.replaceState({}, '', url);
              } catch {}
            }
          }
          switchView(targetView, updateHistory);
        }
      });
    }

    if (updateHistory && typeof window !== 'undefined' && window.location && window.history) {
      try {
        const href = window.location.href || (window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.search || ''}` : String(window.location));
        const newUrl = new URL(href);
        newUrl.searchParams.set('view', 'login');
        window.history.replaceState({}, '', newUrl);
      } catch {}
    }

    renderNavRail();
    return;
  }

  // Handle Reset Password Landing Page (/reset-password)
  if (viewId === 'reset-password') {
    if (cleanupCurrentView) {
      try { cleanupCurrentView(); } catch (err) { console.warn('Error during view cleanup:', err); }
      cleanupCurrentView = null;
    }

    currentView = 'reset-password';
    const viewContainer = getViewContainer();
    if (viewContainer) {
      viewContainer.className = 'flex-1 flex flex-col w-full bg-[#08080a]';
      viewContainer.innerHTML = '';
      cleanupCurrentView = renderResetPasswordView(viewContainer, store, {
        onNavigate: (targetView) => {
          switchView(targetView, updateHistory);
        }
      });
    }

    if (updateHistory && typeof window !== 'undefined' && window.location && window.history) {
      try {
        const href = window.location.href || (window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.search || ''}` : String(window.location));
        const newUrl = new URL(href);
        newUrl.searchParams.set('view', 'reset-password');
        window.history.replaceState({}, '', newUrl);
      } catch {}
    }

    renderNavRail();
    return;
  }

  // Handle Super-Admin Platform Control Plane Route
  if (viewId === 'platform-admin' || viewId === 'master-control') {
    const isMaster = Boolean(
      (typeof store?.isSuperAdmin === 'function' && store.isSuperAdmin()) ||
      (store?.currentUser && (store.currentUser.role === 'master_admin' || store.currentUser.system_role === 'master_admin') && !store.currentUser.cafe_id)
    );
    const isCafe = Boolean(
      store?.currentUser?.cafe_id || 
      store?.currentUser?.role === 'cafe_admin' || 
      store?.currentStaff?.cafe_id || 
      (store?.currentUser?.role || '').toLowerCase() === 'admin' || 
      (store?.currentUser?.role || '').toLowerCase() === 'shift_manager'
    );

    if (isCafe || !isMaster) {
      if (isCafe) {
        if (typeof showToast === 'function') {
          showToast('Access Denied: Platform Control Panel is restricted to Platform Operators only.', 'error');
        }
        const fallback = tableFromUrl ? 'customer' : (store?.currentUser?.role === 'shift_manager' ? 'floorplan' : 'analytics');
        switchView(fallback, updateHistory);
        return;
      }

      // Unauthenticated non-master: prompt super admin login modal
      renderSuperAdminLoginModal(getModalContainer(), store, {
        onSuccess: (admin) => {
          renderNavRail();
          switchView('platform-admin', updateHistory);
        },
        onClose: () => {
          const fallback = tableFromUrl ? 'customer' : 'login';
          switchView(fallback, updateHistory);
        }
      });
      return;
    }

    if (cleanupCurrentView) {
      try {
        cleanupCurrentView();
      } catch (err) {
        console.warn('Error during view cleanup:', err);
      }
      cleanupCurrentView = null;
    }

    currentView = 'platform-admin';
    const viewContainer = getViewContainer();
    if (viewContainer) {
      viewContainer.className = 'flex-1 flex flex-col w-full bg-[#08080a]';
      viewContainer.innerHTML = '';
      cleanupCurrentView = renderMasterAdminView(viewContainer, store);
    }

    if (updateHistory && typeof window !== 'undefined' && window.location && window.history) {
      try {
        const href = window.location.href || (window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.search || ''}` : String(window.location));
        const newUrl = new URL(href);
        newUrl.searchParams.set('view', 'platform-admin');
        window.history.replaceState({}, '', newUrl);
      } catch {}
    }

    renderNavRail();
    return;
  }

  // Validate against canonical registry
  if (!VIEWS.some(v => v.id === viewId)) {
    viewId = 'customer';
  }

  // Gate check before rendering management view
  if (!checkAuthGates(viewId)) {
    if (cleanupCurrentView) {
      try {
        cleanupCurrentView();
      } catch (err) {
        console.warn('Error during view cleanup:', err);
      }
      cleanupCurrentView = null;
    }
    const viewContainer = getViewContainer();
    if (viewContainer) {
      viewContainer.innerHTML = '';
    }
    currentView = viewId;
    renderNavRail();
    return;
  }

  // Cleanup current active view
  if (cleanupCurrentView) {
    try {
      cleanupCurrentView();
    } catch (err) {
      console.warn('Error during view cleanup:', err);
    }
    cleanupCurrentView = null;
  }

  currentView = viewId;
  const viewContainer = getViewContainer();
  if (viewContainer) {
    viewContainer.innerHTML = '';
  }

  // Update URL history without full reload
  if (updateHistory && typeof window !== 'undefined' && window.location && window.history) {
    try {
      const href = window.location.href || (window.location.origin ? `${window.location.origin}${window.location.pathname || '/'}${window.location.search || ''}` : String(window.location));
      const newUrl = new URL(href);
      newUrl.searchParams.set('view', viewId);
      window.history.replaceState({}, '', newUrl);
    } catch {}
  }

  renderNavRail();

  if (!viewContainer) return;

  const isLightView = ['customer', 'analytics', 'floorplan', 'stock', 'kds'].includes(viewId);
  if (isLightView) {
    viewContainer.className = 'flex-1 flex flex-col w-full bg-[#F7F8F9] transition-colors duration-200';
  } else {
    viewContainer.className = 'flex-1 flex flex-col w-full bg-[#08080a] transition-colors duration-200';
  }

  switch (viewId) {
    case 'customer':
      cleanupCurrentView = renderCustomerView(viewContainer, store, {
        onOpenKDS: () => switchView('kds'),
        onOpenPOS: () => switchView('floorplan')
      });
      break;

    case 'analytics':
      cleanupCurrentView = renderSalesAnalyticsView(viewContainer, store);
      break;

    case 'floorplan':
      cleanupCurrentView = renderFloorplanView(viewContainer, store);
      break;

    case 'stock':
      cleanupCurrentView = renderStockIngestionView(viewContainer, store);
      break;

    case 'kds':
      cleanupCurrentView = renderKDSView(viewContainer, store);
      break;

    case 'qr':
      cleanupCurrentView = renderQRStudioView(viewContainer, store);
      break;

    default:
      cleanupCurrentView = renderCustomerView(viewContainer, store, {
        onOpenKDS: () => switchView('kds'),
        onOpenPOS: () => switchView('floorplan')
      });
      break;
  }
}

// Listen to browser forward/back popstate
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('popstate', () => {
    const params = getUrlParams();
    const table = getTableFromUrl();
    const v = params.get('view');
    let canonical = (v === 'pos' ? 'floorplan' : v === 'menu' ? 'stock' : v);
    if (!canonical) {
      canonical = table ? 'customer' : 'analytics';
    }
    if (canonical === 'platform-admin' || canonical === 'master-control') {
      switchView('platform-admin', false);
    } else if (canonical === 'signup' || canonical === 'login') {
      switchView(canonical, false);
    } else if (VIEWS.some(view => view.id === canonical)) {
      switchView(canonical, false);
    }
  });
}

// Subscribe navigation rail & global alerts to store updates so ticket and table badge counts stay synced
let globalToastTimer = null;
if (store && store.subscribe) {
  store.subscribe((s, event) => {
    renderNavRail();
    if (store.isLocked && currentView !== 'customer') {
      openLockScreenGate();
    }
    if (event?.type === 'ORDER_FIRED' && event.order && currentView !== 'customer' && typeof document !== 'undefined') {
      const existingToast = document.getElementById('toast-incoming-order');
      if (!existingToast && document.body) {
        const order = event.order;
        const tableId = order.table_number || order.table_id || 'QR';
        const totalItems = (order.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
        const toastEl = document.createElement('div');
        toastEl.id = 'toast-incoming-order';
        toastEl.className = 'fixed top-6 right-6 z-50 bg-[#181C2E] text-white p-4 rounded-2xl shadow-2xl border border-[#FF7622]/50 flex items-center gap-3.5 animate-in slide-in-from-top duration-300 max-w-sm select-none';
        toastEl.innerHTML = `
          <div class="w-10 h-10 rounded-xl bg-[#FF7622]/20 text-[#FF7622] flex items-center justify-center text-xl font-bold flex-shrink-0 animate-bounce">
            🔔
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-black text-sm text-white">New QR Order Fired!</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFEBE4] text-[#FF7622]">Table ${tableId}</span>
            </div>
            <p class="text-xs text-zinc-400 mt-0.5 truncate">#${order.id} • ${totalItems} item(s) (₹${order.total_amount})</p>
          </div>
          <button id="btn-global-toast-view" class="px-3 py-1.5 rounded-xl bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold transition-all ml-1 cursor-pointer flex-shrink-0">
            View
          </button>
          <button id="btn-global-toast-dismiss" class="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-xs ml-1 cursor-pointer flex-shrink-0">
            ✕
          </button>
        `;
        document.body.appendChild(toastEl);
        toastEl.querySelector('#btn-global-toast-view')?.addEventListener('click', () => {
          toastEl.remove();
          switchView('floorplan');
        });
        toastEl.querySelector('#btn-global-toast-dismiss')?.addEventListener('click', () => {
          toastEl.remove();
        });
        if (globalToastTimer) clearTimeout(globalToastTimer);
        globalToastTimer = setTimeout(() => {
          if (toastEl.parentNode) toastEl.remove();
        }, 8000);
      }
    }
  });
}

// Entrypoint Gateway Routing & Session Resolution Subsystem
export async function initializeGatewayRouting() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // GUEST INVARIANT EXCEPTION: Guest table URLs bypass authentication in zero-auth mode
  if (isGuestTableUrl()) {
    switchView('customer', false);
    return;
  }

  const path = getPathFromUrl();
  const rawP = window.location.pathname.toLowerCase();
  const isRoot = (rawP === '/' || rawP === '' || rawP === '/index.html') && !path;

  // If explicit portal route requested
  if (path === 'signup' || path === 'reset-password' || path === 'login') {
    switchView(path, false);
    return;
  }

  // Check active Supabase session
  let activeSessionUser = null;
  if (supabase && typeof supabase.auth?.getSession === 'function') {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        activeSessionUser = data.session.user;
      }
    } catch (err) {
      console.info('Supabase gateway session verification:', err);
    }
  }

  if (!activeSessionUser && store?.currentUser) {
    activeSessionUser = store.currentUser;
  }

  // 1. If unauthenticated, render /login gateway immediately (except customer / guest table)
  if (!activeSessionUser) {
    if (isGuestTableUrl() || path === 'customer') {
      switchView('customer', false);
    } else if (path === 'signup' || path === 'login' || path === 'reset-password') {
      switchView(path, false);
    } else {
      switchView('login', false);
    }
    return;
  }

  // 2. If authenticated, query user's role from public.profiles
  let role = activeSessionUser.role || activeSessionUser.user_metadata?.role || 'cafe_admin';
  if (supabase && typeof supabase.from === 'function' && activeSessionUser.id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', activeSessionUser.id)
        .single();
      if (profile) {
        role = profile.role;
        store.currentUser = {
          id: activeSessionUser.id,
          email: activeSessionUser.email,
          name: profile.full_name || activeSessionUser.email?.split('@')[0],
          role: profile.role,
          system_role: profile.role,
          cafe_id: profile.cafe_id
        };
        if (profile.role === 'master_admin') {
          store.isMasterSession = true;
          store.isSuperAdminSession = true;
          store.superAdmin = store.currentUser;
        } else {
          store.currentStaff = {
            id: activeSessionUser.id,
            name: store.currentUser.name,
            email: activeSessionUser.email,
            role: profile.role || 'cafe_admin',
            system_role: profile.role || 'cafe_admin',
            cafe_id: profile.cafe_id,
            pin: profile.staff_pin || '1234',
            active: true,
            is_active: true
          };
          store.save('ays_current_staff', store.currentStaff);
          if (profile.cafe_id) {
            store.activateCafeEnvironment(profile.cafe_id, store.currentUser);
          }
        }
      }
    } catch {}
  }

  // 3. Dynamic Gateway Redirect for Root URL
  if (isRoot || !path) {
    if (role === 'master_admin') {
      switchView('platform-admin', false);
    } else if (role === 'shift_manager') {
      switchView('floorplan', false);
    } else {
      // cafe_admin -> /dashboard
      switchView('analytics', false);
    }
  } else {
    switchView(path, false);
  }
}

// Initial application boot in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  renderNavRail();
  initializeGatewayRouting();

  // Persistent Delegated Event Listener for AI Menu Auto-Import
  // Prevents button decoupling when views re-render
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', (e) => {
      const aiBtn = e.target.closest('#nav-master-ai-menu-btn, #tab-btn-master-ai, #btn-ai-menu-import');
      if (!aiBtn) return;

      e.preventDefault();
      e.stopPropagation();

      // 1. Update visual tab state cleanly across all tabs in ribbon if present
      document.querySelectorAll('#tab-btn-catalog, #tab-btn-text, #tab-btn-image, #tab-btn-master-ai').forEach(btn => {
        btn.classList.remove('bg-[#FF7622]', 'text-white', 'shadow-md', 'shadow-[#FF7622]/30', 'bg-emerald-600', 'shadow-emerald-600/30');
        btn.classList.add('text-[#646982]');
      });
      const masterAiBtn = document.querySelector('#tab-btn-master-ai');
      if (masterAiBtn) {
        masterAiBtn.classList.remove('text-[#646982]', 'text-emerald-800', 'bg-emerald-500/10');
        masterAiBtn.classList.add('bg-emerald-600', 'text-white', 'shadow-md', 'shadow-emerald-600/30');
      }

      // 2. Open MasterMenuIngestionModal
      let layer = document.getElementById('app-modal-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'app-modal-layer';
        layer.className = 'fixed inset-0 z-50 flex items-center justify-center';
        document.body?.appendChild(layer);
      }

      const modalFn = typeof renderMasterMenuIngestionModal === 'function'
        ? renderMasterMenuIngestionModal
        : (typeof window !== 'undefined' ? window.renderMasterMenuIngestionModal : null);

      if (typeof modalFn === 'function') {
        const activeStore = (typeof store !== 'undefined' && store) || (typeof window !== 'undefined' ? window.store : null) || {
          isAdmin: () => true,
          venue: { id: 'cafe-first-way-cafe-hotc', name: 'First Way Cafe' },
          dishes: [],
          categories: [],
          save: () => {},
          load: () => null
        };

        modalFn(layer, activeStore, {
          onComplete: () => {
            if (typeof renderNavRail === 'function') renderNavRail();
            if (typeof switchView === 'function' && typeof currentView !== 'undefined' && currentView) switchView(currentView, false);
            if (typeof render === 'function') render();
            if (layer && typeof layer.remove === 'function') layer.remove();
          },
          onClose: () => {
            if (layer && typeof layer.remove === 'function') layer.remove();
          }
        });
      } else {
        console.error('[AI Menu Import] renderMasterMenuIngestionModal could not be found.');
      }
    });
  }
}

