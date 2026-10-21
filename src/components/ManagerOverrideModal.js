/**
 * src/components/ManagerOverrideModal.js
 * 
 * Automated Security Challenge Modal for Sensitive POS Operations:
 * Order Voids, Item Deletions, Custom Discounts, Table Force-Clears, and Price Alters.
 * 
 * Enforces Milestone 4 (Features F9, F10, F11) and Requirement R4.
 */

import { ROLES, SENSITIVE_PERMISSIONS } from '../auth.js';
import { getRoleStyle } from './PINKeypad.js';

/**
 * Render Manager Override Security Challenge Modal
 * 
 * @param {HTMLElement} container - DOM mount container
 * @param {object} store - Central store instance
 * @param {object} options - Challenge options
 * @returns {() => void} Cleanup unmount handler
 */
export function renderManagerOverrideModal(container, store, options = {}) {
  const {
    actionType = 'MANAGER_OVERRIDE',
    actionLabel = 'Restricted POS Action',
    targetItem = 'N/A',
    initiator = store?.currentStaff || { name: 'Staff', role: 'Server' },
    onSuccess = null,
    onCancel = null,
    onDismiss = null
  } = options;

  let currentPin = '';
  let errorMessage = '';
  let isAuthorizing = false;
  let shakeCard = false;

  function handleDigit(digit) {
    if (isAuthorizing) return;
    if (currentPin.length >= 6) return;
    currentPin += String(digit);
    errorMessage = '';
    shakeCard = false;
    store?.playSound?.('tap');
    render();
  }

  function handleBackspace() {
    if (isAuthorizing) return;
    if (currentPin.length > 0) {
      currentPin = currentPin.slice(0, -1);
      errorMessage = '';
      shakeCard = false;
      store?.playSound?.('tap');
      render();
    }
  }

  function handleClear() {
    if (isAuthorizing) return;
    currentPin = '';
    errorMessage = '';
    shakeCard = false;
    store?.playSound?.('pop');
    render();
  }

  async function handleAuthorize() {
    if (isAuthorizing) return;
    const cleanPin = currentPin.trim();

    if (!cleanPin) {
      errorMessage = 'Please enter Manager or Admin PIN';
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

    isAuthorizing = true;
    errorMessage = '';
    render();

    try {
      const result = await store.verifyManagerOverride({
        pin: cleanPin,
        actionType,
        actionLabel,
        targetItem,
        initiator
      });

      if (result && result.success) {
        store?.playSound?.('bell');
        container.innerHTML = '';
        if (typeof onSuccess === 'function') {
          onSuccess(result.authorizer, result.auditLog);
        }
      } else {
        errorMessage = result?.error || 'Security Alert: Invalid Manager PIN or Insufficient Privileges';
        shakeCard = true;
        currentPin = '';
        store?.playSound?.('bump');
        render();
      }
    } catch (err) {
      errorMessage = err?.message || 'Override authorization error';
      shakeCard = true;
      currentPin = '';
      store?.playSound?.('bump');
      render();
    } finally {
      isAuthorizing = false;
    }
  }

  function handleClose() {
    container.innerHTML = '';
    if (typeof onDismiss === 'function') {
      onDismiss();
    } else if (typeof onCancel === 'function') {
      onCancel();
    }
  }

  function handleKeydown(e) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      handleDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAuthorize();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }

  function render() {
    const initiatorRoleStyle = getRoleStyle(initiator.role);
    const terminalSin = store?.terminalPairing?.sin || 'SIN-POS-01';

    // PIN indicator dots
    const pinSlots = Array.from({ length: 6 }, (_, i) => {
      const isFilled = i < currentPin.length;
      return `
        <div class="w-4 h-4 rounded-full border transition-all duration-200 flex items-center justify-center ${
          isFilled
            ? 'bg-amber-400 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.7)] scale-110'
            : 'bg-zinc-900 border-zinc-700/80 scale-100'
        }">
          ${isFilled ? '<span class="w-1.5 h-1.5 rounded-full bg-zinc-950"></span>' : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div 
        id="manager-override-overlay" 
        class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div 
          id="manager-override-card"
          class="w-full max-w-lg bg-[#111116] border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative flex flex-col space-y-5 transition-transform duration-200 ${
            shakeCard ? 'animate-bounce border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.35)]' : ''
          }"
        >
          <!-- Top Warning Header -->
          <div class="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div class="flex items-center space-x-3">
              <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                🛡️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-bold text-zinc-100">Manager Override Required</h3>
                  <span class="text-[9px] uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold tracking-wider">
                    RESTRICTED
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">Authorization challenge for sensitive operation</p>
              </div>
            </div>

            <button 
              id="btn-close-override"
              aria-label="Cancel Override"
              class="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-100 flex items-center justify-center text-sm transition-all"
            >
              ✕
            </button>
          </div>

          <!-- Action Context Card -->
          <div class="p-4 rounded-2xl bg-[#09090c] border border-white/[0.06] space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <span class="text-[10px] font-mono uppercase text-zinc-500">Attempted Action</span>
                <div class="text-sm font-bold text-amber-300 font-mono mt-0.5">${actionLabel}</div>
              </div>
              <div class="text-right">
                <span class="text-[10px] font-mono uppercase text-zinc-500">Terminal</span>
                <div class="text-xs font-mono font-semibold text-zinc-300">${terminalSin}</div>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs font-mono border-t border-white/[0.04] pt-2.5">
              <div class="text-zinc-400">
                <span>Target: </span>
                <span class="text-zinc-200 font-semibold">${targetItem}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-zinc-500">Initiator:</span>
                <span class="font-medium text-zinc-300">${initiator.name || 'Staff'}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded ${initiatorRoleStyle.bg} ${initiatorRoleStyle.text} border ${initiatorRoleStyle.border}">
                  ${initiator.role || 'Staff'}
                </span>
              </div>
            </div>
          </div>

          <!-- PIN Entry Container -->
          <div class="bg-[#0c0c10] border border-white/[0.06] rounded-2xl p-4 flex flex-col items-center justify-center space-y-2">
            <span class="text-[11px] font-mono uppercase text-zinc-400">
              Enter Floor Manager or Master Admin PIN
            </span>

            <!-- Masked Dots -->
            <div class="flex items-center gap-3 py-2" id="override-pin-dots">
              ${pinSlots}
            </div>

            <!-- Error Notification Banner -->
            ${errorMessage ? `
              <div class="text-xs text-red-400 font-mono text-center px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-1.5">
                <span>⚠️</span>
                <span>${errorMessage}</span>
              </div>
            ` : `
              <span class="text-[10px] font-mono text-zinc-500">
                Action will be permanently recorded in immutable audit log
              </span>
            `}
          </div>

          <!-- 3x4 Touch Numeric Keypad -->
          <div class="grid grid-cols-3 gap-2">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => `
              <button 
                data-override-key="${num}"
                class="h-12 rounded-xl bg-[#16161d] hover:bg-[#20202a] active:bg-amber-500 active:text-zinc-950 active:scale-95 border border-white/[0.06] text-lg font-bold font-mono text-zinc-100 flex items-center justify-center transition-all select-none"
              >
                ${num}
              </button>
            `).join('')}

            <!-- Clear -->
            <button 
              id="btn-override-backspace"
              title="Delete last digit"
              class="h-12 rounded-xl bg-[#181822] hover:bg-[#242432] active:scale-95 border border-white/[0.06] text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-all select-none"
            >
              ⌫ Clear
            </button>

            <!-- Zero -->
            <button 
              data-override-key="0"
              class="h-12 rounded-xl bg-[#16161d] hover:bg-[#20202a] active:bg-amber-500 active:text-zinc-950 active:scale-95 border border-white/[0.06] text-lg font-bold font-mono text-zinc-100 flex items-center justify-center transition-all select-none"
            >
              0
            </button>

            <!-- Submit -->
            <button 
              id="btn-override-submit"
              ${isAuthorizing ? 'disabled' : ''}
              class="h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold font-mono text-xs flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(245,158,11,0.35)] active:scale-95 select-none disabled:opacity-50"
            >
              ${isAuthorizing ? `
                <span class="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin"></span>
              ` : `
                <span>Authorize ✓</span>
              `}
            </button>
          </div>

          <!-- Footer Cancel / Esc Helper -->
          <div class="flex items-center justify-between text-xs font-mono text-zinc-500 pt-2 border-t border-white/[0.04]">
            <button 
              id="btn-override-cancel"
              class="hover:text-zinc-300 transition-all text-xs"
            >
              Cancel Operation (Esc)
            </button>
            <span class="text-[10px] text-zinc-600">
              Audit Hash Verified
            </span>
          </div>

        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Number buttons
    container.querySelectorAll('[data-override-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        handleDigit(e.currentTarget.dataset.overrideKey);
      });
    });

    // Backspace
    const backBtn = container.querySelector('#btn-override-backspace');
    if (backBtn) {
      backBtn.addEventListener('click', handleBackspace);
    }

    // Submit
    const submitBtn = container.querySelector('#btn-override-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleAuthorize);
    }

    // Close & Cancel buttons
    const closeBtn = container.querySelector('#btn-close-override');
    if (closeBtn) {
      closeBtn.addEventListener('click', handleClose);
    }

    const cancelBtn = container.querySelector('#btn-override-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', handleClose);
    }
  }

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
 * Promise-based Helper: Request Manager Override for a sensitive action
 * If the current staff already has permission (e.g. is Admin or Manager),
 * it completes immediately without modal prompt.
 * 
 * @param {object} store
 * @param {object} options
 * @returns {Promise<{ approved: boolean, authorizer?: object, auditLog?: object }>}
 */
export async function requestManagerOverride(store, options = {}) {
  const {
    actionType = 'MANAGER_OVERRIDE',
    actionLabel = 'Restricted POS Action',
    targetItem = 'N/A',
    initiator = store?.currentStaff
  } = options;

  // If current staff is already Admin or Manager, bypass override prompt
  if (store?.currentStaff?.role === ROLES.ADMIN || store?.currentStaff?.role === ROLES.MANAGER) {
    const auditLog = store.recordAuditLog({
      action: actionType,
      actionLabel,
      targetItem: String(targetItem),
      initiatorStaffId: store.currentStaff.id,
      initiatorStaffName: store.currentStaff.name,
      initiatorRole: store.currentStaff.role,
      authorizerStaffId: store.currentStaff.id,
      authorizerStaffName: store.currentStaff.name,
      authorizerRole: store.currentStaff.role,
      metadata: { auto_authorized: true }
    });
    return { approved: true, authorizer: store.currentStaff, auditLog };
  }

  // Otherwise, mount ManagerOverrideModal into #app-modal-layer
  return new Promise((resolve) => {
    let modalLayer = typeof document !== 'undefined' ? document.getElementById('app-modal-layer') : null;
    if (!modalLayer && typeof document !== 'undefined') {
      modalLayer = document.createElement('div');
      modalLayer.id = 'app-modal-layer';
      document.body?.appendChild(modalLayer);
    }

    if (!modalLayer) {
      resolve({ approved: false, error: 'DOM container unavailable' });
      return;
    }

    renderManagerOverrideModal(modalLayer, store, {
      actionType,
      actionLabel,
      targetItem,
      initiator,
      onSuccess: (authorizer, auditLog) => {
        modalLayer.innerHTML = '';
        resolve({ approved: true, authorizer, auditLog });
      },
      onCancel: () => {
        modalLayer.innerHTML = '';
        resolve({ approved: false, error: 'User cancelled override' });
      },
      onDismiss: () => {
        modalLayer.innerHTML = '';
        resolve({ approved: false, error: 'Dismissed' });
      }
    });
  });
}
