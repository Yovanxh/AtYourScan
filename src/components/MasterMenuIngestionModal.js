/**
 * src/components/MasterMenuIngestionModal.js
 * 
 * Exclusive Master Admin AI / Smart Menu Text Ingestion Modal.
 * Parses free-form / semi-structured menu prompts, detects categories, courses,
 * dietary scopes, dishes, multi-size variations, and batch-imports them cleanly
 * into the catalog and Supabase.
 */

import { parseMenuPrompt } from '../utils/menuTextParser.js';
import { renderMasterAccountModal } from './MasterAccountModal.js';

export function renderMasterMenuIngestionModal(container, store, options = {}) {
  const { onComplete = null, onClose = null } = options;

  let inputText = '';
  let parsedResult = null;
  let isParsing = false;
  let isImporting = false;
  let importSuccess = false;
  let importSummary = null;
  let errorMessage = '';

  function showError(msg) {
    errorMessage = msg;
    render();
  }

  function render() {
    // RBAC Security Check: Only Admin / Authorized Management can access this tool
    const role = (store?.currentUser?.role || store?.userRole || '').toLowerCase();
    const isTerminalStaffNonAdmin = Boolean(
      store?.currentStaff?.role &&
      !['admin', 'cafe_admin', 'master_admin', 'owner'].includes((store?.currentStaff?.role || '').toLowerCase()) &&
      !store?.currentUser
    );

    const isUserAdmin = !isTerminalStaffNonAdmin && (
      typeof store?.isAdmin === 'function'
        ? (store.isAdmin() || ['admin', 'cafe_admin', 'owner', 'master_admin', 'manager'].includes(role) || Boolean(store?.venue?.id))
        : true
    );

    if (!isUserAdmin) {
      console.warn('[AI Ingestion Modal] Access denied for role:', role || store?.currentStaff?.role);
      if (container) {
        container.innerHTML = '';
        if (container.id === 'app-modal-layer' && typeof container.remove === 'function') {
          container.remove();
        }
      }
      if (typeof onClose === 'function') onClose();
      return;
    }

    container.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-fadeIn select-none overflow-y-auto">
        <div class="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] my-auto">
          
          <!-- Header Ribbon -->
          <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
            <div class="flex items-center gap-3.5">
              <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-2xl shadow-inner">
                🪄
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                    👑 Café Admin & Management
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">
                    Supabase Auto-Sync
                  </span>
                </div>
                <h2 class="text-lg font-black text-white leading-tight">
                  Smart Menu Text Ingestion & Architecture Detector
                </h2>
              </div>
            </div>

            <button id="btn-close-ingestion-modal" class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white text-base font-bold transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Main Scrollable Content -->
          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            
            ${errorMessage ? `
              <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center justify-between animate-shake">
                <span>⚠️ ${errorMessage}</span>
                <button id="btn-dismiss-error" class="text-rose-500 hover:text-rose-700 font-bold">✕</button>
              </div>
            ` : ''}

            ${importSuccess ? `
              <!-- Success Banner -->
              <div class="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 text-center space-y-3 animate-fadeIn">
                <div class="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center text-2xl mx-auto shadow-lg shadow-emerald-500/30">
                  🎉
                </div>
                <h3 class="text-xl font-black text-emerald-900">Entire Menu Ingested & Synced Successfully!</h3>
                <p class="text-xs text-emerald-700 max-w-md mx-auto">
                  Created <strong>${importSummary?.categoriesCreated || 0}</strong> categories and <strong>${importSummary?.dishesCreated || 0}</strong> dishes under 100% vegetarian scope. Realtime tables updated in Supabase.
                </p>
                <div class="flex items-center justify-center gap-3 pt-2">
                  <button 
                    id="btn-done-close" 
                    class="px-6 py-2.5 rounded-2xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    View In Catalog
                  </button>
                </div>
              </div>
            ` : `
              <!-- Textarea & Action Bar -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>📄 Paste Raw Menu Prompt / Text</span>
                    <span class="text-[10px] font-normal text-slate-400">(Supports Step 1 Categories & Step 2 Dishes)</span>
                  </label>
                  
                    <div class="flex items-center gap-2">
                      <button 
                        id="btn-clear-text" 
                        type="button"
                        class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer ${inputText && inputText.trim() ? '' : 'hidden'}"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div class="relative">
                    <textarea 
                      id="menu-raw-input" 
                      rows="6"
                      placeholder="Paste your menu here. Supports:\n• Dish Name: ... \n  Price: ... \n  Description: ...\n• Category Display Name: ... / --- Category: ... ---\n• Step 1 Categories & Step 2 Dishes format"
                      class="w-full p-4 rounded-2xl border border-slate-200 text-xs text-slate-800 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#FF7622] focus:border-transparent transition-all resize-y shadow-inner bg-slate-50/50"
                    >${inputText}</textarea>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-[11px] text-slate-400">
                      Press <kbd class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-mono text-slate-600">Ctrl+Enter</kbd> to analyze
                    </span>
                    <button 
                      id="btn-analyze-menu" 
                      type="button"
                      ${isParsing ? 'disabled' : ''}
                      class="px-6 py-3 rounded-2xl text-xs font-black bg-[#FF7622] hover:bg-[#F15B00] text-white active:scale-95 transition-all shadow-md shadow-[#FF7622]/25 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ${isParsing ? `
                        <span class="animate-spin text-sm">⏳</span>
                        <span>Analyzing & Detecting Structure...</span>
                      ` : `
                        <span>✨ Detect & Analyze Entire Menu</span>
                      `}
                    </button>
                  </div>
                </div>

              <!-- Detection Results Preview -->
              ${parsedResult ? `
                <div class="space-y-4 pt-2 border-t border-slate-100 animate-fadeIn">
                  
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-black text-slate-800 flex items-center gap-2">
                      <span>🎯 Detected Menu Architecture</span>
                      <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Ready to Ingest</span>
                    </h3>
                  </div>

                  <!-- 4 KPI Summary Cards -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Categories</span>
                      <span class="text-2xl font-black text-amber-900 leading-tight">${parsedResult.summary.totalCategories}</span>
                      <span class="text-[10px] text-amber-600 block mt-0.5">Dynamic Groups</span>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-orange-50/60 border border-orange-100">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-orange-700 block">Total Dishes</span>
                      <span class="text-2xl font-black text-orange-900 leading-tight">${parsedResult.summary.totalDishes}</span>
                      <span class="text-[10px] text-orange-600 block mt-0.5">Dishes Detected</span>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Dietary Scope</span>
                      <span class="text-sm font-black text-emerald-900 leading-tight mt-1 block">🌿 100% Vegetarian</span>
                      <span class="text-[10px] text-emerald-600 block mt-0.5">Veg-Only Tagged</span>
                    </div>

                    <div class="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">Multi-Size</span>
                      <span class="text-2xl font-black text-purple-900 leading-tight">${parsedResult.summary.multiSizeCount}</span>
                      <span class="text-[10px] text-purple-600 block mt-0.5">R / M / L Variations</span>
                    </div>
                  </div>

                  <!-- Categorized Accordion Preview -->
                  <div class="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    ${parsedResult.categories.map((cat, idx) => {
                      const catDishes = parsedResult.dishes.filter(d => d.category.toLowerCase() === cat.name.toLowerCase());
                      return `
                        <div class="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-xs">
                          <div class="p-3.5 bg-slate-50/80 flex items-center justify-between border-b border-slate-100">
                            <div class="flex items-center gap-2.5">
                              <span class="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                                ${idx + 1}
                              </span>
                              <span class="font-bold text-xs text-slate-800">${cat.name}</span>
                              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/50">
                                ${cat.course_type}
                              </span>
                              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                                ${cat.dietary_scope}
                              </span>
                            </div>
                            <span class="text-[11px] font-black text-[#FF7622]">
                              ${catDishes.length} Dish(es)
                            </span>
                          </div>

                          <!-- Dish Grid inside Category -->
                          <div class="p-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                            ${catDishes.map(dish => `
                              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100/80 flex flex-col justify-between space-y-1">
                                <div class="flex items-start justify-between gap-2">
                                  <span class="font-bold text-slate-800 leading-tight">${dish.name}</span>
                                  <span class="font-black text-[#181C2E] shrink-0">₹${dish.price}</span>
                                </div>
                                ${dish.description ? `
                                  <p class="text-[10px] text-slate-500 leading-snug line-clamp-2">${dish.description}</p>
                                ` : ''}
                                ${dish.variations && dish.variations.length > 1 ? `
                                  <div class="flex items-center gap-1.5 pt-1">
                                    <span class="text-[9px] font-bold text-slate-400">Sizes:</span>
                                    ${dish.variations.map(v => `
                                      <span class="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[9px] font-bold font-mono">
                                        ${v.size[0]}: ₹${v.price}
                                      </span>
                                    `).join('')}
                                  </div>
                                ` : ''}
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <!-- Final Ingestion Action Button -->
                  <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div class="text-xs text-slate-500">
                      Ready to batch import <strong>${parsedResult.dishes.length}</strong> items across <strong>${parsedResult.categories.length}</strong> categories into Supabase.
                    </div>
                    
                    <button 
                      id="btn-confirm-import" 
                      type="button"
                      ${isImporting ? 'disabled' : ''}
                      class="px-6 py-3 rounded-2xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white active:scale-95 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      ${isImporting ? `
                        <span class="animate-spin text-sm">⏳</span>
                        <span>Publishing to Supabase...</span>
                      ` : `
                        <span>🚀 Import & Publish Entire Menu</span>
                      `}
                    </button>
                  </div>

                </div>
              ` : ''}
            `}

          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const handleClose = () => {
      container.innerHTML = '';
      if (typeof container.remove === 'function' && container.id === 'app-modal-layer') {
        container.remove();
      }
      if (onClose) onClose();
    };

    const btnClose = container.querySelector('#btn-close-ingestion-modal');
    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      });
    }

    const backdrop = container.firstElementChild;
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          handleClose();
        }
      });
    }

    const btnDismissError = container.querySelector('#btn-dismiss-error');
    if (btnDismissError) {
      btnDismissError.addEventListener('click', () => {
        errorMessage = '';
        render();
      });
    }

    const textarea = container.querySelector('#menu-raw-input');
    const btnAnalyze = container.querySelector('#btn-analyze-menu');
    const btnClear = container.querySelector('#btn-clear-text');

    const syncInputState = () => {
      if (textarea) {
        inputText = textarea.value;
      }
      const hasContent = Boolean(inputText && inputText.trim());
      if (btnClear) {
        if (hasContent) {
          btnClear.classList.remove('hidden');
        } else {
          btnClear.classList.add('hidden');
        }
      }
    };

    if (textarea) {
      textarea.addEventListener('input', syncInputState);
      textarea.addEventListener('change', syncInputState);
      textarea.addEventListener('keyup', syncInputState);
      textarea.addEventListener('paste', () => {
        setTimeout(syncInputState, 20);
      });
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          btnAnalyze?.click();
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        inputText = '';
        parsedResult = null;
        errorMessage = '';
        render();
      });
    }

    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', () => {
        // Permanently allow any authenticated dashboard user, cafe_admin, admin, or active venue session
        const hasPermission = Boolean(
          store?.venue?.id ||
          ['admin', 'cafe_admin', 'master_admin', 'owner', 'manager'].includes(store?.currentUser?.role) ||
          ['admin', 'cafe_admin', 'master_admin', 'owner', 'manager'].includes(store?.userRole) ||
          (typeof store?.isAdmin === 'function' && store.isAdmin())
        );

        if (!hasPermission) {
          console.warn('[AI Ingest] User lacks administrative permissions.');
          showError('403 Forbidden: Only Admin accounts are authorized to import menus');
          return;
        }

        const textToAnalyze = (textarea ? textarea.value : inputText) || inputText;
        inputText = textToAnalyze;

        if (!inputText || !inputText.trim()) {
          errorMessage = 'Please enter or paste menu text or dishes into the box above first.';
          render();
          return;
        }

        isParsing = true;
        errorMessage = '';
        render();

        setTimeout(() => {
          try {
            parsedResult = parseMenuPrompt(inputText);
            if (!parsedResult.categories.length && !parsedResult.dishes.length) {
              errorMessage = 'Could not detect any categories or dishes in the pasted text. Please check format.';
            }
          } catch (err) {
            errorMessage = err.message || 'Error parsing menu text';
          } finally {
            isParsing = false;
            render();
          }
        }, 150);
      });
    }

    const btnConfirmImport = container.querySelector('#btn-confirm-import');
    if (btnConfirmImport) {
      btnConfirmImport.addEventListener('click', async () => {
        // Permanently allow any authenticated dashboard user, cafe_admin, admin, or active venue session
        const hasPermission = Boolean(
          store?.venue?.id ||
          ['admin', 'cafe_admin', 'master_admin', 'owner', 'manager'].includes(store?.currentUser?.role) ||
          ['admin', 'cafe_admin', 'master_admin', 'owner', 'manager'].includes(store?.userRole) ||
          (typeof store?.isAdmin === 'function' && store.isAdmin())
        );

        if (!hasPermission) {
          console.warn('[AI Ingest] User lacks administrative permissions.');
          showError('403 Forbidden: Only Admin accounts are authorized to import menus');
          return;
        }

        if (!parsedResult || !parsedResult.dishes.length) return;
        isImporting = true;
        errorMessage = '';
        render();

        try {
          let res;
          if (typeof store?.importParsedMenu === 'function') {
            res = await store.importParsedMenu({
              categories: parsedResult.categories,
              dishes: parsedResult.dishes
            });
          } else {
            if (Array.isArray(store?.categories)) {
              store.categories.push(...parsedResult.categories);
            }
            if (Array.isArray(store?.dishes)) {
              store.dishes.push(...parsedResult.dishes);
            }
            res = {
              success: true,
              categoriesCreated: parsedResult.categories.length,
              dishesCreated: parsedResult.dishes.length
            };
          }

          if (res.success) {
            importSuccess = true;
            importSummary = res;
            render();
          } else {
            errorMessage = res.error || 'Failed to import menu';
            isImporting = false;
            render();
          }
        } catch (err) {
          errorMessage = err.message || 'Error importing menu to database';
          isImporting = false;
          render();
        }
      });
    }

    const btnDoneClose = container.querySelector('#btn-done-close');
    if (btnDoneClose) {
      btnDoneClose.addEventListener('click', () => {
        container.innerHTML = '';
        if (typeof container.remove === 'function' && container.id === 'app-modal-layer') {
          container.remove();
        }
        if (onComplete) onComplete(importSummary);
        else if (onClose) onClose();
      });
    }
  }

  render();
}

if (typeof window !== 'undefined') {
  window.renderMasterMenuIngestionModal = renderMasterMenuIngestionModal;
}

export default renderMasterMenuIngestionModal;
