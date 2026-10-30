/**
 * Customer Dine-In View (Mobile-First Responsive Interface)
 * Implements guest QR ordering, dietary filters, customizer, cart, live UPI checkout & status tracking.
 */

import { generateQRCodeSVG } from '../qrGenerator.js';
import { buildUPIDeepLink, generateUPIDeepLink, isMobileDevice } from '../utils/payment.js';

export function renderCustomerView(container, store, options = {}) {
  const optionsObj = (typeof options === 'number') ? { tableNumber: options } : (options || {});
  let activeCategory = 'All';
  let searchQuery = '';
  let dietaryFilter = 'all'; // 'all' | 'veg' | 'non-veg'
  let customizerItem = null;
  let isCartOpen = false;
  let splitCount = 1;
  let activeTab = 'menu'; // 'menu' | 'track' | 'receipt'
  let showUPIModal = false;
  let lastPlacedOrder = null;
  let settledReceipt = null;
  let customInstructions = '';
  let currentOfferIndex = 0;
  let tableNumber = optionsObj.tableNumber || (store.cart && store.cart.table_number) || null;

  function render() {
    let targetTenant = null;
    const cafes = Array.isArray(store.cafes) ? store.cafes : [];
    const tenants = Array.isArray(store.tenants) ? store.tenants : [];
    // Combine all available cafe sources
    const allCafes = [...cafes, ...tenants];
    let urlCafe = null;

    if (typeof window !== 'undefined' && window.location) {
      // 1. Path & Query Parameter Extraction
      const p = new URLSearchParams(window.location.search);
      urlCafe = p.get('cafe') || p.get('cafe_id') || p.get('cafeId') || p.get('venue');

      if (!urlCafe) {
        const pathVenueMatch = window.location.pathname.match(/\/v\/([^\/]+)/);
        if (pathVenueMatch) {
          urlCafe = decodeURIComponent(pathVenueMatch[1]);
        }
      }
    }

    // 2. Café/Tenant Fallback Resolution
    targetTenant = (urlCafe
      ? allCafes.find(c => c.id === urlCafe || c.slug === urlCafe || c.cafe_id === urlCafe)
      : null) ||
      allCafes.find(c => c.status === 'active') ||
      allCafes[0] ||
      store.venue;

    // Guaranteed fallback resolution so diners never get stuck
    if (!targetTenant) {
      const fallbackName = urlCafe
        ? urlCafe.replace(/^cafe-/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : 'First Way Cafe';
      targetTenant = {
        id: urlCafe || 'venue-default-01',
        cafe_id: urlCafe || 'venue-default-01',
        name: fallbackName,
        upi_id: 'vanshwaghre-1@okicici',
        status: 'active',
        currency: 'INR'
      };
    }

    // 3. Activation & Venue Check
    if (targetTenant) {
      const targetTenantId = targetTenant.id || targetTenant.cafe_id;
      const currentVenue = store.venue;
      if (targetTenantId && currentVenue?.id !== targetTenantId &&
          currentVenue?.cafe_id !== targetTenantId && currentVenue?.slug !== targetTenant.slug) {
        if (typeof store.activateCafeEnvironment === 'function') {
          store.activateCafeEnvironment(targetTenantId);
        }
      }
      if (!store.venue) {
        store.venue = targetTenant;
      }
    }

    if (store.venue && (!store.venue.upi_id || store.venue.upi_id.includes('ptaxis') || store.venue.upi_id.includes('thecopperoak'))) {
      store.venue.upi_id = 'vanshwaghre-1@okicici';
    }
    if (targetTenant && (!targetTenant.upi_id || targetTenant.upi_id.includes('ptaxis') || targetTenant.upi_id.includes('thecopperoak'))) {
      targetTenant.upi_id = 'vanshwaghre-1@okicici';
    }
    const venue = store.venue || targetTenant;
    if (venue && (!venue.upi_id || venue.upi_id.includes('ptaxis') || venue.upi_id.includes('thecopperoak'))) {
      venue.upi_id = 'vanshwaghre-1@okicici';
    }

    // Table Occupation & Menu Freeze Check
    const isTableFrozen = (typeof store.isTableOccupiedByOther === 'function') 
      ? store.isTableOccupiedByOther(tableNumber) 
      : false;
    if (!venue || (!venue.name && !venue.id)) {
      container.innerHTML = `
        <div class="customer-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col items-center justify-center font-sans p-6 text-center select-none">
          <div class="max-w-md w-full bg-white border border-[#E3E8ED] rounded-3xl p-8 shadow-sm space-y-5">
            <div class="w-16 h-16 rounded-3xl bg-[#FFF1E8] border border-[#FF7622]/30 flex items-center justify-center text-3xl mx-auto shadow-md shadow-orange-500/10">
              ☕
            </div>
            <div class="space-y-2">
              <h1 class="text-xl font-bold tracking-tight text-[#181C2E]">No Active Café Found</h1>
              <p class="text-xs text-[#646982] leading-relaxed">
                There is currently no active café provisioned for this dining portal.
                If you are a café owner or manager, register your establishment to launch your contactless digital menu and table QR ordering.
              </p>
            </div>
            <div class="pt-2 flex flex-col gap-2.5">
              <a 
                href="/signup?type=cafe" 
                class="w-full py-3 px-4 rounded-2xl bg-[#FF7622] hover:bg-[#e0651a] text-white text-xs font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🚀</span>
                <span>Register Your Café</span>
              </a>
              <a 
                href="/login" 
                class="w-full py-2.5 px-4 rounded-2xl bg-[#F0F5FA] hover:bg-[#E3E8ED] text-[#181C2E] text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>Staff & Admin Sign In</span>
              </a>
            </div>
          </div>
        </div>
      `;
      return;
    }
    
    // Strict QR Table Parameter Extraction
    tableNumber = tableNumber || store.cart?.table_number;
    if (!tableNumber && typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      if (p.has('table')) {
        const parsed = parseInt(p.get('table'), 10);
        if (!isNaN(parsed)) tableNumber = parsed;
      } else {
        const m = window.location.pathname.match(/\/t\/(\d+)/);
        if (m) {
          const parsed = parseInt(m[1], 10);
          if (!isNaN(parsed)) tableNumber = parsed;
        }
      }
    }
    if (tableNumber && store.cart) {
      if (typeof store.loadTableCart === 'function' && store.cart.table_number !== tableNumber) {
        store.loadTableCart(tableNumber);
      } else {
        store.cart.table_number = tableNumber;
      }
    }

    // IF NO TABLE QR CODE HAS BEEN SCANNED: Render tabletop QR scan gateway
    if (!tableNumber) {
      container.innerHTML = `
        <div class="customer-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none pb-12">
          
          <!-- Persistent Top Header -->
          <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E3E8ED] px-4 py-3 shadow-xs">
            <div class="max-w-md mx-auto flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-2xl bg-[#FF7622] text-white flex items-center justify-center font-bold text-lg shadow-md shadow-orange-500/25">
                  🍽️
                </div>
                <div>
                  <h1 class="text-sm font-bold tracking-tight text-[#181C2E] flex items-center gap-1.5">
                    ${venue.name}
                    <span class="w-2 h-2 rounded-full bg-[#059C6A] inline-block"></span>
                  </h1>
                  <p class="text-[11px] font-bold text-[#FF7622] uppercase tracking-wider">Dine-In QR Gateway</p>
                </div>
              </div>

            </div>
          </header>

          <main class="max-w-md mx-auto w-full px-4 pt-6 flex-1 flex flex-col items-center text-center space-y-5">
            <!-- Animated Hero QR Finder -->
            <div class="relative mt-2">
              <div class="w-24 h-24 rounded-3xl bg-[#FFF1E8] border border-[#FF7622]/30 flex items-center justify-center text-4xl shadow-lg shadow-orange-500/15">
                📱
              </div>
              <span class="absolute -top-1 -right-1 flex h-4 w-4">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059C6A] opacity-75"></span>
                <span class="relative inline-flex rounded-full h-4 w-4 bg-[#059C6A]"></span>
              </span>
            </div>

            <div class="space-y-1.5">
              <span class="text-xs font-bold text-[#FF7622] uppercase tracking-wider">Contactless Dining</span>
              <h2 class="text-xl font-bold tracking-tight text-[#181C2E]">
                Scan Tabletop QR Code
              </h2>
              <p class="text-xs text-[#646982] max-w-xs mx-auto leading-relaxed">
                Guest dine-in ordering is exclusively accessible by scanning the physical acrylic QR stand on your dining table.
              </p>
            </div>

            <!-- Table Selection -->
            <div class="w-full bg-white border border-[#E3E8ED] rounded-3xl p-5 text-left space-y-3.5 shadow-sm">
              <div class="flex items-center justify-between border-b border-[#F0F5FA] pb-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm">🏷️</span>
                  <span class="text-xs font-bold text-[#181C2E]">Select Dine-In Table</span>
                </div>
                <span class="text-[10px] font-bold text-[#FF7622] bg-[#FFF1E8] px-2.5 py-0.5 rounded-full border border-[#FF7622]/20">12 Tables Available</span>
              </div>
              <p class="text-[11px] text-[#646982] leading-normal">
                Select your seated table number to view the artisanal menu and order:
              </p>

              <!-- 12 Working Table QR Buttons -->
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                ${(store.tables || []).map(t => `
                  <button 
                    data-scan-table="${t.table_number}"
                    class="p-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#FFF1E8] border border-transparent hover:border-[#FF7622]/40 text-left transition-all active:scale-95 group cursor-pointer shadow-2xs"
                  >
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-[#181C2E] group-hover:text-[#FF7622]">T-${t.table_number}</span>
                    </div>
                    <div class="text-[9px] text-[#A0A5BA] font-medium mt-0.5 truncate">${t.zone ? t.zone.replace(/🌿|🍃|🍸/g, '').trim() : 'Table'}</div>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Helpful Guidance -->
            <div class="w-full bg-white border border-[#E3E8ED] rounded-3xl p-4 text-left space-y-2 text-xs text-[#646982] shadow-sm">
              <div class="flex items-center gap-1.5 text-[#181C2E] font-bold text-xs">
                <span>💡</span>
                <span>Hospitality Invariant:</span>
              </div>
              <ul class="space-y-1.5 list-disc list-inside text-[#646982] text-[11px]">
                <li>No app download or customer login required.</li>
                <li>Instant tabletop ordering with live kitchen sync.</li>
                <li>One-tap bill settlement via UPI Deep Link.</li>
              </ul>
            </div>
          </main>
        </div>
      `;

      // Bind simulation table buttons
      container.querySelectorAll('[data-scan-table]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tNum = parseInt(e.currentTarget.dataset.scanTable, 10);
          if (store.cart) store.cart.table_number = tNum;
          if (typeof window !== 'undefined' && window.history) {
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('table', tNum);
            newUrl.searchParams.delete('view');
            window.history.replaceState({}, '', newUrl);
          }
          render();
        });
      });

      return;
    }

    const totals = store.getCartTotals();
    const rawDishes = (store.dishes && store.dishes.length > 0) ? store.dishes : (store.menuItems || []);
    const categories = ['All', ...new Set((store.categories || []).map(c => c.name).concat(rawDishes.map(i => i.category)).filter(Boolean))];
    const currentTableObj = (store.tables || []).find(t => t.table_number === tableNumber);
    const tableZone = currentTableObj?.zone ? currentTableObj.zone.replace(/🌿|🍃|🍸/g, '').trim() : 'Indoor Courtyard';

    // Filter items
    let filteredItems = rawDishes.filter(item => {
      const matchCat = !activeCategory || activeCategory === 'all' || activeCategory === 'All' ||
        item.category_id === activeCategory ||
        item.categoryId === activeCategory ||
        item.category === activeCategory ||
        item.categoryName === activeCategory ||
        (item.categoryName && item.categoryName.toLowerCase() === activeCategory.toLowerCase()) ||
        (item.category && item.category.toLowerCase() === activeCategory.toLowerCase()) ||
        (item.category_id && store.categories?.find(c => c.id === item.category_id)?.name === activeCategory);
      const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const isVeg = item.isVeg || item.dietary_tag === 'Veg' || item.dietary === 'veg' || item.dietary === 'vegan';
      const matchDiet = dietaryFilter === 'all' 
        || (dietaryFilter === 'veg' && isVeg) 
        || (dietaryFilter === 'non-veg' && !isVeg);
      return matchCat && matchSearch && matchDiet;
    });

    // Fallback: If the filtered dishes array has length === 0 while store.dishes.length > 0, automatically fallback to displaying store.dishes so the screen is NEVER blank
    if (filteredItems.length === 0 && rawDishes.length > 0) {
      filteredItems = rawDishes;
    }

    // Check for existing active orders for this table
    const tableOrders = store.orders.filter(
      o => (o.table_number === tableNumber || o.table_id === tableNumber || String(o.table_number) === String(tableNumber) || String(o.table_id) === String(tableNumber)) 
        && o.status !== 'Completed' && o.status !== 'Cancelled' && o.status !== 'Void'
    );
    if (lastPlacedOrder && lastPlacedOrder.status !== 'Completed' && lastPlacedOrder.status !== 'Cancelled' && lastPlacedOrder.status !== 'Void') {
      if (!tableOrders.find(o => o.id === lastPlacedOrder.id)) {
        tableOrders.unshift(lastPlacedOrder);
      }
    }

    const activeOfferBanners = store.getActiveOfferBanners ? store.getActiveOfferBanners() : (store.offerBanners || []).filter(b => b.is_active);
    if (currentOfferIndex >= activeOfferBanners.length) {
      currentOfferIndex = Math.max(0, activeOfferBanners.length - 1);
    }

    container.innerHTML = `
      <div class="customer-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans pb-28 select-none">
        
        <!-- Persistent Top Header -->
        <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E3E8ED] px-4 py-3 shadow-xs">
          <div class="max-w-md mx-auto flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-2xl bg-[#FF7622] text-white flex items-center justify-center font-bold text-lg shadow-md shadow-orange-500/25">
                🍽️
              </div>
              <div>
                <h1 class="text-sm font-bold tracking-tight text-[#181C2E] flex items-center gap-1.5">
                  ${venue.name}
                  <span class="w-2 h-2 rounded-full bg-[#059C6A] inline-block"></span>
                </h1>
                <p class="text-[11px] text-[#646982] flex items-center gap-1.5">
                  <span class="font-bold text-[#FF7622]">Table ${tableNumber}</span>
                  <span class="text-[#A0A5BA]">•</span>
                  <span>${tableZone}</span>
                  <span class="text-[#059C6A] font-bold text-[9px] px-1.5 py-0.2 rounded-full bg-[#E6F7F0]">QR Active</span>
                </p>
              </div>
            </div>

            <!-- View action pills -->
            <div class="flex items-center gap-1.5">
              ${tableOrders.length > 0 ? `
                <button id="btn-toggle-track" class="px-3 py-1.5 text-xs rounded-full border border-[#FF7622]/30 bg-[#FFF1E8] text-[#FF7622] font-bold flex items-center gap-1.5 shadow-2xs animate-pulse">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#FF7622]"></span> Orders (${tableOrders.length})
                </button>
              ` : ''}
              
              <button id="btn-service-call" class="w-9 h-9 rounded-full bg-[#ECF0F4] hover:bg-[#E2E7ED] text-[#181C2E] flex items-center justify-center active:scale-95 transition-all text-xs shadow-xs" title="Request Waiter / Water">
                🛎️
              </button>
            </div>
          </div>

          <!-- Secondary Tab Bar if orders or settled receipt exist -->
          ${(tableOrders.length > 0 || settledReceipt) ? `
            <div class="max-w-md mx-auto flex border-t border-[#F0F5FA] mt-2.5 pt-2 gap-2 text-xs">
              <button id="tab-menu" class="flex-1 py-1.5 text-center font-bold rounded-full transition-all ${activeTab === 'menu' ? 'bg-[#FF7622] text-white shadow-xs' : 'text-[#646982] hover:text-[#181C2E]'}">
                Explore Menu
              </button>
              ${tableOrders.length > 0 ? `
                <button id="tab-track" class="flex-1 py-1.5 text-center font-bold rounded-full transition-all ${activeTab === 'track' ? 'bg-[#FF7622] text-white shadow-xs' : 'text-[#646982] hover:text-[#181C2E]'}">
                  Live Tracker (${tableOrders.length})
                </button>
              ` : ''}
              ${settledReceipt ? `
                <button id="tab-receipt" class="flex-1 py-1.5 text-center font-bold rounded-full transition-all ${activeTab === 'receipt' ? 'bg-[#059C6A] text-white shadow-xs' : 'text-[#646982] hover:text-[#181C2E]'}">
                  🧾 Receipt (Paid)
                </button>
              ` : ''}
            </div>
          ` : ''}
        </header>

        <!-- Main Content Area -->
        <main class="max-w-md mx-auto w-full px-4 pt-3 flex-1">

          ${(typeof store.isMaintenanceMode === 'function' && store.isMaintenanceMode()) ? `
            <!-- Emergency System Maintenance Alert Banner -->
            <div id="customer-maintenance-banner" class="bg-amber-500/15 border border-amber-500/35 rounded-2xl p-3.5 mb-3 flex items-center gap-2.5 text-xs select-none shadow-xs">
              <span class="text-xl">⚠️</span>
              <div class="leading-tight">
                <span class="block font-black text-amber-900">System Maintenance Mode Active</span>
                <span class="text-[11px] font-medium text-amber-800">Dine-in ordering is temporarily paused for maintenance. You may still browse our menu freely.</span>
              </div>
            </div>
          ` : ''}

          ${activeTab === 'receipt' && settledReceipt ? renderPaymentReceipt(settledReceipt) : (activeTab === 'track' ? renderOrderTracker(tableOrders) : `

            <!-- Active Running Tab Banner if orders are being prepared -->
            ${tableOrders.length > 0 ? `
              <div id="banner-active-order-status" class="bg-gradient-to-r from-[#181C2E] to-[#2B3149] text-white p-3.5 rounded-2xl shadow-lg border border-orange-500/30 flex items-center justify-between mb-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-[#FF7622]/20 text-[#FF7622] flex items-center justify-center text-sm font-bold animate-pulse">
                    🔥
                  </div>
                  <div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-black">Table ${tableNumber} Running Tab</span>
                      <span class="px-2 py-0.2 rounded-full text-[9px] font-bold bg-[#FFEBE4] text-[#FF7622]">Order #${tableOrders[0].id}</span>
                    </div>
                    <span class="text-[11px] text-zinc-300 font-medium">
                      ${tableOrders[0].status === 'Ready' || tableOrders[0].status === 'Served' ? '🟢 Served' : (tableOrders[0].status === 'in_kitchen' || tableOrders[0].status === 'Preparing' ? '🔥 In Kitchen (Preparing)' : '🟡 Order Received')}
                    </span>
                  </div>
                </div>
                <button id="btn-view-tracker" class="px-3 py-1.5 rounded-xl bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold transition-all shadow-sm cursor-pointer">
                  Live Tracker →
                </button>
              </div>
            ` : ''}

            <!-- Hero Restaurant Info Card (Matching Restaurant View_01.png) -->
            <div class="bg-white rounded-3xl p-4 border border-[#E3E8ED] shadow-sm mb-4 space-y-3">
              <div class="relative h-36 rounded-2xl overflow-hidden bg-slate-100 shadow-2xs">
                <img 
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80" 
                  alt="${venue.name}" 
                  class="w-full h-full object-cover"
                />
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div class="absolute bottom-2.5 left-3 text-white">
                  <span class="text-[10px] font-bold uppercase tracking-wider bg-[#FF7622] px-2 py-0.5 rounded-full">Dine-In Catalog</span>
                </div>
              </div>

              <div>
                <h2 class="text-base font-bold text-[#181C2E] tracking-tight">${venue.name}</h2>
                <p class="text-xs text-[#646982] mt-0.5 leading-relaxed">
                  Handcrafted artisanal plates, woodfired Neapolitan pizzas & botanical cold brews.
                </p>

                <!-- Dynamic Customizable Offer Banner Under Name of Cafe -->
                ${activeOfferBanners.length > 0 ? renderOfferBannerHtml(activeOfferBanners, currentOfferIndex) : ''}

                <!-- Stats Row (Matching Restaurant View_01.png) -->
                <div class="flex items-center gap-4 text-xs font-semibold text-[#181C2E] mt-2.5 pt-2 border-t border-[#F0F5FA]">
                  <span class="flex items-center gap-1 text-[#FF9F1C]">
                    <span>⭐</span>
                    <span>4.7</span>
                  </span>
                  <span class="flex items-center gap-1 text-[#059C6A]">
                    <span>🚚</span>
                    <span>Free Dine-In</span>
                  </span>
                  <span class="flex items-center gap-1 text-[#646982]">
                    <span>⏱️</span>
                    <span>20 min avg</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Tactile Search & Dietary Pills -->
            <div class="space-y-2.5 mb-4">
              <!-- Search bar -->
              <div class="relative">
                <input 
                  type="text" 
                  id="search-input" 
                  value="${searchQuery}" 
                  placeholder="Search dishes, drinks, pizzas..." 
                  class="foodie-input w-full pl-10 pr-9 text-xs placeholder-[#A0A5BA]"
                />
                <svg class="w-4 h-4 text-[#A0A5BA] absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z"/>
                </svg>
                ${searchQuery ? `
                  <button id="clear-search" class="absolute right-3.5 top-3 text-[#A0A5BA] hover:text-[#181C2E] text-xs font-bold">✕</button>
                ` : ''}
              </div>

              <!-- Dietary Toggle Filter -->
              <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
                <button data-diet="all" class="diet-btn px-4 py-2 rounded-full border text-xs font-bold transition-all ${dietaryFilter === 'all' ? 'bg-[#181C2E] text-white border-[#181C2E]' : 'bg-white text-[#646982] border-[#E3E8ED] hover:border-[#181C2E]'}">
                  All Items
                </button>
                <button data-diet="veg" class="diet-btn px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-all ${dietaryFilter === 'veg' ? 'bg-[#059C6A] text-white border-[#059C6A]' : 'bg-white text-[#646982] border-[#E3E8ED] hover:border-[#059C6A]'}">
                  <span class="w-2.5 h-2.5 rounded-sm border ${dietaryFilter === 'veg' ? 'border-white' : 'border-[#059C6A]'} flex items-center justify-center p-0.5">
                    <span class="w-1.5 h-1.5 rounded-full ${dietaryFilter === 'veg' ? 'bg-white' : 'bg-[#059C6A]'}"></span>
                  </span>
                  Veg
                </button>
                <button data-diet="non-veg" class="diet-btn px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-all ${dietaryFilter === 'non-veg' ? 'bg-[#FF334B] text-white border-[#FF334B]' : 'bg-white text-[#646982] border-[#E3E8ED] hover:border-[#FF334B]'}">
                  <span class="w-2.5 h-2.5 rounded-sm border ${dietaryFilter === 'non-veg' ? 'border-white' : 'border-[#FF334B]'} flex items-center justify-center p-0.5">
                    <span class="w-1.5 h-1.5 rounded-full ${dietaryFilter === 'non-veg' ? 'bg-white' : 'bg-[#FF334B]'}"></span>
                  </span>
                  Non-Veg
                </button>
              </div>
            </div>

            <!-- Sticky Category Navigator (Matching Restaurant View_01.png) -->
            <div class="sticky top-[58px] z-20 bg-[#F7F8F9]/95 backdrop-blur-sm py-2 mb-3 -mx-4 px-4 overflow-x-auto no-scrollbar flex items-center gap-2 border-b border-[#E3E8ED]">
              ${categories.map(cat => `
                <button 
                  data-category="${cat}" 
                  class="cat-pill whitespace-nowrap text-xs px-4 py-2 rounded-full transition-all ${
                    activeCategory === cat 
                      ? 'bg-[#FF7622] text-white font-bold shadow-md shadow-orange-500/25' 
                      : 'bg-white text-[#181C2E] border border-[#EDEDED] font-semibold hover:border-[#FF7622] hover:text-[#FF7622]'
                  }"
                >
                  ${cat}
                </button>
              `).join('')}
            </div>

            <!-- Menu Item Cards List -->
            <div class="space-y-3">
              ${rawDishes.length === 0 ? `
                <div class="text-center py-16 px-4 bg-white rounded-3xl border border-[#E3E8ED] shadow-sm flex flex-col items-center justify-center">
                  <div class="w-8 h-8 border-3 border-[#FF7622] border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p class="text-sm font-bold text-[#181C2E]">Loading Fresh Menu...</p>
                  <p class="text-xs text-[#646982] mt-1">Connecting to live cloud catalog</p>
                </div>
              ` : (filteredItems.length === 0 ? `
                <div class="text-center py-16 px-4 bg-white rounded-3xl border border-[#E3E8ED] shadow-sm">
                  <p class="text-sm font-bold text-[#181C2E]">No dishes match your filter</p>
                  <p class="text-xs text-[#646982] mt-1">Try resetting search or dietary filters</p>
                  <button id="reset-filter-btn" class="mt-4 px-4 py-2 bg-[#F0F5FA] hover:bg-[#E3E8ED] text-xs font-bold rounded-xl text-[#181C2E]">Reset Filters</button>
                </div>
              ` : filteredItems.map(item => renderItemCard(item, store)).join(''))}
            </div>
          `)}
        </main>

        <!-- Sticky Floating Cart Bar -->
        ${totals.itemCount > 0 ? `
          <div class="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
            <div class="max-w-md mx-auto pointer-events-auto">
              <button 
                id="btn-open-cart" 
                class="w-full bg-[#FF7622] hover:bg-[#F15B00] text-white px-5 py-3.5 rounded-2xl font-bold shadow-xl shadow-orange-500/35 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
              >
                <div class="flex items-center space-x-2.5">
                  <span class="w-7 h-7 rounded-full bg-[#181C2E] text-white text-xs font-bold flex items-center justify-center">
                    ${totals.itemCount}
                  </span>
                  <span class="text-xs uppercase tracking-wider font-bold">View Order</span>
                </div>
                <div class="flex items-center space-x-1.5 text-sm font-extrabold">
                  <span>₹${totals.total.toLocaleString('en-IN')}</span>
                  <span class="text-white/80 text-xs">→</span>
                </div>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Cart Drawer / Slide-Over Modal -->
        ${isCartOpen ? renderCartDrawer(store, totals, splitCount) : ''}

        <!-- Customizer Modal -->
        ${customizerItem ? renderCustomizerModal(customizerItem, customInstructions) : ''}

        <!-- UPI Instant Pay Modal -->
        ${showUPIModal && lastPlacedOrder ? renderUPIModal(lastPlacedOrder, venue) : ''}

        <!-- High-Contrast Table Freeze Modal Overlay (Occupied by another guest) -->
        ${isTableFrozen ? `
          <div class="fixed inset-0 z-50 bg-[#121223]/95 backdrop-blur-md flex items-center justify-center p-6 text-center select-none animate-in fade-in duration-200">
            <div class="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-rose-300 space-y-4">
              <div class="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-3xl mx-auto shadow-inner">
                ⚠️
              </div>
              <h2 class="text-xl font-black text-[#181C2E]">Table ${tableNumber} is Currently Active</h2>
              <p class="text-sm text-[#646982] leading-relaxed">
                Table ${tableNumber} is currently under an active order. If you were just seated, please ask the staff to clear the table.
              </p>
              <div class="pt-2 space-y-2">
                <button id="btn-refresh-freeze-status" class="w-full py-3.5 bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-orange-500/25 active:scale-98 transition-all cursor-pointer">
                  🔄 Refresh Table Status
                </button>
              </div>
            </div>
          </div>
        ` : ''}

      </div>
    `;

    bindEvents();
  }

  // Render Customizable Offer Banner Carousel (under cafe name)
  function renderOfferBannerHtml(banners, activeIdx) {
    const banner = banners[activeIdx] || banners[0];
    if (!banner) return '';

    return `
      <div class="mt-3 relative rounded-2xl overflow-hidden bg-gradient-to-r ${banner.bg_gradient || 'from-[#FF7622] to-[#FFA14A]'} text-white p-3.5 shadow-sm transition-all select-none group" id="cafe-offer-banner-container">
        <!-- Decorative ambient circles -->
        <div class="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 pointer-events-none"></div>
        <div class="absolute right-12 -top-6 w-14 h-14 rounded-full bg-white/10 pointer-events-none"></div>

        <div class="relative z-10 flex items-start justify-between gap-2.5">
          <div class="space-y-1 flex-1 min-w-0 text-left">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm">${banner.icon || '🏷️'}</span>
              <span class="bg-white/20 backdrop-blur-xs text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/30 shadow-2xs">
                ${banner.badge_text || 'SPECIAL OFFER'}
              </span>
              ${banner.min_order_amount > 0 ? `
                <span class="text-[9px] text-white/90 font-medium bg-black/15 px-1.5 py-0.5 rounded-full">Min ₹${banner.min_order_amount}</span>
              ` : ''}
            </div>

            <h3 class="text-xs font-black tracking-tight leading-snug line-clamp-1">
              ${banner.title}
            </h3>

            ${banner.subtitle ? `
              <p class="text-[10px] text-white/90 line-clamp-1 leading-normal">
                ${banner.subtitle}
              </p>
            ` : ''}
          </div>

          <!-- Right Side: Coupon Pill with One-Tap Copy -->
          ${banner.coupon_code ? `
            <div class="flex-shrink-0 flex flex-col items-end">
              <button 
                id="btn-copy-offer-coupon" 
                data-coupon="${banner.coupon_code}"
                title="Tap to copy coupon code"
                class="bg-white text-[#181C2E] hover:bg-[#FFF1E8] px-2.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer group/btn"
              >
                <span class="text-[8px] font-bold text-[#646982] uppercase tracking-wider leading-none">COUPON</span>
                <span class="text-[11px] font-black font-mono text-[#FF7622] group-hover/btn:text-[#F15B00] leading-tight">
                  ${banner.coupon_code}
                </span>
                <span class="text-[8px] text-[#059C6A] font-bold mt-0.5 leading-none" id="copy-coupon-feedback">TAP TO COPY</span>
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Carousel Navigation Controls if multiple active banners exist -->
        ${banners.length > 1 ? `
          <div class="relative z-10 flex items-center justify-between mt-2 pt-2 border-t border-white/15 text-[10px]">
            <div class="flex items-center gap-1">
              ${banners.map((_, idx) => `
                <button 
                  data-offer-dot="${idx}"
                  class="h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === activeIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }"
                  title="Go to offer ${idx + 1}"
                ></button>
              `).join('')}
            </div>

            <div class="flex items-center gap-1.5">
              <span class="text-[9px] text-white/80 font-medium">${activeIdx + 1} of ${banners.length}</span>
              <button 
                id="btn-offer-prev" 
                class="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] active:scale-90 transition-all cursor-pointer"
                title="Previous offer"
              >
                ‹
              </button>
              <button 
                id="btn-offer-next" 
                class="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-[10px] active:scale-90 transition-all cursor-pointer"
                title="Next offer"
              >
                ›
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Render individual dish card (Matching Restaurant View_01.png & Food - Burgers.png)
  function renderItemCard(item, store) {
    const isVeg = item.dietary_tag === 'Veg' || item.dietary === 'veg' || item.dietary === 'vegan';
    const inCartQty = store.cart.items
      .filter(ci => ci.item.id === item.id)
      .reduce((sum, ci) => sum + ci.quantity, 0);

    return `
      <div class="foodie-card-interactive bg-white rounded-3xl p-3.5 border border-[#E3E8ED] shadow-sm hover:shadow-md transition-all flex gap-3.5 ${!item.is_available ? 'opacity-50 grayscale pointer-events-none' : ''}">
        <!-- Image with Chef Badge -->
        <div class="relative w-24 h-24 rounded-2xl overflow-hidden bg-[#F0F5FA] flex-shrink-0">
          <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover" loading="lazy" />
          ${item.is_chef_special ? `
            <span class="absolute top-1.5 left-1.5 bg-[#FF7622] text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-xs">
              CHEF
            </span>
          ` : ''}
        </div>

        <!-- Info & Actions -->
        <div class="flex-1 flex flex-col justify-between min-w-0">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              <!-- Veg/Non-veg indicator -->
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3.5 h-3.5 rounded-md border ${isVeg ? 'border-[#059C6A]' : 'border-[#FF334B]'} flex items-center justify-center p-0.5 bg-white">
                  <span class="w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-[#059C6A]' : 'bg-[#FF334B]'}"></span>
                </span>
                ${item.spice_level > 0 ? `
                  <span class="text-[10px] text-[#FF7622]" title="Spice level">${'🌶️'.repeat(item.spice_level)}</span>
                ` : ''}
              </span>

              <span class="text-xs font-extrabold text-[#181C2E]">₹${item.price}</span>
            </div>

            <h3 class="text-xs font-bold text-[#181C2E] leading-snug line-clamp-1">${item.name}</h3>
            <p class="text-[11px] text-[#646982] line-clamp-2 mt-0.5 leading-relaxed">${item.description}</p>
          </div>

          <!-- Add Button / Qty adjust -->
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-[#F0F5FA]">
            <span class="text-[10px] text-[#A0A5BA] font-medium flex items-center gap-1">
              <svg class="w-3 h-3 text-[#FF7622]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ${item.prep_time_mins}m prep
            </span>

            ${!item.is_available ? `
              <span class="text-[11px] text-[#FF334B] font-bold">Sold Out</span>
            ` : inCartQty > 0 ? `
              <div class="inline-flex items-center bg-[#181C2E] text-white rounded-full p-1 px-1.5 shadow-xs">
                <button data-quick-del="${item.id}" class="w-5 h-5 flex items-center justify-center text-xs font-bold text-white hover:text-[#FF7622] rounded-full">
                  −
                </button>
                <span class="w-5 text-center text-xs font-bold text-white">${inCartQty}</span>
                <button data-quick-add="${item.id}" class="w-5 h-5 flex items-center justify-center text-xs font-bold text-white hover:text-[#FF7622] rounded-full">
                  +
                </button>
              </div>
            ` : `
              <button 
                data-customize-item="${item.id}" 
                class="w-8 h-8 rounded-full bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-lg flex items-center justify-center shadow-md shadow-orange-500/25 active:scale-90 transition-all cursor-pointer"
                title="Add to order"
              >
                +
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  // Render Customizer Modal (Matching Food Details_01.png)
  function renderCustomizerModal(item, notes) {
    const isVeg = item.dietary === 'veg' || item.dietary === 'vegan';
    return `
      <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="bg-white border border-[#E3E8ED] rounded-t-3xl sm:rounded-3xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto text-[#181C2E] shadow-2xl relative">
          
          <!-- Dish Image Header with Favorite Badge -->
          <div class="relative h-44 rounded-2xl overflow-hidden bg-[#F0F5FA] shadow-sm">
            <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover" />
            <div class="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-rose-500 shadow-sm cursor-pointer">
              ❤️
            </div>
            <button id="close-customizer" class="absolute top-3 left-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-[#181C2E] shadow-sm hover:scale-105 transition-all text-xs font-bold">
              ✕
            </button>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-1.5">
              <span class="w-3.5 h-3.5 rounded-md border ${isVeg ? 'border-[#059C6A]' : 'border-[#FF334B]'} flex items-center justify-center p-0.5 bg-white">
                <span class="w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-[#059C6A]' : 'bg-[#FF334B]'}"></span>
              </span>
              <span class="text-[11px] font-bold text-[#FF7622] uppercase tracking-wider">${item.category}</span>
            </div>
            <h2 class="text-base font-bold text-[#181C2E]">${item.name}</h2>
            <p class="text-xs text-[#646982] mt-1 leading-relaxed">${item.description}</p>
          </div>

          <!-- Kitchen Instructions -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-[#181C2E] uppercase tracking-wider">Kitchen Instructions (Optional)</label>
            <input 
              type="text" 
              id="cust-instructions" 
              value="${notes}" 
              placeholder="e.g. less salt, dressing on the side, extra crispy" 
              class="foodie-input w-full text-xs"
            />
          </div>

          <!-- Sticky Bottom CTA (Matching Food Details_01.png) -->
          <div class="pt-2">
            <button 
              id="confirm-custom-add" 
              class="w-full py-4 bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs rounded-2xl flex items-center justify-between px-6 shadow-xl shadow-orange-500/30 active:scale-98 transition-all cursor-pointer uppercase tracking-wider"
            >
              <span>Add to Table Order</span>
              <span class="font-extrabold text-sm">₹${item.price}</span>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Render Cart Drawer (Matching My Cart.png)
  function renderCartDrawer(store, totals, splits) {
    const splitPerPerson = splits > 0 ? Math.ceil(totals.total / splits) : totals.total;

    return `
      <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
        <div class="bg-[#121223] w-full max-w-md h-full flex flex-col overflow-y-auto text-white shadow-2xl">
          
          <!-- Header (Shared Table Cart) -->
          <div class="flex items-center justify-between p-5 pb-3 border-b border-white/10">
            <div class="flex items-center gap-3">
              <button id="close-cart" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-all cursor-pointer">
                ✕
              </button>
              <div>
                <h2 class="text-base font-bold text-white">Table ${store.cart.table_number} Cart</h2>
                <span class="text-[10px] text-amber-400 font-medium flex items-center gap-1.5 mt-0.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  Family & Group Shared Cart (Live)
                </span>
              </div>
            </div>
            <span class="text-xs font-bold text-[#059C6A] uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              Table ${store.cart.table_number}
            </span>
          </div>

          <!-- Cart Items List (Matching My Cart.png) -->
          <div class="flex-1 px-5 py-2 space-y-3 overflow-y-auto">
            ${store.cart.items.map((ci, idx) => `
              <div class="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div class="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 flex-shrink-0">
                  <img src="${ci.item.image_url}" alt="${ci.item.name}" class="w-full h-full object-cover" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-white truncate">${ci.item.name}</h4>
                    <button data-cart-delta="${idx}" data-delta="-999" class="w-5 h-5 rounded-full bg-[#FF334B] text-white flex items-center justify-center text-[10px] font-bold hover:scale-105 active:scale-95 cursor-pointer" title="Remove item">
                      ✕
                    </button>
                  </div>
                  <span class="text-xs font-bold text-[#FF7622]">₹${ci.item.price * ci.quantity}</span>
                  ${ci.customization ? `
                    <p class="text-[10px] text-[#A0A5BA] mt-0.5 truncate">${ci.customization}</p>
                  ` : ''}
                </div>

                <!-- Stepper (Matching My Cart.png) -->
                <div class="flex items-center gap-2 bg-white/10 rounded-full p-1 px-2">
                  <button data-cart-delta="${idx}" data-delta="-1" class="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:text-[#FF7622] rounded-full">
                    −
                  </button>
                  <span class="w-4 text-center text-xs font-bold text-white">${ci.quantity}</span>
                  <button data-cart-delta="${idx}" data-delta="1" class="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:text-[#FF7622] rounded-full">
                    +
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Bottom Card Container (Matching My Cart.png) -->
          <div class="bg-white rounded-t-3xl p-6 text-[#181C2E] space-y-4 shadow-2xl">
            
            <!-- Delivery / Table Location -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-[11px] font-bold text-[#646982] uppercase tracking-wider">Dine-In Table</span>
                <span class="text-xs font-bold text-[#FF7622]">VERIFIED</span>
              </div>
              <div class="bg-[#F0F5FA] rounded-2xl p-3 text-xs font-bold text-[#181C2E] flex items-center justify-between">
                <span>Table ${store.cart.table_number} • ${store.venue?.name || 'AtYourScan'}</span>
                <span class="text-sm">📍</span>
              </div>
            </div>

            <!-- Bill Splitter Calculator -->
            <div class="bg-[#F0F5FA] rounded-2xl p-3 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-[#646982]">
                <span>Split Bill With Diners</span>
                <div class="flex items-center space-x-1.5">
                  ${[1, 2, 3, 4].map(num => `
                    <button 
                      data-split="${num}" 
                      class="w-7 h-7 rounded-xl text-xs font-bold transition-all ${
                        splits === num ? 'bg-[#FF7622] text-white shadow-xs' : 'bg-white text-[#646982] hover:text-[#181C2E]'
                      }"
                    >
                      ${num}
                    </button>
                  `).join('')}
                </div>
              </div>
              ${splits > 1 ? `
                <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-200 text-[#FF7622] font-bold">
                  <span>Per Person (${splits} diners):</span>
                  <span>₹${splitPerPerson.toLocaleString('en-IN')}</span>
                </div>
              ` : ''}
            </div>

            <!-- Financial Breakdown -->
            <div class="space-y-1.5 text-xs border-t border-[#F0F5FA] pt-3 pb-1">
              <div class="flex justify-between text-[#646982]">
                <span>Item Subtotal</span>
                <span class="font-bold text-[#181C2E]">₹${totals.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div class="flex justify-between text-[#646982]">
                <span>GST (5%)</span>
                <span>₹${totals.gst.toLocaleString('en-IN')}</span>
              </div>
              <div class="flex justify-between text-[#646982]">
                <span>Discretionary Service (7%)</span>
                <span>₹${totals.serviceCharge.toLocaleString('en-IN')}</span>
              </div>
              <div class="flex justify-between text-base font-extrabold text-[#181C2E] pt-2 border-t border-[#F0F5FA]">
                <span>Total:</span>
                <span class="text-[#FF7622] text-xl">₹${totals.total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <!-- Checkout CTAs -->
            <div class="space-y-2.5 pt-1">
              ${(typeof store.isMaintenanceMode === 'function' && store.isMaintenanceMode()) ? `
                <div id="cart-maintenance-notice" class="w-full py-4 px-4 bg-amber-500/15 border border-amber-500/35 text-amber-900 text-xs font-bold rounded-2xl text-center select-none shadow-sm">
                  <span class="block text-sm">⏸️ Dine-In Ordering Paused</span>
                  <span class="text-[11px] font-normal text-amber-800 block mt-0.5">Cafe is undergoing system maintenance. Please consult floor staff.</span>
                </div>
              ` : `
                <button 
                  id="btn-place-order-upi" 
                  class="w-full py-4 bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs rounded-2xl shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer uppercase tracking-wider"
                >
                  <span>⚡ Instant Pay (UPI)</span>
                  <span class="text-sm">₹${totals.total}</span>
                </button>

                <div class="pt-1">
                  <button 
                    id="btn-place-order-table" 
                    class="w-full py-3.5 bg-[#F0F5FA] hover:bg-[#E2E8F0] text-[#181C2E] text-xs font-bold rounded-2xl text-center active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>🍽️ Pay Later (Keep Tab Open)</span>
                  </button>
                </div>
              `}
            </div>

          </div>

        </div>
      </div>
    `;
  }

  // Render Realtime Order Status Tracker
  function renderOrderTracker(orders) {
    if (!orders || orders.length === 0) {
      return `
        <div class="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm text-center space-y-4 pt-6">
          <div class="w-16 h-16 rounded-full bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-3xl mx-auto shadow-sm">
            🍽️
          </div>
          <div>
            <h3 class="text-base font-black text-[#181C2E]">No Active Orders for Table ${tableNumber}</h3>
            <p class="text-xs text-[#646982] mt-1">Browse our artisanal menu and fire your favorite dishes to the kitchen.</p>
          </div>
          <button id="btn-back-menu" class="w-full py-3.5 rounded-2xl bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 cursor-pointer">
            Explore Menu & Add Dishes
          </button>
        </div>
      `;
    }

    return `
      <div class="space-y-4 pt-2">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 class="text-base font-black text-[#181C2E]">Live Kitchen Order Status Tracker</h2>
            <p class="text-xs text-[#646982]">Table ${tableNumber} • Running Tab Active</p>
          </div>
          <button id="btn-add-more-dishes" class="px-3.5 py-1.5 rounded-full bg-[#FFEBE4] text-[#FF7622] hover:bg-[#FFD9CD] text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer">
            <span>+</span> Add More Dishes
          </button>
        </div>

        ${orders.map(order => {
          const isServed = order.status === 'Ready' || order.status === 'Served' || order.status === 'Completed';
          const isPreparing = order.status === 'in_kitchen' || order.status === 'Preparing';
          const isReceived = !isServed && !isPreparing;

          let statusPillClass = 'bg-amber-100 text-amber-900 border border-amber-300';
          let statusPillText = '🟡 Order Received';
          let currentStepIdx = 0;

          if (isServed) {
            statusPillClass = 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold';
            statusPillText = '🟢 Served';
            currentStepIdx = 2;
          } else if (isPreparing) {
            statusPillClass = 'bg-orange-100 text-[#FF7622] border border-orange-300 font-bold animate-pulse';
            statusPillText = '🔥 In Kitchen (Preparing)';
            currentStepIdx = 1;
          }

          const steps = [
            { label: 'Order Received', icon: '🟡' },
            { label: 'In Kitchen (Preparing)', icon: '🔥' },
            { label: 'Served', icon: '🟢' }
          ];

          return `
            <div class="bg-white border border-slate-100 rounded-3xl p-5 space-y-4 shadow-sm">
              <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-black text-sm text-[#181C2E]">Order #${order.id}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F0F5FA] text-[#646982]">
                      Table ${order.table_number || order.table_id || tableNumber}
                    </span>
                  </div>
                  <p class="text-[11px] text-[#A0A5BA] mt-0.5">
                    Fired at ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${statusPillClass}">
                  ${statusPillText}
                </span>
              </div>

              <!-- Step Progress Bar -->
              <div class="relative flex items-center justify-between px-3 pt-1">
                <div class="absolute left-7 right-7 top-4 h-1 bg-[#F0F5FA] -z-0 rounded-full"></div>
                <div class="absolute left-7 top-4 h-1 bg-[#FF7622] transition-all -z-0 rounded-full" style="width: ${(currentStepIdx / 2) * 88}%;"></div>

                ${steps.map((st, i) => {
                  const isDone = i <= currentStepIdx;
                  const isCurrent = i === currentStepIdx;
                  return `
                    <div class="flex flex-col items-center z-10">
                      <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                        isCurrent 
                          ? 'bg-[#FF7622] text-white ring-4 ring-[#FFEBE4]' 
                          : isDone 
                          ? 'bg-[#181C2E] text-white' 
                          : 'bg-[#ECF0F4] text-[#A0A5BA]'
                      }">
                        ${isDone && !isCurrent ? '✓' : i + 1}
                      </div>
                      <span class="text-[10px] mt-1.5 font-bold ${isCurrent ? 'text-[#FF7622]' : 'text-[#A0A5BA]'}">
                        ${st.label}
                      </span>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Items in this ticket -->
              <div class="bg-[#F7F8F9] rounded-2xl p-3.5 divide-y divide-slate-100 text-xs">
                <span class="text-[10px] text-[#A0A5BA] uppercase font-bold tracking-wider block pb-1.5">Currently Cooking</span>
                ${(order.items || []).map(it => `
                  <div class="py-2 flex justify-between items-start text-[#181C2E]">
                    <div>
                      <span class="font-bold">${it.quantity}x ${it.name || it.dish_name}</span>
                      ${(it.notes || it.customization) ? `
                        <span class="block text-[11px] text-[#FF7622] mt-0.5">⚠️ ${it.notes || it.customization}</span>
                      ` : ''}
                    </div>
                    <span class="font-semibold text-xs text-[#646982]">₹${((Number(it.price) || 0) * (Number(it.quantity) || 1)).toFixed(2)}</span>
                  </div>
                `).join('')}
                <div class="pt-2.5 flex justify-between font-black text-[#181C2E] text-sm">
                  <span>Subtotal + Taxes</span>
                  <span class="text-[#FF7622]">₹${Number(order.total_amount).toFixed(2)}</span>
                </div>
              </div>

              <!-- Ticket Payment & Settle Action -->
              <div class="pt-1">
                ${order.payment_status === 'PAID' ? `
                  <div class="flex items-center justify-between text-xs font-bold text-[#059C6A] bg-[#EBF7F2] px-4 py-2.5 rounded-2xl">
                    <span class="flex items-center gap-1.5"><span>✓</span> Settled via UPI</span>
                    <span class="text-[11px] text-[#059C6A] font-mono">${order.transaction_ref || 'Paid'}</span>
                  </div>
                ` : `
                  <div class="flex items-center gap-2">
                    <button 
                      data-order-pay-upi="${order.id}" 
                      class="flex-1 py-3 bg-[#FF7622] hover:bg-[#F15B00] text-white font-black text-xs rounded-2xl shadow-lg shadow-[#FF7622]/20 flex items-center justify-center gap-1.5 active:scale-98 transition-all uppercase tracking-wider cursor-pointer"
                    >
                      <span>⚡ Instant Pay via UPI</span>
                      <span>(₹${Number(order.total_amount).toFixed(2)})</span>
                    </button>
                  </div>
                `}
              </div>
            </div>
          `;
        }).join('')}

        <!-- Add more dishes floating CTA -->
        <div class="pt-2">
          <button id="btn-back-menu" class="w-full py-3.5 rounded-2xl bg-white border border-[#FF7622]/40 text-[#FF7622] hover:bg-[#FFF8F5] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer shadow-xs">
            <span>🍽️ + Add More Dishes to Table ${tableNumber}</span>
          </button>
        </div>
      </div>
    `;
  }

  // Render Instant UPI Modal with dynamic QR code and 12-digit UTR Verification
  function renderUPIModal(order, venue) {
    const totalAmount = order.total_amount || order.bill_amount || 0;
    const orderTableNum = order.table_number || order.table_id || tableNumber;
    let effectiveUpiId = store.venue?.upi_id || venue?.upi_id || 'vanshwaghre-1@okicici';
    if (!effectiveUpiId || effectiveUpiId.includes('ptaxis') || effectiveUpiId.includes('thecopperoak')) {
      effectiveUpiId = 'vanshwaghre-1@okicici';
    }
    const upiUri = (typeof store.generateUpiUrl === 'function') 
      ? store.generateUpiUrl(totalAmount, orderTableNum) 
      : `upi://pay?pa=${encodeURIComponent(effectiveUpiId)}&pn=First%20Way%20Cafe&am=${Number(totalAmount).toFixed(2)}&cu=INR`;
    const qrSvg = generateQRCodeSVG(upiUri, { size: 195, darkColor: '#181C2E', lightColor: '#ffffff' });
    const isMobile = isMobileDevice();
    const formattedAmount = Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return `
      <div class="fixed inset-0 z-50 bg-[#181C2E]/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <div class="bg-white rounded-[32px] max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200 my-auto">
          
          <!-- Top glowing brand badge -->
          <div class="w-14 h-14 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center mx-auto text-2xl font-black shadow-sm">
            ₹
          </div>

          <div>
            <h3 class="text-lg font-black text-[#181C2E] flex items-center justify-center gap-1.5">
              <span>Dynamic UPI Verification</span>
              <span class="w-2 h-2 rounded-full bg-[#059C6A] animate-pulse"></span>
            </h3>
            <p class="text-xs text-[#646982] mt-0.5">
              Zero-fee instant settlement for Table ${orderTableNum}
            </p>
          </div>

          <!-- Total Bill Amount Card (Locked Session) -->
          <div class="py-3 px-4 bg-[#F7F8F9] border border-slate-100 rounded-2xl">
            <span class="text-[11px] font-semibold text-[#A0A5BA] uppercase tracking-wider block">Payable Amount (Locked)</span>
            <span class="text-3xl font-black tracking-tight text-[#FF7622]">₹${formattedAmount}</span>
            <div class="flex items-center justify-between p-2.5 bg-gray-50 border rounded-lg mt-2 text-sm">
              <span class="font-mono text-gray-700" id="upi-id-text">${effectiveUpiId}</span>
              <button type="button" id="copyUpiBtn" class="text-xs font-semibold px-2.5 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition cursor-pointer">
                Copy UPI ID
              </button>
            </div>
          </div>

          <!-- Mobile 1-Tap Intent Launcher CTA -->
          <div class="space-y-2 pt-1 ${isMobile ? 'block' : 'hidden md:hidden'}">
            <a 
              href="${upiUri}" 
              id="btn-direct-upi-launch"
              target="_blank"
              rel="noopener noreferrer"
              class="w-full py-3.5 bg-[#FF7622] hover:bg-[#F15B00] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#FF7622]/25 flex items-center justify-center gap-2 active:scale-95 transition-all uppercase tracking-wider cursor-pointer"
            >
              <span>⚡ Pay ₹${formattedAmount} via UPI App</span>
            </a>

            <!-- App-Specific 1-Tap Quick Links -->
            <div class="grid grid-cols-4 gap-2 text-xs pt-1">
              <a href="${upiUri}" class="p-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] font-bold text-[11px] block transition-all hover:scale-105 active:scale-95 text-center">
                <span class="block text-[#181C2E]">GPay</span>
              </a>
              <a href="${upiUri}" class="p-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] font-bold text-[11px] block transition-all hover:scale-105 active:scale-95 text-center">
                <span class="block text-[#5f259f]">PhonePe</span>
              </a>
              <a href="${upiUri}" class="p-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] font-bold text-[11px] block transition-all hover:scale-105 active:scale-95 text-center">
                <span class="block text-[#00b9f5]">Paytm</span>
              </a>
              <a href="${upiUri}" class="p-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] font-bold text-[11px] block transition-all hover:scale-105 active:scale-95 text-center">
                <span class="block text-[#059C6A]">BHIM</span>
              </a>
            </div>
          </div>

          <!-- Dynamic Desktop Vector SVG QR Fallback -->
          <div class="space-y-2 pt-1 ${isMobile ? 'opacity-90' : 'block'}">
            <div class="bg-white p-3 rounded-2xl shadow-md border border-slate-100 inline-block mx-auto ring-4 ring-orange-50 transition-transform hover:scale-105">
              ${qrSvg}
            </div>
            <p class="text-[11px] text-[#646982] font-medium">
              ${isMobile ? 'Or scan QR code from a second device' : 'Point camera to scan with any UPI app on your phone'}
            </p>
            <p class="text-[11px] text-gray-500 mt-2 text-center">Note: Avoid paying from an account registered with the same mobile number as the cafe UPI ID.</p>
          </div>

          <!-- Real 12-Digit UTR Verification Form -->
          <div id="utr-form-section" class="pt-2 border-t border-slate-100 space-y-2 text-left">
            <label class="text-[11px] font-bold text-[#181C2E] uppercase tracking-wider block text-center">
              Enter 12-digit UPI UTR / Ref Number
            </label>
            <div class="relative">
              <input 
                type="text" 
                id="order-utr-input" 
                maxlength="12" 
                inputmode="numeric" 
                placeholder="e.g. 429182740192" 
                class="w-full text-center tracking-widest font-mono text-base font-bold py-3 px-3 rounded-2xl border border-slate-200 focus:outline-none focus:border-[#059C6A] focus:ring-2 focus:ring-emerald-100 transition-all text-[#181C2E] bg-[#F7F8F9]"
              />
            </div>
            <div id="utr-error-banner" class="hidden text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5 font-semibold text-center"></div>
            
            <button 
              id="btn-submit-order-utr" 
              data-order-id="${order.id}"
              data-table-number="${orderTableNum}"
              class="w-full py-3.5 bg-gradient-to-r from-[#059C6A] to-[#10B981] hover:from-[#047851] hover:to-[#059C6A] text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
            >
              <span id="btn-utr-text">✓ Verify & Complete Payment</span>
              <span id="btn-utr-spinner" class="hidden animate-spin text-sm">⏳</span>
            </button>
            <p class="text-[10px] text-[#A0A5BA] text-center">
              Found on your UPI receipt (Google Pay, PhonePe, Paytm).
            </p>
          </div>

          <!-- Admin Verification Waiting State Card -->
          <div id="utr-waiting-card" class="hidden bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-center space-y-3 animate-in fade-in duration-300">
            <div class="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl font-bold mx-auto animate-pulse shadow-sm">
              ⏳
            </div>
            <h4 class="text-sm font-black text-amber-900">Verifying with Counter</h4>
            <p class="text-xs text-amber-800 leading-relaxed font-medium">
              Verifying your transaction with the counter. Please wait a moment while staff confirms your payment...
            </p>
            <div class="bg-white/90 rounded-xl p-2.5 border border-amber-200 text-xs">
              <span class="block text-[10px] text-[#A0A5BA] font-bold uppercase tracking-wider">Submitted UTR</span>
              <span class="font-mono font-black text-sm text-amber-900" id="waiting-utr-display"></span>
            </div>
          </div>

          <!-- Animated Confirmation Card -->
          <div id="utr-success-card" class="hidden bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2 animate-in fade-in duration-300">
            <div class="w-12 h-12 rounded-full bg-[#059C6A] text-white flex items-center justify-center text-xl font-bold mx-auto animate-bounce">
              ✓
            </div>
            <h4 class="text-sm font-black text-[#059C6A]">Order Accepted & Preparing!</h4>
            <p class="text-xs text-[#181C2E]">
              Total ₹${formattedAmount} verified via UTR: <span class="font-mono font-bold text-emerald-800" id="confirmed-utr-display"></span>
            </p>
          </div>

          <!-- Secondary Dismiss / Manual Check Actions -->
          <div class="flex items-center justify-end text-xs pt-2 border-t border-slate-100">
            <button id="btn-close-upi" class="text-[#646982] hover:text-[#181C2E] font-medium text-xs transition-colors cursor-pointer">
              Cancel / Close
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Render Confirmed Payment Receipt & Settlement Breakdown
  function renderPaymentReceipt(receipt) {
    const formattedAmount = Number(receipt.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return `
      <div class="space-y-4 pt-2 max-w-md mx-auto">
        <div class="bg-white rounded-[32px] p-7 text-center space-y-5 shadow-xl border border-slate-100 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          <!-- Animated Checkmark Icon (matching Payment Successfull.png) -->
          <div class="w-20 h-20 rounded-full bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center mx-auto text-4xl shadow-sm ring-8 ring-[#FFF1E8]">
            ✓
          </div>

          <div>
            <h2 class="text-2xl font-black text-[#181C2E]">Payment Successful!</h2>
            <p class="text-xs text-[#059C6A] font-bold mt-1">Table ${receipt.tableNumber} Tab Settled & Closed</p>
          </div>

          <!-- Amount Paid Banner -->
          <div class="py-3.5 px-5 bg-[#F7F8F9] border border-slate-100 rounded-2xl flex items-center justify-between">
            <span class="text-xs font-semibold text-[#646982]">Total Settled via UPI</span>
            <span class="text-2xl font-black text-[#FF7622]">₹${formattedAmount}</span>
          </div>

          <!-- Metadata Breakdown -->
          <div class="space-y-2 text-xs text-[#646982] text-left border-t border-slate-100 pt-3.5">
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">Order ID:</span>
              <span class="text-[#181C2E] font-bold">#${receipt.orderId}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">NPCI UTR Ref:</span>
              <span class="text-[#FF7622] font-bold font-mono text-[11px]">${receipt.utr}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">Payment Mode:</span>
              <span class="text-[#059C6A] font-bold">UPI Intent (GPay / PhonePe / Paytm)</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">Timestamp:</span>
              <span class="text-[#181C2E]">${receipt.paidAt}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">Merchant VPA:</span>
              <span class="text-[#181C2E]">${receipt.vpa}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-[#A0A5BA]">Floorplan Status:</span>
              <span class="text-[#059C6A] font-bold">Vacant Ready (Tab Cleared)</span>
            </div>
          </div>

          <!-- Ordered Items Summary -->
          <div class="bg-[#F7F8F9] rounded-2xl p-4 text-left space-y-2 border border-slate-100 text-xs">
            <span class="text-[10px] text-[#A0A5BA] uppercase tracking-wider block font-bold">Tax Invoice Breakdown</span>
            <div class="divide-y divide-slate-100">
              ${(receipt.items || []).map(it => `
                <div class="py-2 flex justify-between text-[#181C2E] font-medium">
                  <span>${it.quantity}x ${it.name}</span>
                  <span class="text-[#646982]">₹${(it.price * it.quantity).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-2.5 pt-1 no-print">
            <button 
              id="btn-print-receipt"
              class="w-full py-3.5 rounded-2xl bg-[#ECF0F4] hover:bg-[#E2E8F0] text-[#181C2E] text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <span>📥</span>
              <span>Download / Print Tax Invoice</span>
            </button>

            <button 
              id="btn-start-new-tab"
              class="w-full py-3.5 rounded-2xl bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold shadow-lg shadow-[#FF7622]/25 active:scale-98 transition-all cursor-pointer"
            >
              <span>🍽️ Back to Menu / New Order</span>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Bind DOM event listeners
  function bindEvents() {
    // Category pills
    container.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeCategory = e.currentTarget.dataset.category;
        render();
      });
    });

    // Dietary filter buttons
    container.querySelectorAll('.diet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        dietaryFilter = e.currentTarget.dataset.diet;
        render();
      });
    });

    // Search bar
    const searchInput = container.querySelector('#search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        // Don't lose input focus while typing
        const pos = e.target.selectionStart;
        render();
        const nextInput = container.querySelector('#search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(pos, pos);
        }
      });
    }

    const clearSearch = container.querySelector('#clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    const resetFilters = container.querySelector('#reset-filter-btn');
    if (resetFilters) {
      resetFilters.addEventListener('click', () => {
        searchQuery = '';
        dietaryFilter = 'all';
        activeCategory = 'All';
        render();
      });
    }

    // Quick Add / Quick Del
    container.querySelectorAll('[data-quick-add]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.quickAdd;
        const item = store.dishes?.find(d => d.id === id) || store.menuItems?.find(m => m.id === id);
        if (item) store.addToCart(item, 1);
      });
    });

    container.querySelectorAll('[data-quick-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.quickDel;
        const idx = store.cart.items.findIndex(ci => ci.item.id === id);
        if (idx !== -1) store.updateCartQuantity(idx, -1);
      });
    });

    // Customizer Modal triggers
    container.querySelectorAll('[data-customize-item]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.customizeItem;
        customizerItem = store.dishes?.find(d => d.id === id) || store.menuItems?.find(m => m.id === id);
        customInstructions = '';
        render();
      });
    });

    const closeCust = container.querySelector('#close-customizer');
    if (closeCust) {
      closeCust.addEventListener('click', () => {
        customizerItem = null;
        customInstructions = '';
        render();
      });
    }

    const custInstructionsInput = container.querySelector('#cust-instructions');
    if (custInstructionsInput) {
      custInstructionsInput.addEventListener('input', (e) => {
        customInstructions = e.target.value;
      });
    }

    const confirmCustomAdd = container.querySelector('#confirm-custom-add');
    if (confirmCustomAdd) {
      confirmCustomAdd.addEventListener('click', () => {
        if (customizerItem) {
          const customNote = customInstructions ? customInstructions.trim() : '';
          store.addToCart(customizerItem, 1, customNote);
          customizerItem = null;
          customInstructions = '';
          render();
        }
      });
    }

    // Cart Drawer triggers
    const openCartBtn = container.querySelector('#btn-open-cart');
    if (openCartBtn) {
      openCartBtn.addEventListener('click', () => {
        isCartOpen = true;
        render();
      });
    }

    const closeCartBtn = container.querySelector('#close-cart');
    if (closeCartBtn) {
      closeCartBtn.addEventListener('click', () => {
        isCartOpen = false;
        render();
      });
    }

    // Cart Quantity +/-
    container.querySelectorAll('[data-cart-delta]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.cartDelta, 10);
        const delta = parseInt(e.currentTarget.dataset.delta, 10);
        store.updateCartQuantity(idx, delta);
        if (store.cart.items.length === 0) isCartOpen = false;
        render();
      });
    });

    // Split Bill Buttons
    container.querySelectorAll('[data-split]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        splitCount = parseInt(e.currentTarget.dataset.split, 10);
        render();
      });
    });

    // Dedicated fireOrderToKitchen handler conforming to relational specifications
    const fireOrderToKitchen = (paymentMode = 'PAY_AT_COUNTER') => {
      if (typeof store.isMaintenanceMode === 'function' && store.isMaintenanceMode()) {
        alert('System Maintenance: Dine-in ordering is temporarily paused.');
        return null;
      }
      if (!store.cart?.items || store.cart.items.length === 0) {
        alert('Your cart is empty. Please add dishes to fire an order.');
        return null;
      }

      const cartTotals = store.getCartTotals();
      const activeCafeId = store.venue?.id || store.venue?.cafe_id || 'AYS-VENUE-01';
      const tableId = tableNumber || store.cart?.table_number || 1;
      const orderId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `AYS-${Math.floor(100 + Math.random() * 900)}`;

      let sessionToken = (typeof localStorage !== 'undefined') ? localStorage.getItem('ays_table_session') : null;
      if (!sessionToken && typeof store.generateTableSessionToken === 'function') {
        sessionToken = store.generateTableSessionToken();
        try {
          localStorage.setItem('ays_table_session', sessionToken);
          localStorage.setItem('ays_table_session_table', String(tableId));
        } catch {}
      }

      const isPayLater = paymentMode === 'PAY_LATER' || paymentMode === 'PAY_AT_COUNTER';

      const orderPayload = {
        id: orderId,
        cafe_id: activeCafeId,
        venue_id: activeCafeId,
        table_id: tableId,
        table_number: parseInt(tableId, 10),
        table_label: `Table ${tableId}`,
        status: isPayLater ? 'CONFIRMED' : 'AWAITING_VERIFICATION',
        payment_method: isPayLater ? 'PAY_LATER' : 'UPI',
        payment_status: isPayLater ? 'PENDING' : 'PENDING',
        verification_status: isPayLater ? 'APPROVED' : 'PENDING_APPROVAL',
        is_pay_later: isPayLater,
        session_token: sessionToken,
        items: store.cart.items.map(ci => ({
          id: ci.item.id,
          dish_id: ci.item.id,
          dish_name: ci.item.name,
          name: ci.item.name,
          quantity: ci.quantity,
          price: ci.item.price,
          notes: ci.customization || '',
          customization: ci.customization || ''
        })),
        subtotal: cartTotals.subtotal,
        taxes: cartTotals.gst,
        service_charge: cartTotals.serviceCharge,
        total_amount: cartTotals.total,
        source: 'QR_DINE_IN',
        created_at: new Date().toISOString()
      };

      const order = store.createOrder(orderPayload);
      if (typeof store.setTableSession === 'function') {
        store.setTableSession(tableId, sessionToken, order.id);
      }
      store.clearCart();
      isCartOpen = false;
      lastPlacedOrder = order;

      if (paymentMode === 'UPI') {
        showUPIModal = true;
      } else {
        activeTab = 'track';
      }

      render();
      return order;
    };

    container.fireOrderToKitchen = fireOrderToKitchen;

    // Fire Order to Kitchen buttons
    container.querySelector('#btn-fire-order-kitchen')?.addEventListener('click', () => fireOrderToKitchen('PAY_AT_COUNTER'));
    container.querySelector('#btn-place-order-table')?.addEventListener('click', () => fireOrderToKitchen('PAY_AT_COUNTER'));
    container.querySelector('#btn-place-order-upi')?.addEventListener('click', () => fireOrderToKitchen('UPI'));

    // View Tracker & Add More Dishes buttons
    container.querySelector('#btn-view-tracker')?.addEventListener('click', () => {
      activeTab = 'track';
      render();
    });

    const onBackToMenu = () => {
      activeTab = 'menu';
      render();
    };
    container.querySelector('#btn-add-more-dishes')?.addEventListener('click', onBackToMenu);
    container.querySelector('#btn-back-menu')?.addEventListener('click', onBackToMenu);
    container.querySelectorAll?.('#btn-add-more-dishes, #btn-back-menu')?.forEach(btn => {
      btn.addEventListener('click', onBackToMenu);
    });

    // UPI Modal Actions & Settlement
    const handleSettlement = (orderId, tableNum, utr) => {
      const order = store.orders.find(o => o.id === orderId) || lastPlacedOrder;
      const tNum = tableNum || order?.table_number || store.cart.table_number;
      const ref = utr || '';

      store.settleTable(tNum, 'UPI', ref);

      settledReceipt = {
        orderId: order?.id || 'AYS-ORD',
        tableNumber: tNum,
        totalAmount: order?.total_amount || 0,
        utr: ref,
        paidAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: order?.items || [],
        vpa: store.venue?.upi_id || 'vanshwaghre-1@okicici',
        venueName: store.venue?.name || 'Restaurant'
      };

      showUPIModal = false;
      activeTab = 'receipt';
      render();
    };

    const copyUpiBtn = container.querySelector('#copyUpiBtn');
    if (copyUpiBtn) {
      copyUpiBtn.addEventListener('click', async () => {
        let upiVal = container.querySelector('#upi-id-text')?.textContent?.trim() || store.venue?.upi_id || 'vanshwaghre-1@okicici';
        if (!upiVal || upiVal.includes('ptaxis') || upiVal.includes('thecopperoak')) {
          upiVal = 'vanshwaghre-1@okicici';
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(upiVal);
          } else {
            const ta = document.createElement('textarea');
            ta.value = upiVal;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          copyUpiBtn.textContent = 'Copied!';
          copyUpiBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
          copyUpiBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
          setTimeout(() => {
            copyUpiBtn.textContent = 'Copy UPI ID';
            copyUpiBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
            copyUpiBtn.classList.add('bg-amber-500', 'hover:bg-amber-600');
          }, 2000);
        } catch (err) {
          console.warn('Failed to copy UPI ID:', err);
        }
      });
    }

    const utrInput = container.querySelector('#order-utr-input');

    const submitUtrBtn = container.querySelector('#btn-submit-order-utr');
    if (submitUtrBtn) {
      submitUtrBtn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.orderId;
        const tableNum = parseInt(e.currentTarget.dataset.tableNumber, 10);
        const rawUtr = utrInput ? utrInput.value.trim() : '';
        const sanitized = rawUtr.replace(/\D/g, '');
        const errBanner = container.querySelector('#utr-error-banner');
        const btnText = container.querySelector('#btn-utr-text');
        const btnSpinner = container.querySelector('#btn-utr-spinner');

        if (sanitized.length !== 12) {
          if (errBanner) {
            errBanner.textContent = 'Please enter a valid 12-digit numeric UTR/Ref number.';
            errBanner.classList.remove('hidden');
          }
          return;
        }

        if (errBanner) errBanner.classList.add('hidden');
        if (btnSpinner) btnSpinner.classList.remove('hidden');
        if (btnText) btnText.textContent = 'Verifying with Bank...';

        try {
          let sessionToken = (typeof localStorage !== 'undefined') ? localStorage.getItem('ays_table_session') : null;
          if (!sessionToken && typeof store.generateTableSessionToken === 'function') {
            sessionToken = store.generateTableSessionToken();
            try {
              localStorage.setItem('ays_table_session', sessionToken);
              localStorage.setItem('ays_table_session_table', String(tableNum));
            } catch {}
          }

          const verifyRes = await store.submitOrderUtrForAdminApproval(orderId, sanitized, sessionToken);
          if (!verifyRes.success) {
            if (btnSpinner) btnSpinner.classList.add('hidden');
            if (btnText) btnText.textContent = '✓ Verify & Complete Payment';
            if (errBanner) {
              errBanner.textContent = verifyRes.error || 'Verification failed. Please check UTR.';
              errBanner.classList.remove('hidden');
            }
            return;
          }

          // Transition to Admin Verification Waiting State
          const formSection = container.querySelector('#utr-form-section');
          const waitingCard = container.querySelector('#utr-waiting-card');
          const waitingUtrDisplay = container.querySelector('#waiting-utr-display');
          if (formSection) formSection.classList.add('hidden');
          if (waitingUtrDisplay) waitingUtrDisplay.textContent = sanitized;
          if (waitingCard) waitingCard.classList.remove('hidden');

          // If cart has items, clear it
          store.clearCart();
        } catch (err) {
          if (btnSpinner) btnSpinner.classList.add('hidden');
          if (btnText) btnText.textContent = '✓ Verify & Complete Payment';
          if (errBanner) {
            errBanner.textContent = err.message || 'System error verifying payment.';
            errBanner.classList.remove('hidden');
          }
        }
      });
    }

    const confirmUPIBtn = container.querySelector('#btn-confirm-upi-paid');
    if (confirmUPIBtn) {
      confirmUPIBtn.addEventListener('click', () => {
        if (lastPlacedOrder) {
          handleSettlement(lastPlacedOrder.id, lastPlacedOrder.table_number);
        } else {
          showUPIModal = false;
          render();
        }
      });
    }

    const closeUPIBtn = container.querySelector('#btn-close-upi');
    if (closeUPIBtn) {
      closeUPIBtn.addEventListener('click', () => {
        showUPIModal = false;
        render();
      });
    }

    // Receipt View Actions
    const printReceiptBtn = container.querySelector('#btn-print-receipt');
    if (printReceiptBtn) {
      printReceiptBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined' && window.print) {
          window.print();
        }
      });
    }

    const startNewTabBtn = container.querySelector('#btn-start-new-tab');
    if (startNewTabBtn) {
      startNewTabBtn.addEventListener('click', () => {
        settledReceipt = null;
        activeTab = 'menu';
        render();
      });
    }

    const tabReceipt = container.querySelector('#tab-receipt');
    if (tabReceipt) {
      tabReceipt.addEventListener('click', () => {
        activeTab = 'receipt';
        render();
      });
    }

    // Tracker item "Instant Pay via UPI" button
    container.querySelectorAll('[data-order-pay-upi]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const orderId = e.currentTarget.dataset.orderPayUpi;
        const order = store.orders.find(o => o.id === orderId);
        if (order) {
          lastPlacedOrder = order;
          if (typeof store.lockOrderSession === 'function') {
            store.lockOrderSession(order.id);
          }
          showUPIModal = true;
          render();
        }
      });
    });


    // Service Call Button
    const serviceCallBtn = container.querySelector('#btn-service-call');
    if (serviceCallBtn) {
      serviceCallBtn.addEventListener('click', () => {
        store.requestService(store.cart.table_number, 'Table Service Requested');
        alert(`🛎️ Waiter notified! A server will attend to Table ${store.cart.table_number} shortly.`);
      });
    }

    // Tab Switchers
    const tabMenu = container.querySelector('#tab-menu');
    if (tabMenu) {
      tabMenu.addEventListener('click', () => {
        activeTab = 'menu';
        render();
      });
    }

    const tabTrack = container.querySelector('#tab-track');
    if (tabTrack) {
      tabTrack.addEventListener('click', () => {
        activeTab = 'track';
        render();
      });
    }

    const btnToggleTrack = container.querySelector('#btn-toggle-track');
    if (btnToggleTrack) {
      btnToggleTrack.addEventListener('click', () => {
        activeTab = 'track';
        render();
      });
    }

    const btnBackMenu = container.querySelector('#btn-back-menu');
    if (btnBackMenu) {
      btnBackMenu.addEventListener('click', () => {
        activeTab = 'menu';
        render();
      });
    }

    // Offer Banner Carousel Navigation
    const offerPrev = container.querySelector('#btn-offer-prev');
    if (offerPrev) {
      offerPrev.addEventListener('click', () => {
        const banners = store.getActiveOfferBanners ? store.getActiveOfferBanners() : (store.offerBanners || []).filter(b => b.is_active);
        if (banners.length > 0) {
          currentOfferIndex = (currentOfferIndex - 1 + banners.length) % banners.length;
          render();
        }
      });
    }

    const offerNext = container.querySelector('#btn-offer-next');
    if (offerNext) {
      offerNext.addEventListener('click', () => {
        const banners = store.getActiveOfferBanners ? store.getActiveOfferBanners() : (store.offerBanners || []).filter(b => b.is_active);
        if (banners.length > 0) {
          currentOfferIndex = (currentOfferIndex + 1) % banners.length;
          render();
        }
      });
    }

    container.querySelectorAll('[data-offer-dot]').forEach(dot => {
      dot.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.offerDot, 10);
        if (!isNaN(idx)) {
          currentOfferIndex = idx;
          render();
        }
      });
    });

    // Copy coupon code
    const copyCouponBtn = container.querySelector('#btn-copy-offer-coupon');
    if (copyCouponBtn) {
      copyCouponBtn.addEventListener('click', (e) => {
        const code = e.currentTarget.dataset.coupon;
        if (code && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).catch(() => {});
        }
        const feedback = container.querySelector('#copy-coupon-feedback');
        if (feedback) {
          feedback.textContent = 'COPIED! 🎉';
          feedback.classList.remove('text-[#059C6A]');
          feedback.classList.add('text-[#FF7622]', 'font-black');
          setTimeout(() => {
            if (feedback) {
              feedback.textContent = 'TAP TO COPY';
              feedback.classList.remove('text-[#FF7622]', 'font-black');
              feedback.classList.add('text-[#059C6A]');
            }
          }, 2500);
        }
        store.playSound?.('success');
      });
    }
  }

  // Subscribe to store updates
  const unsubscribe = store.subscribe(() => {
    render();
  });

  // Resolve target venue ID
  const getVenueId = () => {
    if (typeof window !== 'undefined' && window.location) {
      const p = new URLSearchParams(window.location.search);
      const q = p.get('cafe') || p.get('cafe_id') || p.get('cafeId') || p.get('venue');
      if (q) return q;
      const pathMatch = window.location.pathname.match(/\/v\/([^\/]+)/);
      if (pathMatch) return decodeURIComponent(pathMatch[1]);
    }
    return store.venue?.id || 'cafe-first-way-cafe-hotc';
  };

  const venueId = getVenueId();

  // When mounting, if store.dishes is empty, load dishes from Supabase before rendering
  if ((!store.dishes || store.dishes.length === 0) && typeof store.loadDishes === 'function') {
    (async () => {
      try {
        await store.loadDishes(venueId);
      } catch (err) {
        console.warn('[CustomerView] Failed to load dishes from Supabase:', err);
      }
      render();
    })();
  } else {
    // Initial render
    render();
  }

  return () => unsubscribe();
}
