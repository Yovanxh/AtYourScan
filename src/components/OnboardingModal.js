/**
 * src/components/OnboardingModal.js
 * First-Run Setup & Terminal SIN Pairing Wizard (Milestone 2 - Requirement R2)
 *
 * Implements:
 * 1. Uninitialized state first-run onboarding setup wizard.
 * 2. Multi-step workflow (Venue Setup -> Master Admin -> Staff Roster -> Terminal Hardware).
 * 3. Dribbble Dark obsidian glassmorphism aesthetics (Tailwind classes, amber/emerald neon accents, Lucide SVG icons).
 * 4. Comprehensive client-side validation, error banners, and touch-friendly controls.
 * 5. Direct integration with reactive `store.completeOnboarding(onboardingData)`.
 */

import { ROLES } from '../auth.js';

// --- INLINE LUCIDE SVG ICONS ---
const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  store: `<svg ${svgAttrs}><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>`,
  shield: `<svg ${svgAttrs}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  users: `<svg ${svgAttrs}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  terminal: `<svg ${svgAttrs}><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
  check: `<svg ${svgAttrs}><path d="M20 6 9 17l-5-5"/></svg>`,
  alert: `<svg ${svgAttrs}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  arrowRight: `<svg ${svgAttrs}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  arrowLeft: `<svg ${svgAttrs}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  plus: `<svg ${svgAttrs}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  trash: `<svg ${svgAttrs}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  eye: `<svg ${svgAttrs}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg ${svgAttrs}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  sparkles: `<svg ${svgAttrs}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  zap: `<svg ${svgAttrs}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  key: `<svg ${svgAttrs}><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  x: `<svg ${svgAttrs}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
};

// Available Currencies
export const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹) - Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'USD ($) - US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) - Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) - British Pound' },
  { code: 'AED', symbol: 'د.إ', label: 'AED (د.إ) - UAE Dirham' }
];

// Available Station Types
export const STATION_TYPES = [
  { id: 'BILLING_POS', label: 'Front Billing Counter POS' },
  { id: 'BAR_POS', label: 'Craft Bar & Beverage Station' },
  { id: 'SERVER_TABLET', label: 'Server Handheld Tablet' },
  { id: 'KDS_STATION', label: 'Kitchen Bump Display (KDS)' }
];

// Default Realistic Pre-Populated State (for instantaneous 1-click test fill)
export const DEFAULT_ONBOARDING_STATE = {
  // Step 1: Venue Setup
  restaurantName: 'First Way Cafe',
  restaurantId: 'REST-BLR-001',
  tagline: 'Artisanal Dining • Craft Brews • Woodfired Fare',
  address: 'Indiranagar 12th Main, Bengaluru',
  upiId: 'vanshwaghre-1@okicici',
  currency: 'INR',
  gstRate: '5.0',
  serviceChargeRate: '7.0',

  // Step 2: Master Admin Registration
  adminName: 'Dev Anand',
  adminEmail: 'admin@copperoak.com',
  adminPassword: 'AdminSecurePass2026!',
  adminConfirmPassword: 'AdminSecurePass2026!',
  adminPin: '1234',
  adminConfirmPin: '1234',

  // Step 3: Staff Roster
  staffRoster: [
    { id: 'staff-cashier-01', role: ROLES.CASHIER, name: 'Rohan Verma', pin: '1111' },
    { id: 'staff-server-01', role: ROLES.SERVER, name: 'Priya Sharma', pin: '2222' },
    { id: 'staff-bar-01', role: ROLES.BARTENDER, name: 'Alex D’Souza', pin: '3333' }
  ],

  // Step 4: Primary Terminal Setup
  terminalName: 'Front Billing Counter POS #1',
  terminalSin: 'SIN-POS-01',
  terminalType: 'BILLING_POS',
  autoPairDevice: true,
  autoLoginAdmin: true
};

/**
 * Render the first-run onboarding wizard into a DOM container
 * @param {HTMLElement} container - DOM mount target
 * @param {object} store - ReactiveStore instance
 * @param {object} [options={}] - Callbacks & configuration
 * @returns {object} Controller with { close, getState, nextStep, prevStep }
 */
export function renderOnboardingModal(container, store, options = {}) {
  const { onComplete, onCancel } = options;

  let currentStep = 1;
  let isSubmitting = false;
  let errorMessage = '';
  let successState = false;
  let validationErrors = {};
  let showPasswords = false;
  let showPins = false;

  // Local component form model initialized from defaults or store venue
  let formData = {
    ...DEFAULT_ONBOARDING_STATE,
    staffRoster: JSON.parse(JSON.stringify(DEFAULT_ONBOARDING_STATE.staffRoster))
  };

  // If store venue already has partial data, inherit it
  if (store?.venue?.name) {
    formData.restaurantName = store.venue.name;
    formData.tagline = store.venue.tagline || formData.tagline;
    formData.address = store.venue.address || formData.address;
    formData.upiId = store.venue.upi_id || formData.upiId;
    formData.gstRate = String((store.venue.gst_rate || 0.05) * 100);
    formData.serviceChargeRate = String((store.venue.service_charge_rate || 0.07) * 100);
  }

  // Helper: validate specific step
  function validateCurrentStep(step) {
    const errors = {};

    if (step === 1) {
      if (!formData.restaurantName || formData.restaurantName.trim().length < 3) {
        errors.restaurantName = 'Restaurant display name must be at least 3 characters.';
      }
      if (!formData.restaurantId || formData.restaurantId.trim().length < 3) {
        errors.restaurantId = 'Restaurant ID must be at least 3 characters (e.g. REST-BLR-001).';
      }
      if (!formData.address || formData.address.trim().length < 5) {
        errors.address = 'Physical address must be at least 5 characters.';
      }
      if (!formData.upiId || !/^[\w.\-_]+@[\w.\-_]+$/.test(formData.upiId.trim())) {
        errors.upiId = 'Valid UPI VPA ID required (e.g. name@bank).';
      }
      const gst = parseFloat(formData.gstRate);
      if (isNaN(gst) || gst < 0 || gst > 35) {
        errors.gstRate = 'GST / Tax rate must be between 0% and 35%.';
      }
      const sc = parseFloat(formData.serviceChargeRate);
      if (isNaN(sc) || sc < 0 || sc > 30) {
        errors.serviceChargeRate = 'Service charge must be between 0% and 30%.';
      }
    }

    if (step === 2) {
      if (!formData.adminName || formData.adminName.trim().length < 2) {
        errors.adminName = 'Administrator full name is required.';
      }
      if (!formData.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail.trim())) {
        errors.adminEmail = 'Valid administrator email address is required.';
      }
      if (!formData.adminPassword || formData.adminPassword.length < 6) {
        errors.adminPassword = 'Cloud password must be at least 6 characters.';
      }
      if (formData.adminPassword !== formData.adminConfirmPassword) {
        errors.adminConfirmPassword = 'Passwords do not match.';
      }
      if (!formData.adminPin || !/^\d{4,6}$/.test(formData.adminPin.trim())) {
        errors.adminPin = 'Master Admin PIN must be exactly 4 to 6 numeric digits.';
      }
      if (formData.adminPin !== formData.adminConfirmPin) {
        errors.adminConfirmPin = 'Admin PINs do not match.';
      }
    }

    if (step === 3) {
      if (!Array.isArray(formData.staffRoster) || formData.staffRoster.length === 0) {
        errors.staffRoster = 'At least one staff member is required in the initial roster.';
      } else {
        const pinSet = new Set();
        // Check collision with Admin PIN
        const adminPinClean = (formData.adminPin || '').trim();

        formData.staffRoster.forEach((staff, idx) => {
          if (!staff.name || staff.name.trim().length < 2) {
            errors[`staff_${idx}_name`] = 'Staff name required.';
          }
          if (!staff.pin || !/^\d{4,6}$/.test(String(staff.pin).trim())) {
            errors[`staff_${idx}_pin`] = 'PIN must be 4 to 6 digits.';
          } else {
            const cleanPin = String(staff.pin).trim();
            if (cleanPin === adminPinClean) {
              errors[`staff_${idx}_pin`] = 'Staff PIN cannot be identical to Master Admin PIN.';
            } else if (pinSet.has(cleanPin)) {
              errors[`staff_${idx}_pin`] = 'Duplicate PIN. Each staff member must have a distinct PIN.';
            }
            pinSet.add(cleanPin);
          }
        });
      }
    }

    if (step === 4) {
      if (!formData.terminalName || formData.terminalName.trim().length < 2) {
        errors.terminalName = 'Terminal hardware name is required.';
      }
      if (!formData.terminalSin || !/^SIN-[A-Z0-9-]+$/i.test(formData.terminalSin.trim())) {
        errors.terminalSin = 'Terminal SIN code must follow the format SIN-POS-01.';
      }
      if (!formData.terminalType) {
        errors.terminalType = 'Please select a terminal station type.';
      }
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  // Submission handler
  async function handleCompleteSetup() {
    // Re-verify all steps
    for (let s = 1; s <= 4; s++) {
      if (!validateCurrentStep(s)) {
        currentStep = s;
        errorMessage = 'Please correct the highlighted validation errors before finalizing setup.';
        render();
        return;
      }
    }

    isSubmitting = true;
    errorMessage = '';
    render();

    try {
      const gstDecimal = parseFloat(formData.gstRate) / 100;
      const scDecimal = parseFloat(formData.serviceChargeRate || 0) / 100;

      const cleanName = unescapeHtml(formData.restaurantName).trim();
      const cleanTagline = unescapeHtml(formData.tagline).trim();
      const cleanAddress = unescapeHtml(formData.address).trim();
      const cleanAdminName = unescapeHtml(formData.adminName).trim();

      const onboardingPayload = {
        merchantName: cleanName,
        restaurantId: formData.restaurantId.trim().toUpperCase(),
        outletName: cleanName,
        upiId: formData.upiId.trim(),
        gstRate: gstDecimal,
        serviceChargeRate: scDecimal,
        adminUser: {
          name: cleanAdminName,
          email: formData.adminEmail.trim(),
          password: formData.adminPassword,
          pin: formData.adminPin.trim()
        },
        staffList: formData.staffRoster.map(s => ({
          name: unescapeHtml(s.name).trim(),
          role: s.role,
          pin: String(s.pin).trim()
        })),
        initialTerminal: formData.autoPairDevice ? {
          sin: formData.terminalSin.trim().toUpperCase(),
          terminalName: unescapeHtml(formData.terminalName).trim(),
          terminalType: formData.terminalType
        } : null
      };

      // Also persist address & tagline to venue
      if (store && store.venue) {
        store.venue.tagline = cleanTagline;
        store.venue.address = cleanAddress;
        store.venue.currency = formData.currency;
      }

      const success = await store.completeOnboarding(onboardingPayload);

      if (!success) {
        throw new Error('Onboarding failed during local storage or cloud registration.');
      }

      // If auto-login as Admin is selected, switch to Master Admin
      if (formData.autoLoginAdmin) {
        await store.loginWithPIN(formData.adminPin.trim());
      }

      successState = true;
      isSubmitting = false;
      try {
        localStorage.setItem('ays_setup_completed', 'true');
        localStorage.setItem('ays_onboarded', 'true');
      } catch {}
      if (store) store.onboarded = true;
      render();

      if (typeof onComplete === 'function') {
        onComplete(onboardingPayload);
      }
    } catch (err) {
      console.error('Onboarding execution error:', err);
      isSubmitting = false;
      errorMessage = err.message || 'An unexpected error occurred during onboarding.';
      render();
    }
  }

  function render() {
    if (!container) return;

    if (successState) {
      container.innerHTML = `
        <div id="modal-onboarding-wizard" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fadeIn">
          <div class="relative w-full max-w-lg bg-[#0d0d12] border border-emerald-500/30 rounded-3xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.95),0_0_50px_rgba(16,185,129,0.15)] text-center space-y-6">
            
            <div class="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.35)] animate-bounce">
              <span class="w-8 h-8 flex items-center justify-center">${ICONS.check}</span>
            </div>

            <div class="space-y-2">
              <h2 class="text-xl font-bold text-zinc-100 tracking-tight flex items-center justify-center gap-2">
                <span>Setup Complete & Hardware Paired!</span>
              </h2>
              <p class="text-xs text-zinc-400">
                <span class="text-emerald-400 font-semibold">${formData.restaurantName}</span> has been initialized. Master Admin credentials, offline staff cache, and terminal hardware binding are active.
              </p>
            </div>

            <div class="p-4 rounded-2xl bg-[#14141c] border border-white/[0.08] text-left space-y-2.5 text-xs font-mono">
              <div class="flex items-center justify-between text-zinc-400">
                <span>Merchant / Outlet ID:</span>
                <span class="text-zinc-200 font-semibold">${formData.restaurantId}</span>
              </div>
              <div class="flex items-center justify-between text-zinc-400">
                <span>Primary Terminal SIN:</span>
                <span class="text-amber-400 font-bold">${formData.terminalSin} (${formData.terminalType})</span>
              </div>
              <div class="flex items-center justify-between text-zinc-400">
                <span>Active Staff Session:</span>
                <span class="text-emerald-400 font-semibold">${formData.adminName} (Admin)</span>
              </div>
              <div class="flex items-center justify-between text-zinc-400">
                <span>Offline Staff Cached:</span>
                <span class="text-zinc-200">${formData.staffRoster.length + 1} members</span>
              </div>
            </div>

            <button id="btn-onboarding-finish" class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-zinc-950 font-bold text-sm tracking-wide shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition-all">
              Launch POS Terminal & Floorplan →
            </button>
          </div>
        </div>
      `;

      container.querySelector('#btn-onboarding-finish')?.addEventListener('click', () => {
        closeModal();
      });
      return;
    }

    container.innerHTML = `
      <div id="modal-onboarding-wizard" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl overflow-y-auto">
        <div class="relative w-full max-w-3xl bg-[#0b0b10] border border-white/[0.08] rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.9),0_0_50px_rgba(245,158,11,0.06)] overflow-hidden flex flex-col my-auto max-h-[92vh]">
          
          <!-- Top Accent Glow Line -->
          <div class="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500"></div>

          <!-- Modal Header -->
          <header class="px-6 py-5 border-b border-white/[0.08] bg-[#0f0f16]/90 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center space-x-3.5">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-zinc-950 flex items-center justify-center font-bold text-lg shadow-[0_0_20px_rgba(245,158,11,0.35)] ring-1 ring-white/20 select-none">
                A
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h1 class="text-sm font-bold text-zinc-100 tracking-tight">AtYourScan Hospitality OS</h1>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">First-Run Wizard</span>
                </div>
                <p class="text-xs text-zinc-400">Centralized Cloud POS Authentication & Hardware Pairing</p>
              </div>
            </div>

            <!-- Quick Auto-Fill Demo Preset Button -->
            <div class="flex items-center gap-2">
              <button id="btn-quick-fill-presets" class="text-[11px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all" title="Pre-fill standard restaurant configuration">
                <span class="w-3.5 h-3.5">${ICONS.sparkles}</span>
                <span>Auto-Fill Defaults</span>
              </button>
              ${onCancel ? `
                <button id="btn-close-onboarding" class="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all" title="Cancel Setup">
                  <span class="w-4 h-4">${ICONS.x}</span>
                </button>
              ` : ''}
            </div>
          </header>

          <!-- 4-Step Interactive Progress Rail -->
          <div class="px-6 pt-4 pb-2 border-b border-white/[0.06] bg-[#0e0e14]/60">
            <div class="grid grid-cols-4 gap-2">
              
              <!-- Step 1: Venue -->
              <button data-nav-step="1" class="text-left group transition-all">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                    currentStep === 1 
                      ? 'bg-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                      : currentStep > 1 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                        : 'bg-zinc-800 text-zinc-500 border border-white/5'
                  }">
                    ${currentStep > 1 ? ICONS.check : '1'}
                  </span>
                  <div class="hidden sm:block leading-none">
                    <span class="text-[11px] font-semibold ${currentStep === 1 ? 'text-amber-300' : currentStep > 1 ? 'text-emerald-400' : 'text-zinc-500'}">Venue</span>
                    <span class="block text-[9px] text-zinc-500 font-mono mt-0.5">Outlet Info</span>
                  </div>
                </div>
                <div class="h-1 w-full rounded-full mt-2.5 transition-all ${currentStep === 1 ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : currentStep > 1 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
              </button>

              <!-- Step 2: Admin -->
              <button data-nav-step="2" class="text-left group transition-all">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                    currentStep === 2 
                      ? 'bg-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                      : currentStep > 2 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                        : 'bg-zinc-800 text-zinc-500 border border-white/5'
                  }">
                    ${currentStep > 2 ? ICONS.check : '2'}
                  </span>
                  <div class="hidden sm:block leading-none">
                    <span class="text-[11px] font-semibold ${currentStep === 2 ? 'text-amber-300' : currentStep > 2 ? 'text-emerald-400' : 'text-zinc-500'}">Admin</span>
                    <span class="block text-[9px] text-zinc-500 font-mono mt-0.5">Master Pin</span>
                  </div>
                </div>
                <div class="h-1 w-full rounded-full mt-2.5 transition-all ${currentStep === 2 ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : currentStep > 2 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
              </button>

              <!-- Step 3: Roster -->
              <button data-nav-step="3" class="text-left group transition-all">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                    currentStep === 3 
                      ? 'bg-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                      : currentStep > 3 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                        : 'bg-zinc-800 text-zinc-500 border border-white/5'
                  }">
                    ${currentStep > 3 ? ICONS.check : '3'}
                  </span>
                  <div class="hidden sm:block leading-none">
                    <span class="text-[11px] font-semibold ${currentStep === 3 ? 'text-amber-300' : currentStep > 3 ? 'text-emerald-400' : 'text-zinc-500'}">Roster</span>
                    <span class="block text-[9px] text-zinc-500 font-mono mt-0.5">Quick Staff</span>
                  </div>
                </div>
                <div class="h-1 w-full rounded-full mt-2.5 transition-all ${currentStep === 3 ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : currentStep > 3 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
              </button>

              <!-- Step 4: Terminal -->
              <button data-nav-step="4" class="text-left group transition-all">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                    currentStep === 4 
                      ? 'bg-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
                      : 'bg-zinc-800 text-zinc-500 border border-white/5'
                  }">
                    4
                  </span>
                  <div class="hidden sm:block leading-none">
                    <span class="text-[11px] font-semibold ${currentStep === 4 ? 'text-amber-300' : 'text-zinc-500'}">Hardware</span>
                    <span class="block text-[9px] text-zinc-500 font-mono mt-0.5">SIN Pairing</span>
                  </div>
                </div>
                <div class="h-1 w-full rounded-full mt-2.5 transition-all ${currentStep === 4 ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-zinc-800'}"></div>
              </button>

            </div>
          </div>

          <!-- Wizard Body: Scrollable Form View -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            
            <!-- Global Error Banner -->
            ${errorMessage ? `
              <div class="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-3 text-xs animate-shake">
                <span class="w-4 h-4 text-red-400 flex-shrink-0">${ICONS.alert}</span>
                <span>${errorMessage}</span>
              </div>
            ` : ''}

            <!-- ================= STEP 1: VENUE SETUP ================= -->
            ${currentStep === 1 ? `
              <div class="space-y-4 animate-fadeIn">
                <div class="border-b border-white/[0.06] pb-3">
                  <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span class="w-4 h-4 text-amber-400">${ICONS.store}</span>
                    <span>Step 1: Merchant & Hospitality Venue Configuration</span>
                  </h2>
                  <p class="text-xs text-zinc-400 mt-0.5">Register outlet identity, unique restaurant identifier, tax percentages, and instant UPI billing VPA.</p>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <!-- Restaurant Name -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Restaurant Display Name *</label>
                    <input 
                      type="text" 
                      id="input-venue-name" 
                      value="${escapeHtml(formData.restaurantName)}" 
                      placeholder="e.g. First Way Cafe"
                      class="w-full bg-[#111116] border ${validationErrors.restaurantName ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-sans"
                    />
                    ${validationErrors.restaurantName ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.restaurantName}</p>` : ''}
                  </div>

                  <!-- Restaurant ID -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">
                      Unique Restaurant ID (Merchant SIN) *
                      <span class="text-[10px] text-zinc-500 font-mono">(For pairing)</span>
                    </label>
                    <input 
                      type="text" 
                      id="input-restaurant-id" 
                      value="${escapeHtml(formData.restaurantId)}" 
                      placeholder="e.g. REST-BLR-001"
                      class="w-full bg-[#111116] border ${validationErrors.restaurantId ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono uppercase placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.restaurantId ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.restaurantId}</p>` : ''}
                  </div>

                  <!-- Tagline -->
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Concept Tagline / Guest Subtitle</label>
                    <input 
                      type="text" 
                      id="input-venue-tagline" 
                      value="${escapeHtml(formData.tagline)}" 
                      placeholder="e.g. Artisanal Dining • Craft Brews • Woodfired Fare"
                      class="w-full bg-[#111116] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                  </div>

                  <!-- Address -->
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Physical Outlet Address *</label>
                    <input 
                      type="text" 
                      id="input-venue-address" 
                      value="${escapeHtml(formData.address)}" 
                      placeholder="e.g. Indiranagar 12th Main, Bengaluru"
                      class="w-full bg-[#111116] border ${validationErrors.address ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.address ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.address}</p>` : ''}
                  </div>

                  <!-- UPI ID -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">
                      Merchant UPI VPA ID * 
                      <span class="text-[10px] text-emerald-400 font-mono">(Instant Dine-In Pay)</span>
                    </label>
                    <input 
                      type="text" 
                      id="input-venue-upi" 
                      value="${escapeHtml(formData.upiId)}" 
                      placeholder="e.g. vanshwaghre-1@okicici"
                      class="w-full bg-[#111116] border ${validationErrors.upiId ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.upiId ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.upiId}</p>` : ''}
                  </div>

                  <!-- Currency -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Operating Currency</label>
                    <select 
                      id="input-venue-currency"
                      class="w-full bg-[#111116] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                    >
                      ${CURRENCIES.map(c => `
                        <option value="${c.code}" ${formData.currency === c.code ? 'selected' : ''}>${c.label}</option>
                      `).join('')}
                    </select>
                  </div>

                  <!-- GST Rate -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">GST / Sales Tax Rate (%) *</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0" 
                      max="35"
                      id="input-venue-gst" 
                      value="${formData.gstRate}" 
                      placeholder="5.0"
                      class="w-full bg-[#111116] border ${validationErrors.gstRate ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.gstRate ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.gstRate}</p>` : ''}
                  </div>

                  <!-- Service Charge -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Discretionary Service Charge (%)</label>
                    <input 
                      type="number" 
                      step="0.1" 
                      min="0" 
                      max="30"
                      id="input-venue-service" 
                      value="${formData.serviceChargeRate}" 
                      placeholder="7.0"
                      class="w-full bg-[#111116] border ${validationErrors.serviceChargeRate ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.serviceChargeRate ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.serviceChargeRate}</p>` : ''}
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- ================= STEP 2: MASTER ADMIN ================= -->
            ${currentStep === 2 ? `
              <div class="space-y-4 animate-fadeIn">
                <div class="border-b border-white/[0.06] pb-3">
                  <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span class="w-4 h-4 text-amber-400">${ICONS.shield}</span>
                    <span>Step 2: Master Administrator Credentials</span>
                  </h2>
                  <p class="text-xs text-zinc-400 mt-0.5">Establish the root authority account for cloud single sign-on (SSO), terminal hardware unpairing, and high-risk POS operations.</p>
                </div>

                <div class="p-3.5 rounded-2xl bg-[#14141d] border border-amber-500/20 text-xs text-zinc-300 flex items-start gap-3">
                  <span class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5">${ICONS.key}</span>
                  <div>
                    <span class="font-semibold text-amber-300">Master Admin Privilege Scope:</span>
                    <span class="text-zinc-400 ml-1">Holds wildcard permission (<code class="text-emerald-400 font-mono">*</code>), screen unlock override, and permission to bind or unpair physical terminal SINs.</span>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <!-- Admin Name -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Master Administrator Full Name *</label>
                    <input 
                      type="text" 
                      id="input-admin-name" 
                      value="${escapeHtml(formData.adminName)}" 
                      placeholder="e.g. Dev Anand"
                      class="w-full bg-[#111116] border ${validationErrors.adminName ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.adminName ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminName}</p>` : ''}
                  </div>

                  <!-- Admin Email -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Cloud Single Sign-On (SSO) Email *</label>
                    <input 
                      type="email" 
                      id="input-admin-email" 
                      value="${escapeHtml(formData.adminEmail)}" 
                      placeholder="admin@copperoak.com"
                      class="w-full bg-[#111116] border ${validationErrors.adminEmail ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                    />
                    ${validationErrors.adminEmail ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminEmail}</p>` : ''}
                  </div>

                  <!-- Cloud Password -->
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-xs font-medium text-zinc-300">Cloud Web Portal Password *</label>
                      <button type="button" id="btn-toggle-passwords" class="text-[10px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1">
                        <span class="w-3 h-3">${showPasswords ? ICONS.eyeOff : ICONS.eye}</span>
                        <span>${showPasswords ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <input 
                      type="${showPasswords ? 'text' : 'password'}" 
                      id="input-admin-password" 
                      value="${escapeHtml(formData.adminPassword)}" 
                      placeholder="Min 6 characters"
                      class="w-full bg-[#111116] border ${validationErrors.adminPassword ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.adminPassword ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminPassword}</p>` : ''}
                  </div>

                  <!-- Confirm Password -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Confirm Portal Password *</label>
                    <input 
                      type="${showPasswords ? 'text' : 'password'}" 
                      id="input-admin-confirm-password" 
                      value="${escapeHtml(formData.adminConfirmPassword)}" 
                      placeholder="Re-enter password"
                      class="w-full bg-[#111116] border ${validationErrors.adminConfirmPassword ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 font-mono placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                    ${validationErrors.adminConfirmPassword ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminConfirmPassword}</p>` : ''}
                  </div>

                  <!-- Master Quick PIN -->
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-xs font-medium text-zinc-300">
                        Master Quick PIN (4–6 Digits) *
                        <span class="text-[10px] text-amber-400 font-mono">(Keypad Unlock)</span>
                      </label>
                      <button type="button" id="btn-toggle-pins" class="text-[10px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1">
                        <span class="w-3 h-3">${showPins ? ICONS.eyeOff : ICONS.eye}</span>
                        <span>${showPins ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>
                    <input 
                      type="${showPins ? 'text' : 'password'}" 
                      id="input-admin-pin" 
                      maxlength="6"
                      value="${escapeHtml(formData.adminPin)}" 
                      placeholder="e.g. 1234 or 9999"
                      class="w-full bg-[#111116] border ${validationErrors.adminPin ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono tracking-widest placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-center sm:text-left"
                    />
                    ${validationErrors.adminPin ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminPin}</p>` : ''}
                  </div>

                  <!-- Confirm Admin PIN -->
                  <div>
                    <label class="block text-xs font-medium text-zinc-300 mb-1.5">Confirm Master Quick PIN *</label>
                    <input 
                      type="${showPins ? 'text' : 'password'}" 
                      id="input-admin-confirm-pin" 
                      maxlength="6"
                      value="${escapeHtml(formData.adminConfirmPin)}" 
                      placeholder="Re-enter 4–6 digit PIN"
                      class="w-full bg-[#111116] border ${validationErrors.adminConfirmPin ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-amber-300 font-mono tracking-widest placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all text-center sm:text-left"
                    />
                    ${validationErrors.adminConfirmPin ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.adminConfirmPin}</p>` : ''}
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- ================= STEP 3: STAFF ROSTER ================= -->
            ${currentStep === 3 ? `
              <div class="space-y-4 animate-fadeIn">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <div>
                    <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <span class="w-4 h-4 text-amber-400">${ICONS.users}</span>
                      <span>Step 3: Initial Hospitality Staff Roster</span>
                    </h2>
                    <p class="text-xs text-zinc-400 mt-0.5">Assign cashier, server, and bartender accounts with instant 4–6 digit PINs for fast terminal counter switching.</p>
                  </div>

                  <button type="button" id="btn-add-staff-member" class="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-all">
                    <span class="w-3.5 h-3.5">${ICONS.plus}</span>
                    <span>Add Member</span>
                  </button>
                </div>

                ${validationErrors.staffRoster ? `
                  <p class="text-xs text-red-400 font-mono">${validationErrors.staffRoster}</p>
                ` : ''}

                <!-- Roster Cards Container -->
                <div class="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  ${formData.staffRoster.map((staff, idx) => {
                    const roleColor = 
                      staff.role === ROLES.MANAGER ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                      staff.role === ROLES.CASHIER ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                      staff.role === ROLES.BARTENDER ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
                      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

                    return `
                      <div class="p-3.5 rounded-2xl bg-[#121218] border border-white/[0.06] flex flex-wrap items-center gap-3 group hover:border-white/15 transition-all" data-staff-index="${idx}">
                        
                        <!-- Role Selector -->
                        <div class="w-32 flex-shrink-0">
                          <label class="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Role</label>
                          <select 
                            data-staff-role="${idx}"
                            class="w-full bg-[#161620] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-semibold ${roleColor} focus:border-amber-500 focus:ring-0"
                          >
                            <option value="${ROLES.CASHIER}" ${staff.role === ROLES.CASHIER ? 'selected' : ''}>Cashier</option>
                            <option value="${ROLES.SERVER}" ${staff.role === ROLES.SERVER ? 'selected' : ''}>Server</option>
                            <option value="${ROLES.BARTENDER}" ${staff.role === ROLES.BARTENDER ? 'selected' : ''}>Bartender</option>
                            <option value="${ROLES.MANAGER}" ${staff.role === ROLES.MANAGER ? 'selected' : ''}>Manager</option>
                          </select>
                        </div>

                        <!-- Staff Name -->
                        <div class="flex-1 min-w-[140px]">
                          <label class="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Staff Member Name *</label>
                          <input 
                            type="text" 
                            data-staff-name="${idx}"
                            value="${escapeHtml(staff.name)}" 
                            placeholder="Full Name"
                            class="w-full bg-[#161620] border ${validationErrors[`staff_${idx}_name`] ? 'border-red-500' : 'border-white/10'} rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-0"
                          />
                          ${validationErrors[`staff_${idx}_name`] ? `<p class="text-[9px] text-red-400 font-mono mt-0.5">${validationErrors[`staff_${idx}_name`]}</p>` : ''}
                        </div>

                        <!-- Quick PIN -->
                        <div class="w-28 flex-shrink-0">
                          <label class="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Quick PIN *</label>
                          <input 
                            type="password" 
                            maxlength="6"
                            data-staff-pin="${idx}"
                            value="${escapeHtml(staff.pin)}" 
                            placeholder="4-6 Digits"
                            class="w-full bg-[#161620] border ${validationErrors[`staff_${idx}_pin`] ? 'border-red-500' : 'border-white/10'} rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-mono tracking-widest text-center focus:border-amber-500 focus:ring-0"
                          />
                          ${validationErrors[`staff_${idx}_pin`] ? `<p class="text-[9px] text-red-400 font-mono mt-0.5">${validationErrors[`staff_${idx}_pin`]}</p>` : ''}
                        </div>

                        <!-- Delete Member Button -->
                        <div class="pt-4 flex-shrink-0">
                          <button 
                            type="button" 
                            data-delete-staff="${idx}" 
                            title="Remove staff member"
                            class="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all ${formData.staffRoster.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}"
                            ${formData.staffRoster.length <= 1 ? 'disabled' : ''}
                          >
                            <span class="w-4 h-4">${ICONS.trash}</span>
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- ================= STEP 4: HARDWARE SETUP ================= -->
            ${currentStep === 4 ? `
              <div class="space-y-4 animate-fadeIn">
                <div class="border-b border-white/[0.06] pb-3">
                  <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span class="w-4 h-4 text-amber-400">${ICONS.terminal}</span>
                    <span>Step 4: Primary Billing Terminal Hardware Registration</span>
                  </h2>
                  <p class="text-xs text-zinc-400 mt-0.5">Bind this physical device to Restaurant ID & Terminal SIN code for zero-latency offline boot auto-recognition.</p>
                </div>

                <!-- Terminal Hardware Preview Card -->
                <div class="p-5 rounded-2xl bg-gradient-to-br from-[#12121a] to-[#181824] border border-amber-500/30 shadow-xl space-y-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <div class="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center font-mono font-bold">
                        <span class="w-5 h-5">${ICONS.terminal}</span>
                      </div>
                      <div>
                        <span class="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">Terminal Hardware Binding</span>
                        <h3 class="text-sm font-bold text-zinc-100">${formData.restaurantName}</h3>
                      </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>READY TO PAIR</span>
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <!-- Terminal Name -->
                    <div>
                      <label class="block text-xs font-medium text-zinc-300 mb-1.5">Terminal Hardware Name *</label>
                      <input 
                        type="text" 
                        id="input-terminal-name" 
                        value="${escapeHtml(formData.terminalName)}" 
                        placeholder="e.g. Front Billing Counter POS #1"
                        class="w-full bg-[#0c0c12] border ${validationErrors.terminalName ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      />
                      ${validationErrors.terminalName ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.terminalName}</p>` : ''}
                    </div>

                    <!-- Terminal SIN Code -->
                    <div>
                      <label class="block text-xs font-medium text-zinc-300 mb-1.5">
                        Terminal Hardware SIN Code *
                        <span class="text-[10px] text-zinc-500 font-mono">(Format: SIN-POS-01)</span>
                      </label>
                      <input 
                        type="text" 
                        id="input-terminal-sin" 
                        value="${escapeHtml(formData.terminalSin)}" 
                        placeholder="e.g. SIN-POS-01"
                        class="w-full bg-[#0c0c12] border ${validationErrors.terminalSin ? 'border-red-500' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-xs text-amber-400 font-mono uppercase font-bold placeholder-zinc-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      />
                      ${validationErrors.terminalSin ? `<p class="text-[10px] text-red-400 font-mono mt-1">${validationErrors.terminalSin}</p>` : ''}
                    </div>

                    <!-- Station Type -->
                    <div class="sm:col-span-2">
                      <label class="block text-xs font-medium text-zinc-300 mb-1.5">Station Role & Functional Type</label>
                      <select 
                        id="input-terminal-type"
                        class="w-full bg-[#0c0c12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                      >
                        ${STATION_TYPES.map(st => `
                          <option value="${st.id}" ${formData.terminalType === st.id ? 'selected' : ''}>${st.label}</option>
                        `).join('')}
                      </select>
                    </div>
                  </div>

                  <!-- Pairing Options Toggles -->
                  <div class="space-y-2 pt-2 border-t border-white/[0.08]">
                    <label class="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-200 select-none">
                      <input 
                        type="checkbox" 
                        id="check-auto-pair" 
                        ${formData.autoPairDevice ? 'checked' : ''}
                        class="w-4 h-4 rounded bg-zinc-900 border-white/20 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                      />
                      <span>Pair this device immediately as the primary billing terminal on completion</span>
                    </label>

                    <label class="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-200 select-none">
                      <input 
                        type="checkbox" 
                        id="check-auto-login" 
                        ${formData.autoLoginAdmin ? 'checked' : ''}
                        class="w-4 h-4 rounded bg-zinc-900 border-white/20 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                      />
                      <span>Automatically log into terminal as Master Admin <strong class="text-amber-300">(${escapeHtml(formData.adminName)})</strong></span>
                    </label>
                  </div>
                </div>

                <!-- Pre-flight Summary Card -->
                <div class="p-4 rounded-2xl bg-[#111118] border border-white/[0.06] space-y-2 text-xs">
                  <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">Pre-Flight Provisioning Summary</span>
                  <div class="grid grid-cols-2 gap-2 text-zinc-300 font-mono text-[11px]">
                    <div>Venue: <span class="text-zinc-100 font-semibold">${formData.restaurantName}</span></div>
                    <div>Merchant ID: <span class="text-amber-300 font-semibold">${formData.restaurantId}</span></div>
                    <div>Root Admin: <span class="text-zinc-100 font-semibold">${formData.adminName}</span></div>
                    <div>Staff Roster: <span class="text-emerald-400 font-semibold">${formData.staffRoster.length} staff members</span></div>
                  </div>
                </div>
              </div>
            ` : ''}

          </div>

          <!-- Wizard Footer Controls -->
          <footer class="px-6 py-4 border-t border-white/[0.08] bg-[#0d0d14]/90 flex items-center justify-between gap-3">
            <div>
              ${currentStep > 1 ? `
                <button type="button" id="btn-wizard-prev" class="px-4 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-white/10 flex items-center gap-1.5 active:scale-95 transition-all">
                  <span class="w-3.5 h-3.5">${ICONS.arrowLeft}</span>
                  <span>Previous</span>
                </button>
              ` : `
                <span class="text-[11px] font-mono text-zinc-500">Step 1 of 4: Venue Setup</span>
              `}
            </div>

            <div class="flex items-center gap-2">
              ${currentStep < 4 ? `
                <button type="button" id="btn-wizard-next" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.35)] active:scale-95 transition-all">
                  <span>Continue</span>
                  <span class="w-3.5 h-3.5">${ICONS.arrowRight}</span>
                </button>
              ` : `
                <button type="button" id="btn-wizard-finish" ${isSubmitting ? 'disabled' : ''} class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition-all ${isSubmitting ? 'opacity-60 cursor-wait' : ''}">
                  ${isSubmitting ? `
                    <span class="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin"></span>
                    <span>Pairing & Initializing...</span>
                  ` : `
                    <span class="w-4 h-4">${ICONS.zap}</span>
                    <span>Complete Onboarding & Pair Terminal</span>
                  `}
                </button>
              `}
            </div>
          </footer>

        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Step navigation buttons in header progress rail
    container.querySelectorAll('[data-nav-step]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetStep = parseInt(e.currentTarget.dataset.navStep, 10);
        // Can only jump backwards, or jump forwards if intermediate steps are valid
        if (targetStep < currentStep) {
          syncCurrentStepInputs();
          currentStep = targetStep;
          errorMessage = '';
          validationErrors = {};
          render();
        } else if (targetStep > currentStep) {
          syncCurrentStepInputs();
          if (validateCurrentStep(currentStep)) {
            currentStep = targetStep;
            errorMessage = '';
            validationErrors = {};
            render();
          } else {
            render();
          }
        }
      });
    });

    // Preset Demo Auto-fill button
    container.querySelector('#btn-quick-fill-presets')?.addEventListener('click', () => {
      formData = {
        ...DEFAULT_ONBOARDING_STATE,
        staffRoster: JSON.parse(JSON.stringify(DEFAULT_ONBOARDING_STATE.staffRoster))
      };
      validationErrors = {};
      errorMessage = '';
      render();
    });

    // Close button
    container.querySelector('#btn-close-onboarding')?.addEventListener('click', () => {
      try {
        localStorage.setItem('ays_setup_completed', 'true');
        localStorage.setItem('ays_onboarded', 'true');
      } catch {}
      if (store) store.onboarded = true;
      closeModal();
      if (typeof onCancel === 'function') onCancel();
    });

    // Wizard Previous button
    container.querySelector('#btn-wizard-prev')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      if (currentStep > 1) {
        currentStep--;
        errorMessage = '';
        validationErrors = {};
        render();
      }
    });

    // Wizard Next button
    container.querySelector('#btn-wizard-next')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      if (validateCurrentStep(currentStep)) {
        currentStep++;
        errorMessage = '';
        validationErrors = {};
        render();
      } else {
        errorMessage = 'Please fix the highlighted errors before continuing.';
        render();
      }
    });

    // Wizard Finish button
    container.querySelector('#btn-wizard-finish')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      handleCompleteSetup();
    });

    // Toggle password visibility
    container.querySelector('#btn-toggle-passwords')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      showPasswords = !showPasswords;
      render();
    });

    // Toggle PIN visibility
    container.querySelector('#btn-toggle-pins')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      showPins = !showPins;
      render();
    });

    // Add Staff Member button (Step 3)
    container.querySelector('#btn-add-staff-member')?.addEventListener('click', () => {
      syncCurrentStepInputs();
      const newIndex = formData.staffRoster.length + 1;
      formData.staffRoster.push({
        id: `staff-member-${Date.now()}`,
        role: ROLES.SERVER,
        name: `Staff Member #${newIndex}`,
        pin: `${Math.floor(1000 + Math.random() * 9000)}`
      });
      render();
    });

    // Delete Staff Member button (Step 3)
    container.querySelectorAll('[data-delete-staff]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        syncCurrentStepInputs();
        const idx = parseInt(e.currentTarget.dataset.deleteStaff, 10);
        if (formData.staffRoster.length > 1) {
          formData.staffRoster.splice(idx, 1);
          render();
        }
      });
    });
  }

  // Synchronize DOM inputs with local component model
  function syncCurrentStepInputs() {
    if (currentStep === 1) {
      const nameInput = container.querySelector('#input-venue-name');
      const restIdInput = container.querySelector('#input-restaurant-id');
      const taglineInput = container.querySelector('#input-venue-tagline');
      const addressInput = container.querySelector('#input-venue-address');
      const upiInput = container.querySelector('#input-venue-upi');
      const currencyInput = container.querySelector('#input-venue-currency');
      const gstInput = container.querySelector('#input-venue-gst');
      const serviceInput = container.querySelector('#input-venue-service');

      if (nameInput && nameInput.value !== undefined) formData.restaurantName = unescapeHtml(nameInput.value);
      if (restIdInput && restIdInput.value !== undefined) formData.restaurantId = unescapeHtml(restIdInput.value);
      if (taglineInput && taglineInput.value !== undefined) formData.tagline = unescapeHtml(taglineInput.value);
      if (addressInput && addressInput.value !== undefined) formData.address = unescapeHtml(addressInput.value);
      if (upiInput && upiInput.value !== undefined) formData.upiId = unescapeHtml(upiInput.value);
      if (currencyInput && currencyInput.value && currencyInput.value.trim()) formData.currency = currencyInput.value.trim();
      if (gstInput && gstInput.value !== undefined) formData.gstRate = gstInput.value;
      if (serviceInput && serviceInput.value !== undefined) formData.serviceChargeRate = serviceInput.value;
    }

    if (currentStep === 2) {
      const adminNameInput = container.querySelector('#input-admin-name');
      const adminEmailInput = container.querySelector('#input-admin-email');
      const adminPassInput = container.querySelector('#input-admin-password');
      const adminConfPassInput = container.querySelector('#input-admin-confirm-password');
      const adminPinInput = container.querySelector('#input-admin-pin');
      const adminConfPinInput = container.querySelector('#input-admin-confirm-pin');

      if (adminNameInput && adminNameInput.value !== undefined) formData.adminName = unescapeHtml(adminNameInput.value);
      if (adminEmailInput && adminEmailInput.value !== undefined) formData.adminEmail = unescapeHtml(adminEmailInput.value);
      if (adminPassInput && adminPassInput.value !== undefined) formData.adminPassword = adminPassInput.value;
      if (adminConfPassInput && adminConfPassInput.value !== undefined) formData.adminConfirmPassword = adminConfPassInput.value;
      if (adminPinInput && adminPinInput.value !== undefined) formData.adminPin = adminPinInput.value;
      if (adminConfPinInput && adminConfPinInput.value !== undefined) formData.adminConfirmPin = adminConfPinInput.value;
    }

    if (currentStep === 3) {
      formData.staffRoster.forEach((staff, idx) => {
        const roleEl = container.querySelector(`[data-staff-role="${idx}"]`);
        const nameEl = container.querySelector(`[data-staff-name="${idx}"]`);
        const pinEl = container.querySelector(`[data-staff-pin="${idx}"]`);

        if (roleEl && roleEl.value && roleEl.value.trim()) staff.role = roleEl.value.trim();
        if (nameEl && nameEl.value !== undefined) staff.name = unescapeHtml(nameEl.value);
        if (pinEl && pinEl.value !== undefined) staff.pin = pinEl.value;
      });
    }

    if (currentStep === 4) {
      const termNameInput = container.querySelector('#input-terminal-name');
      const termSinInput = container.querySelector('#input-terminal-sin');
      const termTypeInput = container.querySelector('#input-terminal-type');
      const autoPairInput = container.querySelector('#check-auto-pair');
      const autoLoginInput = container.querySelector('#check-auto-login');

      if (termNameInput && termNameInput.value !== undefined) formData.terminalName = unescapeHtml(termNameInput.value);
      if (termSinInput && termSinInput.value !== undefined) formData.terminalSin = unescapeHtml(termSinInput.value);
      if (termTypeInput && termTypeInput.value && termTypeInput.value.trim()) formData.terminalType = termTypeInput.value.trim();
      if (autoPairInput && typeof autoPairInput.checked === 'boolean') formData.autoPairDevice = autoPairInput.checked;
      if (autoLoginInput && typeof autoLoginInput.checked === 'boolean') formData.autoLoginAdmin = autoLoginInput.checked;
    }
  }

  function closeModal() {
    if (container) {
      const modalEl = container.querySelector('#modal-onboarding-wizard');
      if (modalEl) modalEl.remove();
      else container.innerHTML = '';
    }
  }

  // Initial render
  render();

  return {
    close: closeModal,
    getState: () => ({ ...formData, currentStep }),
    nextStep: () => {
      syncCurrentStepInputs();
      if (validateCurrentStep(currentStep) && currentStep < 4) {
        currentStep++;
        render();
      }
    },
    prevStep: () => {
      syncCurrentStepInputs();
      if (currentStep > 1) {
        currentStep--;
        render();
      }
    }
  };
}

/**
 * Open the onboarding modal in document modal layer or body overlay
 * @param {object} store - ReactiveStore instance
 * @param {object} [options={}] - Callbacks
 * @returns {object} Controller { close, element, getState }
 */
export function openOnboardingModal(store, options = {}) {
  if (typeof document === 'undefined') return { close: () => {} };

  const hasActiveVenue = Boolean(store?.venue?.id || store?.venue?.name || (store?.cafes && store.cafes.length > 0));
  let isExplicitlyCompleted = false;
  try {
    isExplicitlyCompleted = localStorage.getItem('ays_setup_completed') === 'true';
  } catch {}

  if (!options?.force && (hasActiveVenue || isExplicitlyCompleted)) {
    // Suppress First-Run Wizard
    return { close: () => {} };
  }

  let modalMount = document.getElementById('app-modal-layer');
  let createdMount = false;

  if (!modalMount) {
    modalMount = document.createElement('div');
    modalMount.id = 'app-modal-layer';
    document.body.appendChild(modalMount);
    createdMount = true;
  }

  const controller = renderOnboardingModal(modalMount, store, {
    ...options,
    onComplete: (data) => {
      controller.close();
      if (createdMount && modalMount.parentNode) {
        modalMount.remove();
      }
      if (typeof options.onComplete === 'function') {
        options.onComplete(data);
      }
    },
    onCancel: () => {
      controller.close();
      if (createdMount && modalMount.parentNode) {
        modalMount.remove();
      }
      if (typeof options.onCancel === 'function') {
        options.onCancel();
      }
    }
  });

  return controller;
}

// Helper: HTML Escaping
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: HTML Unescaping (guards against entity accumulation in mock test harnesses)
export function unescapeHtml(str) {
  if (str === null || str === undefined) return '';
  let res = String(str);
  while (res.includes('&amp;') || res.includes('&lt;') || res.includes('&gt;') || res.includes('&quot;') || res.includes('&#39;')) {
    const next = res
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (next === res) break;
    res = next;
  }
  return res;
}

export default renderOnboardingModal;

