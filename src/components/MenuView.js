/**
 * MenuView.js
 * 
 * Menu Catalog, Categories & Realtime Inventory Control View.
 * Fully supports:
 * - Complete purge of hardcoded/mock dishes and categories
 * - Dynamic Category Builder modal integration
 * - Rich manual Dish Creation modal with Supabase Storage dropzone
 * - Granular Bill of Materials (BOM) & Raw Inventory mapping
 * - Realtime 86'ing and auto-depletion synchronization
 * - RBAC & Admin PIN elevation challenge for non-admin counter staff
 */

import { renderCategoryBuilderModal } from './CategoryBuilderModal.js';
import { renderDishCreationModal } from './DishCreationModal.js';
import { renderOfferBannerModal } from './OfferBannerModal.js';
import { requestManagerOverride } from './ManagerOverrideModal.js';
import { renderMasterMenuIngestionModal } from './MasterMenuIngestionModal.js';

export function renderMenuView(container, store, options = {}) {
  const { onSwitchMode = null, showModeTabs = true } = options;
  let activeTab = options.initialTab || 'dishes'; // 'dishes' | 'categories' | 'inventory' | 'offers'
  let selectedCategory = 'All';
  let searchTerm = '';
  let statusBanner = null; // { type: 'success' | 'error', text: '' }

  function getModalLayer() {
    let layer = document.getElementById('app-modal-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'app-modal-layer';
      layer.className = 'relative z-50';
      document.body?.appendChild(layer);
    }
    return layer;
  }

  function render() {
    const currentUser = store?.currentStaff;
    const isAdmin = Boolean(currentUser && (currentUser.role === 'admin' || (currentUser.role || '').toLowerCase() === 'admin'));

    const dishes = store.getDishes ? store.getDishes() : (store.dishes || store.menuItems || []);
    const categories = store.getCategories ? store.getCategories() : (store.categories || []);
    const inventoryItems = store.getInventoryItems ? store.getInventoryItems() : (store.inventoryItems || []);
    const dishIngredients = store.dishIngredients || [];
    const offerBanners = store.getOfferBanners ? store.getOfferBanners() : (store.offerBanners || []);
    const activeOffers = store.getActiveOfferBanners ? store.getActiveOfferBanners() : offerBanners.filter(b => b.is_active && !store.isOfferExpired?.(b));
    const activeOffersCount = activeOffers.length;
    const expiredOffers = offerBanners.filter(b => store.isOfferExpired?.(b));
    const expiredOffersCount = expiredOffers.length;

    const categoryNames = ['All', ...categories.map(c => c.name)];

    let filteredDishes = dishes.filter(item => {
      const matchCat = !selectedCategory || selectedCategory === 'all' || selectedCategory === 'All' ||
        item.category_id === selectedCategory ||
        item.categoryId === selectedCategory ||
        item.category === selectedCategory ||
        item.categoryName === selectedCategory ||
        (item.categoryName && item.categoryName.toLowerCase() === selectedCategory.toLowerCase()) ||
        (item.category && item.category.toLowerCase() === selectedCategory.toLowerCase()) ||
        (item.category_id && categories.find(c => c.id === item.category_id)?.name === selectedCategory);
      const matchSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || (item.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });

    if (filteredDishes.length === 0 && dishes.length > 0 && !searchTerm) {
      filteredDishes = dishes;
    }

    const outOfStockCount = dishes.filter(i => !i.is_available).length;

    container.innerHTML = `
      <div class="menu-mgmt-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none p-6 space-y-6">
        
        <!-- Merged Header & Action Ribbon -->
        <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm">
          <div>
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                🍱
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-[#FF7622]">Catalog Architecture</span>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${outOfStockCount > 0 ? 'bg-[#FFF0F2] text-[#FF334B]' : 'bg-[#EBF7F2] text-[#059C6A]'}">
                    ${outOfStockCount} Dish(es) 86'd
                  </span>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${activeOffersCount > 0 ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-slate-100 text-[#646982]'}">
                    🏷️ ${activeOffersCount} Promo Offer(s)
                  </span>
                </div>
                <h1 class="text-xl font-black text-[#181C2E]">Menu Management & Raw BOM Inventory</h1>
              </div>
            </div>
          </div>

          <!-- Right: Ingestion Mode Tabs + Action Buttons in One Merged Ribbon -->
          <div class="flex items-center flex-wrap gap-3">
            ${showModeTabs ? `
              <div class="flex items-center bg-[#F0F5FA] p-1.5 rounded-2xl border border-slate-100 text-xs font-bold">
                <button 
                  id="tab-btn-catalog" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/30 cursor-pointer"
                >
                  🍱 Menu & BOM Catalog
                </button>
                <button 
                  id="tab-btn-text" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-[#646982] hover:text-[#181C2E] cursor-pointer"
                >
                  📝 Text Batch Ingest
                </button>
                <button 
                  id="tab-btn-image" 
                  type="button"
                  class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-[#646982] hover:text-[#181C2E] cursor-pointer"
                >
                  📷 Invoice Image OCR
                </button>
                ${isAdmin ? `
                  <button 
                    id="tab-btn-master-ai" 
                    type="button"
                    class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all text-emerald-800 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="AI Menu Auto-Import (OCR & Instant Extraction)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    <span>AI Menu Auto-Import</span>
                  </button>
                ` : ''}
              </div>

              <div class="hidden xl:block w-px h-8 bg-slate-200"></div>
            ` : ''}

            <!-- Action Buttons Toolbar -->
            <div id="menu-action-toolbar" class="menu-action-toolbar flex items-center flex-wrap gap-2.5">
              ${isAdmin ? `
                <button 
                  id="btn-ai-menu-import" 
                  type="button"
                  class="btn-emerald-capsule px-4 py-2.5 rounded-2xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white active:scale-95 transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
                  title="Exclusive to Admin: AI Menu Auto-Import"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <span>AI Menu Auto-Import</span>
                </button>
              ` : ''}

              <button 
                id="btn-add-offer" 
                type="button"
                class="px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#FFF1E8] hover:bg-[#FFE3D1] text-[#FF7622] border border-[#FF7622]/30 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                title="Create customizable promotional offer banner"
              >
                <span>🏷️</span>
                <span>＋ Offer Banner</span>
              </button>

              <button 
                id="btn-add-category" 
                type="button"
                class="px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] border border-slate-100 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>📁</span>
                <span>＋ Category</span>
              </button>

              <button 
                id="btn-add-dish" 
                type="button"
                class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-[#FF7622]/20 cursor-pointer"
              >
                <span>🍲</span>
                <span>＋ New Dish</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Status Banner -->
        ${statusBanner ? `
          <div class="p-4 rounded-2xl ${statusBanner.type === 'error' ? 'bg-[#FFF0F2] border border-rose-200 text-[#FF334B]' : 'bg-[#EBF7F2] border border-emerald-200 text-[#059C6A]'} text-xs font-bold flex items-center justify-between animate-fadeIn shadow-xs">
            <span class="flex items-center gap-2">
              <span>${statusBanner.type === 'error' ? '⚠️' : '✅'}</span>
              <span>${statusBanner.text}</span>
            </span>
            <button id="banner-dismiss" class="text-current opacity-70 hover:opacity-100 font-bold">✕</button>
          </div>
        ` : ''}

        <!-- Navigation Tabs -->
        <div class="flex items-center justify-between bg-white p-3 rounded-[24px] border border-slate-100 shadow-sm overflow-x-auto no-scrollbar">
          <div class="flex items-center gap-2">
            <button 
              data-tab="dishes" 
              class="px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'dishes' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/20' 
                  : 'bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E]'
              }"
            >
              <span>🍽️ Dishes</span>
              <span class="px-2 py-0.5 rounded-full ${activeTab === 'dishes' ? 'bg-white/20 text-white' : 'bg-slate-200 text-[#646982]'} text-[10px] font-bold">${dishes.length}</span>
            </button>

            <button 
              data-tab="categories" 
              class="px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'categories' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/20' 
                  : 'bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E]'
              }"
            >
              <span>📁 Dynamic Categories</span>
              <span class="px-2 py-0.5 rounded-full ${activeTab === 'categories' ? 'bg-white/20 text-white' : 'bg-slate-200 text-[#646982]'} text-[10px] font-bold">${categories.length}</span>
            </button>

            <button 
              data-tab="inventory" 
              class="px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'inventory' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/20' 
                  : 'bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E]'
              }"
            >
              <span>⚖️ Raw Inventory & BOM</span>
              <span class="px-2 py-0.5 rounded-full ${activeTab === 'inventory' ? 'bg-white/20 text-white' : 'bg-slate-200 text-[#646982]'} text-[10px] font-bold">${inventoryItems.length}</span>
            </button>

            <button 
              data-tab="offers" 
              class="px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'offers' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/20' 
                  : 'bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E]'
              }"
            >
              <span>🏷️ Offer Banners</span>
              <span class="px-2 py-0.5 rounded-full ${activeTab === 'offers' ? 'bg-white/20 text-white' : 'bg-slate-200 text-[#646982]'} text-[10px] font-bold">${offerBanners.length}</span>
            </button>
          </div>

          <!-- Search Box (for Dishes tab) -->
          ${activeTab === 'dishes' ? `
            <div class="relative pr-2">
              <input 
                type="text" 
                id="menu-search-input" 
                value="${searchTerm}" 
                placeholder="Search dishes..." 
                class="bg-[#F0F5FA] border border-slate-100 rounded-2xl px-4 py-2 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none focus:ring-2 focus:ring-[#FF7622]/20 w-64"
              />
            </div>
          ` : ''}
        </div>

        <!-- TAB 1: DISHES -->
        ${activeTab === 'dishes' ? `
          <!-- Category Filter Pills Rail -->
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            ${categoryNames.map(cat => `
              <button 
                data-mgmt-cat="${cat}" 
                class="px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat 
                    ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/20' 
                    : 'bg-white border border-slate-100 text-[#646982] hover:text-[#181C2E]'
                }"
              >
                ${cat}
              </button>
            `).join('')}
          </div>

          <!-- Dishes Table or Empty State -->
          ${filteredDishes.length === 0 ? `
            <div class="text-center py-20 px-6 bg-white border border-slate-100 rounded-[32px] space-y-4 shadow-sm">
              <div class="w-16 h-16 rounded-3xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-3xl mx-auto font-black">
                🍽️
              </div>
              <h3 class="text-base font-black text-[#181C2E]">No Dishes In Catalog</h3>
              <p class="text-xs text-[#646982] max-w-sm mx-auto">
                ${dishes.length === 0 
                  ? 'Your restaurant menu catalog is currently empty. Use the buttons above to author dishes and categories.' 
                  : 'No dishes match the selected category or search filter.'}
              </p>
              <div class="flex items-center justify-center gap-3 pt-2">
                <button id="empty-add-dish-btn" class="px-5 py-2.5 rounded-2xl bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold shadow-md shadow-[#FF7622]/20 cursor-pointer">
                  ＋ Author First Dish
                </button>
                <button id="empty-add-cat-btn" class="px-5 py-2.5 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] text-xs font-bold cursor-pointer">
                  ＋ Create Category
                </button>
              </div>
            </div>
          ` : `
            <div class="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
              <div class="grid grid-cols-12 gap-3 px-6 py-4 border-b border-slate-100 text-[11px] uppercase tracking-wider text-[#A0A5BA] font-bold">
                <div class="col-span-5">Dish / Category / Dietary</div>
                <div class="col-span-2">Price (₹)</div>
                <div class="col-span-2">Recipe BOM</div>
                <div class="col-span-3 text-right">86'd Availability & Actions</div>
              </div>

              <div class="divide-y divide-slate-100">
                ${filteredDishes.map(item => {
                  const isVeg = item.dietary_tag === 'Veg' || item.dietary === 'veg' || item.dietary === 'vegan';
                  const linkedIngredients = dishIngredients.filter(di => di.dish_id === item.id);
                  return `
                    <div class="grid grid-cols-12 gap-3 px-6 py-4 items-center hover:bg-[#F7F8F9] transition-colors ${!item.is_available ? 'bg-[#FFF0F2]/30' : ''}">
                      
                      <!-- Name, Photo & Dietary -->
                      <div class="col-span-5 flex items-center space-x-3.5">
                        <div class="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 flex-shrink-0 shadow-xs">
                          <img src="${item.image_url}" alt="${item.name}" class="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div class="flex items-center gap-2 mb-0.5">
                            <span class="w-4 h-4 rounded-md border ${isVeg ? 'border-[#059C6A]' : 'border-[#FF334B]'} flex items-center justify-center p-0.5" title="${item.dietary_tag || (isVeg ? 'Veg' : 'Non-Veg')}">
                              <span class="w-2 h-2 rounded-full ${isVeg ? 'bg-[#059C6A]' : 'bg-[#FF334B]'}"></span>
                            </span>
                            <h3 class="text-sm font-bold text-[#181C2E]">${item.name}</h3>
                          </div>
                          <span class="text-xs text-[#A0A5BA]">${item.category || 'General'}</span>
                          ${item.description ? `<p class="text-xs text-[#646982] line-clamp-1 mt-0.5">${item.description}</p>` : ''}
                        </div>
                      </div>

                      <!-- Price Editor -->
                      <div class="col-span-2">
                        <div class="flex items-center space-x-1.5">
                          <span class="text-xs text-[#A0A5BA]">₹</span>
                          <input 
                            type="number" 
                            data-edit-price="${item.id}" 
                            value="${item.price}" 
                            class="w-24 bg-[#F0F5FA] border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-bold text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-[#FF7622]/20"
                          />
                        </div>
                      </div>

                      <!-- Recipe BOM count -->
                      <div class="col-span-2">
                        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F0F5FA] border border-slate-100 text-xs font-medium text-[#646982]">
                          <span>⚖️</span>
                          <span>${linkedIngredients.length} ingredient(s)</span>
                        </span>
                      </div>

                      <!-- Availability & Actions -->
                      <div class="col-span-3 flex items-center justify-end gap-2.5">
                        <button 
                          data-toggle-avail="${item.id}" 
                          class="px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            item.is_available 
                              ? 'bg-[#EBF7F2] text-[#059C6A] hover:bg-emerald-100' 
                              : 'bg-[#FFF0F2] text-[#FF334B] hover:bg-rose-100'
                          }"
                        >
                          <span>${item.is_available ? '● Available' : '✕ 86’d (Sold Out)'}</span>
                        </button>

                        <button 
                          data-edit-dish="${item.id}" 
                          class="p-2 text-[#646982] hover:text-[#FF7622] hover:bg-[#F0F5FA] rounded-xl text-xs transition-colors cursor-pointer" 
                          title="Edit Dish & Recipe BOM"
                        >
                          ✏️
                        </button>

                        <button 
                          data-delete-dish="${item.id}" 
                          class="p-2 text-[#A0A5BA] hover:text-[#FF334B] hover:bg-[#FFF0F2] rounded-xl text-xs transition-colors cursor-pointer" 
                          title="Delete Dish"
                        >
                          🗑️
                        </button>
                      </div>

                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `}
        ` : ''}

        <!-- TAB 2: DYNAMIC CATEGORIES -->
        ${activeTab === 'categories' ? `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-black text-[#181C2E]">Dynamic Menu Categories</h3>
                <p class="text-xs text-[#646982]">Configured course classifications and dietary filters.</p>
              </div>
              <button id="cat-tab-add-btn" class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-md shadow-[#FF7622]/20 cursor-pointer">
                ＋ Create Category
              </button>
            </div>

            ${categories.length === 0 ? `
              <div class="text-center py-16 px-6 bg-white border border-slate-100 rounded-[32px] space-y-3 shadow-sm">
                <p class="text-sm font-bold text-[#181C2E]">No categories found</p>
                <p class="text-xs text-[#646982]">Create custom categories like "Signature Brews", "Woodfired Pizzas", or "Desserts".</p>
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${categories.map(c => {
                  const dishCount = dishes.filter(d => d.category_id === c.id || d.category === c.name).length;
                  return `
                    <div class="p-6 rounded-[28px] bg-white border border-slate-100 hover:border-slate-300 transition-all flex flex-col justify-between shadow-sm">
                      <div class="flex items-start justify-between">
                        <div>
                          <span class="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFEBE4] text-[#FF7622] font-bold">
                            ${c.course_type}
                          </span>
                          <h4 class="text-base font-bold text-[#181C2E] mt-2.5">${c.name}</h4>
                          <span class="text-xs text-[#646982] mt-0.5 inline-block">Scope: ${c.dietary_scope}</span>
                        </div>
                        <button data-delete-cat="${c.id}" class="text-[#A0A5BA] hover:text-[#FF334B] p-1 text-xs cursor-pointer" title="Delete Category">
                          🗑️
                        </button>
                      </div>

                      <div class="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-[#646982]">
                        <span>Assigned Dishes</span>
                        <span class="font-black text-[#181C2E] text-sm">${dishCount}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        ` : ''}

        <!-- TAB 3: RAW INVENTORY & BILL OF MATERIALS (BOM) -->
        ${activeTab === 'inventory' ? `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-black text-[#181C2E]">Raw Inventory Stock (Bill of Materials Engine)</h3>
                <p class="text-xs text-[#646982]">Live stock for recipe tracking. Placing an order auto-decrements stock. Depleting stock automatically 86's dependent dishes.</p>
              </div>
              <button id="inv-tab-add-btn" class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-md shadow-[#FF7622]/20 cursor-pointer">
                ＋ New Raw Material
              </button>
            </div>

            ${inventoryItems.length === 0 ? `
              <div class="text-center py-16 px-6 bg-white border border-slate-100 rounded-[32px] space-y-3 shadow-sm">
                <p class="text-sm font-bold text-[#181C2E]">No raw inventory materials registered</p>
                <p class="text-xs text-[#646982]">Register stock keeping units like Espresso Beans, Milk, Burrata, Flour to activate BOM auto-depletion.</p>
              </div>
            ` : `
              <div class="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div class="grid grid-cols-12 gap-3 px-6 py-4 border-b border-slate-100 text-[11px] uppercase tracking-wider text-[#A0A5BA] font-bold">
                  <div class="col-span-5">Raw Material / Ingredient</div>
                  <div class="col-span-3">Current Stock Level</div>
                  <div class="col-span-2">Unit</div>
                  <div class="col-span-2 text-right">Quick Restock</div>
                </div>

                <div class="divide-y divide-slate-100">
                  ${inventoryItems.map(inv => {
                    const dependentCount = dishIngredients.filter(di => di.inventory_item_id === inv.id).length;
                    const isDepleted = Number(inv.current_stock) <= 0;
                    return `
                      <div class="grid grid-cols-12 gap-3 px-6 py-4 items-center hover:bg-[#F7F8F9] transition-colors ${isDepleted ? 'bg-[#FFF0F2]/30' : ''}">
                        <div class="col-span-5">
                          <h4 class="text-sm font-bold text-[#181C2E]">${inv.name}</h4>
                          <span class="text-xs text-[#A0A5BA]">Used in ${dependentCount} dish recipe(s)</span>
                        </div>

                        <div class="col-span-3">
                          <span class="text-sm font-black ${isDepleted ? 'text-[#FF334B]' : 'text-[#181C2E]'}">
                            ${inv.current_stock}
                          </span>
                          ${isDepleted ? `
                            <span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF334B]">
                              Depleted (86'd Dishes)
                            </span>
                          ` : ''}
                        </div>

                        <div class="col-span-2">
                          <span class="text-xs font-bold px-2.5 py-1 rounded-xl bg-[#F0F5FA] text-[#FF7622]">
                            ${inv.unit}
                          </span>
                        </div>

                        <div class="col-span-2 flex items-center justify-end space-x-2">
                          <button data-restock-add="${inv.id}" data-add="50" class="px-3 py-1.5 rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-xs font-bold text-[#181C2E] cursor-pointer">
                            +50
                          </button>
                          <button data-restock-add="${inv.id}" data-add="500" class="px-3 py-1.5 rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-xs font-bold text-[#181C2E] cursor-pointer">
                            +500
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `}
          </div>
        ` : ''}

        <!-- TAB 4: PROMOTIONAL OFFER BANNERS -->
        ${activeTab === 'offers' ? `
          <div class="space-y-4">
            <!-- Tab Subheader -->
            <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div>
                <h3 class="text-sm font-bold text-[#181C2E]">Customer Dine-In Offer Banners</h3>
                <p class="text-xs text-[#646982]">Promotional banners displayed under the cafe name in guest dine-in view. Delete or hide expired offers at any time.</p>
              </div>
              <div class="flex items-center flex-wrap gap-2.5">
                <span class="text-xs font-bold px-3 py-1.5 rounded-full ${activeOffersCount > 0 ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-slate-100 text-[#646982]'}">
                  ● ${activeOffersCount} Live on Guest Menu
                </span>
                ${expiredOffersCount > 0 ? `
                  <span class="text-xs font-bold px-3 py-1.5 rounded-full bg-[#FFF0F2] text-[#FF334B]">
                    ⏳ ${expiredOffersCount} Period Ended
                  </span>
                  <button 
                    id="btn-delete-expired-offers" 
                    class="px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-[#FFF0F2] hover:bg-[#FFE5E8] text-[#FF334B] border border-rose-200 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-xs"
                    title="Delete all promotional banners whose validity period has ended"
                  >
                    <span>🗑️</span>
                    <span>Delete Expired (${expiredOffersCount})</span>
                  </button>
                ` : ''}
                <button 
                  id="offer-tab-add-btn" 
                  class="px-4 py-2 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <span>＋</span>
                  <span>Create Offer Banner</span>
                </button>
              </div>
            </div>

            <!-- Offer Banners Grid -->
            ${offerBanners.length === 0 ? `
              <div class="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center space-y-3">
                <div class="text-4xl">🏷️</div>
                <h4 class="text-sm font-bold text-[#181C2E]">No Promotional Offer Banners</h4>
                <p class="text-xs text-[#646982] max-w-sm mx-auto">Create a custom promotional banner with discount tags, coupon codes, and warm gradients to highlight cafe specials under the cafe name.</p>
                <button id="empty-add-offer-btn" class="px-5 py-2.5 rounded-2xl text-xs font-bold bg-[#FF7622] text-white inline-flex items-center gap-2 shadow-md shadow-[#FF7622]/20 cursor-pointer">
                  <span>＋ Create First Offer Banner</span>
                </button>
              </div>
            ` : `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${offerBanners.map(banner => {
                  const isExpired = store.isOfferExpired ? store.isOfferExpired(banner) : (banner.valid_until && Date.now() > banner.valid_until);
                  const isLive = banner.is_active && !isExpired;
                  
                  return `
                    <div class="bg-white rounded-3xl border ${isExpired ? 'border-rose-100 bg-rose-50/10' : 'border-slate-100'} shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
                      <!-- Banner Visual Preview -->
                      <div class="p-4 bg-gradient-to-r ${banner.bg_gradient || 'from-[#FF7622] to-[#FFA14A]'} text-white relative overflow-hidden">
                        <div class="absolute -right-4 -bottom-4 w-16 h-16 rounded-full bg-white/10 pointer-events-none"></div>
                        <div class="flex items-start justify-between gap-2 mb-2">
                          <div class="flex items-center gap-1.5">
                            <span class="text-base">${banner.icon || '🏷️'}</span>
                            <span class="bg-white/20 backdrop-blur-xs text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/30">
                              ${banner.badge_text || 'OFFER'}
                            </span>
                          </div>
                          ${banner.coupon_code ? `
                            <span class="bg-white text-[#181C2E] text-[10px] font-black font-mono px-2 py-0.5 rounded-lg shadow-xs">
                              ${banner.coupon_code}
                            </span>
                          ` : ''}
                        </div>
                        <h4 class="text-sm font-black tracking-tight leading-snug">${banner.title}</h4>
                        ${banner.subtitle ? `
                          <p class="text-[11px] text-white/90 line-clamp-2 mt-1 leading-relaxed">${banner.subtitle}</p>
                        ` : ''}
                      </div>

                      <!-- Details & Action Bar -->
                      <div class="p-4 space-y-3">
                        <!-- Status and Expiration Pill -->
                        <div class="flex items-center justify-between gap-2 text-xs">
                          <div>
                            ${isExpired ? `
                              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0F2] text-[#FF334B] border border-rose-200">
                                <span>⏳</span>
                                <span>Period Ended (Hidden)</span>
                              </span>
                            ` : !banner.is_active ? `
                              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-[#646982] border border-slate-200">
                                <span>⚪</span>
                                <span>Don't Display (Hidden)</span>
                              </span>
                            ` : `
                              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF7F2] text-[#059C6A] border border-emerald-200">
                                <span>🟢</span>
                                <span>Live on Guest Menu</span>
                              </span>
                            `}
                          </div>

                          <span class="font-semibold text-xs text-[#181C2E]">
                            ${banner.discount_type === 'flat' ? `Flat ₹${banner.discount_value} OFF` : `${banner.discount_percent || banner.discount_value}% Discount`}
                          </span>
                        </div>

                        <!-- Time Period Info -->
                        <div class="text-[11px] ${isExpired ? 'text-[#FF334B] font-semibold' : 'text-[#646982]'} border-t border-slate-100 pt-2 flex items-center justify-between">
                          <span class="flex items-center gap-1 truncate">
                            <span>🕒</span>
                            <span>${banner.valid_until ? `Ends: ${new Date(banner.valid_until).toLocaleDateString()} ${new Date(banner.valid_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No expiry (Permanent)'}</span>
                          </span>
                          ${banner.min_order_amount > 0 ? `
                            <span class="text-[10px] font-bold bg-[#F0F5FA] px-2 py-0.5 rounded-full shrink-0">Min. ₹${banner.min_order_amount}</span>
                          ` : ''}
                        </div>

                        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                          <!-- Toggle Display Button -->
                          ${isExpired ? `
                            <button 
                              disabled 
                              class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-[#A0A5BA] cursor-not-allowed flex items-center gap-1"
                              title="Offer time period has ended. Not displayed to customers."
                            >
                              <span>⏳ Expired</span>
                            </button>
                          ` : `
                            <button 
                              data-toggle-offer="${banner.id}"
                              class="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                banner.is_active 
                                  ? 'bg-[#EBF7F2] text-[#059C6A] hover:bg-[#D3EFE4]' 
                                  : 'bg-slate-100 text-[#646982] hover:bg-slate-200'
                              }"
                              title="${banner.is_active ? 'Click to hide offer from guest menu (Don\'t Display)' : 'Click to display offer on guest menu'}"
                            >
                              <span class="w-1.5 h-1.5 rounded-full ${banner.is_active ? 'bg-[#059C6A]' : 'bg-slate-400'}"></span>
                              <span>${banner.is_active ? 'Displaying' : 'Don\'t Display'}</span>
                            </button>
                          `}

                          <!-- Edit & Delete Buttons -->
                          <div class="flex items-center gap-1.5">
                            <button 
                              data-edit-offer="${banner.id}"
                              class="px-2.5 py-1 rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#181C2E] flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Edit offer settings, title, or time period"
                            >
                              <span>✏️</span>
                              <span>Edit</span>
                            </button>
                            <button 
                              data-delete-offer="${banner.id}"
                              class="px-2.5 py-1 rounded-xl bg-[#FFF0F2] hover:bg-[#FFE5E8] text-[#FF334B] flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer"
                              title="Permanently delete this promotional offer"
                            >
                              <span>🗑️</span>
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>
        ` : ''}

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Ingestion Mode Tabs switching
    const tabCatalog = container.querySelector('#tab-btn-catalog');
    const tabText = container.querySelector('#tab-btn-text');
    const tabImage = container.querySelector('#tab-btn-image');
    const tabMasterAi = container.querySelector('#tab-btn-master-ai');

    if (tabCatalog && onSwitchMode) {
      tabCatalog.onclick = () => onSwitchMode('catalog');
    }
    if (tabText && onSwitchMode) {
      tabText.onclick = () => onSwitchMode('text');
    }
    if (tabImage && onSwitchMode) {
      tabImage.onclick = () => onSwitchMode('image');
    }

    if (tabMasterAi) {
      tabMasterAi.onclick = (e) => {
        e?.preventDefault?.();
        // Update active tab styling
        container.querySelectorAll('#tab-btn-catalog, #tab-btn-text, #tab-btn-image, #tab-btn-master-ai').forEach(btn => {
          btn.classList.remove('bg-[#FF7622]', 'text-white', 'shadow-md', 'shadow-[#FF7622]/30', 'bg-emerald-600', 'shadow-emerald-600/30');
          btn.classList.add('text-[#646982]');
        });
        tabMasterAi.classList.remove('text-[#646982]', 'text-emerald-800', 'bg-emerald-500/10');
        tabMasterAi.classList.add('bg-emerald-600', 'text-white', 'shadow-md', 'shadow-emerald-600/30');

        try {
          renderMasterMenuIngestionModal(getModalLayer(), store, {
            onComplete: (summary) => {
              statusBanner = { 
                type: 'success', 
                text: `Ingested ${summary?.categoriesCreated || 0} categories and ${summary?.dishesCreated || 0} dishes successfully!` 
              };
              render();
            }
          });
        } catch (err) {
          console.error('[MenuView] Error opening MasterMenuIngestionModal:', err);
        }
      };
    }

    // Tab switching
    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = (e) => {
        activeTab = e.currentTarget.getAttribute('data-tab');
        render();
      };
    });

    // Dismiss banner
    const bannerDismiss = container.querySelector('#banner-dismiss');
    if (bannerDismiss) {
      bannerDismiss.onclick = () => { statusBanner = null; render(); };
    }

    // Category selection in dishes tab
    container.querySelectorAll('[data-mgmt-cat]').forEach(btn => {
      btn.onclick = (e) => {
        selectedCategory = e.currentTarget.getAttribute('data-mgmt-cat');
        render();
      };
    });

    // Search input
    const searchInput = container.querySelector('#menu-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        searchTerm = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const next = container.querySelector('#menu-search-input');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      };
    }

    // Action: Purge Mock Catalog
    const purgeBtn = container.querySelector('#btn-purge-catalog');
    if (purgeBtn) {
      purgeBtn.onclick = async () => {
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_PURGE',
            actionLabel: 'Purge Mock Catalog',
            targetItem: 'Full Menu Catalog'
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to purge catalog.' };
            render();
            return;
          }
        }

        store.purgeMockCatalog();
        statusBanner = { type: 'success', text: 'All mock dishes, categories, and inventory items purged successfully.' };
        render();
      };
    }

    // Action: Seed Demo Menu
    const seedBtn = container.querySelector('#btn-seed-catalog');
    if (seedBtn) {
      seedBtn.onclick = () => {
        store.seedDemoCatalog();
        statusBanner = { type: 'success', text: 'Artisanal demo catalog and BOM recipe mappings restored.' };
        render();
      };
    }

    // Action: Add Category Modal
    const addCatBtn = container.querySelector('#btn-add-category');
    const catTabAddBtn = container.querySelector('#cat-tab-add-btn');
    const emptyAddCatBtn = container.querySelector('#empty-add-cat-btn');
    [addCatBtn, catTabAddBtn, emptyAddCatBtn].filter(Boolean).forEach(btn => {
      btn.onclick = () => {
        renderCategoryBuilderModal(getModalLayer(), store, {
          onSuccess: (cat) => {
            statusBanner = { type: 'success', text: `Category "${cat.name}" created successfully!` };
            render();
          }
        });
      };
    });

    // Action: Master Admin AI Menu Ingestion
    const aiMenuImportBtn = container.querySelector('#btn-ai-menu-import');
    if (aiMenuImportBtn) {
      aiMenuImportBtn.onclick = () => {
        renderMasterMenuIngestionModal(getModalLayer(), store, {
          onComplete: (summary) => {
            statusBanner = { 
              type: 'success', 
              text: `Ingested ${summary?.categoriesCreated || 0} categories and ${summary?.dishesCreated || 0} dishes successfully!` 
            };
            render();
          }
        });
      };
    }

    // Action: Add Dish Modal
    const addDishBtn = container.querySelector('#btn-add-dish');
    const emptyAddDishBtn = container.querySelector('#empty-add-dish-btn');
    [addDishBtn, emptyAddDishBtn].filter(Boolean).forEach(btn => {
      btn.onclick = () => {
        renderDishCreationModal(getModalLayer(), store, {
          onSuccess: (dish) => {
            statusBanner = { type: 'success', text: `Dish "${dish.name}" added to catalog!` };
            render();
          }
        });
      };
    });

    // Action: Edit Dish Modal
    container.querySelectorAll('[data-edit-dish]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-edit-dish');
        const dish = store.dishes.find(d => d.id === id) || store.menuItems.find(m => m.id === id);
        if (dish) {
          renderDishCreationModal(getModalLayer(), store, {
            initialDish: dish,
            onSuccess: (updated) => {
              statusBanner = { type: 'success', text: `Dish "${updated.name}" updated successfully!` };
              render();
            }
          });
        }
      };
    });

    // Action: Delete Dish
    container.querySelectorAll('[data-delete-dish]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-delete-dish');
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_DISH_DELETE',
            actionLabel: 'Delete Dish',
            targetItem: id
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to delete dishes.' };
            render();
            return;
          }
        }
        store.deleteDish(id);
        statusBanner = { type: 'success', text: 'Dish deleted.' };
        render();
      };
    });

    // Action: Delete Category
    container.querySelectorAll('[data-delete-cat]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-delete-cat');
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_CATEGORY_DELETE',
            actionLabel: 'Delete Category',
            targetItem: id
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to delete categories.' };
            render();
            return;
          }
        }
        store.deleteCategory(id);
        statusBanner = { type: 'success', text: 'Category deleted.' };
        render();
      };
    });

    // Action: Toggle Availability (86'd)
    container.querySelectorAll('[data-toggle-avail]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-toggle-avail');
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_86_TOGGLE',
            actionLabel: 'Toggle 86\'d Availability',
            targetItem: id
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to toggle availability.' };
            render();
            return;
          }
        }
        store.toggleDishAvailability(id);
        render();
      };
    });

    // Action: Price change
    container.querySelectorAll('[data-edit-price]').forEach(input => {
      input.onchange = async (e) => {
        const id = input.getAttribute('data-edit-price');
        const val = parseFloat(e.target.value) || 0;
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_PRICE_CHANGE',
            actionLabel: 'Change Dish Price',
            targetItem: id
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to update price.' };
            render();
            return;
          }
        }
        store.updateDish(id, { price: val });
        render();
      };
    });

    // Action: Restock Inventory
    container.querySelectorAll('[data-restock-add]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-restock-add');
        const add = parseFloat(btn.getAttribute('data-add')) || 0;
        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'INVENTORY_RESTOCK',
            actionLabel: 'Restock Raw Material',
            targetItem: id
          });
          if (!override.approved) {
            statusBanner = { type: 'error', text: '403 Forbidden: Admin PIN required to restock inventory.' };
            render();
            return;
          }
        }
        store.restockInventoryItem(id, add);
        statusBanner = { type: 'success', text: `Restocked ${add} units. Dependent dishes updated!` };
        render();
      };
    });

    // Action: Add Offer Banner
    const addOfferBtn = container.querySelector('#btn-add-offer');
    const offerTabAddBtn = container.querySelector('#offer-tab-add-btn');
    const emptyAddOfferBtn = container.querySelector('#empty-add-offer-btn');
    [addOfferBtn, offerTabAddBtn, emptyAddOfferBtn].filter(Boolean).forEach(btn => {
      btn.onclick = () => {
        renderOfferBannerModal(getModalLayer(), store, {
          onSuccess: (banner) => {
            statusBanner = { type: 'success', text: `Offer banner "${banner.title}" published successfully!` };
            activeTab = 'offers';
            render();
          }
        });
      };
    });

    // Action: Edit Offer Banner
    container.querySelectorAll('[data-edit-offer]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-edit-offer');
        const banner = store.offerBanners?.find(b => b.id === id);
        if (banner) {
          renderOfferBannerModal(getModalLayer(), store, {
            bannerToEdit: banner,
            onSuccess: (updated) => {
              statusBanner = { type: 'success', text: `Offer banner "${updated.title}" updated!` };
              render();
            }
          });
        }
      };
    });

    // Action: Toggle Offer Banner Active Status
    container.querySelectorAll('[data-toggle-offer]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-toggle-offer');
        const res = store.toggleOfferBanner(id);
        if (res && res.success) {
          statusBanner = { type: 'success', text: `Offer banner is now ${res.is_active ? 'LIVE on guest menu' : 'PAUSED'}.` };
          render();
        }
      };
    });

    // Action: Delete Expired Offers Bulk Button
    const deleteExpiredBtn = container.querySelector('#btn-delete-expired-offers');
    if (deleteExpiredBtn) {
      deleteExpiredBtn.onclick = () => {
        const res = store.deleteExpiredOffers ? store.deleteExpiredOffers() : { count: 0 };
        const count = typeof res === 'object' && res !== null ? res.count : res;
        statusBanner = { type: 'success', text: `Successfully cleaned up ${count} expired promotional offer(s).` };
        render();
      };
    }

    // Action: Delete Offer Banner
    container.querySelectorAll('[data-delete-offer]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-delete-offer');
        const banner = store.offerBanners?.find(b => b.id === id);
        const name = banner?.title || 'Offer';
        const shouldDelete = typeof confirm === 'function' ? confirm(`Are you sure you want to delete the offer "${name}"?`) : true;
        if (shouldDelete) {
          store.deleteOfferBanner(id);
          statusBanner = { type: 'success', text: `Offer "${name}" deleted.` };
          render();
        }
      };
    });
  }

  const unsubscribe = store.subscribe(() => {
    render();
  });

  render();
  return () => unsubscribe();
}
