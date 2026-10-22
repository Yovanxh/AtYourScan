/**
 * Stock & Inventory Ingestion View (Milestone 2 - F5, F6, F7)
 * Implements Text Batch Ingestion, Real Tesseract WebAssembly Invoice OCR Scanner,
 * Live Progress Tracking, Raw OCR Text Inspector, and Automatic 86'd Catalog Synchronization.
 */

import { store } from '../store.js';
import { renderMenuView } from './MenuView.js';
import { renderMasterMenuIngestionModal } from './MasterMenuIngestionModal.js';
import { 
  recognizeInvoiceImage, 
  preprocessInvoiceImage, 
  parseInvoiceTextLines as parseLinesWithMetadata,
  generateSampleInvoiceImage 
} from '../utils/ocr.js';

/**
 * Robust Invoice Line Parser (Matches test helper specifications)
 * Re-exported from ocr.js for backward compatibility with test suites.
 */
export function parseInvoiceTextLines(rawText) {
  return parseLinesWithMetadata(rawText);
}

export function renderStockIngestionView(container, reactiveStore) {
  let activeTab = 'catalog'; // 'catalog' | 'text' | 'image'
  let textInput = '';
  let parsedItems = [];
  let invoiceMetadata = {};
  let uploadedImageSrc = null;
  let preprocessedImageSrc = null;
  let uploadedFileName = '';
  let ocrScanning = false;
  let ocrProgress = 0;
  let ocrStatusMessage = '';
  let ocrConfidence = 0;
  let ocrRawText = '';
  let showRawTextDrawer = false;
  let enhanceContrast = true;
  let commitFeedback = null;
  let scanDurationMs = 0;
  let scanError = null;

  function render() {
    const currentUser = reactiveStore?.currentUser || reactiveStore?.currentStaff;
    const canUseAi = Boolean(
      !currentUser ||
      currentUser.role === 'admin' ||
      currentUser.role === 'cafe_admin' ||
      currentUser.role === 'master_admin' ||
      (currentUser.role || '').toLowerCase().includes('admin')
    );

    const items = reactiveStore.menuItems || [];
    const totalItems = items.length;
    const outOfStockCount = items.filter(i => !i.is_available).length;
    const inStockCount = totalItems - outOfStockCount;
    const lowStockCount = items.filter(i => i.is_available && (i.stock_quantity ?? 10) <= 8).length;

    if (activeTab === 'catalog') {
      return renderMenuView(container, reactiveStore, {
        onSwitchMode: (mode) => {
          activeTab = mode;
          render();
        }
      });
    }

    container.innerHTML = `
      <div class="stock-app stock-stub min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        
        <!-- Header & KPIs -->
        <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm">
          <div>
            <div class="flex items-center space-x-3.5">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
                📦
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-[#FF7622]">Procurement & Ingestion</span>
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    outOfStockCount > 0 ? 'bg-[#FFF0F2] text-[#FF334B]' : 'bg-[#EBF7F2] text-[#059C6A]'
                  }">
                    ${outOfStockCount} 86'd Out-of-Stock
                  </span>
                </div>
                <h1 class="text-xl font-black text-[#181C2E]">Smart Stock & Invoice OCR Ingestion</h1>
              </div>
            </div>
          </div>

          <!-- Mode Toggle Tabs -->
          <div class="flex items-center bg-[#F0F5FA] p-1.5 rounded-2xl border border-slate-100 text-xs font-bold">
            <button 
              id="tab-btn-catalog" 
              class="px-4 py-2 rounded-xl text-xs font-bold transition-all text-[#646982] hover:text-[#181C2E]"
            >
              🍱 Menu & BOM Catalog
            </button>
            <button 
              id="tab-btn-text" 
              class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'text' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/30' 
                  : 'text-[#646982] hover:text-[#181C2E]'
              }"
            >
              📝 Text Batch Ingest
            </button>
            <button 
              id="tab-btn-image" 
              class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'image' 
                  ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/30' 
                  : 'text-[#646982] hover:text-[#181C2E]'
              }"
            >
              📷 Invoice Image OCR
            </button>
            ${canUseAi ? `
              <button 
                id="tab-btn-master-ai" 
                class="px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-gradient-to-r from-emerald-600/10 to-teal-600/10 text-emerald-800 hover:bg-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
                title="AI Menu Auto-Import (OCR & Instant Extraction)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                <span>AI Menu Auto-Import</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Metric Capsule Ribbon -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Total Catalog</span>
            <div class="text-3xl font-black text-[#181C2E] mt-2">${totalItems}</div>
            <span class="text-xs text-[#646982] mt-1 block">Dishes & craft drinks</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#059C6A]">Available In Stock</span>
            <div class="text-3xl font-black text-[#059C6A] mt-2">${inStockCount}</div>
            <span class="text-xs text-[#646982] mt-1 block">Ready for customer ordering</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#FF334B]">86'd Out-of-Stock</span>
            <div class="text-3xl font-black text-[#FF334B] mt-2">${outOfStockCount}</div>
            <span class="text-xs text-[#646982] mt-1 block">Auto-hidden on guest menu</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#FF7622]">Low Stock Alert</span>
            <div class="text-3xl font-black text-[#FF7622] mt-2">${lowStockCount}</div>
            <span class="text-xs text-[#646982] mt-1 block">≤ 8 units remaining</span>
          </div>
        </div>

        <!-- Commit Notification Banner -->
        ${commitFeedback ? `
          <div class="p-4 rounded-2xl bg-[#EBF7F2] border border-emerald-200 text-[#059C6A] flex items-center justify-between text-xs font-bold shadow-xs animate-fadeIn">
            <div class="flex items-center gap-2">
              <span class="text-base">✓</span>
              <span>${commitFeedback}</span>
            </div>
            <button id="dismiss-feedback" class="text-[#059C6A] hover:text-emerald-800 font-black cursor-pointer">✕</button>
          </div>
        ` : ''}

        <!-- Main Work Area: Tab Content -->
        ${activeTab === 'text' ? renderTextBatchSection() : renderImageOCRSection()}

        <!-- Live Inventory Table with 1-Click Adjusters -->
        <div class="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-black text-[#181C2E] flex items-center gap-2">
                <span>Real-Time Inventory Status</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F0F5FA] text-[#646982]">Live Sync</span>
              </h3>
              <p class="text-xs text-[#646982] mt-0.5">Adjust stock count on-the-fly or toggle availability across all tables.</p>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-100 text-[#A0A5BA] uppercase text-[10px] font-bold">
                  <th class="py-3 px-3.5">Item Name</th>
                  <th class="py-3 px-3.5">Category</th>
                  <th class="py-3 px-3.5 text-right">Selling Price</th>
                  <th class="py-3 px-3.5 text-right">Unit Cost</th>
                  <th class="py-3 px-3.5 text-center">Stock Count</th>
                  <th class="py-3 px-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${items.map(item => `
                  <tr class="hover:bg-[#F7F8F9] transition-colors ${!item.is_available ? 'bg-[#FFF0F2]/30' : ''}">
                    <td class="py-3.5 px-3.5 font-bold text-[#181C2E] flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full ${item.is_available ? 'bg-[#059C6A]' : 'bg-[#FF334B]'}"></span>
                      <span>${item.name}</span>
                    </td>
                    <td class="py-3.5 px-3.5 text-[#646982]">${item.category}</td>
                    <td class="py-3.5 px-3.5 text-right font-black text-[#181C2E]">₹${item.price}</td>
                    <td class="py-3.5 px-3.5 text-right text-[#646982]">₹${item.unit_cost || Math.round(item.price * 0.35)}</td>
                    <td class="py-3.5 px-3.5 text-center">
                      <div class="inline-flex items-center gap-1.5 bg-[#F0F5FA] rounded-xl px-2 py-1">
                        <button data-stock-delta="${item.id}" data-delta="-5" class="w-6 h-6 rounded-lg bg-white shadow-xs text-xs font-bold text-[#181C2E] hover:bg-slate-50 active:scale-95 cursor-pointer">-5</button>
                        <span class="w-10 text-center font-black ${item.stock_quantity <= 5 ? 'text-[#FF334B]' : 'text-[#181C2E]'}">${item.stock_quantity ?? 10}</span>
                        <button data-stock-delta="${item.id}" data-delta="5" class="w-6 h-6 rounded-lg bg-white shadow-xs text-xs font-bold text-[#181C2E] hover:bg-slate-50 active:scale-95 cursor-pointer">+5</button>
                      </div>
                    </td>
                    <td class="py-3.5 px-3.5 text-right">
                      <button 
                        data-toggle-avail="${item.id}"
                        class="px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                          item.is_available 
                            ? 'bg-[#EBF7F2] text-[#059C6A] hover:bg-[#D4EFE4]' 
                            : 'bg-[#FFF0F2] text-[#FF334B] hover:bg-[#FFE5E8]'
                        }"
                      >
                        ${item.is_available ? '✓ In Stock' : '86\'d Out'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    bindEvents();
  }

  function renderTextBatchSection() {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Input Form (7 cols) -->
        <div class="lg:col-span-7 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-[#181C2E] flex items-center gap-2">
              <span>Text Batch Ingestion</span>
              <span class="text-[10px] font-bold text-[#FF7622] bg-[#FFEBE4] px-2 py-0.5 rounded-full">F5</span>
            </h3>
            <div class="flex items-center gap-2">
              <button id="btn-clear-text" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-[#646982] cursor-pointer">
                Clear
              </button>
            </div>
          </div>

          <p class="text-xs text-[#646982]">Paste line-separated items with optional quantities and unit costs. Supported formats:</p>
          <div class="text-[11px] font-mono text-[#646982] bg-[#F7F8F9] p-3 rounded-2xl border border-slate-100 space-y-1">
            <div>• <span class="text-[#181C2E] font-semibold">10x Truffle & Aged Parmesan Polenta Fries @ 140</span></div>
            <div>• <span class="text-[#181C2E] font-semibold">Burrata with Charred Stone Peaches 8 Qty 195 Cost</span></div>
            <div>• <span class="text-[#181C2E] font-semibold">Name: Malai Chicken Skewers, Qty: 15, Rate: 210</span></div>
          </div>

          <textarea 
            id="batch-text-area" 
            rows="6" 
            placeholder="Paste or type inventory invoice lines here..." 
            class="w-full bg-[#F7F8F9] border border-slate-200 rounded-2xl p-4 text-xs text-[#181C2E] font-mono placeholder:text-[#A0A5BA] focus:outline-none focus:ring-2 focus:ring-[#FF7622]/20 transition-all"
          >${textInput}</textarea>

          <button 
            id="btn-parse-text" 
            class="w-full py-3 bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold text-xs rounded-2xl shadow-md shadow-[#FF7622]/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>⚡ Parse Invoice Lines</span>
          </button>
        </div>

        <!-- Parsed Preview & Commit (5 cols) -->
        <div class="lg:col-span-5 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-[#181C2E]">Parsed Review Grid</h3>
              <span class="text-xs font-bold text-[#646982]">${parsedItems.length} items parsed</span>
            </div>

            ${parsedItems.length === 0 ? `
              <div class="h-48 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4">
                <span class="text-3xl text-slate-400 mb-2">📋</span>
                <p class="text-xs font-bold text-[#181C2E]">No items parsed yet</p>
                <p class="text-[11px] text-[#646982]">Type or paste text and click "Parse Invoice Lines"</p>
              </div>
            ` : `
              <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
                ${parsedItems.map((item, idx) => `
                  <div class="p-3 rounded-2xl bg-[#F7F8F9] border border-slate-100 flex items-center justify-between text-xs">
                    <div class="flex-1 min-w-0 pr-2">
                      <div class="font-bold text-[#181C2E] truncate">${item.name}</div>
                      <div class="text-[10px] text-[#646982]">Unit Cost: ₹${item.unit_cost || 0}</div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-1 rounded-full bg-[#EBF7F2] text-[#059C6A] font-bold text-xs">
                        +${item.quantity} qty
                      </span>
                      <button data-remove-parsed="${idx}" class="text-slate-400 hover:text-rose-500 font-bold text-xs cursor-pointer">✕</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <button 
            id="btn-commit-batch" 
            ${parsedItems.length === 0 ? 'disabled' : ''} 
            class="w-full py-3.5 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
              parsedItems.length > 0 
                ? 'bg-[#059C6A] hover:bg-emerald-600 text-white shadow-md shadow-[#059C6A]/20 active:scale-98 cursor-pointer' 
                : 'bg-slate-100 text-[#A0A5BA] cursor-not-allowed'
            }"
          >
            <span>✓ Commit to Catalog Inventory (${parsedItems.length})</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderImageOCRSection() {
    return `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Image Upload & Preview (6 cols) -->
        <div class="lg:col-span-6 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-[#181C2E] flex items-center gap-2">
              <span>Real Tesseract WebAssembly OCR Scanner</span>
              <span class="text-[10px] font-bold text-[#059C6A] bg-[#EBF7F2] px-2 py-0.5 rounded-full border border-emerald-200">
                Client-Side AI Engine
              </span>
            </h3>
            ${uploadedImageSrc ? `
              <button id="btn-remove-image" class="text-xs font-bold text-[#FF334B] hover:underline cursor-pointer">Remove Image</button>
            ` : ''}
          </div>

          ${!uploadedImageSrc ? `
            <div 
              id="ocr-dropzone" 
              class="border-2 border-dashed border-slate-200 hover:border-[#FF7622] rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[#F7F8F9]/80 group"
            >
              <input type="file" id="invoice-file-input" accept="image/*" class="hidden" />
              <input type="file" id="camera-file-input" accept="image/*" capture="environment" class="hidden" />
              
              <div class="w-16 h-16 rounded-3xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform">
                🧾
              </div>
              <h4 class="text-sm font-black text-[#181C2E] mt-3">Upload Supplier Invoice or Receipt Photo</h4>
              <p class="text-xs text-[#646982] mt-1 max-w-sm">Drop your PNG, JPG, or WebP invoice here. Client-side OCR extracts line items, quantities, and unit rates directly in your browser.</p>
              
              <div class="mt-5 flex items-center flex-wrap justify-center gap-2.5">
                <button type="button" id="btn-browse-file" class="px-4 py-2 rounded-2xl bg-[#181C2E] hover:bg-slate-800 text-xs text-white font-bold transition-all shadow-sm cursor-pointer">
                  📁 Browse Device Files
                </button>
                <button type="button" id="btn-camera-capture" class="px-4 py-2 rounded-2xl bg-[#F0F5FA] hover:bg-[#E4ECF4] text-xs text-[#181C2E] font-bold transition-all cursor-pointer">
                  📷 Snap Photo
                </button>
              </div>
            </div>
          ` : `
            <div class="space-y-4">
              <!-- Image Preview Card -->
              <div class="relative rounded-2xl overflow-hidden border border-slate-200 max-h-72 bg-slate-900 flex items-center justify-center group shadow-inner">
                <img 
                  id="preview-invoice-img" 
                  src="${enhanceContrast && preprocessedImageSrc ? preprocessedImageSrc : uploadedImageSrc}" 
                  alt="Uploaded Invoice" 
                  class="max-h-72 object-contain w-full select-none" 
                />
                
                <!-- OCR Laser Scanner Beam Animation -->
                ${ocrScanning ? `
                  <div class="absolute inset-0 pointer-events-none overflow-hidden">
                    <div class="w-full h-1 bg-gradient-to-r from-transparent via-[#059C6A] to-transparent shadow-[0_0_15px_#059C6A] animate-pulse absolute top-1/2 -translate-y-1/2"></div>
                  </div>
                ` : ''}

                <div class="absolute bottom-2 left-2 px-3 py-1 rounded-xl bg-black/75 backdrop-blur-md text-[11px] font-mono text-white border border-white/10 flex items-center gap-2">
                  <span>📄</span>
                  <span class="truncate max-w-[200px]">${uploadedFileName || 'Invoice Receipt'}</span>
                </div>
              </div>

              <!-- Controls Toolbar -->
              <div class="flex items-center justify-between text-xs bg-[#F7F8F9] p-3 rounded-2xl border border-slate-100">
                <label class="flex items-center gap-2 cursor-pointer font-bold text-[#181C2E]">
                  <input type="checkbox" id="toggle-enhance-contrast" ${enhanceContrast ? 'checked' : ''} class="w-4 h-4 rounded text-[#FF7622] cursor-pointer" />
                  <span>High-Contrast Denoising Filter</span>
                </label>
                <span class="text-[11px] text-[#646982]">Optimizes faded receipts & camera noise</span>
              </div>

              <!-- Real Tesseract OCR Progress / Action Button -->
              ${ocrScanning ? `
                <div class="p-4 rounded-2xl bg-[#EBF7F2] border border-emerald-200 space-y-2">
                  <div class="flex items-center justify-between text-xs font-bold text-[#059C6A]">
                    <span class="flex items-center gap-1.5">
                      <span class="animate-spin">⚙️</span>
                      <span>${ocrStatusMessage || 'Extracting Characters & Tabular Matrix...'}</span>
                    </span>
                    <span>${ocrProgress}%</span>
                  </div>
                  <div class="w-full bg-emerald-200/50 h-2 rounded-full overflow-hidden">
                    <div class="bg-[#059C6A] h-full transition-all duration-300 rounded-full" style="width: ${ocrProgress}%;"></div>
                  </div>
                </div>
              ` : `
                <button 
                  id="btn-scan-ocr" 
                  class="w-full py-3 bg-[#059C6A] hover:bg-emerald-600 text-white font-bold text-xs rounded-2xl shadow-md shadow-[#059C6A]/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🔍</span>
                  <span>${parsedItems.length > 0 ? 'Re-Scan Invoice with Tesseract OCR' : 'Run Real OCR & Extract Line Items'}</span>
                </button>
              `}
            </div>
          `}
        </div>

        <!-- OCR Extracted Review & Catalog Match (6 cols) -->
        <div class="lg:col-span-6 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-4">
            
            <!-- Panel Header -->
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-[#181C2E] flex items-center gap-2">
                  <span>OCR Recognized Line Items</span>
                  <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${parsedItems.length > 0 ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-slate-100 text-[#646982]'}">
                    ${parsedItems.length} items
                  </span>
                </h3>
              </div>

              ${ocrConfidence > 0 ? `
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#EBF7F2] text-[#059C6A] border border-emerald-200">
                    🎯 ${ocrConfidence}% Optical Confidence
                  </span>
                  ${scanDurationMs > 0 ? `
                    <span class="text-[10px] font-bold text-[#646982]">
                      ⏱️ ${(scanDurationMs / 1000).toFixed(1)}s
                    </span>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            <!-- Invoice Metadata Banner (if supplier, date, or inv# detected) -->
            ${(invoiceMetadata.supplierName || invoiceMetadata.invoiceNumber || invoiceMetadata.totalAmount) ? `
              <div class="p-3.5 rounded-2xl bg-[#F0F5FA] border border-slate-200 text-xs space-y-1.5">
                <div class="font-bold text-[#181C2E] flex items-center justify-between">
                  <span class="flex items-center gap-1.5">
                    <span>🏢</span>
                    <span>${invoiceMetadata.supplierName || 'Detected Supplier Invoice'}</span>
                  </span>
                  ${invoiceMetadata.invoiceNumber ? `
                    <span class="font-mono text-[11px] bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                      ${invoiceMetadata.invoiceNumber}
                    </span>
                  ` : ''}
                </div>
                <div class="flex items-center justify-between text-[11px] text-[#646982]">
                  <span>${invoiceMetadata.date ? `Date: ${invoiceMetadata.date}` : ''}</span>
                  ${invoiceMetadata.totalAmount ? `
                    <span class="font-black text-[#181C2E]">Billed Total: ₹${invoiceMetadata.totalAmount.toLocaleString('en-IN')}</span>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Scan Error Notice -->
            ${scanError ? `
              <div class="p-3.5 rounded-2xl bg-[#FFF0F2] border border-rose-200 text-xs text-[#FF334B] flex items-center justify-between">
                <span>⚠️ ${scanError}</span>
                <button id="btn-dismiss-scan-error" class="font-bold">✕</button>
              </div>
            ` : ''}

            <!-- Extracted Raw OCR Text (Inspect & Edit Drawer) -->
            ${ocrRawText ? `
              <div class="space-y-2">
                <button 
                  id="btn-toggle-raw-text" 
                  class="text-xs font-bold text-[#FF7622] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>${showRawTextDrawer ? '▲ Hide' : '▼ Inspect & Edit'} Raw OCR Text</span>
                  <span class="text-[10px] text-[#A0A5BA]">(${ocrRawText.split('\n').length} lines recognized)</span>
                </button>

                ${showRawTextDrawer ? `
                  <div class="space-y-2 p-3 bg-[#F7F8F9] rounded-2xl border border-slate-100 animate-fadeIn">
                    <p class="text-[11px] text-[#646982]">Edit any smudged characters or typos below and re-parse:</p>
                    <textarea 
                      id="raw-ocr-textarea" 
                      rows="5" 
                      class="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-[#181C2E] focus:outline-none focus:ring-2 focus:ring-[#FF7622]/20"
                    >${ocrRawText}</textarea>
                    <button 
                      id="btn-reparse-raw-text" 
                      class="px-3.5 py-1.5 rounded-xl bg-[#181C2E] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                    >
                      ⚡ Re-Parse from Raw Text
                    </button>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Items Review Grid -->
            ${parsedItems.length === 0 ? `
              <div class="h-44 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-4">
                <span class="text-3xl text-slate-400 mb-2">📄</span>
                <p class="text-xs font-bold text-[#181C2E]">No items extracted yet</p>
                <p class="text-[11px] text-[#646982] max-w-xs">Upload a supplier invoice or snap a receipt photo to execute optical character recognition.</p>
              </div>
            ` : `
              <div class="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                ${parsedItems.map((item, idx) => {
                  const existingDish = reactiveStore.menuItems?.find(m => m.name.toLowerCase() === item.name.toLowerCase());
                  const existingRaw = reactiveStore.inventoryItems?.find(r => r.name.toLowerCase() === item.name.toLowerCase());
                  const isMatched = existingDish || existingRaw;

                  return `
                    <div class="p-3.5 rounded-2xl bg-[#F7F8F9] border border-slate-100 space-y-2.5 text-xs hover:border-slate-200 transition-colors">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                          <input 
                            type="text" 
                            value="${item.name}" 
                            data-edit-ocr-name="${idx}"
                            class="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-[#181C2E] focus:outline-none focus:ring-1 focus:ring-[#FF7622]"
                            placeholder="Item Name"
                          />
                        </div>
                        <button data-remove-parsed="${idx}" class="text-slate-400 hover:text-rose-500 font-bold text-xs p-1 cursor-pointer" title="Remove item">✕</button>
                      </div>

                      <div class="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-200/60 text-[11px]">
                        <!-- Quantity Stepper -->
                        <div class="flex items-center gap-1.5">
                          <span class="text-[#646982] font-semibold">Qty:</span>
                          <div class="inline-flex items-center bg-white rounded-xl border border-slate-200 px-1 py-0.5">
                            <button data-ocr-qty-dec="${idx}" class="w-5 h-5 rounded-lg text-xs font-bold hover:bg-slate-100 text-[#181C2E] cursor-pointer">-</button>
                            <input 
                              type="number" 
                              value="${item.quantity}" 
                              data-edit-ocr-qty="${idx}"
                              class="w-12 text-center text-xs font-black text-[#059C6A] border-none focus:outline-none"
                            />
                            <button data-ocr-qty-inc="${idx}" class="w-5 h-5 rounded-lg text-xs font-bold hover:bg-slate-100 text-[#181C2E] cursor-pointer">+</button>
                          </div>
                          ${item.unit ? `<span class="text-[#A0A5BA] font-mono">${item.unit}</span>` : ''}
                        </div>

                        <!-- Unit Cost -->
                        <div class="flex items-center gap-1">
                          <span class="text-[#646982] font-semibold">Rate: ₹</span>
                          <input 
                            type="number" 
                            value="${item.unit_cost || 0}" 
                            data-edit-ocr-cost="${idx}"
                            class="w-16 bg-white border border-slate-200 rounded-xl px-2 py-0.5 text-xs text-[#181C2E] font-mono focus:outline-none"
                          />
                        </div>

                        <!-- Catalog Match Status -->
                        <div>
                          ${isMatched ? `
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF7F2] text-[#059C6A]">
                              ✓ Matched in Catalog
                            </span>
                          ` : `
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFEBE4] text-[#FF7622]">
                              ＋ New Catalog Item
                            </span>
                          `}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}

            <!-- Add Manual Item Button -->
            ${parsedItems.length > 0 ? `
              <div class="flex justify-end pt-1">
                <button 
                  id="btn-add-manual-item" 
                  class="text-xs font-bold text-[#FF7622] hover:text-[#F15B00] flex items-center gap-1 cursor-pointer"
                >
                  <span>＋</span>
                  <span>Add Line Item Manually</span>
                </button>
              </div>
            ` : ''}

          </div>

          <!-- Commit Button -->
          <button 
            id="btn-commit-batch" 
            ${parsedItems.length === 0 ? 'disabled' : ''} 
            class="w-full py-3.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
              parsedItems.length > 0 
                ? 'bg-[#059C6A] hover:bg-emerald-600 text-white shadow-md shadow-[#059C6A]/20 active:scale-98 cursor-pointer' 
                : 'bg-slate-100 text-[#A0A5BA] cursor-not-allowed'
            }"
          >
            <span>✓</span>
            <span>Apply Invoiced Stock to Catalog (${parsedItems.length} Items)</span>
          </button>
        </div>

      </div>
    `;
  }

  function bindEvents() {
    // Tab switching
    const tabCatalog = container.querySelector('#tab-btn-catalog');
    const tabText = container.querySelector('#tab-btn-text');
    const tabImage = container.querySelector('#tab-btn-image');
    if (tabCatalog) {
      tabCatalog.addEventListener('click', () => {
        activeTab = 'catalog';
        render();
      });
    }
    if (tabText) {
      tabText.addEventListener('click', () => {
        activeTab = 'text';
        render();
      });
    }
    if (tabImage) {
      tabImage.addEventListener('click', () => {
        activeTab = 'image';
        render();
      });
    }
    const tabMasterAi = container.querySelector('#tab-btn-master-ai');
    if (tabMasterAi) {
      tabMasterAi.addEventListener('click', (e) => {
        e?.preventDefault?.();
        activeTab = 'master-ai';
        // Update active tab styles immediately across all mode buttons
        container.querySelectorAll('#tab-btn-catalog, #tab-btn-text, #tab-btn-image').forEach(b => {
          b.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-[#646982] hover:text-[#181C2E]';
        });
        tabMasterAi.className = 'px-3.5 py-2 rounded-xl text-xs font-black transition-all bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer';

        try {
          let layer = document.getElementById('app-modal-layer');
          if (!layer) {
            layer = document.createElement('div');
            layer.id = 'app-modal-layer';
            layer.className = 'relative z-50';
            document.body?.appendChild(layer);
          }
          renderMasterMenuIngestionModal(layer, reactiveStore, {
            onComplete: () => {
              render();
            }
          });
        } catch (err) {
          console.error('[StockIngestionView] Failed to open MasterMenuIngestionModal:', err);
        }
      });
    }

    // Dismiss feedback
    const dismissBtn = container.querySelector('#dismiss-feedback');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        commitFeedback = null;
        render();
      });
    }

    // Dismiss scan error
    const dismissErrBtn = container.querySelector('#btn-dismiss-scan-error');
    if (dismissErrBtn) {
      dismissErrBtn.addEventListener('click', () => {
        scanError = null;
        render();
      });
    }

    // Text input area
    const textArea = container.querySelector('#batch-text-area');
    if (textArea) {
      textArea.addEventListener('input', (e) => {
        textInput = e.target.value;
      });
    }

    // Clear text (Text tab)
    const clearBtn = container.querySelector('#btn-clear-text');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        textInput = '';
        parsedItems = [];
        render();
      });
    }

    // Parse Text button (Text tab)
    const parseBtn = container.querySelector('#btn-parse-text');
    if (parseBtn) {
      parseBtn.addEventListener('click', () => {
        parsedItems = parseInvoiceTextLines(textInput);
        if (parsedItems.length === 0) {
          alert('Could not detect item patterns. Please paste lines formatted like: "10x Truffle Fries @ 140"');
        } else {
          reactiveStore.playSound('pop');
        }
        render();
      });
    }

    // Remove parsed item
    container.querySelectorAll('[data-remove-parsed]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.removeParsed, 10);
        parsedItems.splice(idx, 1);
        render();
      });
    });

    // Edit Item Name
    container.querySelectorAll('[data-edit-ocr-name]').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.currentTarget.dataset.editOcrName, 10);
        if (parsedItems[idx]) {
          parsedItems[idx].name = e.target.value.trim();
        }
      });
    });

    // Edit Item Quantity
    container.querySelectorAll('[data-edit-ocr-qty]').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.currentTarget.dataset.editOcrQty, 10);
        const val = parseInt(e.target.value, 10) || 0;
        if (parsedItems[idx]) {
          parsedItems[idx].quantity = Math.max(0, val);
          render();
        }
      });
    });

    // Quantity Dec / Inc buttons
    container.querySelectorAll('[data-ocr-qty-dec]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.ocrQtyDec, 10);
        if (parsedItems[idx]) {
          parsedItems[idx].quantity = Math.max(1, (parsedItems[idx].quantity || 1) - 1);
          render();
        }
      });
    });

    container.querySelectorAll('[data-ocr-qty-inc]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.ocrQtyInc, 10);
        if (parsedItems[idx]) {
          parsedItems[idx].quantity = (parsedItems[idx].quantity || 0) + 1;
          render();
        }
      });
    });

    // Edit Item Cost
    container.querySelectorAll('[data-edit-ocr-cost]').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.currentTarget.dataset.editOcrCost, 10);
        const val = parseFloat(e.target.value) || 0;
        if (parsedItems[idx]) {
          parsedItems[idx].unit_cost = Math.max(0, val);
        }
      });
    });

    // Add Item Manually
    const addManualBtn = container.querySelector('#btn-add-manual-item');
    if (addManualBtn) {
      addManualBtn.addEventListener('click', () => {
        parsedItems.push({
          name: 'New Invoiced Item',
          quantity: 10,
          unit_cost: 150
        });
        render();
      });
    }

    // Toggle Raw Text Drawer
    const toggleRawBtn = container.querySelector('#btn-toggle-raw-text');
    if (toggleRawBtn) {
      toggleRawBtn.addEventListener('click', () => {
        showRawTextDrawer = !showRawTextDrawer;
        render();
      });
    }

    // Re-parse from edited raw text
    const reparseRawBtn = container.querySelector('#btn-reparse-raw-text');
    if (reparseRawBtn) {
      reparseRawBtn.addEventListener('click', () => {
        const rawArea = container.querySelector('#raw-ocr-textarea');
        if (rawArea) {
          ocrRawText = rawArea.value;
          const parsed = parseInvoiceTextLines(ocrRawText);
          parsedItems = parsed.items || parsed;
          invoiceMetadata = parsed.metadata || {};
          reactiveStore.playSound('pop');
          render();
        }
      });
    }

    // File Browse / Dropzone
    const fileInput = container.querySelector('#invoice-file-input');
    const cameraInput = container.querySelector('#camera-file-input');
    const browseBtn = container.querySelector('#btn-browse-file');
    const cameraBtn = container.querySelector('#btn-camera-capture');
    const dropzone = container.querySelector('#ocr-dropzone');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
    }
    if (cameraBtn && cameraInput) {
      cameraBtn.addEventListener('click', () => cameraInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(file);
      });
    }
    if (cameraInput) {
      cameraInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(file);
      });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-[#FF7622]');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-[#FF7622]');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-[#FF7622]');
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelected(file);
      });
    }

    // Toggle Contrast Filter
    const toggleContrast = container.querySelector('#toggle-enhance-contrast');
    if (toggleContrast) {
      toggleContrast.addEventListener('change', async (e) => {
        enhanceContrast = e.target.checked;
        if (enhanceContrast && uploadedImageSrc && !preprocessedImageSrc) {
          preprocessedImageSrc = await preprocessInvoiceImage(uploadedImageSrc);
        }
        render();
      });
    }

    // Remove Image
    const removeImgBtn = container.querySelector('#btn-remove-image');
    if (removeImgBtn) {
      removeImgBtn.addEventListener('click', () => {
        uploadedImageSrc = null;
        preprocessedImageSrc = null;
        uploadedFileName = '';
        parsedItems = [];
        ocrRawText = '';
        scanError = null;
        render();
      });
    }

    // Execute Real Tesseract WebAssembly OCR
    const scanBtn = container.querySelector('#btn-scan-ocr');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        if (!uploadedImageSrc) return;

        ocrScanning = true;
        ocrProgress = 5;
        ocrStatusMessage = 'Booting Tesseract WebAssembly Neural Engine...';
        scanError = null;
        render();

        const startTime = Date.now();

        try {
          // If contrast filter is enabled, preprocess
          const targetImage = (enhanceContrast && preprocessedImageSrc) 
            ? preprocessedImageSrc 
            : uploadedImageSrc;

          const result = await recognizeInvoiceImage(targetImage, (progressUpdate) => {
            ocrProgress = progressUpdate.progress;
            ocrStatusMessage = progressUpdate.message;
            const progressEl = container.querySelector('.bg-\\[\\#059C6A\\]');
            if (progressEl) progressEl.style.width = `${ocrProgress}%`;
            const textEl = container.querySelector('.text-\\[\\#059C6A\\] span:last-child');
            if (textEl) textEl.textContent = `${ocrProgress}%`;
          });

          scanDurationMs = Date.now() - startTime;
          ocrScanning = false;

          if (result.success) {
            ocrRawText = result.rawText;
            ocrConfidence = Math.round(result.confidence || 0);
            parsedItems = result.items || [];
            invoiceMetadata = result.metadata || {};

            if (parsedItems.length === 0) {
              scanError = 'OCR scanned the image but could not identify standard quantity/price lines. Try expanding "Inspect Raw OCR Text" to review the extracted text.';
            } else {
              reactiveStore.playSound('bell');
            }
          } else {
            scanError = result.error || 'Failed to complete optical character recognition.';
          }
        } catch (err) {
          console.error('Scan execution error:', err);
          ocrScanning = false;
          scanError = err.message || 'Error occurred during OCR processing.';
        }

        render();
      });
    }

    // Commit to Catalog Inventory
    const commitBtn = container.querySelector('#btn-commit-batch');
    if (commitBtn) {
      commitBtn.addEventListener('click', () => {
        if (parsedItems.length === 0) return;

        const count = reactiveStore.batchIngestStock(parsedItems);

        // Also cross-reference raw inventory BOM materials
        if (Array.isArray(reactiveStore.inventoryItems)) {
          parsedItems.forEach(item => {
            const raw = reactiveStore.inventoryItems.find(r => r.name.toLowerCase() === item.name.toLowerCase());
            if (raw) {
              reactiveStore.restockInventoryItem(raw.id, item.quantity);
            }
          });
        }

        // Record Audit Entry
        reactiveStore.recordAuditLog({
          action: 'INVOICE_OCR_INGESTION',
          actionLabel: 'Invoice OCR Ingestion',
          targetItem: `${count} items from ${invoiceMetadata.supplierName || uploadedFileName || 'Supplier Invoice'}`,
          details: {
            supplier: invoiceMetadata.supplierName,
            invoiceNumber: invoiceMetadata.invoiceNumber,
            date: invoiceMetadata.date,
            totalAmount: invoiceMetadata.totalAmount,
            itemCount: count
          }
        });

        commitFeedback = `Successfully applied ${count} line items from ${invoiceMetadata.supplierName || 'supplier invoice'} directly into live inventory & catalog! 86'd items restored.`;
        parsedItems = [];
        textInput = '';
        reactiveStore.playSound('bump');
        render();
      });
    }

    // Live Inventory +/- adjusters
    container.querySelectorAll('[data-stock-delta]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.stockDelta;
        const delta = parseInt(e.currentTarget.dataset.delta, 10);
        reactiveStore.updateStock(id, delta);
      });
    });

    // 1-Click Availability Toggle
    container.querySelectorAll('[data-toggle-avail]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.toggleAvail;
        reactiveStore.toggleItemAvailability(id);
      });
    });
  }

  function handleFileSelected(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WebP).');
      return;
    }
    uploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = async (e) => {
      uploadedImageSrc = e.target.result;
      preprocessedImageSrc = null;
      parsedItems = [];
      ocrRawText = '';
      scanError = null;

      // Automatically generate preprocessed high-contrast preview in background
      if (enhanceContrast) {
        preprocessedImageSrc = await preprocessInvoiceImage(uploadedImageSrc);
      }
      render();
    };
    reader.readAsDataURL(file);
  }

  const unsubscribe = reactiveStore.subscribe(() => {
    render();
  });

  render();

  return () => unsubscribe();
}
