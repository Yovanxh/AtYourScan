/**
 * src/views/signupView.js
 * Unified Multi-Role Account Creation Gateway (/signup)
 * 
 * Implements Zero Dummy Accounts Policy:
 * 1. Flow A: Café Account Registration (/signup?type=cafe)
 * 2. Flow B: Master Admin Genesis Registration (/signup?type=master) with MASTER_BOOTSTRAP_SECRET gate.
 * 
 * Styled with Dribbble Obsidian Dark Palette Tokens, tactile glassmorphism, and live validation.
 */

import { MASTER_BOOTSTRAP_SECRET } from '../auth.js';
import { supabase } from '../supabaseClient.js';

export function renderSignupView(container, store, { onNavigate, initialType = 'cafe' } = {}) {
  if (!container) return () => {};

  // Check URL query param ?type=cafe or ?type=master
  let activeTab = initialType;
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const paramType = params.get('type');
    if (paramType === 'master' || paramType === 'cafe') {
      activeTab = paramType;
    }
  }

  // Local component form state
  const state = {
    // Cafe form
    cafeName: '',
    cafeSlug: '',
    ownerName: '',
    email: '',
    upiId: '',
    password: '',
    confirmPassword: '',
    tablesCount: 12,

    // Master form
    masterName: '',
    masterEmail: '',
    masterPasskey: '',
    masterPassword: '',
    masterConfirmPassword: '',

    // UI state
    showPasswords: false,
    isSubmitting: false,
    errorMessage: '',
    successMessage: '',
    pendingCafe: null,
    isApproved: false
  };

  let approvalChannel = null;
  function subscribeToCafeApproval(cafeId) {
    if (!supabase || typeof supabase.channel !== 'function' || !cafeId) return;
    if (approvalChannel && typeof supabase.removeChannel === 'function') {
      try { supabase.removeChannel(approvalChannel); } catch {}
    }
    approvalChannel = supabase
      .channel(`cafe-approval-${cafeId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cafes',
        filter: `id=eq.${cafeId}`
      }, (payload) => {
        const updated = payload.new;
        if (updated && (updated.status === 'active' || updated.approval_status === 'approved')) {
          state.isApproved = true;
          state.successMessage = `🎉 Congratulations! Café "${updated.name || 'Your café'}" has been APPROVED by the Master Admin! You may now sign in.`;
          state.errorMessage = '';
          render();
        } else if (updated && (updated.status === 'rejected' || updated.approval_status === 'rejected')) {
          state.errorMessage = `❌ Application was declined: ${updated.rejection_reason || 'Compliance verification failed'}.`;
          state.successMessage = '';
          render();
        }
      })
      .subscribe();
  }

  function updateUrlType(type) {
    if (typeof window !== 'undefined' && window.location && window.history) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('type', type);
        window.history.replaceState({}, '', url);
      } catch {}
    }
  }

  function autoDeriveSlug(val) {
    return (val || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function render() {
    container.innerHTML = `
      <div class="min-h-screen bg-[#08080a] text-zinc-100 flex items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden font-sans">
        
        <!-- Ambient Radial Glows -->
        <div class="absolute -top-32 -left-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="w-full max-w-xl bg-[#111115] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
          
          <!-- Portal Header with Official AtYourScan Logo -->
          <div class="text-center space-y-3">
            <div class="flex items-center justify-center">
              <div class="bg-white rounded-2xl p-2.5 shadow-xl border border-white/20 inline-flex items-center justify-center">
                <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan - Cafe & Restaurant QR System" class="h-14 sm:h-16 w-auto object-contain" />
              </div>
            </div>

            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-zinc-400">
                <span class="w-1.5 h-1.5 rounded-full ${activeTab === 'cafe' ? 'bg-[#FF7622]' : 'bg-rose-400'} animate-pulse"></span>
                <span>AtYourScan Gateway • Self-Service Provisioning</span>
              </div>
              
              <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>${activeTab === 'cafe' ? 'Register Your Café' : 'Master Admin Genesis'}</span>
              </h1>
              
              <p class="text-xs text-zinc-400 max-w-md mx-auto">
                ${activeTab === 'cafe' 
                  ? 'Create your sovereign restaurant tenant, seed digital dining tables, and initialize real-time QR ordering.' 
                  : 'Sovereign platform bootstrap. Strictly restricted to verified system operators holding a secret passkey.'}
              </p>
            </div>
          </div>

          <!-- Tab Switcher (Segregated Flows) -->
          <div class="flex items-center gap-1 bg-[#16161d] p-1.5 rounded-2xl border border-white/[0.06] text-xs font-bold shadow-inner">
            <button 
              id="tab-btn-cafe" 
              class="flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'cafe' 
                  ? 'bg-gradient-to-r from-orange-500 to-[#FF7622] text-white shadow-md shadow-orange-500/25' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }"
            >
              <span>🏪 Café Account</span>
              <span class="text-[10px] font-mono opacity-80">/signup?type=cafe</span>
            </button>
            <button 
              id="tab-btn-master" 
              class="flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'master' 
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-600/30' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }"
            >
              <span>🛡️ Master Genesis</span>
              <span class="text-[10px] font-mono opacity-80">/signup?type=master</span>
            </button>
          </div>

          <!-- Error & Success Banners -->
          ${state.errorMessage ? `
            <div class="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2.5 animate-shake">
              <span class="text-sm">⚠️</span>
              <span class="flex-1">${state.errorMessage}</span>
            </div>
          ` : ''}

          ${state.successMessage ? `
            <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2.5">
              <span class="text-sm">✅</span>
              <span class="flex-1">${state.successMessage}</span>
            </div>
          ` : ''}

          <!-- Flow A: Café Account Registration Form / Pending Approval Review -->
          ${activeTab === 'cafe' ? (
            state.pendingCafe ? `
              <div class="p-5 rounded-2xl bg-[#14141d] border border-amber-500/30 shadow-xl space-y-4">
                <div class="flex items-start gap-3">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl shrink-0">
                    ⏳
                  </div>
                  <div class="space-y-1">
                    <h2 class="text-base font-bold text-white flex items-center gap-2">
                      <span>Application Submitted for Review</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                        PENDING APPROVAL
                      </span>
                    </h2>
                    <p class="text-xs text-zinc-400">
                      Your café registration has been securely queued. To protect our tenant fleet and ensure valid merchant credentials, new café registrations require authorization from the <strong class="text-zinc-200">Platform Master Admin</strong> before going live.
                    </p>
                  </div>
                </div>

                <!-- Cafe Tenant Metadata Card -->
                <div class="bg-[#0c0c10] border border-white/[0.08] rounded-xl p-3.5 space-y-2 text-xs font-mono">
                  <div class="flex justify-between items-center text-zinc-400">
                    <span>Café Name:</span>
                    <span class="font-bold text-white">${state.pendingCafe.cafe.name}</span>
                  </div>
                  <div class="flex justify-between items-center text-zinc-400">
                    <span>Tenant Slug:</span>
                    <span class="text-amber-300">${state.pendingCafe.cafe.slug}</span>
                  </div>
                  <div class="flex justify-between items-center text-zinc-400">
                    <span>Owner / Admin:</span>
                    <span class="text-zinc-300">${state.pendingCafe.cafe.owner_name} (${state.pendingCafe.cafe.owner_email})</span>
                  </div>
                  <div class="flex justify-between items-center text-zinc-400">
                    <span>Direct Settlement UPI:</span>
                    <span class="text-emerald-300">${state.pendingCafe.cafe.upi_id}</span>
                  </div>
                  <div class="flex justify-between items-center text-zinc-400">
                    <span>Initial Table Capacity:</span>
                    <span class="text-zinc-300">${state.pendingCafe.cafe.tables_count || 12} Dining Tables</span>
                  </div>
                  <div class="flex justify-between items-center text-zinc-400 pt-1 border-t border-white/[0.06]">
                    <span>Authorization Status:</span>
                    ${state.isApproved ? `
                      <span class="text-emerald-400 font-bold flex items-center gap-1"><span>✅</span><span>APPROVED & LIVE</span></span>
                    ` : `
                      <span class="text-amber-400 font-bold">⏳ Awaiting Master Admin Approval</span>
                    `}
                  </div>
                </div>

                <div class="space-y-2 pt-1">
                  ${!state.isApproved ? `
                    <button 
                      type="button"
                      id="btn-check-approval-status"
                      class="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>🔄</span>
                      <span>Check Approval Status</span>
                    </button>
                    <button 
                      type="button"
                      id="btn-pending-go-login"
                      class="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>Go to Sign In Screen →</span>
                    </button>
                  ` : `
                    <button 
                      type="button"
                      id="btn-pending-go-login"
                      class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>🚀 Sign In to Dashboard →</span>
                    </button>
                  `}
                  <button 
                    type="button"
                    id="btn-register-another-cafe"
                    class="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-400 underline cursor-pointer pt-1"
                  >
                    Register another café instead
                  </button>
                </div>
              </div>
            ` : `
            <form id="form-signup-cafe" class="space-y-4">
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Café Commercial Name *</label>
                  <input 
                    type="text" 
                    id="input-cafe-name"
                    value="${state.cafeName}"
                    placeholder="e.g. The Roasted Bean"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Unique Tenant Slug *</label>
                  <div class="relative">
                    <input 
                      type="text" 
                      id="input-cafe-slug"
                      value="${state.cafeSlug}"
                      placeholder="e.g. roasted-bean"
                      required
                      class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-300 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Owner / Admin Full Name *</label>
                  <input 
                    type="text" 
                    id="input-owner-name"
                    value="${state.ownerName}"
                    placeholder="e.g. Vikram Seth"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Business Email Address *</label>
                  <input 
                    type="email" 
                    id="input-email"
                    value="${state.email}"
                    placeholder="owner@roastedbean.com"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Merchant Direct UPI VPA *</label>
                  <input 
                    type="text" 
                    id="input-upi"
                    value="${state.upiId}"
                    placeholder="cafe@okaxis or cafe@icici"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs font-mono text-emerald-300 placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Default Table Capacity</label>
                  <select 
                    id="select-tables-count"
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-white focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all cursor-pointer"
                  >
                    <option value="6" ${state.tablesCount === 6 ? 'selected' : ''}>6 Tables (Boutique Cafe)</option>
                    <option value="12" ${state.tablesCount === 12 ? 'selected' : ''}>12 Tables (Standard Dining)</option>
                    <option value="20" ${state.tablesCount === 20 ? 'selected' : ''}>20 Tables (Large Bistro)</option>
                    <option value="32" ${state.tablesCount === 32 ? 'selected' : ''}>32 Tables (Multi-Floor Banquet)</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Password (Min 8 Chars) *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-password"
                    value="${state.password}"
                    placeholder="••••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Confirm Password *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-confirm-password"
                    value="${state.confirmPassword}"
                    placeholder="••••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>
              </div>

              <div class="flex items-center justify-between text-xs pt-1">
                <label class="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                  <input type="checkbox" id="chk-show-passwords" ${state.showPasswords ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700 text-[#FF7622] focus:ring-0 cursor-pointer" />
                  <span>Show Passwords</span>
                </label>
                <span class="text-[11px] text-zinc-500 font-mono">Role: cafe_admin</span>
              </div>

              <button 
                type="submit" 
                id="btn-submit-cafe"
                ${state.isSubmitting ? 'disabled' : ''}
                class="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-[#FF7622] hover:from-orange-600 hover:to-[#ea580c] text-white font-bold text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                ${state.isSubmitting ? `
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Provisioning Café & Seeding Tables...</span>
                ` : `
                  <span>🚀 Register Café & Open Menu Builder</span>
                `}
              </button>
            </form>
          `) : `
            <!-- Flow B: Master Admin Genesis Registration Form -->
            <form id="form-signup-master" class="space-y-4">
              
              <!-- Strict Security Gate Banner -->
              <div class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <span class="text-base leading-none">🔒</span>
                <div class="leading-relaxed">
                  <strong class="font-bold block text-rose-200">Genesis Security Verification Gate</strong>
                  Master Operator creation requires the secret verification code (<code class="font-mono bg-rose-950/60 px-1 py-0.5 rounded text-[10px]">MASTER_BOOTSTRAP_SECRET</code>) matching server environment configuration.
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Master Operator Full Name *</label>
                  <input 
                    type="text" 
                    id="input-master-name"
                    value="${state.masterName}"
                    placeholder="e.g. Master Operations Lead"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Master Email Address *</label>
                  <input 
                    type="email" 
                    id="input-master-email"
                    value="${state.masterEmail}"
                    placeholder="master@atyourscan.com"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-zinc-300 mb-1">Security Secret Passkey (MASTER_BOOTSTRAP_SECRET) *</label>
                <input 
                  type="${state.showPasswords ? 'text' : 'password'}" 
                  id="input-master-passkey"
                  value="${state.masterPasskey}"
                  placeholder="Enter authorized bootstrap passkey"
                  required
                  class="w-full bg-[#0c0c10] border border-rose-500/40 rounded-xl px-3.5 py-2.5 text-xs font-mono text-rose-300 placeholder-zinc-600 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Master Password (Min 8 Chars) *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-master-password"
                    value="${state.masterPassword}"
                    placeholder="••••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Confirm Master Password *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-master-confirm-password"
                    value="${state.masterConfirmPassword}"
                    placeholder="••••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                  />
                </div>
              </div>

              <div class="flex items-center justify-between text-xs pt-1">
                <label class="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                  <input type="checkbox" id="chk-show-passwords" ${state.showPasswords ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700 text-rose-500 focus:ring-0 cursor-pointer" />
                  <span>Show Passwords</span>
                </label>
                <span class="text-[11px] text-rose-400 font-mono">Role: master_admin (cafe_id: NULL)</span>
              </div>

              <button 
                type="submit" 
                id="btn-submit-master"
                ${state.isSubmitting ? 'disabled' : ''}
                class="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                ${state.isSubmitting ? `
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Verifying Passkey & Provisioning Master...</span>
                ` : `
                  <span>👑 Bootstrap Master Admin & Enter Control Plane</span>
                `}
              </button>
            </form>
          `}

          <!-- Bottom Navigation Links -->
          <div class="pt-2 border-t border-white/[0.06] text-center space-y-2 text-xs">
            <p class="text-zinc-400">
              Already have an account? 
              <button id="link-to-login" class="font-bold text-[#FF7622] hover:text-orange-400 hover:underline cursor-pointer">
                Log In to AtYourScan
              </button>
            </p>
            <p class="text-[11px] text-zinc-500">
              Dine-in guest at a table? 
              <button id="link-to-customer" class="text-zinc-400 hover:text-white underline cursor-pointer">
                Access Contactless QR Menu
              </button>
            </p>
          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Tab switching
    container.querySelector('#tab-btn-cafe')?.addEventListener('click', () => {
      activeTab = 'cafe';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlType('cafe');
      render();
    });

    container.querySelector('#tab-btn-master')?.addEventListener('click', () => {
      activeTab = 'master';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlType('master');
      render();
    });

    // Password visibility toggle
    container.querySelector('#chk-show-passwords')?.addEventListener('change', (e) => {
      state.showPasswords = Boolean(e.target.checked);
      render();
    });

    // Navigation links
    container.querySelector('#link-to-login')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('login');
      }
    });

    container.querySelector('#link-to-customer')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('customer');
      }
    });

    // Live auto-derivation of cafe slug
    const nameInput = container.querySelector('#input-cafe-name');
    const slugInput = container.querySelector('#input-cafe-slug');
    if (nameInput && slugInput) {
      nameInput.addEventListener('input', (e) => {
        state.cafeName = e.target.value;
        if (!slugInput.dataset.manual) {
          state.cafeSlug = autoDeriveSlug(state.cafeName);
          slugInput.value = state.cafeSlug;
        }
      });
      slugInput.addEventListener('input', (e) => {
        slugInput.dataset.manual = 'true';
        state.cafeSlug = e.target.value;
      });
    }

    // Submit Café Form
    container.querySelector('#form-signup-cafe')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const cafeName = container.querySelector('#input-cafe-name')?.value || '';
      const cafeSlug = container.querySelector('#input-cafe-slug')?.value || '';
      const ownerName = container.querySelector('#input-owner-name')?.value || '';
      const email = container.querySelector('#input-email')?.value || '';
      const upiId = container.querySelector('#input-upi')?.value || '';
      const password = container.querySelector('#input-password')?.value || '';
      const confirmPassword = container.querySelector('#input-confirm-password')?.value || '';
      const tablesCount = parseInt(container.querySelector('#select-tables-count')?.value || 12, 10);

      state.cafeName = cafeName;
      state.cafeSlug = cafeSlug;
      state.ownerName = ownerName;
      state.email = email;
      state.upiId = upiId;
      state.password = password;
      state.confirmPassword = confirmPassword;
      state.tablesCount = tablesCount;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.registerCafeAccount({
          cafeName,
          cafeSlug,
          ownerName,
          email,
          upiId,
          password,
          confirmPassword,
          tablesCount
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Registration failed.';
          render();
          return;
        }

        state.isSubmitting = false;
        if (res.requiresApproval || res.status === 'pending_approval' || res.status === 'pending') {
          state.pendingCafe = {
            cafe: res.cafe,
            user: res.user,
            submittedAt: new Date().toLocaleTimeString()
          };
          state.successMessage = `⏳ Application for "${res.cafe.name}" submitted! Awaiting Master Admin approval.`;
          subscribeToCafeApproval(res.cafe?.id);
          render();
          return;
        }

        state.successMessage = `🎉 Café "${res.cafe.name}" successfully registered! Redirecting to dashboard...`;
        render();

        setTimeout(() => {
          if (typeof onNavigate === 'function') {
            onNavigate('analytics'); // Cafe admin routes to /dashboard
          }
        }, 1200);

      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'An unexpected error occurred during café registration.';
        render();
      }
    });

    // Check approval status in pending review card
    container.querySelector('#btn-check-approval-status')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span><span>Checking Supabase...</span>';
      
      const cafeId = state.pendingCafe?.cafe?.id;
      let found = null;
      if (supabase && typeof supabase.from === 'function' && cafeId) {
        try {
          const { data, error } = await supabase.from('cafes').select('*').eq('id', cafeId).maybeSingle();
          if (data) found = data;
        } catch (err) {
          console.warn('Direct cafe status query failed:', err);
        }
      }
      if (!found) {
        const cafes = Array.isArray(store.cafes) ? store.cafes : [];
        const tenants = Array.isArray(store.tenants) ? store.tenants : [];
        found = cafes.find(c => c.id === cafeId) || tenants.find(t => t.id === cafeId || t.cafe_id === cafeId);
      }

      if (found && (found.status === 'active' || found.approval_status === 'approved')) {
        state.isApproved = true;
        state.successMessage = `🎉 Congratulations! Café "${found.name}" has been APPROVED by the Master Admin! You may now sign in.`;
        state.errorMessage = '';
        render();
      } else if (found && (found.status === 'rejected' || found.approval_status === 'rejected')) {
        state.errorMessage = `❌ Application was declined: ${found.rejection_reason || 'Compliance verification failed'}.`;
        state.successMessage = '';
        render();
      } else {
        state.errorMessage = '';
        state.successMessage = `⏳ Status check: Still pending Master Admin authorization. Last checked at ${new Date().toLocaleTimeString()}.`;
        render();
      }
    });

    container.querySelector('#btn-pending-go-login')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('login');
      }
    });

    container.querySelector('#btn-register-another-cafe')?.addEventListener('click', () => {
      state.pendingCafe = null;
      state.errorMessage = '';
      state.successMessage = '';
      render();
    });

    // Submit Master Genesis Form
    container.querySelector('#form-signup-master')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const name = container.querySelector('#input-master-name')?.value || '';
      const email = container.querySelector('#input-master-email')?.value || '';
      const passkey = container.querySelector('#input-master-passkey')?.value || '';
      const password = container.querySelector('#input-master-password')?.value || '';
      const confirmPassword = container.querySelector('#input-master-confirm-password')?.value || '';

      state.masterName = name;
      state.masterEmail = email;
      state.masterPasskey = passkey;
      state.masterPassword = password;
      state.masterConfirmPassword = confirmPassword;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.registerMasterAdmin({
          name,
          email,
          passkey,
          password,
          confirmPassword
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Master Admin creation failed.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.successMessage = `👑 Master Admin "${res.user.name}" provisioned! Entering Platform Control Plane...`;
        render();

        setTimeout(() => {
          if (typeof onNavigate === 'function') {
            onNavigate('platform-admin');
          }
        }, 1200);

      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'An unexpected error occurred during Master Admin genesis.';
        render();
      }
    });
  }

  render();

  return () => {
    if (approvalChannel && supabase && typeof supabase.removeChannel === 'function') {
      try {
        supabase.removeChannel(approvalChannel);
      } catch {}
    }
    container.innerHTML = '';
  };
}
