/**
 * QR Table Tent-Card Studio
 * Generates ready-to-print acrylic stand tent cards for tables 1-12 with vector QR codes.
 */

import { generateQRCodeSVG } from '../qrGenerator.js';

export function renderQRStudioView(container, store) {
  let selectedTableNum = 'ALL'; // 'ALL' | 1..12
  let customBaseUrl = typeof window !== 'undefined' && window.localStorage ? (window.localStorage.getItem('ays_qr_base_url') || '') : '';

  function render() {
    const venue = store.venue;
    const tablesToRender = selectedTableNum === 'ALL' 
      ? store.tables 
      : store.tables.filter(t => t.table_number === parseInt(selectedTableNum, 10));

    container.innerHTML = `
      <div class="qr-studio-app min-h-screen bg-[#09090c] text-zinc-100 flex flex-col font-sans select-none p-6 space-y-6">
        
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4 no-print">
          <div>
            <h1 class="text-base font-bold text-zinc-100 flex items-center gap-2">
              🏷️ Table QR Tent-Card Studio
            </h1>
            <p class="text-xs text-zinc-400">Generate standards-compliant vector QR tent cards for acrylic tabletop stands.</p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1">
              <span class="text-[11px] text-zinc-400 font-mono">Domain:</span>
              <input 
                id="input-qr-base-url" 
                type="text" 
                placeholder="${typeof window !== 'undefined' && window.location ? window.location.origin : 'https://your-domain.vercel.app'}"
                value="${customBaseUrl}"
                class="bg-transparent text-xs text-zinc-100 font-mono w-44 sm:w-56 focus:outline-none placeholder:text-zinc-600"
                title="Override base URL (e.g. your Vercel URL or local Wi-Fi IP) to test scan from phones"
              />
            </div>

            <select id="table-filter-select" class="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono">
              <option value="ALL">Print All Tables (1–12)</option>
              ${store.tables.map(t => `
                <option value="${t.table_number}" ${selectedTableNum == t.table_number ? 'selected' : ''}>
                  Table ${t.table_number} (${t.section})
                </option>
              `).join('')}
            </select>

            <button id="btn-print-qrs" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
              <span>🖨️ Print Tent Cards</span>
            </button>
          </div>
        </div>

        <!-- Tent Cards Grid (Print-Ready) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 print-grid">
          ${tablesToRender.map(table => {
            const defaultOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000';
            const origin = customBaseUrl ? customBaseUrl.trim().replace(/\/$/, '') : defaultOrigin;
            const pathname = typeof window !== 'undefined' && window.location ? window.location.pathname : '/';
            const targetUrl = `${origin}${pathname}?table=${table.table_number}`;
            const qrSvg = generateQRCodeSVG(targetUrl, { size: 160, darkColor: '#09090b', lightColor: '#ffffff' });

            return `
              <div class="tent-card bg-[#141418] border border-zinc-800/90 rounded-3xl p-6 flex flex-col items-center text-center space-y-4 shadow-xl relative overflow-hidden group">
                
                <!-- Card Top Accent -->
                <div class="w-12 h-1 bg-amber-500 rounded-full mb-1"></div>

                <!-- Venue Logo & Name -->
                <div>
                  <h3 class="text-xs font-serif font-bold tracking-wider uppercase text-amber-400">
                    ${venue.name}
                  </h3>
                  <p class="text-[10px] text-zinc-400 tracking-wide font-mono mt-0.5">
                    ${table.section || table.zone || 'Dining Area'}
                  </p>
                </div>

                <!-- Table Big Indicator -->
                <div class="py-1 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]"></span>
                  <span class="text-xl font-bold font-mono tracking-tight text-zinc-100">
                    TABLE ${table.table_number}
                  </span>
                </div>

                <!-- Crisp Vector QR Code (Clickable to open) -->
                <a 
                  href="?table=${table.table_number}" 
                  target="_blank" 
                  class="bg-white p-3 rounded-2xl shadow-inner inline-block hover:ring-4 hover:ring-amber-500/40 transition-all cursor-pointer group"
                  title="Click or scan to open live guest menu for Table ${table.table_number}"
                >
                  ${qrSvg}
                </a>

                <!-- Instructions -->
                <div class="space-y-1">
                  <p class="text-xs font-semibold text-zinc-200">Point Camera to Order</p>
                  <p class="text-[10px] text-zinc-500 font-mono">No App Required • Instant UPI & Card Pay</p>
                </div>

                <!-- Direct Testing & Action Buttons (Hidden on Print) -->
                <div class="w-full space-y-2 pt-1 no-print">
                  <a 
                    href="?table=${table.table_number}" 
                    target="_blank"
                    class="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    title="Launch live guest ordering view for Table ${table.table_number}"
                  >
                    <span>📱</span>
                    <span>Test Scan / Open Tab ${table.table_number}</span>
                  </a>

                  <button 
                    data-copy-link="${targetUrl}"
                    class="w-full py-1.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>🔗</span>
                    <span>Copy QR Link</span>
                  </button>
                </div>

                <!-- Card Bottom Micro-Badge -->
                <div class="pt-3 border-t border-zinc-800/60 w-full flex items-center justify-between text-[9px] font-mono text-zinc-600">
                  <span>AtYourScan OS</span>
                  <span>UPI: ${venue.upi_id}</span>
                </div>

              </div>
            `;
          }).join('')}
        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const urlInput = container.querySelector('#input-qr-base-url');
    if (urlInput) {
      urlInput.addEventListener('change', (e) => {
        customBaseUrl = e.target.value.trim();
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('ays_qr_base_url', customBaseUrl);
        }
        render();
      });
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    }

    const sel = container.querySelector('#table-filter-select');
    if (sel) {
      sel.addEventListener('change', (e) => {
        selectedTableNum = e.target.value;
        render();
      });
    }

    const printBtn = container.querySelector('#btn-print-qrs');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Copy link buttons
    container.querySelectorAll('[data-copy-link]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const link = e.currentTarget.dataset.copyLink;
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(link);
          }
          const origText = e.currentTarget.innerHTML;
          e.currentTarget.innerHTML = '<span>✓</span> <span class="text-emerald-400">Copied!</span>';
          setTimeout(() => {
            e.currentTarget.innerHTML = origText;
          }, 1500);
        } catch (err) {
          console.log('Clipboard fallback:', err);
        }
      });
    });
  }

  const unsubscribe = store.subscribe(() => {
    render();
  });

  render();

  return () => unsubscribe();
}
