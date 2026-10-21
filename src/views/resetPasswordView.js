/**
 * src/views/resetPasswordView.js
 * Reset Password Landing Page (/reset-password)
 * 
 * Complies with Master Production Specification:
 * - Accepts New Password and Confirm Password
 * - Calls supabase.auth.updateUser({ password: newPassword })
 * - Redirects back to /login upon success
 * - Full Obsidian UI Theme Unification (#08080a canvas, #111115 card, #26262e borders, Vibrant Orange #f97316 accents)
 */

import { supabase } from '../../supabase.js';

export function renderResetPasswordView(container, store, { onNavigate } = {}) {
  if (!container) return () => {};

  const state = {
    newPassword: '',
    confirmPassword: '',
    showPassword: false,
    isSubmitting: false,
    errorMessage: '',
    successMessage: ''
  };

  function render() {
    container.innerHTML = `
      <div class="min-h-screen bg-[#08080a] text-zinc-100 flex items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden font-sans">
        
        <!-- Ambient Radial Glows -->
        <div class="absolute -top-32 -left-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="w-full max-w-md bg-[#111115] border border-[#26262e] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
          
          <!-- Header with Official AtYourScan Logo -->
          <div class="text-center space-y-3">
            <div class="flex items-center justify-center">
              <div class="bg-white rounded-2xl p-2.5 shadow-xl border border-white/20 inline-flex items-center justify-center">
                <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan - Cafe & Restaurant QR System" class="h-14 sm:h-16 w-auto object-contain" />
              </div>
            </div>

            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-[#26262e] text-[11px] font-mono text-zinc-400">
                <span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                <span>Security Gateway • Set New Credentials</span>
              </div>
              
              <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>Reset Your Password</span>
              </h1>
              
              <p class="text-xs text-[#9ca3af] max-w-sm mx-auto">
                Choose a strong, confidential password with at least 8 characters to secure your AtYourScan account.
              </p>
            </div>
          </div>

          <!-- Error Alert -->
          ${state.errorMessage ? `
            <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <span class="text-sm">⚠️</span>
              <span class="flex-1 font-medium leading-relaxed">${state.errorMessage}</span>
            </div>
          ` : ''}

          <!-- Success Alert -->
          ${state.successMessage ? `
            <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <span class="text-sm">✅</span>
              <span class="flex-1 font-medium leading-relaxed">${state.successMessage}</span>
            </div>
          ` : ''}

          <!-- Reset Form -->
          <form id="form-reset-password" class="space-y-4">
            
            <!-- New Password -->
            <div>
              <label class="block text-xs font-semibold text-[#9ca3af] mb-1.5">
                New Password
              </label>
              <div class="relative">
                <input 
                  type="${state.showPassword ? 'text' : 'password'}"
                  id="input-new-password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  placeholder="Min. 8 characters"
                  value="${state.newPassword}"
                  class="w-full bg-[#08080a] border border-[#26262e] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            <!-- Confirm Password -->
            <div>
              <label class="block text-xs font-semibold text-[#9ca3af] mb-1.5">
                Confirm New Password
              </label>
              <div class="relative">
                <input 
                  type="${state.showPassword ? 'text' : 'password'}"
                  id="input-confirm-password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  placeholder="Re-enter your new password"
                  value="${state.confirmPassword}"
                  class="w-full bg-[#08080a] border border-[#26262e] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            <!-- Show Password Toggle -->
            <div class="flex items-center justify-between text-xs text-[#9ca3af]">
              <label class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  id="chk-show-reset-password"
                  ${state.showPassword ? 'checked' : ''}
                  class="rounded bg-[#08080a] border-[#26262e] text-orange-500 focus:ring-0 cursor-pointer"
                />
                <span class="text-[11px]">Show passwords</span>
              </label>
            </div>

            <!-- Submit Button -->
            <button
              type="submit"
              id="btn-submit-reset"
              ${state.isSubmitting ? 'disabled' : ''}
              class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#f97316] to-[#ea580c] hover:from-[#ea580c] hover:to-[#c2410c] text-white font-bold text-xs tracking-wide shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
            >
              ${state.isSubmitting ? `
                <span class="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                <span>Updating Password...</span>
              ` : `
                <span>Update Password & Log In →</span>
              `}
            </button>

          </form>

          <!-- Back to Login Link -->
          <div class="pt-2 text-center border-t border-[#26262e]">
            <button 
              id="btn-back-to-login" 
              type="button"
              class="text-xs text-[#9ca3af] hover:text-orange-400 font-semibold transition-colors cursor-pointer"
            >
              ← Back to Sign In Gateway
            </button>
          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const form = container.querySelector('#form-reset-password');
    const newPassInput = container.querySelector('#input-new-password');
    const confirmPassInput = container.querySelector('#input-confirm-password');
    const showPassChk = container.querySelector('#chk-show-reset-password');
    const backBtn = container.querySelector('#btn-back-to-login');

    if (newPassInput) {
      newPassInput.addEventListener('input', (e) => {
        state.newPassword = e.target.value;
      });
    }

    if (confirmPassInput) {
      confirmPassInput.addEventListener('input', (e) => {
        state.confirmPassword = e.target.value;
      });
    }

    if (showPassChk) {
      showPassChk.addEventListener('change', (e) => {
        state.showPassword = e.target.checked;
        if (newPassInput) newPassInput.type = state.showPassword ? 'text' : 'password';
        if (confirmPassInput) confirmPassInput.type = state.showPassword ? 'text' : 'password';
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof onNavigate === 'function') {
          onNavigate('login');
        } else if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        state.errorMessage = '';
        state.successMessage = '';

        if (!state.newPassword || state.newPassword.length < 8) {
          state.errorMessage = 'Password must be at least 8 characters long.';
          render();
          return;
        }

        if (state.newPassword !== state.confirmPassword) {
          state.errorMessage = 'Password confirmation does not match.';
          render();
          return;
        }

        state.isSubmitting = true;
        render();

        try {
          if (supabase && typeof supabase.auth?.updateUser === 'function') {
            const { data, error } = await supabase.auth.updateUser({
              password: state.newPassword
            });

            if (error) {
              state.errorMessage = error.message || 'Failed to update password. Please request a new reset link.';
              state.isSubmitting = false;
              render();
              return;
            }
          }

          state.successMessage = 'Password updated successfully! Redirecting to sign in...';
          state.isSubmitting = false;
          render();

          setTimeout(() => {
            if (typeof onNavigate === 'function') {
              onNavigate('login');
            } else if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }, 1500);

        } catch (err) {
          state.errorMessage = err.message || 'An unexpected error occurred during password reset.';
          state.isSubmitting = false;
          render();
        }
      });
    }
  }

  render();

  return () => {
    container.innerHTML = '';
  };
}
