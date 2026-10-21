/**
 * CategoryBuilderModal.js
 * 
 * Dynamic Category Builder Modal for AtYourScan.
 * Supports:
 * - Category Name (e.g. "Artisanal Brews", "Woodfired Pizzas", "Signature Mocktails")
 * - Course Type (Dropdown: Starter, Main Course, Dessert, Beverage, Accompaniment)
 * - Dietary Scope (Radio: All, Veg-Only, Non-Veg-Only)
 * - Role Check & Admin PIN Elevation Challenge for non-admin staff
 * - Direct persistence to Supabase and Store
 */

import { requestManagerOverride } from './ManagerOverrideModal.js';

export function renderCategoryBuilderModal(container, store, options = {}) {
  const {
    onSuccess = null,
    onCancel = null
  } = options;

  let name = '';
  let courseType = 'Main Course';
  let dietaryScope = 'All';
  let errorMessage = '';
  let isSaving = false;

  const COURSE_TYPES = ['Starter', 'Main Course', 'Dessert', 'Beverage', 'Accompaniment'];
  const DIETARY_SCOPES = [
    { id: 'All', label: 'All Items', icon: '🍽️', desc: 'Mix of veg & non-veg dishes' },
    { id: 'Veg-Only', label: 'Veg Only', icon: '🌱', desc: 'Strictly vegetarian dishes' },
    { id: 'Non-Veg-Only', label: 'Non-Veg Only', icon: '🥩', desc: 'Non-vegetarian culinary fare' }
  ];

  function render() {
    container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181C2E]/70 backdrop-blur-md animate-fadeIn">
        <div class="relative w-full max-w-lg bg-white border border-slate-100 rounded-[32px] shadow-2xl overflow-hidden flex flex-col font-sans text-[#181C2E] animate-in fade-in zoom-in-95 duration-200">
          
          <!-- Modal Header -->
          <div class="px-6 py-5 border-b border-slate-100 bg-white flex items-center justify-between">
            <div class="flex items-center space-x-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                📁
              </div>
              <div>
                <h2 class="text-base font-black tracking-tight text-[#181C2E]">Dynamic Category Builder</h2>
                <p class="text-xs text-[#646982]">Create custom dining courses and dietary menu partitions.</p>
              </div>
            </div>
            <button id="cat-close-btn" class="w-8 h-8 rounded-full bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982] hover:text-[#181C2E] flex items-center justify-center text-sm font-bold transition-colors cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Modal Body Form -->
          <div class="p-6 space-y-5">
            ${errorMessage ? `
              <div class="p-3.5 rounded-2xl bg-[#FFF0F2] border border-rose-200 text-[#FF334B] text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>${errorMessage}</span>
              </div>
            ` : ''}

            <!-- Category Display Name -->
            <div>
              <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                Category Display Name <span class="text-[#FF7622]">*</span>
              </label>
              <input 
                type="text" 
                id="cat-name-input" 
                value="${name}"
                placeholder="e.g. Artisanal Brews, Woodfired Pizzas, Small Plates" 
                class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-3 text-xs text-[#181C2E] placeholder:text-[#A0A5BA] focus:outline-none transition-all font-medium"
              />
            </div>

            <!-- Course Type Dropdown -->
            <div>
              <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-1.5">
                Course Classification <span class="text-[#FF7622]">*</span>
              </label>
              <select 
                id="cat-course-select" 
                class="w-full bg-[#F0F5FA] border border-slate-100 focus:ring-2 focus:ring-[#FF7622]/20 rounded-2xl px-4 py-3 text-xs text-[#181C2E] font-medium focus:outline-none transition-all cursor-pointer"
              >
                ${COURSE_TYPES.map(ct => `
                  <option value="${ct}" ${courseType === ct ? 'selected' : ''}>${ct}</option>
                `).join('')}
              </select>
            </div>

            <!-- Dietary Scope Radio Group -->
            <div>
              <label class="block text-xs font-bold text-[#181C2E] uppercase tracking-wider mb-2">
                Dietary Scope <span class="text-[#FF7622]">*</span>
              </label>
              <div class="grid grid-cols-3 gap-3">
                ${DIETARY_SCOPES.map(ds => `
                  <label class="relative flex flex-col items-center justify-center p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    dietaryScope === ds.id 
                      ? 'bg-[#FFEBE4] border-orange-200 text-[#FF7622] shadow-xs' 
                      : 'bg-[#F7F8F9] border-slate-100 text-[#646982] hover:border-slate-200'
                  }">
                    <input 
                      type="radio" 
                      name="cat-dietary-scope" 
                      value="${ds.id}" 
                      ${dietaryScope === ds.id ? 'checked' : ''} 
                      class="sr-only"
                    />
                    <span class="text-xl mb-1">${ds.icon}</span>
                    <span class="text-xs font-bold">${ds.label}</span>
                    <span class="text-[10px] text-[#A0A5BA] text-center mt-0.5">${ds.desc}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Modal Footer -->
          <div class="px-6 py-4 border-t border-slate-100 bg-[#FDFEFE] flex items-center justify-between">
            <button 
              id="cat-cancel-btn" 
              class="px-5 py-2.5 rounded-2xl text-xs font-bold text-[#646982] hover:text-[#181C2E] bg-[#F0F5FA] hover:bg-[#E4ECF4] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              id="cat-submit-btn" 
              ${isSaving ? 'disabled' : ''}
              class="px-6 py-3 rounded-2xl text-xs font-bold bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-md shadow-[#FF7622]/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              ${isSaving ? `
                <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Saving...</span>
              ` : `
                <span>＋</span>
                <span>Create Category</span>
              `}
            </button>
          </div>

        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const closeBtn = container.querySelector('#cat-close-btn');
    const cancelBtn = container.querySelector('#cat-cancel-btn');
    const submitBtn = container.querySelector('#cat-submit-btn');
    const nameInput = container.querySelector('#cat-name-input');
    const courseSelect = container.querySelector('#cat-course-select');
    const dietaryRadios = container.querySelectorAll('input[name="cat-dietary-scope"]');

    if (closeBtn) closeBtn.onclick = () => { onCancel?.(); container.innerHTML = ''; };
    if (cancelBtn) cancelBtn.onclick = () => { onCancel?.(); container.innerHTML = ''; };

    if (nameInput) {
      nameInput.oninput = (e) => { name = e.target.value; };
      nameInput.focus();
    }
    if (courseSelect) {
      courseSelect.onchange = (e) => { courseType = e.target.value; };
    }
    dietaryRadios.forEach(r => {
      r.onchange = (e) => {
        dietaryScope = e.target.value;
        render();
      };
    });

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const cleanName = (name || '').trim();
        if (!cleanName) {
          errorMessage = 'Please enter a valid category name';
          render();
          return;
        }

        isSaving = true;
        render();

        try {
          // Check role authorization: if not admin, request Admin/Manager PIN challenge
          if (!store.canMutateCatalog()) {
            const override = await requestManagerOverride(store, {
              actionType: 'CATALOG_CATEGORY_CREATE',
              actionLabel: `Add Category: ${cleanName}`,
              targetItem: cleanName
            });

            if (!override.approved) {
              errorMessage = '403 Forbidden: Elevation challenge rejected. Admin PIN required.';
              isSaving = false;
              render();
              return;
            }
          }

          const res = store.createCategory({
            name: cleanName,
            course_type: courseType,
            dietary_scope: dietaryScope
          });

          if (res.success) {
            container.innerHTML = '';
            onSuccess?.(res.category);
          } else {
            errorMessage = res.error || 'Failed to create category';
            isSaving = false;
            render();
          }
        } catch (err) {
          errorMessage = err.message || 'Error creating category';
          isSaving = false;
          render();
        }
      };
    }
  }

  render();
  return () => { container.innerHTML = ''; };
}
