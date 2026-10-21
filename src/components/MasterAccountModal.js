/**
 * src/components/MasterAccountModal.js
 * 
 * Master Account Authentication & Management Modal with Supabase.
 * Exclusively provides Master Admin authentication, credentials management,
 * and elevation to perform high-privilege menu architecture ingestion.
 */

import { supabase } from '../../supabase.js';

export function renderMasterAccountModal(container, store, options = {}) {
  const { onSuccess = null, onClose = null } = options;

  let email = store?.currentStaff?.email || 'admin@copperoak.com';
  let password = '';
  let pin = '1234';
  let isSubmitting = false;
  let statusMessage = '';
  let statusType = ''; // 'success' | 'error'

  const isAlreadyMaster = store.isMasterAdmin();

  function render() {
    container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden select-none flex flex-col">
          
          <!-- Header -->
          <div class="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white relative">
            <button id="btn-close-master-modal" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white text-sm font-bold transition-all cursor-pointer">
              ✕
            </button>
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shadow-inner">
                👑
              </div>
              <div>
                <span class="text-[10px] font-black uppercase tracking-wider text-amber-200 block">System Authority</span>
                <h2 class="text-xl font-black leading-tight">Master Admin Account</h2>
              </div>
            </div>
            <p class="text-xs text-amber-100 mt-2 font-medium">
              Unified Supabase Authentication & exclusive access to AI Menu Ingestion.
            </p>
          </div>

          <!-- Body -->
          <div class="p-6 space-y-5">
            
            <!-- Supabase Cloud Connection Status -->
            <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
              <div class="flex items-center gap-2">
                <span class="relative flex h-2.5 w-2.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span class="font-bold text-slate-700">Supabase Cloud</span>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                Online & Synced
              </span>
            </div>

            ${statusMessage ? `
              <div class="p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                statusType === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }">
                <span>${statusType === 'error' ? '⚠️' : '✅'}</span>
                <span>${statusMessage}</span>
              </div>
            ` : ''}

            ${isAlreadyMaster ? `
              <!-- Active Master Session Info -->
              <div class="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span>✨</span> Master Session Active
                  </span>
                  <span class="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase">
                    Admin
                  </span>
                </div>
                <div class="text-xs text-amber-800 space-y-0.5">
                  <p><strong class="font-semibold">User:</strong> ${store.currentStaff?.name || 'Main Admin'}</p>
                  <p><strong class="font-semibold">Email:</strong> ${store.currentStaff?.email || 'admin@copperoak.com'}</p>
                </div>
              </div>

              <div class="flex gap-2.5 pt-2">
                <button 
                  id="btn-re-auth-master" 
                  class="flex-1 py-3 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white active:scale-95 transition-all shadow-md shadow-[#FF7622]/20 cursor-pointer"
                >
                  Confirm Master Session
                </button>
                <button 
                  id="btn-logout-master" 
                  class="px-4 py-3 rounded-2xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  Exit Master
                </button>
              </div>
            ` : `
              <!-- Sign In Form -->
              <form id="master-login-form" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">Master Admin Email (Supabase)</label>
                  <input 
                    type="email" 
                    id="master-email" 
                    required 
                    value="${email}" 
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    placeholder="admin@copperoak.com"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-600 mb-1">Admin Security PIN</label>
                  <input 
                    type="password" 
                    id="master-pin" 
                    maxlength="6"
                    value="${pin}" 
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono tracking-widest text-center text-base"
                    placeholder="1234"
                  />
                </div>

                <div class="pt-2">
                  <button 
                    type="submit" 
                    id="btn-submit-master-login" 
                    ${isSubmitting ? 'disabled' : ''}
                    class="w-full py-3 rounded-2xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white active:scale-95 transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    ${isSubmitting ? '<span>⏳ Authenticating...</span>' : '<span>👑 Sign In as Master Admin</span>'}
                  </button>
                </div>
              </form>
            `}

          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const btnClose = container.querySelector('#btn-close-master-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        container.innerHTML = '';
        if (onClose) onClose();
      });
    }

    const form = container.querySelector('#master-login-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        isSubmitting = true;
        statusMessage = '';
        render();

        const emailVal = container.querySelector('#master-email')?.value?.trim() || email;
        const pinVal = container.querySelector('#master-pin')?.value?.trim() || pin;

        try {
          const res = await store.loginMasterAccount({ email: emailVal, pin: pinVal });
          if (res.success) {
            statusType = 'success';
            statusMessage = 'Master Admin Authenticated via Supabase!';
            render();
            setTimeout(() => {
              container.innerHTML = '';
              if (onSuccess) onSuccess(res.staff);
            }, 800);
          } else {
            statusType = 'error';
            statusMessage = res.error || 'Authentication failed';
            isSubmitting = false;
            render();
          }
        } catch (err) {
          statusType = 'error';
          statusMessage = err.message || 'Error communicating with Supabase';
          isSubmitting = false;
          render();
        }
      });
    }

    const btnConfirm = container.querySelector('#btn-re-auth-master');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        container.innerHTML = '';
        if (onSuccess) onSuccess(store.currentStaff);
      });
    }

    const btnLogout = container.querySelector('#btn-logout-master');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        store.logoutMasterAccount();
        container.innerHTML = '';
        if (onClose) onClose();
      });
    }
  }

  render();
}
