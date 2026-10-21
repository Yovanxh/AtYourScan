/**
 * src/views/loginView.js
 * Multi-Role Authentication Portal (/login) with Secure Email OTP Password Recovery
 * 
 * Segmented entry:
 * 1. Café Portal:
 *    - Sub-tab A: Café Admin (Owner Email + Password)
 *    - Sub-tab B: Shift Staff / Cashier (Café Slug + 4-digit Staff PIN)
 * 2. Master Admin Portal:
 *    - Platform Administrators (Master Email + Password / PIN)
 * 3. Secure Email OTP Password & PIN Recovery Subsystem:
 *    - Step 1: Request 6-digit OTP code to verified email
 *    - Step 2: Validate OTP code & set new cryptographic password
 *    - Step 3: Success state with immediate one-click sign in
 * 
 * Bottom Links:
 * - "Don't have a Café account? Register your Café" -> /signup?type=cafe
 * - Subtle footer: "System Operator Sign Up" -> /signup?type=master
 * 
 * Styled with Dribbble Obsidian Dark Theme tokens, glowing glassmorphism, and live feedback.
 */

export function renderLoginView(container, store, { onNavigate, initialPortal = 'cafe' } = {}) {
  if (!container) return () => {};

  let activePortal = initialPortal; // 'cafe' | 'master'
  let cafeMode = 'admin'; // 'admin' | 'staff'

  // Read URL query params
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal') === 'master') activePortal = 'master';
    if (params.get('mode') === 'staff') cafeMode = 'staff';
  }

  const state = {
    // Cafe Admin
    adminEmail: '',
    adminPassword: '',

    // Staff PIN
    cafeSlug: '',
    staffPin: '',

    // Master Admin
    masterEmail: '',
    masterPassword: '',

    // Forgot Password Flow
    isForgotMode: false,
    forgotStep: 'request', // 'request' | 'verify' | 'success'
    forgotEmail: '',
    forgotOtp: '',
    forgotNewPassword: '',
    forgotConfirmPassword: '',
    otpSentInfo: null,
    resendCooldown: 0,

    // UI
    showPasswords: false,
    isSubmitting: false,
    errorMessage: '',
    successMessage: ''
  };

  let cooldownTimer = null;

  function updateUrlParams() {
    if (typeof window !== 'undefined' && window.location && window.history) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('portal', activePortal);
        if (activePortal === 'cafe') {
          url.searchParams.set('mode', cafeMode);
        } else {
          url.searchParams.delete('mode');
        }
        window.history.replaceState({}, '', url);
      } catch {}
    }
  }

  function startResendCooldown(seconds = 60) {
    state.resendCooldown = seconds;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      state.resendCooldown--;
      if (state.resendCooldown <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
      const timerBtn = container.querySelector('#btn-resend-otp');
      if (timerBtn) {
        if (state.resendCooldown > 0) {
          timerBtn.disabled = true;
          timerBtn.innerText = `Resend Code in ${state.resendCooldown}s`;
        } else {
          timerBtn.disabled = false;
          timerBtn.innerText = `Resend Code 🔄`;
        }
      }
    }, 1000);
  }

  function render() {
    // -------------------------------------------------------------
    // RENDER FORGOT PASSWORD / EMAIL OTP RECOVERY FLOW
    // -------------------------------------------------------------
    if (state.isForgotMode) {
      container.innerHTML = `
        <div class="min-h-screen bg-[#08080a] text-zinc-100 flex items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden font-sans">
          
          <!-- Ambient Radial Glows -->
          <div class="absolute -top-32 -left-32 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div class="w-full max-w-lg bg-[#111115] border border-amber-500/25 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            <!-- Header with Official AtYourScan Logo -->
            <div class="text-center space-y-2">
              <div class="flex items-center justify-center mb-1">
                <div class="bg-white rounded-2xl p-2 shadow-xl border border-white/20 inline-flex items-center justify-center">
                  <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan Logo" class="h-12 w-auto object-contain" />
                </div>
              </div>

              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-300">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Security Recovery • Password Recovery</span>
              </div>

              <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>🔑 Reset Account Password</span>
              </h1>

              <p class="text-xs text-zinc-400 max-w-sm mx-auto">
                ${state.forgotStep === 'request'
                  ? 'Enter your registered email address. We will immediately dispatch a 6-digit one-time passcode (OTP) to your inbox.'
                  : state.forgotStep === 'verify'
                  ? `Enter the 6-digit OTP code sent to your email to set a new password.`
                  : 'Your account password has been updated successfully.'}
              </p>
            </div>

            <!-- Error Banner -->
            ${state.errorMessage ? `
              <div class="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2.5 animate-shake">
                <span class="text-sm">⚠️</span>
                <span class="flex-1">${state.errorMessage}</span>
              </div>
            ` : ''}

            <!-- Success Banner -->
            ${state.successMessage ? `
              <div class="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2.5">
                <span class="text-sm">✅</span>
                <span class="flex-1">${state.successMessage}</span>
              </div>
            ` : ''}

            <!-- STEP 1: REQUEST OTP FORM -->
            ${state.forgotStep === 'request' ? `
              <form id="form-request-otp" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Registered Account Email Address *</label>
                  <div class="relative">
                    <input 
                      type="email" 
                      id="input-forgot-email"
                      value="${state.forgotEmail}"
                      placeholder="e.g. owner@mycafe.com or master@atyourscan.com"
                      required
                      class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                    />
                    <span class="absolute left-3 top-2.5 text-zinc-500 text-xs">✉️</span>
                  </div>
                  <p class="text-[10px] text-zinc-500 mt-1 font-mono">Compatible with Café Admin, Shift Staff, or Master Admin accounts</p>
                </div>

                <div class="pt-2 flex flex-col gap-2">
                  <button 
                    type="submit" 
                    id="btn-send-otp-submit"
                    ${state.isSubmitting ? 'disabled' : ''}
                    class="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-zinc-950 font-black text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    ${state.isSubmitting ? `
                      <span class="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin"></span>
                      <span>Dispatching Email OTP...</span>
                    ` : `
                      <span>Send 6-Digit OTP to Email →</span>
                    `}
                  </button>

                  <button 
                    type="button" 
                    id="btn-back-to-login"
                    class="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white font-medium text-xs transition-all cursor-pointer text-center"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- STEP 2: VERIFY OTP & RESET PASSWORD FORM -->
            ${state.forgotStep === 'verify' ? `
              <!-- Simulated Email Inbox Notification Banner -->
              <div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5 shadow-inner">
                <div class="flex items-center justify-between font-bold">
                  <span class="flex items-center gap-1.5">
                    <span>📬</span>
                    <span>Email Notification Sent</span>
                  </span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                    Expires in 10m
                  </span>
                </div>
                <p class="text-[11px] text-zinc-400">
                  A verification code has been dispatched to <strong class="text-white font-mono">${state.forgotEmail}</strong>.
                </p>
                ${state.otpSentInfo?.otp ? `
                  <div class="mt-2 p-2.5 rounded-xl bg-black/40 border border-amber-500/30 flex items-center justify-between">
                    <div>
                      <span class="text-[9px] font-mono uppercase text-amber-400 block font-bold">Your Verification Passcode (OTP)</span>
                      <span class="text-lg font-mono font-black text-white tracking-widest">${state.otpSentInfo.otp}</span>
                    </div>
                    <button 
                      type="button" 
                      id="btn-auto-fill-otp" 
                      class="px-2.5 py-1 text-[10px] rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold transition-all border border-amber-500/40 cursor-pointer"
                    >
                      Fill Code
                    </button>
                  </div>
                ` : ''}
              </div>

              <form id="form-verify-otp" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Enter 6-Digit Email OTP Code *</label>
                  <input 
                    type="text" 
                    id="input-verify-otp"
                    maxlength="6"
                    value="${state.forgotOtp}"
                    placeholder="••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-center text-xl font-mono tracking-[0.3em] font-black text-amber-400 placeholder-zinc-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">New Password or Security PIN *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-new-password"
                    value="${state.forgotNewPassword}"
                    placeholder="Enter at least 4 characters"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Confirm New Password *</label>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-confirm-password"
                    value="${state.forgotConfirmPassword}"
                    placeholder="Re-enter new password"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                  />
                </div>

                <div class="flex items-center justify-between text-xs pt-0.5">
                  <label class="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                    <input type="checkbox" id="chk-show-forgot-passwords" ${state.showPasswords ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0 cursor-pointer" />
                    <span>Show Password</span>
                  </label>
                  <button 
                    type="button" 
                    id="btn-resend-otp" 
                    ${state.resendCooldown > 0 ? 'disabled' : ''}
                    class="text-[11px] text-amber-400 hover:text-amber-300 hover:underline font-bold disabled:opacity-40 disabled:hover:no-underline cursor-pointer"
                  >
                    ${state.resendCooldown > 0 ? `Resend Code in ${state.resendCooldown}s` : 'Resend Code 🔄'}
                  </button>
                </div>

                <div class="pt-2 flex flex-col gap-2">
                  <button 
                    type="submit" 
                    id="btn-verify-otp-submit"
                    ${state.isSubmitting ? 'disabled' : ''}
                    class="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-zinc-950 font-black text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    ${state.isSubmitting ? `
                      <span class="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin"></span>
                      <span>Updating Password...</span>
                    ` : `
                      <span>Verify OTP & Update Password 🔐</span>
                    `}
                  </button>

                  <button 
                    type="button" 
                    id="btn-back-to-login"
                    class="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white font-medium text-xs transition-all cursor-pointer text-center"
                  >
                    ← Cancel & Back to Sign In
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- STEP 3: SUCCESS STATE -->
            ${state.forgotStep === 'success' ? `
              <div class="text-center space-y-4 py-4">
                <div class="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/20">
                  🎉
                </div>

                <div class="space-y-1">
                  <h3 class="text-lg font-black text-white">Password Reset Complete!</h3>
                  <p class="text-xs text-zinc-400 max-w-xs mx-auto">
                    Your password has been securely updated and encrypted. You can now log into your account.
                  </p>
                </div>

                <button 
                  type="button" 
                  id="btn-proceed-to-login"
                  class="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.99] transition-all cursor-pointer"
                >
                  Proceed to Sign In Now →
                </button>
              </div>
            ` : ''}

          </div>
        </div>
      `;

      bindForgotEvents();
      return;
    }

    // -------------------------------------------------------------
    // RENDER STANDARD MULTI-ROLE LOGIN CARD
    // -------------------------------------------------------------
    container.innerHTML = `
      <div class="min-h-screen bg-[#08080a] text-zinc-100 flex items-center justify-center p-4 sm:p-6 select-none relative overflow-hidden font-sans">
        
        <!-- Ambient Radial Glows -->
        <div class="absolute -top-32 -left-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="w-full max-w-lg bg-[#111115] border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
          
          <!-- Portal Header with Official AtYourScan Brand & Logo -->
          <div class="text-center space-y-3">
            <div class="flex items-center justify-center">
              <div class="bg-white rounded-2xl p-2.5 shadow-xl border border-white/20 inline-flex items-center justify-center">
                <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan - Cafe & Restaurant QR System" class="h-14 sm:h-16 w-auto object-contain" />
              </div>
            </div>

            <div class="space-y-1">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-zinc-400">
                <span class="w-1.5 h-1.5 rounded-full ${activePortal === 'cafe' ? 'bg-[#FF7622]' : 'bg-rose-400'} animate-pulse"></span>
                <span>AtYourScan Gateway • Authenticated Access</span>
              </div>
              
              <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                <span>${activePortal === 'cafe' ? 'Café Portal Sign In' : 'Master Admin Portal'}</span>
              </h1>
              
              <p class="text-xs text-zinc-400 max-w-sm mx-auto">
                ${activePortal === 'cafe' 
                  ? 'Sign in to access your café dashboard, active POS floorplan, and live orders.' 
                  : 'Platform Operator & Super-Admin Console. Sovereign multi-tenant control plane.'}
              </p>
            </div>
          </div>

          <!-- Primary Segmented Control: Café vs Master -->
          <div class="flex items-center gap-1 bg-[#16161d] p-1.5 rounded-2xl border border-white/[0.06] text-xs font-bold shadow-inner">
            <button 
              id="btn-portal-cafe" 
              class="flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activePortal === 'cafe' 
                  ? 'bg-gradient-to-r from-orange-500 to-[#FF7622] text-white shadow-md shadow-orange-500/25' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }"
            >
              <span>🏪 Café Portal</span>
            </button>
            <button 
              id="btn-portal-master" 
              class="flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activePortal === 'master' 
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-600/30' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }"
            >
              <span>🛡️ Master Admin</span>
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

          <!-- PORTAL 1: CAFÉ PORTAL (Admin vs Shift Staff) -->
          ${activePortal === 'cafe' ? `
            
            <!-- Sub-Toggle: Café Admin vs Staff PIN -->
            <div class="flex items-center justify-center gap-3 pb-1 border-b border-white/[0.06] text-xs font-semibold">
              <button 
                id="btn-sub-admin"
                class="pb-2 border-b-2 transition-all cursor-pointer ${
                  cafeMode === 'admin' 
                    ? 'border-[#FF7622] text-white font-bold' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }"
              >
                Café Admin (Email + Password)
              </button>
              <button 
                id="btn-sub-staff"
                class="pb-2 border-b-2 transition-all cursor-pointer ${
                  cafeMode === 'staff' 
                    ? 'border-[#FF7622] text-white font-bold' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }"
              >
                Shift Manager / Cashier (PIN)
              </button>
            </div>

            ${cafeMode === 'admin' ? `
              <!-- Café Admin Login Form -->
              <form id="form-login-cafe-admin" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Owner / Business Email Address *</label>
                  <input 
                    type="email" 
                    id="input-admin-email"
                    value="${state.adminEmail}"
                    placeholder="owner@mycafe.com"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-[11px] font-bold text-zinc-300">Password *</label>
                    <button 
                      type="button" 
                      id="btn-forgot-password-cafe" 
                      class="text-[11px] text-[#FF7622] hover:text-orange-400 font-bold hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input 
                    type="${state.showPasswords ? 'text' : 'password'}" 
                    id="input-admin-password"
                    value="${state.adminPassword}"
                    placeholder="••••••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                </div>

                <div class="flex items-center justify-between text-xs pt-1">
                  <label class="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                    <input type="checkbox" id="chk-show-passwords" ${state.showPasswords ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700 text-[#FF7622] focus:ring-0 cursor-pointer" />
                    <span>Show Password</span>
                  </label>
                  <span class="text-[11px] text-zinc-500 font-mono">Role: cafe_admin</span>
                </div>

                <button 
                  type="submit" 
                  id="btn-submit-cafe-admin"
                  ${state.isSubmitting ? 'disabled' : ''}
                  class="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-[#FF7622] hover:from-orange-600 hover:to-[#ea580c] text-white font-bold text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  ${state.isSubmitting ? `
                    <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Authenticating Owner Session...</span>
                  ` : `
                    <span>Sign In to Café Dashboard →</span>
                  `}
                </button>
              </form>
            ` : `
              <!-- Shift Staff PIN Login Form -->
              <form id="form-login-cafe-staff" class="space-y-4">
                <div>
                  <label class="block text-[11px] font-bold text-zinc-300 mb-1">Café Slug Identifier (Optional)</label>
                  <input 
                    type="text" 
                    id="input-staff-slug"
                    value="${state.cafeSlug}"
                    placeholder="e.g. roasted-bean (or leave blank for active venue)"
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-300 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                  />
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-[11px] font-bold text-zinc-300">4-Digit Staff Security PIN *</label>
                    <button 
                      type="button" 
                      id="btn-forgot-pin-staff" 
                      class="text-[11px] text-amber-400 hover:text-amber-300 font-bold hover:underline cursor-pointer"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                  <input 
                    type="password" 
                    id="input-staff-pin"
                    maxlength="8"
                    value="${state.staffPin}"
                    placeholder="••••"
                    required
                    class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-[#FF7622] placeholder-zinc-600 focus:border-[#FF7622] focus:ring-1 focus:ring-[#FF7622] transition-all"
                  />
                  <p class="text-[10px] text-zinc-500 mt-1 text-center font-mono">Accepts keyboard numpad digits</p>
                </div>

                <button 
                  type="submit" 
                  id="btn-submit-cafe-staff"
                  ${state.isSubmitting ? 'disabled' : ''}
                  class="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-[#FF7622] hover:from-orange-600 hover:to-[#ea580c] text-white font-bold text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  ${state.isSubmitting ? `
                    <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Verifying Staff PIN...</span>
                  ` : `
                    <span>Unlock Floorplan & POS →</span>
                  `}
                </button>
              </form>
            `}
          ` : `
            <!-- PORTAL 2: MASTER ADMIN PORTAL -->
            <form id="form-login-master" class="space-y-4">
              <div class="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                Platform Super-Admin Sovereign Authentication Gateway.
              </div>

              <div>
                <label class="block text-[11px] font-bold text-zinc-300 mb-1">Master Admin Email Address *</label>
                <input 
                  type="email" 
                  id="input-master-email"
                  value="${state.masterEmail}"
                  placeholder="master@atyourscan.com"
                  required
                  class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] font-bold text-zinc-300">Master Password or Sovereign PIN *</label>
                  <button 
                    type="button" 
                    id="btn-forgot-password-master" 
                    class="text-[11px] text-rose-400 hover:text-rose-300 font-bold hover:underline cursor-pointer"
                  >
                    Forgot Password / PIN?
                  </button>
                </div>
                <input 
                  type="${state.showPasswords ? 'text' : 'password'}" 
                  id="input-master-password"
                  value="${state.masterPassword}"
                  placeholder="••••••••"
                  required
                  class="w-full bg-[#0c0c10] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                />
              </div>

              <div class="flex items-center justify-between text-xs pt-1">
                <label class="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                  <input type="checkbox" id="chk-show-passwords" ${state.showPasswords ? 'checked' : ''} class="rounded bg-zinc-800 border-zinc-700 text-rose-500 focus:ring-0 cursor-pointer" />
                  <span>Show Password</span>
                </label>
                <span class="text-[11px] text-rose-400 font-mono">Role: master_admin</span>
              </div>

              <button 
                type="submit" 
                id="btn-submit-master-login"
                ${state.isSubmitting ? 'disabled' : ''}
                class="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                ${state.isSubmitting ? `
                  <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Verifying Master Credentials...</span>
                ` : `
                  <span>👑 Enter Platform Control Plane →</span>
                `}
              </button>
            </form>
          `}

          <!-- Bottom Navigation Links -->
          <div class="pt-2 border-t border-white/[0.06] text-center space-y-2 text-xs">
            <p class="text-zinc-300">
              Don't have a Café account? 
              <button id="link-to-signup-cafe" class="font-bold text-[#FF7622] hover:text-orange-400 hover:underline cursor-pointer">
                Register your Café
              </button>
            </p>
            <p class="text-[11px] text-zinc-500">
              System Operator? 
              <button id="link-to-signup-master" class="text-zinc-400 hover:text-rose-400 underline cursor-pointer">
                System Operator Sign Up
              </button>
              <span class="text-zinc-600">•</span>
              <button id="link-to-guest" class="text-zinc-400 hover:text-white underline cursor-pointer">
                Guest QR Menu
              </button>
            </p>
          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindForgotEvents() {
    // Show / Hide password toggle
    container.querySelector('#chk-show-forgot-passwords')?.addEventListener('change', (e) => {
      state.showPasswords = Boolean(e.target.checked);
      render();
    });

    // Auto-fill OTP button
    container.querySelector('#btn-auto-fill-otp')?.addEventListener('click', () => {
      if (state.otpSentInfo?.otp) {
        state.forgotOtp = state.otpSentInfo.otp;
        const otpInput = container.querySelector('#input-verify-otp');
        if (otpInput) otpInput.value = state.forgotOtp;
        store?.playSound?.('tap');
      }
    });

    // Back to Login buttons
    container.querySelectorAll('#btn-back-to-login, #btn-proceed-to-login')?.forEach(btn => {
      btn.addEventListener('click', () => {
        state.isForgotMode = false;
        state.forgotStep = 'request';
        state.errorMessage = '';
        state.successMessage = '';
        render();
      });
    });

    // Submit Request OTP
    container.querySelector('#form-request-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const email = container.querySelector('#input-forgot-email')?.value || '';
      state.forgotEmail = email;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.requestPasswordResetOTP({
          email,
          role: activePortal === 'master' ? 'master_admin' : 'auto'
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Failed to dispatch verification code.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.otpSentInfo = res;
        state.forgotStep = 'verify';
        state.errorMessage = '';
        state.successMessage = `📨 Verification code sent to ${email}`;
        startResendCooldown(60);
        render();
      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'Error sending verification code.';
        render();
      }
    });

    // Resend OTP button
    container.querySelector('#btn-resend-otp')?.addEventListener('click', async () => {
      if (state.resendCooldown > 0) return;
      state.errorMessage = '';
      state.successMessage = '';
      try {
        const res = await store.requestPasswordResetOTP({
          email: state.forgotEmail,
          role: activePortal === 'master' ? 'master_admin' : 'auto'
        });
        if (res.success) {
          state.otpSentInfo = res;
          state.successMessage = `📨 New verification code sent to ${state.forgotEmail}`;
          startResendCooldown(60);
          render();
        } else {
          state.errorMessage = res.error || 'Failed to resend code.';
          render();
        }
      } catch (err) {
        state.errorMessage = err.message || 'Failed to resend code.';
        render();
      }
    });

    // Submit Verify OTP & Reset Password
    container.querySelector('#form-verify-otp')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const otp = container.querySelector('#input-verify-otp')?.value || '';
      const newPassword = container.querySelector('#input-new-password')?.value || '';
      const confirmPassword = container.querySelector('#input-confirm-password')?.value || '';

      state.forgotOtp = otp;
      state.forgotNewPassword = newPassword;
      state.forgotConfirmPassword = confirmPassword;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.verifyAndResetPasswordWithOTP({
          email: state.forgotEmail,
          otp,
          newPassword,
          confirmPassword
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Password update failed.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.forgotStep = 'success';
        state.adminEmail = state.forgotEmail;
        state.masterEmail = state.forgotEmail;
        state.adminPassword = newPassword;
        state.masterPassword = newPassword;
        state.errorMessage = '';
        state.successMessage = '';
        render();
      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'Password update failed.';
        render();
      }
    });
  }

  function bindEvents() {
    // Portal toggle
    container.querySelector('#btn-portal-cafe')?.addEventListener('click', () => {
      activePortal = 'cafe';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlParams();
      render();
    });

    container.querySelector('#btn-portal-master')?.addEventListener('click', () => {
      activePortal = 'master';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlParams();
      render();
    });

    // Sub-toggle
    container.querySelector('#btn-sub-admin')?.addEventListener('click', () => {
      cafeMode = 'admin';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlParams();
      render();
    });

    container.querySelector('#btn-sub-staff')?.addEventListener('click', () => {
      cafeMode = 'staff';
      state.errorMessage = '';
      state.successMessage = '';
      updateUrlParams();
      render();
    });

    // Password visibility
    container.querySelector('#chk-show-passwords')?.addEventListener('change', (e) => {
      state.showPasswords = Boolean(e.target.checked);
      render();
    });

    // Forgot Password triggers
    const triggerForgotFlow = (emailHint) => {
      state.isForgotMode = true;
      state.forgotStep = 'request';
      state.forgotEmail = emailHint || state.adminEmail || state.masterEmail || '';
      state.forgotOtp = '';
      state.forgotNewPassword = '';
      state.forgotConfirmPassword = '';
      state.errorMessage = '';
      state.successMessage = '';
      render();
    };

    container.querySelector('#btn-forgot-password-cafe')?.addEventListener('click', () => {
      const emailInput = container.querySelector('#input-admin-email')?.value || state.adminEmail;
      triggerForgotFlow(emailInput);
    });

    container.querySelector('#btn-forgot-pin-staff')?.addEventListener('click', () => {
      triggerForgotFlow('');
    });

    container.querySelector('#btn-forgot-password-master')?.addEventListener('click', () => {
      const emailInput = container.querySelector('#input-master-email')?.value || state.masterEmail;
      triggerForgotFlow(emailInput);
    });

    // Navigation links
    container.querySelector('#link-to-signup-cafe')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('signup', { type: 'cafe' });
      }
    });

    container.querySelector('#link-to-signup-master')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('signup', { type: 'master' });
      }
    });

    container.querySelector('#link-to-guest')?.addEventListener('click', () => {
      if (typeof onNavigate === 'function') {
        onNavigate('customer');
      }
    });

    // Submit Cafe Admin
    container.querySelector('#form-login-cafe-admin')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const email = container.querySelector('#input-admin-email')?.value || '';
      const password = container.querySelector('#input-admin-password')?.value || '';

      state.adminEmail = email;
      state.adminPassword = password;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.loginUser({
          type: 'cafe_admin',
          email,
          password
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Authentication failed.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.successMessage = `👋 Welcome back, ${res.user.name}! Redirecting...`;
        render();

        setTimeout(() => {
          if (typeof onNavigate === 'function') {
            onNavigate('analytics'); // Cafe admin routes to /dashboard (Sales Analytics)
          }
        }, 1000);
      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'Login error occurred.';
        render();
      }
    });

    // Submit Staff PIN
    container.querySelector('#form-login-cafe-staff')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const slug = container.querySelector('#input-staff-slug')?.value || '';
      const pin = container.querySelector('#input-staff-pin')?.value || '';

      state.cafeSlug = slug;
      state.staffPin = pin;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.loginUser({
          type: 'shift_manager',
          slug,
          pin
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Invalid Staff PIN.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.successMessage = `👋 Staff session unlocked for ${res.staff.name} (${res.staff.role}).`;
        render();

        setTimeout(() => {
          if (typeof onNavigate === 'function') {
            onNavigate('floorplan');
          }
        }, 800);
      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'Staff PIN verification failed.';
        render();
      }
    });

    // Submit Master Admin
    container.querySelector('#form-login-master')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      state.errorMessage = '';
      state.successMessage = '';

      const email = container.querySelector('#input-master-email')?.value || '';
      const password = container.querySelector('#input-master-password')?.value || '';

      state.masterEmail = email;
      state.masterPassword = password;
      state.isSubmitting = true;
      render();

      try {
        const res = await store.loginUser({
          type: 'master_admin',
          email,
          password
        });

        if (!res.success) {
          state.isSubmitting = false;
          state.errorMessage = res.error || 'Master Admin authentication failed.';
          render();
          return;
        }

        state.isSubmitting = false;
        state.successMessage = `👑 Master Session authenticated for ${res.user.name}. Opening Control Plane...`;
        render();

        setTimeout(() => {
          if (typeof onNavigate === 'function') {
            onNavigate('platform-admin');
          }
        }, 1000);
      } catch (err) {
        state.isSubmitting = false;
        state.errorMessage = err.message || 'Master Admin authentication failed.';
        render();
      }
    });
  }

  render();

  return () => {
    if (cooldownTimer) clearInterval(cooldownTimer);
    container.innerHTML = '';
  };
}
