/**
 * src/components/PINKeypad.js
 * 
 * Interactive 3x4 Touch-Friendly Numeric Keypad, Fast Staff Session Switching,
 * Role Badges, and Fullscreen Screen Lock Overlay.
 * 
 * Complies with Milestone 3 (Features F6, F7, F8) and Requirement R3.
 */

import { ROLES } from '../auth.js';

/**
 * Role badge style mapping
 */
export const ROLE_STYLES = Object.freeze({
  [ROLES.ADMIN]: {
    label: 'Master Admin',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    glow: 'shadow-[0_0_10px_rgba(16,185,129,0.25)]',
    dot: 'bg-emerald-400'
  },
  [ROLES.MANAGER]: {
    label: 'Floor Manager',
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    glow: 'shadow-[0_0_10px_rgba(245,158,11,0.25)]',
    dot: 'bg-amber-400'
  },
  [ROLES.CASHIER]: {
    label: 'Head Cashier',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    glow: 'shadow-[0_0_10px_rgba(6,182,212,0.25)]',
    dot: 'bg-cyan-400'
  },
  [ROLES.SERVER]: {
    label: 'Floor Server',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    glow: 'shadow-[0_0_10px_rgba(99,102,241,0.25)]',
    dot: 'bg-indigo-400'
  },
  [ROLES.BARTENDER]: {
    label: 'Bar Specialist',
    bg: 'bg-purple-500/15',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    glow: 'shadow-[0_0_10px_rgba(168,85,247,0.25)]',
    dot: 'bg-purple-400'
  }
});

/**
 * Resolve style for a given role with safe fallback
 */
export function getRoleStyle(role) {
  return ROLE_STYLES[role] || {
    label: role || 'Staff Member',
    bg: 'bg-zinc-800',
    text: 'text-zinc-300',
    border: 'border-zinc-700',
    glow: '',
    dot: 'bg-zinc-400'
  };
}

/**
 * Render Numeric Touch Keypad Component
 * 
 * @param {HTMLElement} container - DOM mount container
 * @param {object} store - Central store instance
 * @param {object} options - Configuration options
 * @returns {() => void} Cleanup unmount handler
 */
export function renderPINKeypad(container, store, options = {}) {
  const {
    mode = 'modal', // 'modal' | 'lockscreen' | 'inline'
    title = mode === 'lockscreen' ? 'Terminal Locked' : 'Staff Quick Login',
    subtitle = mode === 'lockscreen' 
      ? 'Enter your 4-6 digit numeric PIN to unlock terminal' 
      : 'Select staff member or enter 4-6 digit PIN',
    requireRole = null,
    preselectedStaffId = null,
    targetAction = null,
    onSuccess = null,
    onClose = null,
    onDismiss = null
  } = options;

  let currentPin = '';
  let selectedStaffId = preselectedStaffId || (store?.currentStaff?.id || null);
  let errorMessage = '';
  let isAuthenticating = false;
  let shakeCard = false;

  const isLockscreen = mode === 'lockscreen';

  function getCachedStaffRoster() {
    if (store && Array.isArray(store.cachedStaff) && store.cachedStaff.length > 0) {
      const superAdminEmails = (store.superAdminAccounts || []).map(a => (a.email || '').toLowerCase());
      if (store.superAdmin?.email) superAdminEmails.push(store.superAdmin.email.toLowerCase());

      return store.cachedStaff.filter(s => {
        if (!s || s.active === false || s.is_active === false) return false;
        const r = (s.role || '').toLowerCase();
        const sr = (s.system_role || '').toLowerCase();
        const em = (s.email || '').toLowerCase();
        if (r === 'master_admin' || sr === 'master_admin' || r === 'super_admin' || sr === 'super_admin' || s.is_super_admin) return false;
        if (superAdminEmails.includes(em)) return false;
        return true;
      });
    }
    return [];
  }

  function handleDigit(digit) {
    if (isAuthenticating) return;
    if (currentPin.length >= 6) return;
    currentPin += String(digit);
    errorMessage = '';
    shakeCard = false;
    store?.playSound?.('tap');
    render();

    // Auto-submit on 4 or 6 digits if single staff or pre-selected
    if (currentPin.length === 4 || currentPin.length === 6) {
      // Optional subtle debounce / auto-test
    }
  }

  function handleBackspace() {
    if (isAuthenticating) return;
    if (currentPin.length > 0) {
      currentPin = currentPin.slice(0, -1);
      errorMessage = '';
      shakeCard = false;
      store?.playSound?.('tap');
      render();
    }
  }

  function handleClear() {
    if (isAuthenticating) return;
    currentPin = '';
    errorMessage = '';
    shakeCard = false;
    store?.playSound?.('pop');
    render();
  }

  async function handleSubmit() {
    if (isAuthenticating) return;
    const cleanPin = currentPin.trim();

    if (!cleanPin) {
      errorMessage = 'Please enter your numeric PIN';
      shakeCard = true;
      store?.playSound?.('bump');
      render();
      return;
    }

    if (cleanPin.length < 4 || cleanPin.length > 6) {
      errorMessage = 'PIN must be 4 to 6 digits';
      shakeCard = true;
      store?.playSound?.('bump');
      render();
      return;
    }

    isAuthenticating = true;
    errorMessage = '';
    render();

    try {
      let result;
      if (isLockscreen) {
        result = await store.unlockScreen(cleanPin);
      } else {
        result = await store.switchStaff(cleanPin, selectedStaffId);
      }

      if (result && result.success) {
        store?.playSound?.('bell');
        currentPin = '';
        if (typeof onSuccess === 'function') {
          onSuccess(result.staff);
        }
      } else {
        errorMessage = result?.error || 'Authentication Failed: Invalid PIN';
        shakeCard = true;
        currentPin = '';
        store?.playSound?.('bump');
        render();
      }
    } catch (err) {
      errorMessage = err?.message || 'Authentication error occurred';
      shakeCard = true;
      currentPin = '';
      store?.playSound?.('bump');
      render();
    } finally {
      isAuthenticating = false;
    }
  }

  function handleKeydown(e) {
    let digit = null;
    if (e.key >= '0' && e.key <= '9') {
      digit = e.key;
    } else if (e.code && /^Numpad[0-9]$/.test(e.code)) {
      digit = e.code.replace('Numpad', '');
    }

    if (digit !== null) {
      e.preventDefault();
      const btn = container.querySelector(`[data-pin-key="${digit}"]`);
      if (btn) {
        btn.classList.add('scale-90', 'bg-[#FF7622]', 'text-white');
        setTimeout(() => {
          btn?.classList?.remove('scale-90', 'bg-[#FF7622]', 'text-white');
        }, 120);
      }
      handleDigit(digit);
    } else if (e.key === 'Backspace' || e.code === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      if (!isLockscreen) {
        e.preventDefault();
        handleClose();
      }
    }
  }

  function handleClose() {
    if (typeof onDismiss === 'function') {
      onDismiss();
    } else if (typeof onClose === 'function') {
      onClose();
    } else {
      container.innerHTML = '';
    }
  }

  function render() {
    const staffRoster = getCachedStaffRoster();
    const pairedTerminal = store?.getPairedTerminal?.() || store?.terminalPairing;
    const venue = store?.venue || { name: 'AtYourScan Hospitality' };
    const selectedStaff = staffRoster.find(s => s.id === selectedStaffId) || store?.currentStaff;

    // PIN indicator dots (supports up to 6 digits)
    const pinSlots = Array.from({ length: 6 }, (_, i) => {
      const isFilled = i < currentPin.length;
      return `
        <div class="w-4 h-4 rounded-full border transition-all duration-200 flex items-center justify-center ${
          isFilled
            ? 'bg-[#FF7622] border-[#FF7622] shadow-sm shadow-[#FF7622]/40 scale-110'
            : 'bg-[#F0F5FA] border-slate-200 scale-100'
        }">
          ${isFilled ? '<span class="w-1.5 h-1.5 rounded-full bg-white"></span>' : ''}
        </div>
      `;
    }).join('');

    const keypadHtml = `
      <div 
        id="pin-keypad-overlay"
        class="${
          isLockscreen 
            ? 'fixed inset-0 z-50 bg-[#181C2E]/85 backdrop-blur-xl flex items-center justify-center p-4' 
            : 'fixed inset-0 z-50 bg-[#181C2E]/70 backdrop-blur-md flex items-center justify-center p-4'
        }"
      >
        <div 
          id="pin-keypad-card"
          class="w-full max-w-md bg-white border border-slate-100 rounded-[32px] p-7 shadow-2xl relative flex flex-col space-y-5 transition-transform duration-200 ${
            shakeCard ? 'animate-bounce border-red-400 ring-4 ring-red-100' : ''
          }"
        >
          <!-- Top Header -->
          <div class="flex items-center justify-between border-b border-slate-100 pb-4">
            <div class="flex items-center space-x-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                ${isLockscreen ? '🔒' : '👤'}
              </div>
              <div>
                <h3 class="text-base font-black text-[#181C2E] flex items-center gap-2">
                  ${title}
                  ${pairedTerminal?.sin ? `
                    <span class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#F0F5FA] text-[#646982]">
                      ${pairedTerminal.sin}
                    </span>
                  ` : ''}
                </h3>
                <p class="text-xs text-[#646982] mt-0.5">${subtitle}</p>
              </div>
            </div>

            ${!isLockscreen ? `
              <button 
                id="btn-close-keypad"
                aria-label="Close Keypad"
                class="w-8 h-8 rounded-full bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982] hover:text-[#181C2E] flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
              >
                ✕
              </button>
            ` : `
              <div class="text-[11px] font-bold text-[#FF7622] flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[#FF7622] animate-pulse"></span>
                <span>Locked</span>
              </div>
            `}
          </div>

          <!-- Staff Roster Selector Carousel -->
          ${staffRoster.length > 0 ? `
            <div class="space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-[#A0A5BA]">Quick Staff Switch</span>
              <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                ${staffRoster.map(s => {
                  const isSelected = selectedStaffId === s.id;
                  const roleStyle = getRoleStyle(s.role);
                  return `
                    <button 
                      data-select-staff="${s.id}"
                      class="px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap active:scale-95 cursor-pointer ${
                        isSelected 
                          ? 'bg-[#FF7622] text-white shadow-sm shadow-[#FF7622]/30' 
                          : 'bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982]'
                      }"
                    >
                      <span class="w-2 h-2 rounded-full ${isSelected ? 'bg-white' : roleStyle.dot}"></span>
                      <span>${s.name}</span>
                      <span class="text-[9px] uppercase px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-black/20 text-white' : 'bg-white text-[#646982]'}">
                        ${s.role}
                      </span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- PIN Display Area -->
          <div class="bg-[#F7F8F9] border border-slate-100 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
            ${selectedStaff ? `
              <div class="flex items-center gap-2 text-xs text-[#646982]">
                <span>Authenticating:</span>
                <span class="font-bold text-[#181C2E]">${selectedStaff.name}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${getRoleStyle(selectedStaff.role).bg} ${getRoleStyle(selectedStaff.role).text}">
                  ${selectedStaff.role}
                </span>
              </div>
            ` : ''}

            <!-- Dots Container -->
            <div class="flex items-center gap-3 py-2" id="pin-indicator-dots">
              ${pinSlots}
            </div>

            <!-- Error Banner -->
            ${errorMessage ? `
              <div class="text-xs text-[#FF334B] font-bold text-center px-3 py-1.5 rounded-xl bg-[#FFF0F2] border border-rose-200 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>${errorMessage}</span>
              </div>
            ` : `
              <span class="text-[11px] font-medium text-[#A0A5BA]">Enter 4 to 6 digit security PIN</span>
            `}
          </div>

          <!-- 3x4 Touch Numeric Keypad Grid -->
          <div class="grid grid-cols-3 gap-3 pt-1">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
              <button 
                data-pin-key="${num}"
                class="h-14 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] active:bg-[#FF7622] active:text-white active:scale-95 text-xl font-black text-[#181C2E] flex items-center justify-center transition-all select-none cursor-pointer"
              >
                ${num}
              </button>
            `).join('')}

            <!-- Clear / Backspace Key -->
            <button 
              id="btn-pin-backspace"
              title="Delete last digit"
              class="h-14 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] active:scale-95 text-xs font-bold text-[#646982] hover:text-[#181C2E] flex items-center justify-center transition-all select-none cursor-pointer"
            >
              ⌫ Clear
            </button>

            <!-- Zero Key -->
            <button 
              data-pin-key="0"
              class="h-14 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] active:bg-[#FF7622] active:text-white active:scale-95 text-xl font-black text-[#181C2E] flex items-center justify-center transition-all select-none cursor-pointer"
            >
              0
            </button>

            <!-- Submit Key -->
            <button 
              id="btn-pin-submit"
              title="Submit PIN"
              ${isAuthenticating ? 'disabled' : ''}
              class="h-14 rounded-2xl bg-[#FF7622] hover:bg-[#F15B00] text-white font-black text-sm flex items-center justify-center gap-1.5 transition-all shadow-md shadow-[#FF7622]/25 active:scale-95 select-none disabled:opacity-50 cursor-pointer"
            >
              ${isAuthenticating ? `
                <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ` : `
                <span>Unlock ✓</span>
              `}
            </button>
          </div>

          <!-- Quick Actions & Reset demo helper -->
          <div class="flex items-center justify-between text-[11px] text-[#A0A5BA] pt-2 border-t border-slate-100">
            <span class="flex items-center gap-1">
              <span>⌨️</span>
              <span>Physical keyboard & numpad active</span>
            </span>
            <div class="flex items-center gap-3">
              <button 
                id="btn-pin-forgot"
                type="button"
                class="hover:text-[#FF7622] underline transition-all cursor-pointer font-bold text-[#646982]"
              >
                Forgot PIN?
              </button>
              <button 
                id="btn-pin-all-clear"
                type="button"
                class="hover:text-[#181C2E] underline transition-all cursor-pointer font-bold"
              >
                Clear
              </button>
            </div>
          </div>

        </div>
      </div>
    `;

    container.innerHTML = keypadHtml;
    bindEvents();
  }

  function bindEvents() {
    // Number keys
    container.querySelectorAll('[data-pin-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = e.currentTarget.dataset.pinKey;
        handleDigit(val);
      });
    });

    // Backspace
    const backBtn = container.querySelector('#btn-pin-backspace');
    if (backBtn) {
      backBtn.addEventListener('click', handleBackspace);
    }

    // Reset Entry
    const allClearBtn = container.querySelector('#btn-pin-all-clear');
    if (allClearBtn) {
      allClearBtn.addEventListener('click', handleClear);
    }

    // Forgot PIN advice
    const forgotBtn = container.querySelector('#btn-pin-forgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', () => {
        errorMessage = 'Forgot PIN? Contact Floor Manager or Platform Super-Admin to reset your PIN remotely.';
        shakeCard = true;
        store?.playSound?.('bump');
        render();
      });
    }

    // Submit
    const submitBtn = container.querySelector('#btn-pin-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleSubmit);
    }

    // Close button (for non-lockscreen mode)
    const closeBtn = container.querySelector('#btn-close-keypad');
    if (closeBtn) {
      closeBtn.addEventListener('click', handleClose);
    }

    // Staff roster switch chips
    container.querySelectorAll('[data-select-staff]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectedStaffId = e.currentTarget.dataset.selectStaff;
        errorMessage = '';
        currentPin = '';
        store?.playSound?.('tap');
        render();
      });
    });
  }

  // Bind keyboard listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown);
  }

  render();

  return () => {
    if (typeof window !== 'undefined') {
      window?.removeEventListener?.('keydown', handleKeydown);
    }
  };
}

/**
 * Convenience helper to open PIN keypad in modal layer
 * @param {object} store
 * @param {object} options
 */
export function openPINKeypad(store, options = {}) {
  let modalLayer = typeof document !== 'undefined' ? document.getElementById('app-modal-layer') : null;
  if (!modalLayer && typeof document !== 'undefined') {
    modalLayer = document.createElement('div');
    modalLayer.id = 'app-modal-layer';
    document.body?.appendChild(modalLayer);
  }
  if (!modalLayer) return () => {};

  return renderPINKeypad(modalLayer, store, {
    mode: 'modal',
    ...options,
    onSuccess: (staff) => {
      modalLayer.innerHTML = '';
      if (typeof options.onSuccess === 'function') {
        options.onSuccess(staff);
      }
    },
    onDismiss: () => {
      modalLayer.innerHTML = '';
      if (typeof options.onDismiss === 'function') {
        options.onDismiss();
      }
    }
  });
}

/**
 * Convenience helper to render fullscreen lockscreen overlay
 * @param {HTMLElement} container
 * @param {object} store
 * @param {object} options
 */
export function renderLockScreenOverlay(container, store, options = {}) {
  return renderPINKeypad(container, store, {
    mode: 'lockscreen',
    title: 'POS Terminal Locked',
    subtitle: 'Enter staff PIN to unlock terminal session',
    ...options,
    onSuccess: (staff) => {
      container.innerHTML = '';
      if (typeof options.onSuccess === 'function') {
        options.onSuccess(staff);
      }
    }
  });
}
