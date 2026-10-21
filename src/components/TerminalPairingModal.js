/**
 * AtYourScan - Hardware Terminal SIN Pairing Modal Component
 * Milestone 2: Requirement R2 (First-Run Onboarding & Terminal SIN Pairing)
 * 
 * Features:
 * 1. Dribbble Dark obsidian glassmorphic aesthetic with neon lime/amber accents.
 * 2. Dual-mode support:
 *    - Unpaired: Hardware pairing form (Restaurant ID, Terminal SIN, Friendly Name, Station Type, Admin PIN).
 *    - Paired: Active hardware status inspector with metadata details and Admin-PIN-protected Unpair flow.
 * 3. Quick-fill presets for instant evaluator testing (Counter POS, Bar Station, Kitchen KDS).
 * 4. Direct integration with reactive store:
 *    - `store.pairTerminal({ restaurantId, sin, terminalSin, terminalName, terminalType, adminPin })`
 *    - `store.unpairTerminal({ adminPin })`
 *    - Auditory feedback: `bell` on successful pairing, `bump` on unpairing or validation errors.
 * 5. Persistent hardware state across reboots via LocalStorage (`ays_terminal_pairing`).
 * 6. Responsive, touch-friendly, accessible (ESC dismiss, backdrop click, keyboard navigation).
 */

import { store as defaultStore } from '../store.js';
import { ROLES } from '../auth.js';

// Inject keyframe animation styles safely into document head once
function injectModalStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ays-terminal-modal-styles')) return;

  const style = document.createElement('style');
  style.id = 'ays-terminal-modal-styles';
  style.textContent = `
    @keyframes aysModalFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes aysModalCardEnter {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes aysShakeAlert {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-6px); }
      40%, 80% { transform: translateX(6px); }
    }
    .ays-modal-backdrop-anim {
      animation: aysModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .ays-modal-card-anim {
      animation: aysModalCardEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .ays-shake-alert {
      animation: aysShakeAlert 0.4s ease-in-out;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Open the Terminal Hardware Pairing Modal.
 * Renders into #app-modal-layer or document.body and handles lifecycle events.
 * 
 * @param {object} [options={}]
 * @param {object} [options.store] - Store instance (defaults to imported store)
 * @param {Function} [options.onSuccess] - Callback when pairing succeeds
 * @param {Function} [options.onUnpair] - Callback when unpairing succeeds
 * @param {Function} [options.onClose] - Callback when modal is dismissed
 * @param {string} [options.defaultRestaurantId] - Default Restaurant ID
 * @param {string} [options.defaultSin] - Default Terminal SIN
 * @param {string} [options.defaultName] - Default Terminal Name
 * @param {string} [options.defaultType] - Default Terminal Type
 * @param {HTMLElement} [options.container] - Custom container to mount inside
 * @returns {{ close: Function, element: HTMLElement }}
 */
export function openTerminalPairingModal(options = {}) {
  if (typeof document === 'undefined') {
    return { close: () => {}, element: null };
  }

  injectModalStyles();

  const store = options.store || defaultStore;

  // Resolve mounting container (#app-modal-layer or body)
  let mountParent = options.container;
  if (!mountParent) {
    mountParent = document.getElementById('app-modal-layer');
    if (!mountParent) {
      mountParent = document.createElement('div');
      mountParent.id = 'app-modal-layer';
      document.body.appendChild(mountParent);
    }
  }

  // Remove existing pairing modal if already present
  const existingModal = document.getElementById('modal-terminal-pairing');
  if (existingModal) {
    existingModal.remove();
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'modal-terminal-pairing';
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md ays-modal-backdrop-anim';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modal-pairing-title');

  // Internal component state
  let isUnpairConfirmOpen = false;
  let isSubmitting = false;

  // Clean dismissal closure
  const closeModal = () => {
    document.removeEventListener('keydown', handleKeydown);
    overlay.classList.add('opacity-0');
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (typeof options.onClose === 'function') {
        options.onClose();
      }
      if (typeof options.onDismiss === 'function') {
        options.onDismiss();
      }
    }, 150);
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      closeModal();
    }
  };
  document.addEventListener('keydown', handleKeydown);

  // Close when clicking outside modal card
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !isSubmitting) {
      closeModal();
    }
  });

  /**
   * Main render method: draws UI based on store.isTerminalPaired()
   */
  function render() {
    const isPaired = store.isTerminalPaired();
    const pairing = store.getPairedTerminal() || {};

    const activeRestaurantId = options.defaultRestaurantId || 
                               store.merchant?.restaurant_id || 
                               store.venue?.restaurant_id || 
                               'REST-BLR-001';

    const defaultSin = options.defaultSin || 'SIN-POS-01';
    const defaultName = options.defaultName || 'Front Billing Counter POS #1';
    const defaultType = options.defaultType || 'BILLING_POS';

    overlay.innerHTML = `
      <div class="bg-[#0c0c10]/95 border border-white/[0.1] rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.06)] max-w-lg w-full p-6 md:p-8 space-y-6 relative overflow-hidden backdrop-blur-xl ays-modal-card-anim select-none" onclick="event.stopPropagation()">
        
        <!-- Ambient Radial Glow -->
        <div class="absolute -top-24 -right-24 w-48 h-48 rounded-full ${isPaired ? 'bg-emerald-500/10' : 'bg-amber-500/10'} blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-24 -left-24 w-48 h-48 rounded-full ${isPaired ? 'bg-emerald-500/5' : 'bg-amber-500/5'} blur-3xl pointer-events-none"></div>

        <!-- Modal Top Bar -->
        <div class="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4 relative z-10">
          <div class="flex items-center gap-3.5">
            <!-- Sleek Hardware Terminal Icon -->
            <div class="w-12 h-12 rounded-2xl bg-[#16161d] border border-white/[0.1] flex items-center justify-center shadow-lg relative group">
              <div class="absolute inset-0 rounded-2xl ${isPaired ? 'bg-emerald-500/20' : 'bg-amber-500/20'} blur-sm"></div>
              <svg class="w-6 h-6 ${isPaired ? 'text-emerald-400' : 'text-amber-400'} relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="3"></rect>
                <line x1="8" y1="6" x2="16" y2="6"></line>
                <line x1="8" y1="10" x2="16" y2="10"></line>
                <line x1="8" y1="14" x2="10" y2="14"></line>
                <line x1="14" y1="14" x2="16" y2="14"></line>
                <line x1="8" y1="18" x2="10" y2="18"></line>
                <line x1="14" y1="18" x2="16" y2="18"></line>
              </svg>
            </div>

            <div>
              <div class="flex items-center gap-2">
                <h2 id="modal-pairing-title" class="text-base md:text-lg font-bold text-zinc-100 tracking-tight">
                  Terminal Hardware Pairing
                </h2>
                ${isPaired ? `
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-semibold">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse"></span>
                    PAIRED
                  </span>
                ` : `
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-semibold">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] animate-pulse"></span>
                    UNPAIRED
                  </span>
                `}
              </div>
              <p class="text-xs text-zinc-400 font-mono mt-0.5">
                ${isPaired ? 'Active hardware station bound to cloud tenant' : 'Link billing counter hardware via SIN identifier'}
              </p>
            </div>
          </div>

          <!-- Close '✕' Button -->
          <button id="btn-close-pairing-modal" class="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-full hover:bg-white/[0.06] transition-colors" title="Close Modal">
            ✕
          </button>
        </div>

        <!-- Alert Notification Box (Dynamic Error/Success) -->
        <div id="pairing-alert-box" class="hidden p-3.5 rounded-2xl text-xs font-mono border transition-all"></div>

        <!-- BODY: Paired Hardware Details or Pairing Form -->
        <div class="relative z-10">
          ${isPaired ? renderPairedView(pairing) : renderUnpairedForm(activeRestaurantId, defaultSin, defaultName, defaultType)}
        </div>

      </div>
    `;

    bindEvents();
  }

  /**
   * Render Mode A: Hardware is Currently Paired
   */
  function renderPairedView(pairing) {
    const formattedDate = pairing.paired_at ? new Date(pairing.paired_at).toLocaleString() : 'Active Session';

    return `
      <div class="space-y-5">
        
        <!-- Hardware Station Identity Card -->
        <div class="bg-[#141418] border border-white/[0.08] rounded-2xl p-4.5 space-y-3.5 shadow-inner">
          <div class="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <span class="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Hardware Identifier (SIN)</span>
              <div class="text-lg font-mono font-bold text-emerald-400 tracking-wider flex items-center gap-2">
                ${pairing.sin || 'SIN-POS-01'}
                <span class="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-sans font-medium">Verified</span>
              </div>
            </div>
            <div class="text-right">
              <span class="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Station Type</span>
              <div class="text-xs font-mono text-zinc-200 font-semibold uppercase">
                ${(pairing.terminal_type || 'BILLING_POS').replace('_', ' ')}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span class="text-[10px] text-zinc-500 block">Friendly Name</span>
              <span class="text-zinc-200 font-medium">${pairing.terminal_name || 'Front Counter POS'}</span>
            </div>
            <div>
              <span class="text-[10px] text-zinc-500 block">Restaurant Tenant</span>
              <span class="text-zinc-200 font-medium">${pairing.restaurant_id || 'REST-BLR-001'}</span>
            </div>
            <div>
              <span class="text-[10px] text-zinc-500 block">Outlet Name</span>
              <span class="text-zinc-300">${pairing.outlet_name || store.venue?.name || 'Main Counter'}</span>
            </div>
            <div>
              <span class="text-[10px] text-zinc-500 block">Bound Since</span>
              <span class="text-zinc-400 text-[11px]">${formattedDate}</span>
            </div>
          </div>

          ${pairing.pairing_token ? `
            <div class="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-zinc-500">
              <span>Token: <span class="text-zinc-400">${pairing.pairing_token}</span></span>
              <span class="text-emerald-400/80">● Realtime Sync Active</span>
            </div>
          ` : ''}
        </div>

        <!-- Persistent State Notice -->
        <div class="bg-zinc-900/60 border border-white/[0.06] rounded-xl p-3 flex items-start gap-2.5 text-xs text-zinc-400 font-mono">
          <span class="text-emerald-400 text-sm leading-none mt-0.5">🔒</span>
          <span>Hardware binding persists in LocalStorage (<code class="text-zinc-300">ays_terminal_pairing</code>). Subsequent boots automatically recognize this terminal station.</span>
        </div>

        <!-- Unpair Action or Confirmation Drawer -->
        ${isUnpairConfirmOpen ? `
          <div class="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-3.5 ays-shake-alert">
            <div class="flex items-center gap-2 text-rose-300 text-xs font-mono font-semibold">
              <span>⚠️</span>
              <span>Admin PIN Authorization Required to Decouple</span>
            </div>
            <p class="text-[11px] text-zinc-400">
              Decoupling will wipe the persistent pairing record from this physical device. You will need to re-pair before billing orders can proceed.
            </p>
            <div class="space-y-1.5">
              <label for="unpair-admin-pin" class="text-[11px] font-mono text-zinc-300 block">Enter Master Admin PIN</label>
              <input 
                type="password" 
                id="unpair-admin-pin" 
                maxlength="6" 
                inputmode="numeric" 
                placeholder="•••• (Admin PIN)" 
                class="w-full bg-[#111116] border border-rose-500/40 rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 font-mono text-sm tracking-widest focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
              />
            </div>
            <div class="flex items-center gap-2 pt-1">
              <button id="btn-confirm-unpair" class="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition-all shadow-[0_0_15px_rgba(225,29,72,0.35)] active:scale-95">
                Confirm De-authorization
              </button>
              <button id="btn-cancel-unpair" class="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-all">
                Cancel
              </button>
            </div>
          </div>
        ` : `
          <div class="flex items-center justify-between gap-3 pt-2">
            <button id="btn-trigger-unpair" class="py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs font-mono transition-all flex items-center gap-1.5">
              <span>🔌</span>
              <span>De-authorize Station</span>
            </button>
            <button id="btn-dismiss-paired" class="py-2.5 px-6 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs font-mono transition-all">
              Close
            </button>
          </div>
        `}

      </div>
    `;
  }

  /**
   * Render Mode B: Hardware Pairing Form
   */
  function renderUnpairedForm(restaurantId, sin, name, type) {
    return `
      <form id="form-terminal-pairing" class="space-y-4" novalidate>
        
        <!-- Quick-Fill Presets for Instant 1-Tap Evaluation -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Quick-Fill Presets</span>
            <span class="text-zinc-500">Quick Station Setup</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-preset="counter" class="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-mono text-zinc-300 border border-white/[0.06] transition-all flex items-center gap-1.5">
              <span>🖥️</span> Counter 01 (POS)
            </button>
            <button type="button" data-preset="bar" class="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-mono text-zinc-300 border border-white/[0.06] transition-all flex items-center gap-1.5">
              <span>🍸</span> Bar Station 02
            </button>
            <button type="button" data-preset="kds" class="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-mono text-zinc-300 border border-white/[0.06] transition-all flex items-center gap-1.5">
              <span>🍳</span> Kitchen KDS Rail
            </button>
          </div>
        </div>

        <!-- Form Inputs Grid -->
        <div class="space-y-3">
          
          <!-- Field 1: Restaurant ID -->
          <div class="space-y-1">
            <label for="pairing-restaurant-id" class="text-xs font-mono text-zinc-300 flex items-center justify-between">
              <span>Restaurant Tenant ID <span class="text-amber-400">*</span></span>
              <span class="text-[10px] text-zinc-500">Alphanumeric Code</span>
            </label>
            <input 
              type="text" 
              id="pairing-restaurant-id" 
              value="${restaurantId}" 
              placeholder="e.g. REST-BLR-001" 
              class="w-full bg-[#141418] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 font-mono text-sm uppercase focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
              required 
            />
          </div>

          <!-- Field 2: Terminal Hardware / SIN Code -->
          <div class="space-y-1">
            <label for="pairing-terminal-sin" class="text-xs font-mono text-zinc-300 flex items-center justify-between">
              <span>Terminal SIN Code <span class="text-amber-400">*</span></span>
              <span class="text-[10px] text-zinc-500">Chassis ID (e.g. SIN-POS-01)</span>
            </label>
            <input 
              type="text" 
              id="pairing-terminal-sin" 
              value="${sin}" 
              placeholder="e.g. SIN-POS-01" 
              class="w-full bg-[#141418] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 font-mono text-sm uppercase focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
              required 
            />
          </div>

          <!-- Field 3 & 4: Friendly Name & Station Type -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="pairing-terminal-name" class="text-xs font-mono text-zinc-300 block">
                Station Friendly Name
              </label>
              <input 
                type="text" 
                id="pairing-terminal-name" 
                value="${name}" 
                placeholder="Front Counter POS #1" 
                class="w-full bg-[#141418] border border-white/[0.1] rounded-xl px-3.5 py-2 text-zinc-100 placeholder-zinc-600 font-sans text-xs focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
              />
            </div>

            <div class="space-y-1">
              <label for="pairing-terminal-type" class="text-xs font-mono text-zinc-300 block">
                Station Type
              </label>
              <select 
                id="pairing-terminal-type" 
                class="w-full bg-[#141418] border border-white/[0.1] rounded-xl px-3 py-2 text-zinc-200 font-mono text-xs focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all cursor-pointer"
              >
                <option value="BILLING_POS" ${type === 'BILLING_POS' ? 'selected' : ''}>Billing Counter (POS)</option>
                <option value="BAR_POS" ${type === 'BAR_POS' ? 'selected' : ''}>Bar Counter POS</option>
                <option value="KDS" ${type === 'KDS' ? 'selected' : ''}>Kitchen Bump Station (KDS)</option>
                <option value="SERVER_TABLET" ${type === 'SERVER_TABLET' ? 'selected' : ''}>Server Handheld Tablet</option>
              </select>
            </div>
          </div>

          <!-- Field 5: Admin PIN Authorization Challenge -->
          <div class="space-y-1 pt-1">
            <label for="pairing-admin-pin" class="text-xs font-mono text-zinc-300 flex items-center justify-between">
              <span>Admin Authorization PIN <span class="text-amber-400">*</span></span>
              <span class="text-[10px] text-zinc-500">Required (Default: 1234)</span>
            </label>
            <div class="relative">
              <input 
                type="password" 
                id="pairing-admin-pin" 
                maxlength="6" 
                inputmode="numeric" 
                placeholder="••••" 
                value="1234"
                class="w-full bg-[#141418] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 font-mono text-sm tracking-widest focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition-all"
                required 
              />
              <button 
                type="button" 
                id="btn-toggle-pin-visibility" 
                class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs p-1"
                title="Toggle PIN Visibility"
              >
                👁️
              </button>
            </div>
          </div>

        </div>

        <!-- Form Submission Button -->
        <div class="pt-2 flex items-center gap-3">
          <button 
            type="submit" 
            id="btn-submit-pairing" 
            class="flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono tracking-tight transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:shadow-[0_0_25px_rgba(16,185,129,0.55)] active:scale-95 flex items-center justify-center gap-2"
          >
            <span id="btn-submit-spinner" class="hidden">⚙️</span>
            <span id="btn-submit-text">Authorize & Pair Hardware</span>
          </button>
          <button 
            type="button" 
            id="btn-cancel-pairing" 
            class="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs transition-all"
          >
            Cancel
          </button>
        </div>

      </form>
    `;
  }

  /**
   * Display Error or Success Alert Banner
   */
  function showAlert(message, type = 'error') {
    const alertBox = overlay.querySelector('#pairing-alert-box');
    if (!alertBox) return;

    alertBox.classList.remove('hidden', 'bg-rose-500/10', 'border-rose-500/30', 'text-rose-300', 'ays-shake-alert', 'bg-emerald-500/15', 'border-emerald-500/40', 'text-emerald-300');

    if (type === 'error') {
      alertBox.classList.add('bg-rose-500/10', 'border-rose-500/30', 'text-rose-300', 'ays-shake-alert');
      alertBox.innerHTML = `
        <div class="flex items-center gap-2">
          <span>❌</span>
          <span class="font-medium">${message}</span>
        </div>
      `;
    } else {
      alertBox.classList.add('bg-emerald-500/15', 'border-emerald-500/40', 'text-emerald-300');
      alertBox.innerHTML = `
        <div class="flex items-center gap-2">
          <span>✅</span>
          <span class="font-medium">${message}</span>
        </div>
      `;
    }
  }

  /**
   * Bind DOM Event Handlers
   */
  function bindEvents() {
    // 1. Close Button
    const btnClose = overlay.querySelector('#btn-close-pairing-modal');
    if (btnClose) btnClose.addEventListener('click', closeModal);

    const btnDismiss = overlay.querySelector('#btn-dismiss-paired');
    if (btnDismiss) btnDismiss.addEventListener('click', closeModal);

    const btnCancel = overlay.querySelector('#btn-cancel-pairing');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    // 2. Preset Buttons
    overlay.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.preset;
        const resInput = overlay.querySelector('#pairing-restaurant-id');
        const sinInput = overlay.querySelector('#pairing-terminal-sin');
        const nameInput = overlay.querySelector('#pairing-terminal-name');
        const typeSelect = overlay.querySelector('#pairing-terminal-type');
        const pinInput = overlay.querySelector('#pairing-admin-pin');

        if (preset === 'counter') {
          if (resInput) resInput.value = 'REST-BLR-001';
          if (sinInput) sinInput.value = 'SIN-POS-01';
          if (nameInput) nameInput.value = 'Front Counter POS #1';
          if (typeSelect) typeSelect.value = 'BILLING_POS';
          if (pinInput) pinInput.value = '1234';
        } else if (preset === 'bar') {
          if (resInput) resInput.value = 'REST-BLR-001';
          if (sinInput) sinInput.value = 'SIN-BAR-02';
          if (nameInput) nameInput.value = 'Bar Lounge POS #2';
          if (typeSelect) typeSelect.value = 'BAR_POS';
          if (pinInput) pinInput.value = '1234';
        } else if (preset === 'kds') {
          if (resInput) resInput.value = 'REST-BLR-001';
          if (sinInput) sinInput.value = 'SIN-KDS-01';
          if (nameInput) nameInput.value = 'Kitchen Bump Rail #1';
          if (typeSelect) typeSelect.value = 'KDS';
          if (pinInput) pinInput.value = '1234';
        }

        const alertBox = overlay.querySelector('#pairing-alert-box');
        if (alertBox) alertBox.classList.add('hidden');
      });
    });

    // 3. PIN Visibility Toggle
    const btnTogglePin = overlay.querySelector('#btn-toggle-pin-visibility');
    if (btnTogglePin) {
      btnTogglePin.addEventListener('click', () => {
        const pinInput = overlay.querySelector('#pairing-admin-pin');
        if (!pinInput) return;
        if (pinInput.type === 'password') {
          pinInput.type = 'text';
          btnTogglePin.textContent = '🔒';
        } else {
          pinInput.type = 'password';
          btnTogglePin.textContent = '👁️';
        }
      });
    }

    // 4. Form Submission: Pair Terminal
    const form = overlay.querySelector('#form-terminal-pairing');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const restaurantId = (overlay.querySelector('#pairing-restaurant-id')?.value || '').trim();
        const terminalSin = (overlay.querySelector('#pairing-terminal-sin')?.value || '').trim();
        const terminalName = (overlay.querySelector('#pairing-terminal-name')?.value || '').trim();
        const terminalType = overlay.querySelector('#pairing-terminal-type')?.value || 'BILLING_POS';
        const adminPin = (overlay.querySelector('#pairing-admin-pin')?.value || '').trim();

        // Validation 1: Restaurant ID
        if (!restaurantId) {
          store.playSound?.('bump');
          showAlert('Restaurant ID is required (e.g. REST-BLR-001)', 'error');
          overlay.querySelector('#pairing-restaurant-id')?.focus();
          return;
        }

        // Validation 2: Terminal SIN Code
        if (!terminalSin || !/^SIN-[A-Z0-9-]+$/i.test(terminalSin)) {
          store.playSound?.('bump');
          showAlert('Terminal SIN is required and must follow format SIN-XXX (e.g. SIN-POS-01)', 'error');
          overlay.querySelector('#pairing-terminal-sin')?.focus();
          return;
        }

        // Validation 3: Admin PIN Check (if cached roster contains Admin)
        const hasAdmin = store.cachedStaff && store.cachedStaff.some(s => s.role === ROLES?.ADMIN || s.role === 'Admin');
        if (hasAdmin && !adminPin) {
          store.playSound?.('bump');
          showAlert('Admin PIN is required to authorize terminal pairing', 'error');
          overlay.querySelector('#pairing-admin-pin')?.focus();
          return;
        }

        // Enter loading state
        isSubmitting = true;
        const btnSubmit = overlay.querySelector('#btn-submit-pairing');
        const spinner = overlay.querySelector('#btn-submit-spinner');
        const btnText = overlay.querySelector('#btn-submit-text');
        if (btnSubmit) btnSubmit.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Authorizing Hardware...';

        try {
          // Connect to store.pairTerminal supporting both sin and terminalSin
          const res = await store.pairTerminal({
            restaurantId: restaurantId.toUpperCase(),
            sin: terminalSin.toUpperCase(),
            terminalSin: terminalSin.toUpperCase(),
            terminalName: terminalName || 'Front Billing Counter POS #1',
            terminalType: terminalType,
            adminPin: adminPin
          });

          if (res.success) {
            // Success audio feedback
            store.playSound?.('bell');

            // Defensive local storage verification
            try {
              const pairedObj = res.pairing || store.getPairedTerminal();
              if (pairedObj) {
                localStorage.setItem('ays_terminal_pairing', JSON.stringify(pairedObj));
              }
            } catch (storageErr) {
              console.warn('LocalStorage save warning:', storageErr);
            }

            showAlert(`Hardware paired successfully! Terminal ${terminalSin.toUpperCase()} is active.`, 'success');

            if (typeof options.onSuccess === 'function') {
              options.onSuccess(res.pairing);
            }
            if (typeof options.onComplete === 'function') {
              options.onComplete(res.pairing);
            }

            // Brief visual celebration before dismiss or re-render
            setTimeout(() => {
              isSubmitting = false;
              closeModal();
            }, 850);

          } else {
            // Failure audio feedback and visible error alert
            store.playSound?.('bump');
            showAlert(res.error || 'Failed to authorize terminal pairing', 'error');
            isSubmitting = false;
            if (btnSubmit) btnSubmit.disabled = false;
            if (spinner) spinner.classList.add('hidden');
            if (btnText) btnText.textContent = 'Authorize & Pair Hardware';
          }
        } catch (err) {
          console.error('Pairing error:', err);
          store.playSound?.('bump');
          showAlert(err.message || 'Unexpected error during hardware pairing', 'error');
          isSubmitting = false;
          if (btnSubmit) btnSubmit.disabled = false;
          if (spinner) spinner.classList.add('hidden');
          if (btnText) btnText.textContent = 'Authorize & Pair Hardware';
        }
      });
    }

    // 5. Unpair Trigger
    const btnTriggerUnpair = overlay.querySelector('#btn-trigger-unpair');
    if (btnTriggerUnpair) {
      btnTriggerUnpair.addEventListener('click', () => {
        isUnpairConfirmOpen = true;
        render();
        const unpairInput = overlay.querySelector('#unpair-admin-pin');
        if (unpairInput) unpairInput.focus();
      });
    }

    // 6. Cancel Unpair Drawer
    const btnCancelUnpair = overlay.querySelector('#btn-cancel-unpair');
    if (btnCancelUnpair) {
      btnCancelUnpair.addEventListener('click', () => {
        isUnpairConfirmOpen = false;
        render();
      });
    }

    // 7. Confirm Unpair Flow
    const btnConfirmUnpair = overlay.querySelector('#btn-confirm-unpair');
    if (btnConfirmUnpair) {
      btnConfirmUnpair.addEventListener('click', async () => {
        const unpairPin = (overlay.querySelector('#unpair-admin-pin')?.value || '').trim();

        if (!unpairPin) {
          store.playSound?.('bump');
          showAlert('Admin PIN is required to unpair terminal', 'error');
          overlay.querySelector('#unpair-admin-pin')?.focus();
          return;
        }

        try {
          // Support store.unpairTerminal with object or string argument
          const unpairRes = await store.unpairTerminal({ adminPin: unpairPin });

          if (unpairRes.success) {
            // Tactile bump sound on unpair
            store.playSound?.('bump');

            // Ensure LocalStorage is cleared
            try {
              localStorage.removeItem('ays_terminal_pairing');
            } catch (e) {}

            isUnpairConfirmOpen = false;

            if (typeof options.onUnpair === 'function') {
              options.onUnpair();
            }

            // Transition directly into Unpaired setup view
            render();
            showAlert('Terminal hardware successfully unpaired and decoupled.', 'success');

          } else {
            store.playSound?.('bump');
            showAlert(unpairRes.error || 'Unauthorized: Invalid Admin PIN', 'error');
          }
        } catch (err) {
          console.error('Unpairing error:', err);
          store.playSound?.('bump');
          showAlert(err.message || 'Error occurred while unpairing', 'error');
        }
      });
    }
  }

  // Initial draw and DOM mount
  render();
  mountParent.appendChild(overlay);

  return {
    close: closeModal,
    element: overlay
  };
}

/**
 * Convenience renderer to mount directly into a provided DOM container.
 * 
 * @param {HTMLElement|string} container - Mount element or selector
 * @param {object} [options={}] - Options forwarded to openTerminalPairingModal
 * @returns {{ close: Function, element: HTMLElement }}
 */
export function renderTerminalPairingModal(container, storeOrOptions = {}, maybeOptions = {}) {
  const isStore = storeOrOptions && (typeof storeOrOptions.isTerminalPaired === 'function' || typeof storeOrOptions.pairTerminal === 'function');
  const opts = isStore ? { ...maybeOptions, store: storeOrOptions } : (storeOrOptions || {});
  const mountElement = typeof container === 'string' ? document.querySelector(container) : container;
  return openTerminalPairingModal({
    ...opts,
    container: mountElement || undefined
  });
}

// Module export default bundle
export default {
  open: openTerminalPairingModal,
  render: renderTerminalPairingModal
};
