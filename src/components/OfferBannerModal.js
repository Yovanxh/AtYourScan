/**
 * OfferBannerModal.js
 * 
 * Interactive Manager Offer Banner Builder, Scheduler & Manager.
 * Empowers managers to author, style, schedule (time period / expiry),
 * display/hide, and delete promotional offer banners in real-time.
 */

import { requestManagerOverride } from './ManagerOverrideModal.js';

export const THEME_GRADIENTS = [
  { id: 'orange', name: 'Warm Orange', class: 'from-[#FF7622] to-[#FFA14A]', color: '#FF7622' },
  { id: 'navy', name: 'Midnight Navy', class: 'from-[#181C2E] to-[#2D3450]', color: '#181C2E' },
  { id: 'emerald', name: 'Botanical Emerald', class: 'from-[#059C6A] to-[#10B981]', color: '#059C6A' },
  { id: 'crimson', name: 'Berry Crimson', class: 'from-[#FF334B] to-[#FF6B8B]', color: '#FF334B' },
  { id: 'sunset', name: 'Golden Sunset', class: 'from-[#FF9F1C] to-[#FFBF69]', color: '#FF9F1C' },
  { id: 'violet', name: 'Royal Violet', class: 'from-[#6C5CE7] to-[#A29BFE]', color: '#6C5CE7' }
];

export const SUGGESTED_BADGES = [
  '20% OFF',
  'BUY 1 GET 1',
  'FLAT ₹150 OFF',
  'HAPPY HOUR',
  'CHEF SPECIAL',
  'FREE DESSERT',
  'WEEKEND DEAL'
];

export const SUGGESTED_ICONS = ['🏷️', '☕', '🍕', '🍸', '🍰', '🍔', '🎉', '⚡', '🔥'];

export function renderOfferBannerModal(container, store, options = {}) {
  const {
    bannerToEdit = null,
    onSuccess = null,
    onCancel = null
  } = options;

  let activeModalTab = bannerToEdit ? 'form' : ((store.offerBanners && store.offerBanners.length > 0) ? 'list' : 'form');
  let editingBanner = bannerToEdit ? { ...bannerToEdit } : null;

  let title = editingBanner?.title || '';
  let subtitle = editingBanner?.subtitle || '';
  let badgeText = editingBanner?.badge_text || '20% OFF';
  let couponCode = editingBanner?.coupon_code || 'SPECIAL20';
  let discountType = editingBanner?.discount_type || 'percentage';
  let discountValue = editingBanner?.discount_value || (editingBanner?.discount_percent ?? 20);
  let minOrderAmount = editingBanner?.min_order_amount ?? 300;
  let validUntil = editingBanner?.valid_until ? editingBanner.valid_until.slice(0, 16) : '';
  let isActive = editingBanner?.is_active !== undefined ? editingBanner.is_active : true;
  let bgGradient = editingBanner?.bg_gradient || THEME_GRADIENTS[0].class;
  let icon = editingBanner?.icon || '🏷️';
  let errorMessage = '';
  let successNotice = '';
  let isSaving = false;

  function setEditing(banner) {
    editingBanner = banner ? { ...banner } : null;
    title = editingBanner?.title || '';
    subtitle = editingBanner?.subtitle || '';
    badgeText = editingBanner?.badge_text || '20% OFF';
    couponCode = editingBanner?.coupon_code || 'SPECIAL20';
    discountType = editingBanner?.discount_type || 'percentage';
    discountValue = editingBanner?.discount_value || (editingBanner?.discount_percent ?? 20);
    minOrderAmount = editingBanner?.min_order_amount ?? 300;
    validUntil = editingBanner?.valid_until ? editingBanner.valid_until.slice(0, 16) : '';
    isActive = editingBanner?.is_active !== undefined ? editingBanner.is_active : true;
    bgGradient = editingBanner?.bg_gradient || THEME_GRADIENTS[0].class;
    icon = editingBanner?.icon || '🏷️';
    activeModalTab = 'form';
    errorMessage = '';
    render();
  }

  function render() {
    const allBanners = store.getOfferBanners ? store.getOfferBanners() : (store.offerBanners || []);
    const activeBanners = store.getActiveOfferBanners ? store.getActiveOfferBanners() : allBanners.filter(b => b.is_active);
    const expiredBanners = allBanners.filter(b => store.isOfferExpired ? store.isOfferExpired(b) : false);

    container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181C2E]/70 backdrop-blur-md animate-fadeIn overflow-y-auto">
        <div class="relative w-full max-w-xl bg-white border border-slate-100 rounded-[32px] shadow-2xl overflow-hidden flex flex-col font-sans text-[#181C2E] my-8 animate-in fade-in zoom-in-95 duration-200">
          
          <!-- Modal Header -->
          <div class="px-6 py-5 border-b border-slate-100 bg-white flex items-center justify-between sticky top-0 z-10">
            <div class="flex items-center space-x-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                🏷️
              </div>
              <div>
                <h2 class="text-base font-black tracking-tight text-[#181C2E]">
                  Promotional Offer Banner Manager
                </h2>
                <p class="text-xs text-[#646982]">
                  Customize, schedule, hide, or delete cafe promotions.
                </p>
              </div>
            </div>
            <button id="offer-modal-close" class="w-8 h-8 rounded-full bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982] hover:text-[#181C2E] flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Top Navigation Tabs (List vs Create/Edit) -->
          <div class="flex items-center justify-between px-6 py-2.5 bg-[#F0F5FA] border-b border-slate-100 text-xs font-bold">
            <div class="flex items-center gap-2">
              <button 
                id="tab-btn-modal-list"
                class="px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeModalTab === 'list' 
                    ? 'bg-white text-[#181C2E] shadow-xs' 
                    : 'text-[#646982] hover:text-[#181C2E]'
                }"
              >
                📋 All Offers (${allBanners.length})
              </button>
              <button 
                id="tab-btn-modal-form"
                class="px-4 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeModalTab === 'form' 
                    ? 'bg-white text-[#181C2E] shadow-xs' 
                    : 'text-[#646982] hover:text-[#181C2E]'
                }"
              >
                ${editingBanner ? '✏️ Edit Offer' : '＋ Create New Offer'}
              </button>
            </div>

            ${expiredBanners.length > 0 ? `
              <button 
                id="btn-purge-expired-offers" 
                class="text-[11px] font-bold text-[#FF334B] bg-[#FFF0F2] hover:bg-[#FFE5E8] border border-rose-200 px-3 py-1 rounded-xl transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                title="Delete all expired offers whose time period has ended"
              >
                <span>🗑️</span>
                <span>Delete Expired (${expiredBanners.length})</span>
              </button>
            ` : ''}
          </div>

          <!-- Feedback Messages -->
          ${errorMessage ? `
            <div class="mx-6 mt-4 p-3.5 rounded-2xl bg-[#FFF0F2] border border-rose-200 text-[#FF334B] text-xs font-bold flex items-center justify-between">
              <span class="flex items-center gap-2">
                <span>⚠️</span>
                <span>${errorMessage}</span>
              </span>
              <button id="dismiss-error-msg" class="text-current opacity-70 hover:opacity-100">✕</button>
            </div>
          ` : ''}

          ${successNotice ? `
            <div class="mx-6 mt-4 p-3.5 rounded-2xl bg-[#EBF7F2] border border-emerald-200 text-[#059C6A] text-xs font-bold flex items-center justify-between">
              <span class="flex items-center gap-2">
                <span>✅</span>
                <span>${successNotice}</span>
              </span>
              <button id="dismiss-success-msg" class="text-current opacity-70 hover:opacity-100">✕</button>
            </div>
          ` : ''}

          <!-- TAB 1: ALL OFFERS LIST -->
          ${activeModalTab === 'list' ? `
            <div class="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              ${allBanners.length === 0 ? `
                <div class="p-10 text-center space-y-3 bg-[#F7F8F9] rounded-3xl border border-dashed border-slate-200">
                  <div class="text-3xl">🏷️</div>
                  <h4 class="text-sm font-bold text-[#181C2E]">No Offer Banners Created</h4>
                  <p class="text-xs text-[#646982] max-w-xs mx-auto">Create a customized banner to display under the cafe name on the guest menu.</p>
                  <button 
                    id="btn-list-create-new" 
                    class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>＋</span>
                    <span>Create Offer Banner</span>
                  </button>
                </div>
              ` : `
                <div class="space-y-3">
                  ${allBanners.map(banner => {
                    const isExpired = store.isOfferExpired ? store.isOfferExpired(banner) : false;
                    const isLive = banner.is_active && !isExpired;

                    return `
                      <div class="p-4 rounded-3xl border ${isLive ? 'border-[#FF7622]/30 bg-white shadow-xs' : 'border-slate-200 bg-[#F7F8F9]'} space-y-3 transition-all">
                        <!-- Mini Preview Banner -->
                        <div class="p-3 rounded-2xl bg-gradient-to-r ${banner.bg_gradient || 'from-[#FF7622] to-[#FFA14A]'} text-white flex items-start justify-between gap-2 shadow-xs">
                          <div class="space-y-0.5 min-w-0">
                            <div class="flex items-center gap-1.5">
                              <span>${banner.icon || '🏷️'}</span>
                              <span class="bg-white/20 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.2 rounded-full border border-white/30">
                                ${banner.badge_text || 'OFFER'}
                              </span>
                            </div>
                            <h4 class="text-xs font-black truncate">${banner.title}</h4>
                            ${banner.subtitle ? `<p class="text-[10px] text-white/90 truncate">${banner.subtitle}</p>` : ''}
                          </div>

                          ${banner.coupon_code ? `
                            <span class="bg-white text-[#181C2E] text-[10px] font-black font-mono px-2 py-0.5 rounded-lg shadow-xs flex-shrink-0">
                              ${banner.coupon_code}
                            </span>
                          ` : ''}
                        </div>

                        <!-- Status & Controls Bar -->
                        <div class="flex items-center justify-between text-xs pt-1">
                          <!-- Status pill -->
                          <div>
                            ${isExpired ? `
                              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF334B] border border-rose-200 flex items-center gap-1">
                                <span>⏳</span>
                                <span>Period Ended (Hidden)</span>
                              </span>
                            ` : banner.is_active ? `
                              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#EBF7F2] text-[#059C6A] border border-emerald-200 flex items-center gap-1">
                                <span class="w-2 h-2 rounded-full bg-[#059C6A] animate-pulse"></span>
                                <span>Live on Guest Menu</span>
                              </span>
                            ` : `
                              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-200 text-[#646982] flex items-center gap-1">
                                <span>⚪</span>
                                <span>Don't Display (Hidden)</span>
                              </span>
                            `}
                          </div>

                          <!-- Action Buttons (Toggle, Edit, Delete) -->
                          <div class="flex items-center gap-1.5">
                            <!-- Display/Hide Toggle -->
                            <button 
                              data-list-toggle="${banner.id}"
                              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                banner.is_active 
                                  ? 'bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982]' 
                                  : 'bg-[#EBF7F2] hover:bg-[#D4EFE4] text-[#059C6A]'
                              }"
                              title="${banner.is_active ? 'Click to hide offer from guest menu' : 'Click to display offer on guest menu'}"
                            >
                              <span>${banner.is_active ? 'Hide' : 'Display'}</span>
                            </button>

                            <!-- Edit -->
                            <button 
                              data-list-edit="${banner.id}"
                              class="px-3 py-1.5 rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="Edit this offer"
                            >
                              <span>✏️</span>
                              <span>Edit</span>
                            </button>

                            <!-- Delete Button (Prominent Red) -->
                            <button 
                              data-list-delete="${banner.id}"
                              class="px-3 py-1.5 rounded-xl bg-[#FFF0F2] hover:bg-[#FFE5E8] text-[#FF334B] border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Permanently delete this offer"
                            >
                              <span>🗑️</span>
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          ` : `

          <!-- TAB 2: CREATE / EDIT OFFER FORM -->
          <div class="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
            
            <!-- Live Customer Dine-In Preview -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-[11px] font-bold text-[#646982] uppercase tracking-wider">
                  Live Preview (Customer Dine-In View)
                </label>
                <span class="text-[10px] font-bold text-[#059C6A] bg-[#EBF7F2] px-2 py-0.5 rounded-full">
                  ● Real-Time
                </span>
              </div>

              <!-- Preview Card Under Cafe Name Mockup -->
              <div class="p-4 rounded-2xl bg-[#F7F8F9] border border-[#E3E8ED]">
                <div class="text-[10px] text-[#A0A5BA] font-semibold mb-2 flex items-center gap-1.5">
                  <span>🏪</span>
                  <span>Under Cafe Name: <strong>${store.venue?.name || 'Your Cafe'}</strong></span>
                </div>

                <div class="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-r ${bgGradient} text-white shadow-md transition-all">
                  <div class="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none"></div>
                  <div class="absolute right-8 -top-6 w-16 h-16 rounded-full bg-white/10 pointer-events-none"></div>

                  <div class="relative z-10 flex items-start justify-between gap-3">
                    <div class="space-y-1 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="text-base">${icon}</span>
                        <span class="bg-white/20 backdrop-blur-xs text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-white/30">
                          ${badgeText || 'SPECIAL OFFER'}
                        </span>
                        ${minOrderAmount > 0 ? `
                          <span class="text-[10px] text-white/80 font-medium">Above ₹${minOrderAmount}</span>
                        ` : ''}
                      </div>

                      <h3 class="text-sm font-black tracking-tight leading-snug">
                        ${title || 'Enter your promotion headline here...'}
                      </h3>

                      <p class="text-[11px] text-white/90 line-clamp-2 leading-relaxed">
                        ${subtitle || 'Add appetizing details, applicable items, or happy hour timings.'}
                      </p>
                    </div>

                    ${couponCode ? `
                      <div class="bg-white text-[#181C2E] rounded-xl px-2.5 py-1.5 shadow-sm text-center select-none flex-shrink-0">
                        <span class="text-[8px] font-bold text-[#646982] uppercase tracking-wider block">COUPON</span>
                        <span class="text-xs font-black tracking-wider text-[#FF7622] font-mono">${couponCode}</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>

            <!-- Form Fields -->
            <div class="space-y-4">
              <!-- Offer Title -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Offer Headline / Title <span class="text-[#FF7622]">*</span>
                </label>
                <input 
                  type="text" 
                  id="offer-title-input" 
                  value="${title}"
                  placeholder="e.g. Flat 25% OFF on Woodfired Pizzas" 
                  class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-3 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all font-medium"
                />
              </div>

              <!-- Offer Subtitle / Terms -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Offer Description / Terms
                </label>
                <textarea 
                  id="offer-subtitle-input" 
                  rows="2"
                  placeholder="e.g. Valid on all artisanal Neapolitan pizzas & pasta bowls after 6 PM" 
                  class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all font-medium resize-none"
                >${subtitle}</textarea>
              </div>

              <!-- Badge Tag & Quick Suggestions -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Promo Badge Tag <span class="text-[#FF7622]">*</span>
                </label>
                <input 
                  type="text" 
                  id="offer-badge-input" 
                  value="${badgeText}"
                  placeholder="e.g. 25% OFF, BUY 1 GET 1" 
                  class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] font-bold focus:outline-none transition-all uppercase"
                />
                <!-- Quick Badge Chips -->
                <div class="flex items-center gap-1.5 flex-wrap mt-2">
                  ${SUGGESTED_BADGES.map(b => `
                    <button 
                      type="button" 
                      data-badge-chip="${b}"
                      class="px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                        badgeText === b ? 'bg-[#FF7622] text-white' : 'bg-[#F0F5FA] text-[#646982] hover:bg-[#E4ECF4]'
                      }"
                    >
                      ${b}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Time Period / Expiry Date Schedule -->
              <div class="p-3.5 rounded-2xl bg-[#F0F5FA] border border-slate-100 space-y-2">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs font-bold text-[#181C2E] block">Offer Time Period / Expiry</span>
                    <span class="text-[11px] text-[#646982]">When the period ends, this offer is automatically hidden from guests.</span>
                  </div>
                  ${validUntil ? `
                    <button 
                      type="button" 
                      id="btn-clear-expiry" 
                      class="text-[10px] text-[#FF334B] hover:underline font-bold"
                    >
                      Clear Expiry
                    </button>
                  ` : ''}
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label class="block text-[10px] font-bold text-[#646982] uppercase mb-1">Valid Until (Date & Time)</label>
                    <input 
                      type="datetime-local" 
                      id="offer-valid-until-input" 
                      value="${validUntil}"
                      class="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#181C2E] font-medium focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-[#646982] uppercase mb-1">Quick Presets</label>
                    <div class="flex items-center gap-1 flex-wrap">
                      <button type="button" data-expiry-preset="today" class="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-[#181C2E]">Tonight</button>
                      <button type="button" data-expiry-preset="tomorrow" class="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-[#181C2E]">Tomorrow</button>
                      <button type="button" data-expiry-preset="week" class="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-[#181C2E]">7 Days</button>
                      <button type="button" data-expiry-preset="none" class="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold text-[#646982]">No Expiry</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Coupon Code & Minimum Order -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                    Coupon Code
                  </label>
                  <input 
                    type="text" 
                    id="offer-code-input" 
                    value="${couponCode}"
                    placeholder="e.g. PIZZA25" 
                    class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] font-mono font-bold uppercase focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                    Min. Order Amount (₹)
                  </label>
                  <input 
                    type="number" 
                    id="offer-min-order-input" 
                    value="${minOrderAmount}"
                    min="0"
                    placeholder="0" 
                    class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] font-medium focus:outline-none transition-all"
                  />
                </div>
              </div>

              <!-- Discount Value & Type -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                    Discount Type
                  </label>
                  <div class="grid grid-cols-2 gap-1.5 bg-[#F0F5FA] p-1 rounded-2xl">
                    <button 
                      type="button" 
                      id="btn-discount-pct" 
                      class="py-1.5 text-center text-xs font-bold rounded-xl transition-all ${
                        discountType === 'percentage' ? 'bg-white text-[#181C2E] shadow-xs' : 'text-[#646982]'
                      }"
                    >
                      % Percent
                    </button>
                    <button 
                      type="button" 
                      id="btn-discount-flat" 
                      class="py-1.5 text-center text-xs font-bold rounded-xl transition-all ${
                        discountType === 'flat' ? 'bg-white text-[#181C2E] shadow-xs' : 'text-[#646982]'
                      }"
                    >
                      ₹ Flat Off
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                    Discount Value (${discountType === 'percentage' ? '%' : '₹'})
                  </label>
                  <input 
                    type="number" 
                    id="offer-discount-value-input" 
                    value="${discountValue}"
                    min="0"
                    max="${discountType === 'percentage' ? 100 : 9999}"
                    class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] font-bold focus:outline-none transition-all"
                  />
                </div>
              </div>

              <!-- Theme Gradient Selection -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-2">
                  Banner Color Theme
                </label>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  ${THEME_GRADIENTS.map(t => `
                    <button 
                      type="button" 
                      data-theme-grad="${t.class}"
                      class="p-2 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all ${
                        bgGradient === t.class ? 'border-[#FF7622] scale-105 shadow-sm' : 'border-transparent hover:border-slate-200'
                      }"
                    >
                      <div class="w-full h-7 rounded-xl bg-gradient-to-r ${t.class}"></div>
                      <span class="text-[9px] font-bold text-[#646982] truncate max-w-full">${t.name}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Icon Selection -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-2">
                  Banner Emoji Icon
                </label>
                <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  ${SUGGESTED_ICONS.map(ic => `
                    <button 
                      type="button" 
                      data-icon-chip="${ic}"
                      class="w-9 h-9 rounded-2xl flex items-center justify-center text-lg transition-all ${
                        icon === ic ? 'bg-[#FFEBE4] border-2 border-[#FF7622] scale-110 shadow-xs' : 'bg-[#F0F5FA] border border-transparent hover:bg-[#E4ECF4]'
                      }"
                    >
                      ${ic}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Active Status Switch: Display on Guest Menu vs Don't Display -->
              <div class="p-3.5 rounded-2xl bg-[#F0F5FA] flex items-center justify-between">
                <div>
                  <span class="text-xs font-bold text-[#181C2E] block">Display on Guest Menu</span>
                  <span class="text-[11px] text-[#646982]">
                    ${isActive 
                      ? '🟢 Currently LIVE on the guest dine-in menu.' 
                      : '⚪ HIDDEN. Turn on when ready to display to guests.'}
                  </span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="offer-active-toggle" ${isActive ? 'checked' : ''} class="sr-only peer">
                  <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#059C6A]"></div>
                </label>
              </div>
            </div>
          </div>
          `}

          <!-- Modal Footer Actions -->
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            ${activeModalTab === 'form' && editingBanner ? `
              <!-- Red Delete Button for Editing Banner -->
              <button 
                id="btn-modal-delete-current-offer" 
                class="px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#FFF0F2] hover:bg-[#FFE5E8] text-[#FF334B] border border-rose-200 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Permanently delete this promotional offer banner"
              >
                <span>🗑️</span>
                <span>Delete Offer</span>
              </button>
            ` : `
              <button 
                id="offer-cancel-btn" 
                class="px-5 py-2.5 rounded-2xl text-xs font-bold text-[#646982] hover:text-[#181C2E] hover:bg-slate-200/50 transition-colors cursor-pointer"
              >
                Close
              </button>
            `}

            <div class="flex items-center gap-2">
              ${activeModalTab === 'form' && editingBanner ? `
                <button 
                  id="offer-cancel-btn" 
                  class="px-4 py-2.5 rounded-2xl text-xs font-bold text-[#646982] hover:text-[#181C2E] hover:bg-slate-200/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              ` : ''}

              ${activeModalTab === 'form' ? `
                <button 
                  id="offer-save-btn" 
                  ${isSaving ? 'disabled' : ''}
                  class="px-6 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white active:scale-95 transition-all shadow-md shadow-[#FF7622]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>${isSaving ? 'Saving...' : '💾'}</span>
                  <span>${editingBanner ? 'Update Offer Banner' : 'Publish Offer Banner'}</span>
                </button>
              ` : `
                <button 
                  id="btn-list-create-new-footer" 
                  class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white active:scale-95 transition-all shadow-md shadow-[#FF7622]/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>＋</span>
                  <span>Add New Offer</span>
                </button>
              `}
            </div>
          </div>

        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Dismissal
    container.querySelector('#offer-modal-close')?.addEventListener('click', handleCancel);
    container.querySelector('#offer-cancel-btn')?.addEventListener('click', handleCancel);
    container.querySelector('#dismiss-error-msg')?.addEventListener('click', () => { errorMessage = ''; render(); });
    container.querySelector('#dismiss-success-msg')?.addEventListener('click', () => { successNotice = ''; render(); });

    // Tab Navigation
    container.querySelector('#tab-btn-modal-list')?.addEventListener('click', () => {
      activeModalTab = 'list';
      errorMessage = '';
      successNotice = '';
      render();
    });

    container.querySelector('#tab-btn-modal-form')?.addEventListener('click', () => {
      activeModalTab = 'form';
      errorMessage = '';
      render();
    });

    container.querySelector('#btn-list-create-new')?.addEventListener('click', () => {
      setEditing(null);
    });

    container.querySelector('#btn-list-create-new-footer')?.addEventListener('click', () => {
      setEditing(null);
    });

    // Clean up expired offers in bulk
    container.querySelector('#btn-purge-expired-offers')?.addEventListener('click', () => {
      if (confirm('Delete all offer banners whose time period has ended?')) {
        const res = store.deleteExpiredOffers ? store.deleteExpiredOffers() : { success: true, count: 0 };
        successNotice = `Purged ${res.count} expired offer(s).`;
        render();
      }
    });

    // List Item Controls: Toggle, Edit, Delete
    container.querySelectorAll('[data-list-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.listToggle;
        const res = store.toggleOfferBanner(id);
        if (res && res.success) {
          successNotice = `Offer banner is now ${res.is_active ? 'displayed on guest menu' : 'hidden from guests'}.`;
          render();
        }
      });
    });

    container.querySelectorAll('[data-list-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.listEdit;
        const banner = store.offerBanners?.find(b => b.id === id);
        if (banner) setEditing(banner);
      });
    });

    container.querySelectorAll('[data-list-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.listDelete;
        const banner = store.offerBanners?.find(b => b.id === id);
        const name = banner?.title || 'Offer';
        if (confirm(`Are you sure you want to permanently delete the offer "${name}"?`)) {
          store.deleteOfferBanner(id);
          successNotice = `Offer "${name}" deleted successfully.`;
          render();
        }
      });
    });

    // Form inputs and live preview update handlers
    const titleInput = container.querySelector('#offer-title-input');
    titleInput?.addEventListener('input', (e) => {
      title = e.target.value;
      updateLivePreview();
    });

    const subInput = container.querySelector('#offer-subtitle-input');
    subInput?.addEventListener('input', (e) => {
      subtitle = e.target.value;
      updateLivePreview();
    });

    const badgeInput = container.querySelector('#offer-badge-input');
    badgeInput?.addEventListener('input', (e) => {
      badgeText = e.target.value;
      updateLivePreview();
    });

    const codeInput = container.querySelector('#offer-code-input');
    codeInput?.addEventListener('input', (e) => {
      couponCode = e.target.value.toUpperCase();
      updateLivePreview();
    });

    const minOrderInput = container.querySelector('#offer-min-order-input');
    minOrderInput?.addEventListener('input', (e) => {
      minOrderAmount = Number(e.target.value) || 0;
      updateLivePreview();
    });

    // Expiry input & presets
    const expiryInput = container.querySelector('#offer-valid-until-input');
    expiryInput?.addEventListener('input', (e) => {
      validUntil = e.target.value;
    });

    container.querySelector('#btn-clear-expiry')?.addEventListener('click', () => {
      validUntil = '';
      if (expiryInput) expiryInput.value = '';
      render();
    });

    container.querySelectorAll('[data-expiry-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.expiryPreset;
        const now = new Date();
        if (preset === 'today') {
          const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
          validUntil = endOfToday.toISOString().slice(0, 16);
        } else if (preset === 'tomorrow') {
          const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 0);
          validUntil = endOfTomorrow.toISOString().slice(0, 16);
        } else if (preset === 'week') {
          const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          validUntil = inAWeek.toISOString().slice(0, 16);
        } else {
          validUntil = '';
        }
        if (expiryInput) expiryInput.value = validUntil;
        render();
      });
    });

    // Discount type toggles
    container.querySelector('#btn-discount-pct')?.addEventListener('click', () => {
      discountType = 'percentage';
      render();
    });
    container.querySelector('#btn-discount-flat')?.addEventListener('click', () => {
      discountType = 'flat';
      render();
    });

    const discountValInput = container.querySelector('#offer-discount-value-input');
    discountValInput?.addEventListener('input', (e) => {
      discountValue = Number(e.target.value) || 0;
      updateLivePreview();
    });

    // Badge chips
    container.querySelectorAll('[data-badge-chip]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        badgeText = e.currentTarget.dataset.badgeChip;
        if (badgeInput) badgeInput.value = badgeText;
        updateLivePreview();
        container.querySelectorAll('[data-badge-chip]').forEach(c => {
          c.className = c.dataset.badgeChip === badgeText 
            ? 'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all bg-[#FF7622] text-white' 
            : 'px-2.5 py-1 rounded-full text-[10px] font-bold transition-all bg-[#F0F5FA] text-[#646982] hover:bg-[#E4ECF4]';
        });
      });
    });

    // Gradient chips
    container.querySelectorAll('[data-theme-grad]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        bgGradient = e.currentTarget.dataset.themeGrad;
        render();
      });
    });

    // Icon chips
    container.querySelectorAll('[data-icon-chip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        icon = e.currentTarget.dataset.iconChip;
        render();
      });
    });

    // Active toggle
    container.querySelector('#offer-active-toggle')?.addEventListener('change', (e) => {
      isActive = e.target.checked;
    });

    // Delete current editing banner from footer
    container.querySelector('#btn-modal-delete-current-offer')?.addEventListener('click', () => {
      if (!editingBanner || !editingBanner.id) return;
      const bannerName = editingBanner.title || 'Offer';
      if (confirm(`Are you sure you want to permanently delete the offer "${bannerName}"?`)) {
        store.deleteOfferBanner(editingBanner.id);
        successNotice = `Offer "${bannerName}" was permanently deleted.`;
        setEditing(null);
        activeModalTab = 'list';
        render();
      }
    });

    // Save submission
    container.querySelector('#offer-save-btn')?.addEventListener('click', handleSave);
  }

  function updateLivePreview() {
    const previewContainer = container.querySelector('.relative.z-10');
    if (!previewContainer) return;

    const titleEl = previewContainer.querySelector('h3');
    if (titleEl) titleEl.textContent = title || 'Enter your promotion headline here...';

    const subEl = previewContainer.querySelector('p');
    if (subEl) subEl.textContent = subtitle || 'Add appetizing details, applicable items, or happy hour timings.';

    const badgeEl = previewContainer.querySelector('.bg-white\\/20');
    if (badgeEl) badgeEl.textContent = badgeText || 'SPECIAL OFFER';

    const codeSpan = previewContainer.querySelector('.font-mono');
    if (codeSpan) codeSpan.textContent = couponCode || '';
  }

  async function handleSave() {
    if (!title.trim()) {
      errorMessage = 'Please provide a clear promotion headline / title.';
      render();
      return;
    }

    if (!badgeText.trim()) {
      errorMessage = 'Please specify a promo badge tag (e.g. 20% OFF).';
      render();
      return;
    }

    // Role verification: check if current staff is authorized (Manager or Admin)
    const currentStaff = store.currentStaff;
    if (currentStaff && !store.canManageOffers(currentStaff)) {
      isSaving = true;
      render();

      requestManagerOverride(store, {
        reason: 'Manager elevation required to customize promotional offer banners',
        requiredPermission: 'CAN_MUTATE_CATALOG',
        onApproved: (approver) => {
          isSaving = false;
          executeCommit();
        },
        onDenied: () => {
          isSaving = false;
          errorMessage = '403 Forbidden: Manager PIN verification required to manage offer banners.';
          render();
        }
      });
      return;
    }

    executeCommit();
  }

  function executeCommit() {
    isSaving = true;
    render();

    const bannerData = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      badge_text: badgeText.trim().toUpperCase(),
      coupon_code: couponCode.trim().toUpperCase().replace(/\s+/g, ''),
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      discount_percent: discountType === 'percentage' ? Number(discountValue) || 0 : 0,
      min_order_amount: Number(minOrderAmount) || 0,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      is_active: isActive,
      bg_gradient: bgGradient,
      text_color: '#FFFFFF',
      icon: icon
    };

    let result;
    if (editingBanner && editingBanner.id) {
      result = store.updateOfferBanner(editingBanner.id, bannerData);
    } else {
      result = store.addOfferBanner(bannerData);
    }

    if (result && result.success) {
      store.playSound?.('success');
      successNotice = `Offer banner "${result.banner.title}" saved successfully!`;
      isSaving = false;
      activeModalTab = 'list';
      editingBanner = null;
      render();
      if (typeof onSuccess === 'function') onSuccess(result.banner);
    } else {
      isSaving = false;
      errorMessage = result?.error || 'Failed to persist offer banner.';
      render();
    }
  }

  function handleCancel() {
    container.innerHTML = '';
    if (typeof onCancel === 'function') onCancel();
  }

  render();
}
