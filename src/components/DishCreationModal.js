/**
 * DishCreationModal.js
 * 
 * Rich Manual Dish Creation Interface with Bill of Materials (BOM).
 * Conforms to Milestone Menu Catalog Specifications:
 * - Dish Display Name & Detailed Description
 * - Image asset dropzone / Supabase Storage uploader with public URL resolution
 * - Category Selector dynamically sourced with inline "+ Add Category" shortcut
 * - Dietary Tag Toggle (Veg vs Non-Veg with iconic badges)
 * - Price Currency Field (INR with decimal validation)
 * - Expandable Recipe / Stock Composition (Bill of Materials) mapping raw materials
 * - Admin RBAC Guard with PIN Elevation Challenge
 */

import { supabase } from '../../supabase.js';
import { requestManagerOverride } from './ManagerOverrideModal.js';
import { renderCategoryBuilderModal } from './CategoryBuilderModal.js';

export function renderDishCreationModal(container, store, options = {}) {
  const {
    onSuccess = null,
    onCancel = null,
    initialDish = null
  } = options;

  let name = initialDish?.name || '';
  let description = initialDish?.description || '';
  let imageUrl = initialDish?.image_url || '';
  let categoryId = initialDish?.category_id || (store.categories[0]?.id || '');
  let dietaryTag = initialDish?.dietary_tag || 'Veg'; // 'Veg' | 'Non-Veg'
  let price = initialDish?.price !== undefined ? String(initialDish.price) : '';
  
  // Recipe Ingredients (BOM)
  // [{ inventory_item_id, quantity_required }]
  let recipeRows = [];
  if (initialDish && store.dishIngredients) {
    const existing = store.dishIngredients.filter(di => di.dish_id === initialDish.id);
    recipeRows = existing.map(e => ({
      inventory_item_id: e.inventory_item_id,
      quantity_required: e.quantity_required
    }));
  }

  let errorMessage = '';
  let isUploading = false;
  let isSaving = false;
  let showNewRawItemModal = false;
  let newRawItemName = '';
  let newRawItemStock = '100';
  let newRawItemUnit = 'g';

  const UNITS = ['ml', 'g', 'pcs', 'kg'];

  async function uploadImageFile(file) {
    if (!file) return;
    isUploading = true;
    errorMessage = '';
    render();

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `dish-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const filePath = `dishes/${fileName}`;

      // Try uploading to Supabase Storage bucket 'dish-images'
      if (supabase?.storage) {
        const { data, error } = await supabase.storage
          .from('dish-images')
          .upload(filePath, file, { upsert: true, cacheControl: '3600' });

        if (!error) {
          const { data: publicData } = supabase.storage
            .from('dish-images')
            .getPublicUrl(filePath);

          if (publicData?.publicUrl) {
            imageUrl = publicData.publicUrl;
            isUploading = false;
            render();
            return;
          }
        }
      }

      // Fallback: Read as Data URL so image immediately renders offline
      const reader = new FileReader();
      reader.onload = (e) => {
        imageUrl = e.target.result;
        isUploading = false;
        render();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('Image upload fallback triggered:', err);
      const reader = new FileReader();
      reader.onload = (e) => {
        imageUrl = e.target.result;
        isUploading = false;
        render();
      };
      reader.readAsDataURL(file);
    }
  }

  function render() {
    const categories = store.categories || [];
    const inventoryItems = store.inventoryItems || [];

    // Ensure categoryId is valid
    if (!categoryId && categories.length > 0) {
      categoryId = categories[0].id;
    }

    container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181C2E]/70 backdrop-blur-md overflow-y-auto animate-fadeIn">
        <div class="relative w-full max-w-2xl bg-white border border-slate-100 rounded-[32px] shadow-2xl overflow-hidden flex flex-col font-sans text-[#181C2E] my-8 animate-in fade-in zoom-in-95 duration-200">
          
          <!-- Modal Header -->
          <div class="px-6 py-5 border-b border-slate-100 bg-white flex items-center justify-between">
            <div class="flex items-center space-x-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                🍲
              </div>
              <div>
                <h2 class="text-base font-black tracking-tight text-[#181C2E]">
                  ${initialDish ? 'Edit Dish Catalog Entry' : 'Manual Dish Creation & Recipe BOM'}
                </h2>
                <p class="text-xs text-[#646982]">Author dish display, photography, pricing, and raw material bill of materials.</p>
              </div>
            </div>
            <button id="dish-modal-close" class="w-8 h-8 rounded-full bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982] hover:text-[#181C2E] flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Modal Scrollable Content -->
          <div class="p-6 space-y-5 max-h-[72vh] overflow-y-auto pr-3">
            ${errorMessage ? `
              <div class="p-3.5 rounded-2xl bg-[#FFF0F2] border border-rose-200 text-[#FF334B] text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>${errorMessage}</span>
              </div>
            ` : ''}

            <!-- 1. Display Name & Price Row -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Dish Display Name <span class="text-[#FF7622]">*</span>
                </label>
                <input 
                  type="text" 
                  id="dish-name-input" 
                  value="${name}"
                  placeholder="e.g. Truffle Infused Burrata" 
                  class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-3 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all font-medium"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Price (₹ INR) <span class="text-[#FF7622]">*</span>
                </label>
                <div class="relative">
                  <span class="absolute left-4 top-3 text-xs font-bold text-[#A0A5BA]">₹</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0"
                    id="dish-price-input" 
                    value="${price}"
                    placeholder="450.00" 
                    class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl pl-8 pr-3 py-3 text-xs font-bold text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <!-- 2. Category Selector & Dietary Tag Toggle -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Category Selector -->
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-[#181C2E] uppercase tracking-wider">
                    Category <span class="text-[#FF7622]">*</span>
                  </label>
                  <button 
                    id="dish-quick-add-cat-btn" 
                    type="button" 
                    class="text-xs text-[#FF7622] hover:text-[#F15B00] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>＋</span> New Category
                  </button>
                </div>
                <select 
                  id="dish-category-select" 
                  class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-3 text-xs text-[#181C2E] font-medium focus:outline-none transition-all cursor-pointer"
                >
                  ${categories.length === 0 ? `
                    <option value="" disabled selected>No categories created yet</option>
                  ` : categories.map(c => `
                    <option value="${c.id}" ${categoryId === c.id ? 'selected' : ''}>
                      ${c.name} (${c.course_type} • ${c.dietary_scope})
                    </option>
                  `).join('')}
                </select>
              </div>

              <!-- Dietary Tag Toggle -->
              <div>
                <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                  Dietary Classification <span class="text-[#FF7622]">*</span>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <button 
                    type="button" 
                    id="dietary-toggle-veg" 
                    class="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                      dietaryTag === 'Veg' 
                        ? 'bg-[#EBF7F2] border-emerald-300 text-[#059C6A] shadow-xs' 
                        : 'bg-[#F0F5FA] border-slate-100 text-[#646982] hover:text-[#181C2E]'
                    }"
                  >
                    <span class="w-3.5 h-3.5 rounded-sm border border-[#059C6A] flex items-center justify-center p-0.5">
                      <span class="w-2 h-2 rounded-full bg-[#059C6A]"></span>
                    </span>
                    <span>Vegetarian</span>
                  </button>

                  <button 
                    type="button" 
                    id="dietary-toggle-nonveg" 
                    class="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                      dietaryTag === 'Non-Veg' 
                        ? 'bg-[#FFF0F2] border-rose-300 text-[#FF334B] shadow-xs' 
                        : 'bg-[#F0F5FA] border-slate-100 text-[#646982] hover:text-[#181C2E]'
                    }"
                  >
                    <span class="w-3.5 h-3.5 rounded-sm border border-[#FF334B] flex items-center justify-center p-0.5">
                      <span class="w-2 h-2 rounded-full bg-[#FF334B]"></span>
                    </span>
                    <span>Non-Veg</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 3. Description Input -->
            <div>
              <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                Dish Description & Tasting Notes
              </label>
              <textarea 
                id="dish-desc-input" 
                rows="2" 
                placeholder="Ingredients, preparation technique, flavor profile, allergen notices..." 
                class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-2.5 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all resize-none font-medium"
              >${description}</textarea>
            </div>

            <!-- 4. Image Uploader Dropzone -->
            <div>
              <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                Dish Photography (Supabase Storage Bucket: dish-images)
              </label>
              <div class="flex items-center gap-4">
                <div class="relative w-20 h-20 rounded-2xl bg-[#F0F5FA] border border-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-xs">
                  ${imageUrl ? `
                    <img src="${imageUrl}" alt="Preview" class="w-full h-full object-cover" />
                  ` : `
                    <span class="text-2xl text-[#A0A5BA]">📷</span>
                  `}
                  ${isUploading ? `
                    <div class="absolute inset-0 bg-[#181C2E]/70 flex items-center justify-center">
                      <span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    </div>
                  ` : ''}
                </div>

                <div class="flex-1 space-y-2">
                  <div class="flex items-center gap-2">
                    <input 
                      type="file" 
                      id="dish-file-input" 
                      accept="image/*" 
                      class="hidden" 
                    />
                    <button 
                      type="button" 
                      id="dish-upload-trigger" 
                      class="px-4 py-2 rounded-2xl bg-[#ECF0F4] hover:bg-[#E2E8F0] text-xs font-bold text-[#181C2E] border border-slate-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>📁</span>
                      <span>Choose File...</span>
                    </button>
                    <span class="text-xs text-[#A0A5BA]">or paste direct image URL below</span>
                  </div>
                  <input 
                    type="url" 
                    id="dish-url-input" 
                    value="${imageUrl}" 
                    placeholder="https://images.unsplash.com/photo-..." 
                    class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-3.5 py-2 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- 5. Granular Recipe-Level Inventory Composition (Bill of Materials) -->
            <div class="border-t border-slate-100 pt-4">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h3 class="text-xs font-bold text-[#181C2E] uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚖️</span>
                    <span>Bill of Materials (BOM) & Inventory Auto-Depletion</span>
                  </h3>
                  <p class="text-xs text-[#646982]">Map raw ingredients consumed per serving. When stock hits 0, dish automatically 86's on guest screens.</p>
                </div>
                <div class="flex items-center gap-2">
                  <button 
                    type="button" 
                    id="dish-new-raw-btn" 
                    class="text-xs px-3 py-1.5 rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#FF7622] font-bold transition-colors cursor-pointer"
                  >
                    ＋ New Raw Material
                  </button>
                  <button 
                    type="button" 
                    id="dish-add-bom-row-btn" 
                    class="text-xs px-3 py-1.5 rounded-xl bg-[#FFEBE4] hover:bg-[#FFD9CD] text-[#FF7622] font-bold transition-colors cursor-pointer"
                  >
                    ＋ Add Ingredient
                  </button>
                </div>
              </div>

              <!-- BOM Dynamic Table -->
              <div class="bg-[#F7F8F9] border border-slate-100 rounded-2xl overflow-hidden p-3.5 space-y-2">
                ${recipeRows.length === 0 ? `
                  <div class="text-center py-4 text-xs text-[#A0A5BA]">
                    No raw materials mapped yet. Click "＋ Add Ingredient" to link inventory items.
                  </div>
                ` : `
                  <div class="grid grid-cols-12 gap-2 text-[10px] uppercase text-[#A0A5BA] font-bold px-2 pb-1 border-b border-slate-200">
                    <div class="col-span-6">Raw Inventory Item</div>
                    <div class="col-span-3">Qty / Serving</div>
                    <div class="col-span-2">Unit</div>
                    <div class="col-span-1 text-right">Del</div>
                  </div>

                  ${recipeRows.map((row, idx) => {
                    const selItem = inventoryItems.find(i => i.id === row.inventory_item_id);
                    const unitLabel = selItem ? selItem.unit : 'unit';
                    return `
                      <div class="grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-slate-100 text-xs shadow-xs">
                        <!-- Select Item -->
                        <div class="col-span-6">
                          <select 
                            data-bom-item="${idx}" 
                            class="w-full bg-[#F0F5FA] border border-slate-100 rounded-xl px-3 py-1.5 text-xs text-[#181C2E] font-medium focus:outline-none"
                          >
                            <option value="" disabled ${!row.inventory_item_id ? 'selected' : ''}>-- Select Ingredient --</option>
                            ${inventoryItems.map(inv => `
                              <option value="${inv.id}" ${row.inventory_item_id === inv.id ? 'selected' : ''}>
                                ${inv.name} (Stock: ${inv.current_stock} ${inv.unit})
                              </option>
                            `).join('')}
                          </select>
                        </div>

                        <!-- Quantity -->
                        <div class="col-span-3">
                          <input 
                            type="number" 
                            step="any" 
                            min="0.01" 
                            data-bom-qty="${idx}" 
                            value="${row.quantity_required || ''}" 
                            placeholder="e.g. 50" 
                            class="w-full bg-[#F0F5FA] border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-bold text-[#181C2E] focus:outline-none"
                          />
                        </div>

                        <!-- Unit (Auto-filled) -->
                        <div class="col-span-2">
                          <span class="text-xs font-bold text-[#FF7622] px-2.5 py-1 rounded-lg bg-[#FFEBE4] inline-block">
                            ${unitLabel}
                          </span>
                        </div>

                        <!-- Remove Row -->
                        <div class="col-span-1 text-right">
                          <button 
                            type="button" 
                            data-bom-remove="${idx}" 
                            class="text-[#FF334B] hover:text-red-700 font-bold text-xs p-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                `}
              </div>
            </div>

            <!-- Inline Quick Add Raw Material Submodal -->
            ${showNewRawItemModal ? `
              <div class="p-4 rounded-2xl bg-[#FFEBE4] border border-orange-200 space-y-3 animate-fadeIn">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-[#FF7622]">Create New Raw Inventory Material</h4>
                  <button type="button" id="raw-cancel-btn" class="text-xs text-[#646982] hover:text-[#181C2E] cursor-pointer">✕</button>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input 
                    type="text" 
                    id="raw-name-input" 
                    value="${newRawItemName}" 
                    placeholder="Item name (e.g. Fresh Milk)" 
                    class="bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs text-[#181C2E] font-medium"
                  />
                  <input 
                    type="number" 
                    id="raw-stock-input" 
                    value="${newRawItemStock}" 
                    placeholder="Initial Stock" 
                    class="bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#181C2E]"
                  />
                  <select 
                    id="raw-unit-select" 
                    class="bg-white border border-slate-100 rounded-xl px-3 py-2 text-xs text-[#181C2E] font-medium"
                  >
                    ${UNITS.map(u => `<option value="${u}" ${newRawItemUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
                  </select>
                </div>
                <div class="flex justify-end">
                  <button 
                    type="button" 
                    id="raw-save-btn" 
                    class="px-4 py-2 rounded-xl bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs cursor-pointer shadow-sm"
                  >
                    Save Raw Material
                  </button>
                </div>
              </div>
            ` : ''}

          </div>

          <!-- Modal Footer -->
          <div class="px-6 py-4 border-t border-slate-100 bg-[#FDFEFE] flex items-center justify-between">
            <button 
              id="dish-cancel-btn" 
              class="px-5 py-2.5 rounded-2xl text-xs font-bold text-[#646982] hover:text-[#181C2E] bg-[#F0F5FA] hover:bg-[#E4ECF4] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              id="dish-submit-btn" 
              ${isSaving || isUploading ? 'disabled' : ''}
              class="px-6 py-3 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-md shadow-[#FF7622]/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              ${isSaving ? `
                <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Saving Dish...</span>
              ` : `
                <span>＋</span>
                <span>${initialDish ? 'Update Dish' : 'Publish Dish to Menu'}</span>
              `}
            </button>
          </div>

        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const closeBtn = container.querySelector('#dish-modal-close');
    const cancelBtn = container.querySelector('#dish-cancel-btn');
    const submitBtn = container.querySelector('#dish-submit-btn');

    if (closeBtn) closeBtn.onclick = () => { onCancel?.(); container.innerHTML = ''; };
    if (cancelBtn) cancelBtn.onclick = () => { onCancel?.(); container.innerHTML = ''; };

    // Inputs
    const nameInput = container.querySelector('#dish-name-input');
    if (nameInput) nameInput.oninput = (e) => { name = e.target.value; };

    const priceInput = container.querySelector('#dish-price-input');
    if (priceInput) priceInput.oninput = (e) => { price = e.target.value; };

    const descInput = container.querySelector('#dish-desc-input');
    if (descInput) descInput.oninput = (e) => { description = e.target.value; };

    const urlInput = container.querySelector('#dish-url-input');
    if (urlInput) urlInput.oninput = (e) => { imageUrl = e.target.value; };

    const catSelect = container.querySelector('#dish-category-select');
    if (catSelect) catSelect.onchange = (e) => { categoryId = e.target.value; };

    // Dietary toggles
    const vegBtn = container.querySelector('#dietary-toggle-veg');
    const nonVegBtn = container.querySelector('#dietary-toggle-nonveg');
    if (vegBtn) vegBtn.onclick = () => { dietaryTag = 'Veg'; render(); };
    if (nonVegBtn) nonVegBtn.onclick = () => { dietaryTag = 'Non-Veg'; render(); };

    // Image Upload
    const uploadTrigger = container.querySelector('#dish-upload-trigger');
    const fileInput = container.querySelector('#dish-file-input');
    if (uploadTrigger && fileInput) {
      uploadTrigger.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          uploadImageFile(e.target.files[0]);
        }
      };
    }

    // Quick Add Category
    const quickAddCatBtn = container.querySelector('#dish-quick-add-cat-btn');
    if (quickAddCatBtn) {
      quickAddCatBtn.onclick = () => {
        const modalLayer = document.getElementById('app-modal-layer') || container;
        renderCategoryBuilderModal(modalLayer, store, {
          onSuccess: (newCat) => {
            categoryId = newCat.id;
            render();
          },
          onCancel: () => {
            render();
          }
        });
      };
    }

    // BOM Dynamic Rows
    const addBomRowBtn = container.querySelector('#dish-add-bom-row-btn');
    if (addBomRowBtn) {
      addBomRowBtn.onclick = () => {
        const firstInv = store.inventoryItems[0]?.id || '';
        recipeRows.push({ inventory_item_id: firstInv, quantity_required: 1 });
        render();
      };
    }

    container.querySelectorAll('[data-bom-item]').forEach(el => {
      el.onchange = (e) => {
        const idx = parseInt(el.getAttribute('data-bom-item'), 10);
        recipeRows[idx].inventory_item_id = e.target.value;
        render();
      };
    });

    container.querySelectorAll('[data-bom-qty]').forEach(el => {
      el.oninput = (e) => {
        const idx = parseInt(el.getAttribute('data-bom-qty'), 10);
        recipeRows[idx].quantity_required = parseFloat(e.target.value) || 0;
      };
    });

    container.querySelectorAll('[data-bom-remove]').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.getAttribute('data-bom-remove'), 10);
        recipeRows.splice(idx, 1);
        render();
      };
    });

    // Quick Add Raw Material
    const newRawBtn = container.querySelector('#dish-new-raw-btn');
    if (newRawBtn) {
      newRawBtn.onclick = () => {
        showNewRawItemModal = true;
        render();
      };
    }
    const rawCancelBtn = container.querySelector('#raw-cancel-btn');
    if (rawCancelBtn) {
      rawCancelBtn.onclick = () => {
        showNewRawItemModal = false;
        render();
      };
    }
    const rawNameInput = container.querySelector('#raw-name-input');
    if (rawNameInput) rawNameInput.oninput = (e) => { newRawItemName = e.target.value; };
    const rawStockInput = container.querySelector('#raw-stock-input');
    if (rawStockInput) rawStockInput.oninput = (e) => { newRawItemStock = e.target.value; };
    const rawUnitSelect = container.querySelector('#raw-unit-select');
    if (rawUnitSelect) rawUnitSelect.onchange = (e) => { newRawItemUnit = e.target.value; };

    const rawSaveBtn = container.querySelector('#raw-save-btn');
    if (rawSaveBtn) {
      rawSaveBtn.onclick = async () => {
        const cleanRawName = (newRawItemName || '').trim();
        if (!cleanRawName) return;

        if (!store.canMutateCatalog()) {
          const override = await requestManagerOverride(store, {
            actionType: 'CATALOG_RAW_ITEM_CREATE',
            actionLabel: `Add Raw Material: ${cleanRawName}`,
            targetItem: cleanRawName
          });
          if (!override.approved) {
            errorMessage = '403 Forbidden: Admin PIN required to create raw inventory';
            render();
            return;
          }
        }

        const res = store.createInventoryItem({
          name: cleanRawName,
          current_stock: parseFloat(newRawItemStock) || 0,
          unit: newRawItemUnit
        });

        if (res.success) {
          showNewRawItemModal = false;
          newRawItemName = '';
          recipeRows.push({ inventory_item_id: res.item.id, quantity_required: 1 });
          render();
        } else {
          errorMessage = res.error || 'Failed to create inventory item';
          render();
        }
      };
    }

    // Submit Dish
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const cleanName = (name || '').trim();
        if (!cleanName) {
          errorMessage = 'Please enter a valid dish name';
          render();
          return;
        }

        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          errorMessage = 'Please enter a valid price in INR';
          render();
          return;
        }

        isSaving = true;
        render();

        try {
          // RBAC Check: Non-Admin staff must pass PIN elevation challenge
          if (!store.canMutateCatalog()) {
            const override = await requestManagerOverride(store, {
              actionType: initialDish ? 'CATALOG_DISH_UPDATE' : 'CATALOG_DISH_CREATE',
              actionLabel: `${initialDish ? 'Edit' : 'Create'} Dish: ${cleanName}`,
              targetItem: cleanName
            });

            if (!override.approved) {
              errorMessage = '403 Forbidden: Elevation challenge rejected. Admin PIN required.';
              isSaving = false;
              render();
              return;
            }
          }

          // Filter valid recipe rows
          const validIngredients = recipeRows.filter(r => r.inventory_item_id && r.quantity_required > 0);

          const dishData = {
            name: cleanName,
            description: (description || '').trim(),
            price: parsedPrice,
            category_id: categoryId || null,
            dietary_tag: dietaryTag,
            image_url: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
            ingredients: validIngredients
          };

          let res;
          if (initialDish) {
            res = store.updateDish(initialDish.id, dishData);
          } else {
            res = store.createDish(dishData);
          }

          if (res.success) {
            container.innerHTML = '';
            onSuccess?.(res.dish);
          } else {
            errorMessage = res.error || 'Failed to save dish';
            isSaving = false;
            render();
          }
        } catch (err) {
          errorMessage = err.message || 'Error saving dish';
          isSaving = false;
          render();
        }
      };
    }
  }

  render();
  return () => { container.innerHTML = ''; };
}
