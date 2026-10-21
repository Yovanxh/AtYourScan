/**
 * src/components/SuperAdminLoginModal.js
 * Master Super-Admin Sovereign Authentication & Account Creation Modal
 * Enables initial provisioning of the Master Super-Admin, elevated login,
 * password/PIN recovery/reset, and tactile physical keyboard/numpad accessibility.
 */

export function renderSuperAdminLoginModal(container, store, { onSuccess, onClose, initialMode } = {}) {
  if (!container) return () => {};
  container.innerHTML = '';

  const accounts = typeof store.getSuperAdminAccounts === 'function' ? store.getSuperAdminAccounts() : [];
  const hasAccounts = accounts.length > 0;

  // If no account exists yet, default to 'create' mode; otherwise use initialMode or 'login'
  let mode = initialMode || (hasAccounts ? 'login' : 'create');

  let selectedAdmin = accounts[0] || null;
  let pinInput = '';
  let errorMessage = '';
  let successMessage = '';
  let isSubmitting = false;

  // Creation form state
  let createName = '';
  let createEmail = '';
  let createPin = '';
  let createConfirmPin = '';

  // Reset password / PIN form state
  let resetEmail = selectedAdmin?.email || '';
  let resetPin = '';
  let resetConfirmPin = '';

  function cleanup() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
    }
    container.innerHTML = '';
  }

  function handleCloseModal() {
    cleanup();
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  function handleKeydown(e) {
    if (mode === 'login') {
      let digit = null;
      if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      } else if (e.code && /^Numpad[0-9]$/.test(e.code)) {
        digit = e.code.replace('Numpad', '');
      }

      if (digit !== null) {
        e.preventDefault();
        if (pinInput.length < 8) {
          pinInput += digit;
          errorMessage = '';
          store?.playSound?.('tap');

          // Tactile visual flash on corresponding keypad button
          const btn = container.querySelector(`[data-pin-key="${digit}"]`);
          if (btn) {
            btn.classList.add('scale-90', 'bg-rose-500', 'text-white');
            setTimeout(() => {
              btn?.classList?.remove('scale-90', 'bg-rose-500', 'text-white');
            }, 120);
          }

          if (pinInput.length >= 4 && pinInput.length === (selectedAdmin?.pin?.length || 4)) {
            handleAuthenticate();
          } else {
            renderModal();
          }
        }
      } else if (e.key === 'Backspace' || e.code === 'Backspace') {
        e.preventDefault();
        if (pinInput.length > 0) {
          pinInput = pinInput.slice(0, -1);
          errorMessage = '';
          store?.playSound?.('tap');
          renderModal();
        }
      } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (pinInput.length >= 4) {
          handleAuthenticate();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseModal();
      }
    } else {
      // Create or Reset mode
      if (e.key === 'Escape') {
        e.preventDefault();
        const currentAccounts = typeof store.getSuperAdminAccounts === 'function' ? store.getSuperAdminAccounts() : [];
        if (currentAccounts.length > 0) {
          mode = 'login';
          errorMessage = '';
          successMessage = '';
          renderModal();
        } else {
          handleCloseModal();
        }
      }
    }
  }

  function renderModal() {
    const currentAccounts = typeof store.getSuperAdminAccounts === 'function' ? store.getSuperAdminAccounts() : [];
    if (!selectedAdmin && currentAccounts.length > 0) {
      selectedAdmin = currentAccounts[0];
    }
    if (selectedAdmin && !resetEmail) {
      resetEmail = selectedAdmin.email;
    }

    let cardContent = '';

    if (mode === 'create') {
      cardContent = `
        <div class="bg-[#12121a] border border-rose-500/30 rounded-3xl max-w-md w-full p-6 text-zinc-100 shadow-2xl relative overflow-hidden space-y-5">
          
          <!-- Top Glowing Header -->
          <div class="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center text-2xl shadow-lg shadow-rose-500/20">
                👑
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-black tracking-tight text-white">Master Super-Admin</h3>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    SOVEREIGN SETUP
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">
                  ${currentAccounts.length === 0 ? 'Create your platform master administrator account' : 'Provision an additional sovereign master administrator'}
                </p>
              </div>
            </div>

            <button id="btn-close-super-modal" class="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Account Creation Form -->
          <form id="form-create-super-admin" class="space-y-3.5">
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Super-Admin Full Name
              </label>
              <input 
                id="super-create-name"
                type="text"
                required
                placeholder="e.g. Master Administrator"
                value="${createName}"
                class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-zinc-500 outline-none transition-all"
              />
            </div>

            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Admin Work / Cloud Email
              </label>
              <input 
                id="super-create-email"
                type="email"
                required
                placeholder="master@atyourscan.com"
                value="${createEmail}"
                class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Sovereign PIN (4-8 digits)
                </label>
                <input 
                  id="super-create-pin"
                  type="password"
                  maxlength="8"
                  required
                  placeholder="••••"
                  value="${createPin}"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono tracking-widest text-center"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Confirm PIN
                </label>
                <input 
                  id="super-create-confirm-pin"
                  type="password"
                  maxlength="8"
                  required
                  placeholder="••••"
                  value="${createConfirmPin}"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono tracking-widest text-center"
                />
              </div>
            </div>

            <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-zinc-400 flex items-start gap-2">
              <span class="text-rose-400">🛡️</span>
              <span>PIN is cryptographically salted with SHA-256 and never stored in plaintext. This account grants full unrestricted access to the Control Plane.</span>
            </div>

            <!-- Error Feedback -->
            ${errorMessage ? `
              <div class="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium text-center animate-shake">
                ⚠️ ${errorMessage}
              </div>
            ` : ''}

            <!-- Submit Action -->
            <div class="pt-2 flex items-center gap-2.5">
              ${currentAccounts.length > 0 ? `
                <button 
                  type="button"
                  id="btn-switch-to-login"
                  class="px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-98 cursor-pointer"
                >
                  Back to Login
                </button>
              ` : `
                <button 
                  type="button"
                  id="btn-super-cancel"
                  class="flex-1 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-98 cursor-pointer"
                >
                  Cancel
                </button>
              `}

              <button 
                type="submit"
                id="btn-create-super-account"
                ${isSubmitting ? 'disabled' : ''}
                class="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                ${isSubmitting ? `
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Provisioning Account...</span>
                ` : `
                  <span>Create Account & Unlock</span>
                `}
              </button>
            </div>
          </form>

        </div>
      `;
    } else if (mode === 'reset') {
      // Reset PIN / Password Mode
      cardContent = `
        <div class="bg-[#12121a] border border-amber-500/30 rounded-3xl max-w-md w-full p-6 text-zinc-100 shadow-2xl relative overflow-hidden space-y-5">
          
          <!-- Top Header -->
          <div class="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
                🔑
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-black tracking-tight text-white">Reset Sovereign PIN</h3>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PIN RECOVERY
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">Verify admin email and set a new master security PIN</p>
              </div>
            </div>

            <button id="btn-close-super-modal" class="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Reset Form -->
          <form id="form-reset-super-admin" class="space-y-3.5">
            <div>
              <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                Super-Admin Email
              </label>
              <input 
                id="super-reset-email"
                type="email"
                required
                placeholder="master@atyourscan.com"
                value="${resetEmail}"
                class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  New PIN (4-8 digits)
                </label>
                <input 
                  id="super-reset-pin"
                  type="password"
                  maxlength="8"
                  required
                  placeholder="••••"
                  value="${resetPin}"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono tracking-widest text-center"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Confirm New PIN
                </label>
                <input 
                  id="super-reset-confirm-pin"
                  type="password"
                  maxlength="8"
                  required
                  placeholder="••••"
                  value="${resetConfirmPin}"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm text-white placeholder-zinc-500 outline-none transition-all font-mono tracking-widest text-center"
                />
              </div>
            </div>

            <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-zinc-400 flex items-start gap-2">
              <span class="text-amber-400">🛡️</span>
              <span>Your new PIN is salted with a fresh cryptographic token and updated in the system audit registry immediately.</span>
            </div>

            <!-- Error Feedback -->
            ${errorMessage ? `
              <div class="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium text-center animate-shake">
                ⚠️ ${errorMessage}
              </div>
            ` : ''}

            <!-- Success Feedback -->
            ${successMessage ? `
              <div class="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium text-center">
                ✓ ${successMessage}
              </div>
            ` : ''}

            <!-- Form Actions -->
            <div class="pt-2 flex items-center gap-2.5">
              <button 
                type="button"
                id="btn-switch-to-login"
                class="px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-98 cursor-pointer"
              >
                Back to Login
              </button>

              <button 
                type="submit"
                id="btn-submit-reset-super-admin"
                ${isSubmitting ? 'disabled' : ''}
                class="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-600 via-rose-500 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                ${isSubmitting ? `
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Updating PIN...</span>
                ` : `
                  <span>Reset PIN & Unlock</span>
                `}
              </button>
            </div>
          </form>

        </div>
      `;
    } else {
      // Login Mode
      cardContent = `
        <div class="bg-[#12121a] border border-rose-500/30 rounded-3xl max-w-md w-full p-6 text-zinc-100 shadow-2xl relative overflow-hidden space-y-5">
          
          <!-- Top glowing badge -->
          <div class="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center text-2xl shadow-lg shadow-rose-500/20">
                🛡️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-black tracking-tight text-white">Platform Control Plane</h3>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    SUPER ADMIN
                  </span>
                </div>
                <p class="text-xs text-zinc-400 mt-0.5">Sovereign Master Authentication Gate</p>
              </div>
            </div>

            <button id="btn-close-super-modal" class="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Super-Admin Account Selector -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Select Super-Admin Identity</label>
              <button 
                type="button" 
                id="btn-switch-to-create" 
                class="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                + Create New Admin
              </button>
            </div>
            
            <div class="grid ${currentAccounts.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2.5 max-h-40 overflow-y-auto no-scrollbar">
              ${currentAccounts.map(acc => {
                const isSelected = selectedAdmin && selectedAdmin.id === acc.id;
                return `
                  <button 
                    type="button"
                    data-select-admin="${acc.id}"
                    class="p-3 rounded-2xl border text-left transition-all cursor-pointer active:scale-95 ${
                      isSelected 
                        ? 'bg-rose-500/15 border-rose-500/60 text-white shadow-md shadow-rose-500/15' 
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-white">${acc.name}</span>
                      <span class="w-2 h-2 rounded-full ${isSelected ? 'bg-rose-400 shadow-[0_0_6px_#f43f5e]' : 'bg-zinc-600'}"></span>
                    </div>
                    <span class="text-[10px] font-mono text-zinc-400 block mt-1 truncate">${acc.email}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- PIN Display Dots -->
          <div class="space-y-2 text-center pt-1">
            <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">Enter Sovereign Master PIN</label>
            <div class="flex items-center justify-center gap-3 py-2">
              ${[0, 1, 2, 3].map(i => `
                <div class="w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pinInput.length > i 
                    ? 'bg-rose-500 border-rose-400 shadow-[0_0_8px_#f43f5e] scale-110' 
                    : 'bg-zinc-900 border-zinc-700'
                }"></div>
              `).join('')}
            </div>
          </div>

          <!-- Error Feedback -->
          ${errorMessage ? `
            <div class="p-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-medium text-center animate-shake">
              ⚠️ ${errorMessage}
            </div>
          ` : ''}

          <!-- Tactile Numeric Keypad -->
          <div class="grid grid-cols-3 gap-2 pt-1 max-w-xs mx-auto">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
              <button 
                type="button"
                data-pin-key="${n}"
                class="h-12 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-100 font-mono text-lg font-bold transition-all active:scale-95 cursor-pointer shadow-sm border border-white/[0.04]"
              >
                ${n}
              </button>
            `).join('')}
            <button 
              type="button"
              id="btn-pin-clear"
              class="h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer border border-white/[0.04]"
            >
              CLEAR
            </button>
            <button 
              type="button"
              data-pin-key="0"
              class="h-12 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-100 font-mono text-lg font-bold transition-all active:scale-95 cursor-pointer shadow-sm border border-white/[0.04]"
            >
              0
            </button>
            <button 
              type="button"
              id="btn-pin-backspace"
              class="h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-base font-bold transition-all active:scale-95 cursor-pointer border border-white/[0.04]"
            >
              ⌫
            </button>
          </div>

          <!-- Keyboard Support Indicator & Reset PIN link -->
          <div class="flex items-center justify-between text-xs pt-1 border-t border-white/[0.08]">
            <span class="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <span>⌨️</span>
              <span>Physical keyboard & numpad active</span>
            </span>
            <button 
              type="button" 
              id="btn-switch-to-reset" 
              class="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer underline underline-offset-2"
            >
              Forgot PIN / Reset Password?
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="pt-2 flex items-center gap-3">
            <button 
              type="button"
              id="btn-super-cancel"
              class="flex-1 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-98 cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="button"
              id="btn-super-submit"
              ${pinInput.length < 4 || isSubmitting ? 'disabled' : ''}
              class="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              ${isSubmitting ? `
                <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Authenticating...</span>
              ` : `
                <span>Unlock Control Plane</span>
              `}
            </button>
          </div>

        </div>
      `;
    }

    container.innerHTML = `
      <div id="super-admin-login-modal" class="fixed inset-0 z-50 bg-[#08080c]/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
        ${cardContent}
      </div>
    `;

    bindModalEvents();
  }

  function bindModalEvents() {
    // Close / Cancel
    container.querySelector('#btn-close-super-modal')?.addEventListener('click', handleCloseModal);
    container.querySelector('#btn-super-cancel')?.addEventListener('click', handleCloseModal);

    if (mode === 'create') {
      container.querySelector('#btn-switch-to-login')?.addEventListener('click', () => {
        mode = 'login';
        errorMessage = '';
        successMessage = '';
        renderModal();
      });

      const nameInput = container.querySelector('#super-create-name');
      const emailInput = container.querySelector('#super-create-email');
      const pinEl = container.querySelector('#super-create-pin');
      const confirmPinEl = container.querySelector('#super-create-confirm-pin');

      nameInput?.addEventListener('input', (e) => { createName = e?.target?.value ?? nameInput?.value ?? ''; });
      emailInput?.addEventListener('input', (e) => { createEmail = e?.target?.value ?? emailInput?.value ?? ''; });
      pinEl?.addEventListener('input', (e) => { createPin = e?.target?.value ?? pinEl?.value ?? ''; });
      confirmPinEl?.addEventListener('input', (e) => { createConfirmPin = e?.target?.value ?? confirmPinEl?.value ?? ''; });

      container.querySelector('#form-create-super-admin')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        isSubmitting = true;
        errorMessage = '';
        renderModal();

        try {
          const result = await store.createSuperAdminAccount({
            name: nameInput?.value || createName,
            email: emailInput?.value || createEmail,
            pin: pinEl?.value || createPin,
            confirmPin: confirmPinEl?.value || createConfirmPin
          });

          if (result.success) {
            cleanup();
            if (onSuccess) onSuccess(result.superAdmin, result.token);
          } else {
            errorMessage = result.error || 'Failed to create Super-Admin account';
            isSubmitting = false;
            renderModal();
          }
        } catch (err) {
          errorMessage = err.message || 'Creation error';
          isSubmitting = false;
          renderModal();
        }
      });
    } else if (mode === 'reset') {
      // Reset PIN Mode events
      container.querySelector('#btn-switch-to-login')?.addEventListener('click', () => {
        mode = 'login';
        errorMessage = '';
        successMessage = '';
        renderModal();
      });

      const emailEl = container.querySelector('#super-reset-email');
      const pinEl = container.querySelector('#super-reset-pin');
      const confirmPinEl = container.querySelector('#super-reset-confirm-pin');

      emailEl?.addEventListener('input', (e) => { resetEmail = e?.target?.value ?? emailEl?.value ?? ''; });
      pinEl?.addEventListener('input', (e) => { resetPin = e?.target?.value ?? pinEl?.value ?? ''; });
      confirmPinEl?.addEventListener('input', (e) => { resetConfirmPin = e?.target?.value ?? confirmPinEl?.value ?? ''; });

      container.querySelector('#form-reset-super-admin')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        isSubmitting = true;
        errorMessage = '';
        successMessage = '';
        renderModal();

        try {
          const result = await store.resetSuperAdminPIN({
            email: emailEl?.value || resetEmail,
            newPin: pinEl?.value || resetPin,
            confirmPin: confirmPinEl?.value || resetConfirmPin
          });

          if (result.success) {
            successMessage = 'PIN successfully reset! Unlocking Control Plane...';
            renderModal();
            setTimeout(() => {
              cleanup();
              if (onSuccess) onSuccess(result.superAdmin, result.token);
            }, 150);
          } else {
            errorMessage = result.error || 'Failed to reset PIN';
            isSubmitting = false;
            renderModal();
          }
        } catch (err) {
          errorMessage = err.message || 'PIN reset error';
          isSubmitting = false;
          renderModal();
        }
      });
    } else {
      // Login mode events
      container.querySelector('#btn-switch-to-create')?.addEventListener('click', () => {
        mode = 'create';
        errorMessage = '';
        successMessage = '';
        renderModal();
      });

      container.querySelector('#btn-switch-to-reset')?.addEventListener('click', () => {
        mode = 'reset';
        errorMessage = '';
        successMessage = '';
        resetEmail = selectedAdmin?.email || '';
        resetPin = '';
        resetConfirmPin = '';
        renderModal();
      });

      container.querySelectorAll('[data-select-admin]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.selectAdmin;
          const currentAccounts = store.getSuperAdminAccounts();
          const found = currentAccounts.find(a => a.id === id);
          if (found) {
            selectedAdmin = found;
            resetEmail = found.email;
            pinInput = '';
            errorMessage = '';
            renderModal();
          }
        });
      });

      // Keypad numbers
      container.querySelectorAll('[data-pin-key]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (pinInput.length < 8) {
            pinInput += e.currentTarget.dataset.pinKey;
            errorMessage = '';
            store?.playSound?.('tap');
            if (pinInput.length >= 4 && pinInput.length === (selectedAdmin?.pin?.length || 4)) {
              handleAuthenticate();
            } else {
              renderModal();
            }
          }
        });
      });

      container.querySelector('#btn-pin-clear')?.addEventListener('click', () => {
        pinInput = '';
        errorMessage = '';
        store?.playSound?.('pop');
        renderModal();
      });

      container.querySelector('#btn-pin-backspace')?.addEventListener('click', () => {
        pinInput = pinInput.slice(0, -1);
        errorMessage = '';
        store?.playSound?.('tap');
        renderModal();
      });

      container.querySelector('#btn-super-submit')?.addEventListener('click', () => {
        handleAuthenticate();
      });
    }
  }

  async function handleAuthenticate() {
    isSubmitting = true;
    errorMessage = '';
    renderModal();

    try {
      const result = await store.loginSuperAdmin({
        email: selectedAdmin ? selectedAdmin.email : '',
        pin: pinInput
      });

      if (result.success) {
        cleanup();
        if (onSuccess) onSuccess(result.superAdmin, result.token);
      } else {
        errorMessage = result.error || 'Authentication failed: Invalid PIN';
        pinInput = '';
        isSubmitting = false;
        renderModal();
      }
    } catch (err) {
      errorMessage = err.message || 'Authentication error';
      pinInput = '';
      isSubmitting = false;
      renderModal();
    }
  }

  // Attach global keyboard/numpad listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown);
  }

  renderModal();

  return cleanup;
}
