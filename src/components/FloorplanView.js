/**
 * Interactive Floorplan & Table Tabs View (Milestone 4 - F12, F13, F14)
 * Spatial Dining Zones, Realtime Table Occupancy States, Running Tab Durations,
 * and Interactive Inspection Modal with Split, Transfer, and Checkout.
 */

import { store } from '../store.js';
import { requestManagerOverride } from './ManagerOverrideModal.js';
import { generateQRCodeSVG } from '../qrGenerator.js';

export function splitBillEvenly(totalAmount, guestCount) {
  const total = Math.round(Number(totalAmount) * 100);
  const n = parseInt(guestCount, 10);
  if (isNaN(n) || n <= 0) throw new Error('Guest count must be >= 1');
  if (total <= 0) return Array.from({ length: n }, () => 0);

  const basePence = Math.floor(total / n);
  const remainder = total % n;

  const shares = [];
  for (let i = 0; i < n; i++) {
    const pence = i < remainder ? basePence + 1 : basePence;
    shares.push(pence / 100);
  }
  return shares;
}

/**
 * Dynamically format elapsed duration into human-readable hours and minutes (e.g. 1h 25m, 42m, Just seated)
 * Clamps or resets corrupted, stale, or vacant table timestamps.
 * @param {string|null} seatedAt - ISO timestamp of when table was seated
 * @param {boolean} [isVacant=false] - Whether table is currently vacant
 * @returns {string} Formatted duration or '—'
 */
export function formatElapsedDuration(seatedAt, isVacant = false) {
  if (isVacant || !seatedAt) return '—';

  const seatedTime = new Date(seatedAt).getTime();
  if (isNaN(seatedTime)) return '—';

  const diffMs = Date.now() - seatedTime;
  if (diffMs < 0) return 'Just seated';

  const totalMins = Math.floor(diffMs / 60000);

  // Reject ghost / epoch timestamps older than 24 hours
  if (totalMins > 24 * 60) {
    return '—';
  }

  if (totalMins < 1) {
    return 'Just seated';
  }

  if (totalMins < 60) {
    return `${totalMins}m`;
  }

  const hours = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;

  if (remainingMins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMins}m`;
}

export function renderFloorplanView(container, reactiveStore) {
  let selectedTableNum = null;
  let inspectionSplitCount = 1;
  let transferTargetTable = null;
  let activeIncomingTicket = null;
  let incomingToastOrder = null;
  let toastTimer = null;

  function render() {
    if (reactiveStore && typeof reactiveStore.syncTableStates === 'function') {
      reactiveStore.syncTableStates();
    }

    const tables = reactiveStore.tables || [];
    const orders = reactiveStore.orders || [];
    const activeTables = tables.filter(t => t.status && t.status !== 'Vacant' && t.status !== 'Available');
    const vacantTables = tables.filter(t => !t.status || t.status === 'Vacant' || t.status === 'Available');

    // Group tables by architectural zones
    const zones = [
      {
        name: '🌿 Indoor Courtyard',
        filter: t => (t.zone ? t.zone.includes('Courtyard') : (t.table_number || t.number) <= 4),
        desc: 'Quiet fountain seating & private alcoves'
      },
      {
        name: '🍃 Verandah & Garden',
        filter: t => (t.zone ? t.zone.includes('Verandah') : ((t.table_number || t.number) >= 5 && (t.table_number || t.number) <= 8)),
        desc: 'Open-air botanical deck'
      },
      {
        name: '🍸 Mezzanine Lounge',
        filter: t => (t.zone ? t.zone.includes('Mezzanine') : (t.table_number || t.number) >= 9),
        desc: 'Elevated bar & cocktail tables'
      }
    ];

    container.innerHTML = `
      <div class="floorplan-app floorplan-stub min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        
        <!-- Header & Floor Metrics -->
        <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm">
          <div class="flex items-center space-x-3.5">
            <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
              🗺️
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-[#FF7622]">Floor Management</span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF7F2] text-[#059C6A]">
                  ${activeTables.length} Active / ${tables.length} Total
                </span>
              </div>
              <h1 class="text-xl font-black text-[#181C2E]">Spatial Floorplan & Live Table Tabs</h1>
            </div>
          </div>

          <!-- Status Legend Pill -->
          <div class="flex items-center gap-3.5 bg-[#F0F5FA] px-4 py-2 rounded-2xl border border-slate-100 text-xs font-bold text-[#646982]">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#A0A5BA]"></span> Vacant</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#FF7622]"></span> Active Tab</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#059C6A]"></span> Food Ready</span>
          </div>
        </div>

        <!-- 4 Quick Stats Capsules -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Total Capacity</span>
            <div class="text-3xl font-black text-[#181C2E] mt-2">54 Seats</div>
            <span class="text-xs text-[#646982] mt-1 block">12 Tables across 3 zones</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#FF7622]">Active Seated</span>
            <div class="text-3xl font-black text-[#FF7622] mt-2">${activeTables.length} Tables</div>
            <span class="text-xs text-[#646982] mt-1 block">Running dining tabs</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#059C6A]">Vacant Ready</span>
            <div class="text-3xl font-black text-[#059C6A] mt-2">${vacantTables.length} Tables</div>
            <span class="text-xs text-[#646982] mt-1 block">Ready for walk-ins</span>
          </div>

          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm">
            <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Occupancy Rate</span>
            <div class="text-3xl font-black text-[#181C2E] mt-2">${tables.length > 0 ? Math.round((activeTables.length / tables.length) * 100) : 0}%</div>
            <span class="text-xs text-[#059C6A] font-bold mt-1 block">Optimal floor velocity</span>
          </div>
        </div>

        <!-- Spatial Zones Container -->
        <div class="space-y-6">
          ${zones.map(zone => {
            const zoneTables = tables.filter(zone.filter);

            return `
              <div class="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm space-y-4">
                <div class="flex items-center justify-between border-b border-slate-100 pb-3.5">
                  <div>
                    <h3 class="text-base font-black text-[#181C2E] flex items-center gap-2">
                      <span>${zone.name}</span>
                      <span class="text-xs font-normal text-[#646982]">(${zone.desc})</span>
                    </h3>
                  </div>
                  <span class="text-xs font-bold text-[#A0A5BA]">${zoneTables.length} Tables</span>
                </div>

                <!-- Tables Grid in Zone -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  ${zoneTables.map(t => {
                    const tableNum = t.table_number || t.number;
                    const tableOrders = orders.filter(
                      o => o.table_number === tableNum && o.status !== 'Completed' && o.status !== 'Cancelled'
                    );
                    const hasActiveOrders = tableOrders.length > 0;
                    const isFoodReady = tableOrders.some(o => o.status === 'Ready');
                    const tabTotal = tableOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

                    // Card borders & badges
                    let borderClass = 'border-slate-100 bg-[#FDFEFE] hover:border-slate-300';
                    let statusPill = 'bg-[#F0F5FA] text-[#646982]';
                    let statusText = 'Vacant';

                    if (isFoodReady) {
                      borderClass = 'border-[#059C6A] ring-2 ring-emerald-100 bg-[#EBF7F2]/40';
                      statusPill = 'bg-[#EBF7F2] text-[#059C6A] font-bold';
                      statusText = 'Food Ready';
                    } else if (hasActiveOrders || (t.status && t.status !== 'Vacant' && t.status !== 'Available')) {
                      borderClass = 'border-[#FF7622] ring-2 ring-orange-100 bg-[#FFEBE4]/30';
                      statusPill = 'bg-[#FFEBE4] text-[#FF7622] font-bold';
                      statusText = (t.status && t.status !== 'Vacant' && t.status !== 'Available') ? t.status : 'Active Ordering';
                    }

                    const isVacant = statusText === 'Vacant';
                    const durationStr = formatElapsedDuration(t.seated_at, isVacant);
                    const seatedGuestsStr = isVacant ? '—' : `${t.party_size || t.seated_guests || 0} diners`;

                    return `
                      <div 
                        data-inspect-table="${tableNum}" 
                        class="border ${borderClass} rounded-[24px] p-4 flex flex-col justify-between h-38 cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-98 relative group shadow-xs"
                      >
                        <div class="flex items-center justify-between">
                          <div class="flex items-center space-x-1.5">
                            <span class="font-black text-sm text-[#181C2E]">Table ${tableNum}</span>
                            <span class="text-xs text-[#A0A5BA]">(${t.capacity}p)</span>
                          </div>
                          <div class="flex items-center gap-1.5">
                            <a 
                              href="?table=${tableNum}" 
                              target="_blank" 
                              title="Open live guest QR ordering menu for Table ${tableNum}" 
                              class="px-2 py-0.5 rounded-lg bg-[#FFEBE4] hover:bg-[#FFD9CD] text-[#FF7622] text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                              onclick="event.stopPropagation()"
                            >
                              <span>📱</span>
                              <span>QR</span>
                            </a>
                            <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${statusPill}">
                              ${statusText}
                            </span>
                          </div>
                        </div>

                        <div class="space-y-1 text-xs">
                          <div class="text-[#646982] flex items-center justify-between">
                            <span>Seated Guests:</span>
                            <span class="${isVacant ? 'text-[#A0A5BA]' : 'font-bold text-[#181C2E]'}">${seatedGuestsStr}</span>
                          </div>
                          <div class="text-[#646982] flex items-center justify-between">
                            <span>Elapsed Tab:</span>
                            <span class="${isVacant ? 'text-[#A0A5BA]' : 'text-[#FF7622] font-bold'}">${isVacant ? '—' : `⏱ ${durationStr}`}</span>
                          </div>
                        </div>

                        <div class="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                          <span class="text-[#A0A5BA] text-[11px] font-medium">${isVacant ? 'Ready for seating' : `${tableOrders.length} ticket(s)`}</span>
                          <span class="font-black ${isVacant ? 'text-[#A0A5BA]' : 'text-[#FF7622]'} text-sm">${tabTotal > 0 ? `₹${tabTotal.toLocaleString('en-IN')}` : '₹0'}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Table Inspection Modal -->
        ${selectedTableNum ? renderInspectionModal(selectedTableNum, reactiveStore, tables, orders, inspectionSplitCount) : ''}

        <!-- Real-Time Incoming Order Toast Notification -->
        ${incomingToastOrder ? renderIncomingToast(incomingToastOrder) : ''}

        <!-- Incoming Kitchen Ticket Popup Modal -->
        ${activeIncomingTicket ? renderIncomingTicketModal(activeIncomingTicket) : ''}

      </div>
    `;

    bindEvents();
  }

  function renderIncomingToast(order) {
    const tableId = order.table_number || order.table_id || 'QR';
    const totalItems = (order.items || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
    return `
      <div id="toast-incoming-order" class="fixed top-6 right-6 z-50 bg-[#181C2E] text-white p-4 rounded-2xl shadow-2xl border border-[#FF7622]/50 flex items-center gap-3.5 animate-in slide-in-from-top duration-300 max-w-sm select-none">
        <div class="w-10 h-10 rounded-xl bg-[#FF7622]/20 text-[#FF7622] flex items-center justify-center text-xl font-bold flex-shrink-0 animate-bounce">
          🔔
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-black text-sm text-white">New QR Order Fired!</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFEBE4] text-[#FF7622]">Table ${tableId}</span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5 truncate">#${order.id} • ${totalItems} item(s) (₹${order.total_amount})</p>
        </div>
        <button id="btn-toast-view-order" class="px-3 py-1.5 rounded-xl bg-[#FF7622] hover:bg-[#F15B00] text-white text-xs font-bold transition-all ml-1 cursor-pointer flex-shrink-0">
          View
        </button>
        <button id="btn-toast-dismiss" class="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center text-xs ml-1 cursor-pointer flex-shrink-0">
          ✕
        </button>
      </div>
    `;
  }

  function renderIncomingTicketModal(order) {
    const tableId = order.table_number || order.table_id || 'QR';
    return `
      <div id="modal-incoming-ticket" class="fixed inset-0 z-50 bg-[#181C2E]/75 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
        <div class="bg-white rounded-[32px] border border-orange-200 max-w-md w-full p-6 shadow-2xl relative space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-bold shadow-md shadow-orange-500/20">
                🚨
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-base font-black text-[#181C2E]">Incoming Kitchen Order</h3>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FFEBE4] text-[#FF7622] uppercase tracking-wider">
                    LIVE QR TICKET
                  </span>
                </div>
                <p class="text-xs text-[#646982] mt-0.5">Table ${tableId} • Order #${order.id}</p>
              </div>
            </div>
            <button id="btn-close-ticket-popup" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-[#646982] flex items-center justify-center text-sm cursor-pointer transition-all">
              ✕
            </button>
          </div>

          <div class="bg-[#F7F8F9] rounded-2xl p-4 divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto">
            <span class="text-[10px] text-[#A0A5BA] uppercase font-bold tracking-wider block mb-2">Itemized Order Breakdown</span>
            ${(order.items || []).map(it => `
              <div class="py-2 flex justify-between items-start text-[#181C2E]">
                <div>
                  <span class="font-bold text-sm">${it.quantity}x ${it.dish_name || it.name}</span>
                  ${(it.notes || it.customization) ? `
                    <span class="block text-[11px] text-[#FF7622] mt-0.5">⚠️ ${it.notes || it.customization}</span>
                  ` : ''}
                </div>
                <span class="font-semibold text-xs text-[#646982]">₹${((Number(it.price) || 0) * (Number(it.quantity) || 1)).toFixed(2)}</span>
              </div>
            `).join('')}
            <div class="pt-3 flex justify-between font-black text-sm text-[#181C2E]">
              <span>Total Value</span>
              <span class="text-[#FF7622] text-base">₹${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <div class="pt-2 flex items-center gap-2.5">
            <button id="btn-ticket-dismiss" class="flex-1 py-3.5 rounded-2xl bg-[#ECF0F4] hover:bg-[#E2E8F0] text-[#181C2E] font-bold text-xs transition-all cursor-pointer">
              Acknowledge & Close
            </button>
            <button id="btn-ticket-open-kds" class="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF7622] to-[#F15B00] hover:from-[#F15B00] hover:to-[#E05300] text-white font-bold text-xs shadow-lg shadow-orange-500/30 transition-all cursor-pointer flex items-center justify-center gap-1.5">
              <span>Go to KDS Rail</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderInspectionModal(tableNum, reactiveStore, tables, orders, splitCount) {
    const tableOrders = (orders || []).filter(
      o => (o.table_number || o.table) === tableNum && o.status !== 'Completed' && o.status !== 'Cancelled'
    );
    const tbl = (tables || []).find(t => (t.table_number || t.number) === tableNum);
    const otherTables = (tables || []).filter(t => (t.table_number || t.number) !== tableNum);
    const tabTotal = tableOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const shares = splitBillEvenly(tabTotal, splitCount);
    const savedBase = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('ays_qr_base_url') : '';
    const defaultOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000';
    const origin = savedBase ? savedBase.trim().replace(/\/$/, '') : defaultOrigin;
    const tableGuestUrl = `${origin}/?table=${tableNum}`;
    const tableQrSvg = generateQRCodeSVG(tableGuestUrl, { size: 84, darkColor: '#181C2E', lightColor: '#ffffff' });

    return `
      <div id="inspect-modal-backdrop" class="fixed inset-0 z-50 bg-[#181C2E]/70 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-white rounded-[32px] max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          
          <!-- Modal Header -->
          <div class="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div>
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-[#FF7622]"></span>
                <h3 class="text-lg font-black text-[#181C2E]">Table ${tableNum} Tab Inspector</h3>
              </div>
              <p class="text-xs text-[#646982] mt-0.5">${tbl?.zone || 'Dining Zone'} • ${tbl?.capacity} seats</p>
            </div>
            <button id="close-inspect-modal" class="w-8 h-8 rounded-full bg-[#F0F5FA] text-[#646982] hover:text-[#181C2E] flex items-center justify-center text-sm font-bold cursor-pointer">✕</button>
          </div>

          <!-- Tabletop QR Stand & Live Guest Ordering Shortcut -->
          <div class="p-3.5 rounded-2xl bg-[#F7F8F9] border border-slate-100 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <a href="?table=${tableNum}" target="_blank" class="bg-white p-1.5 rounded-2xl shadow-sm block hover:ring-2 hover:ring-[#FF7622] transition-all cursor-pointer" title="Scan or open Table ${tableNum} QR Code">
                ${tableQrSvg}
              </a>
              <div>
                <span class="text-xs font-black text-[#181C2E] block">Table ${tableNum} QR Code</span>
                <span class="text-[11px] text-[#A0A5BA]">Contactless tabletop dine-in link</span>
              </div>
            </div>
            <a 
              href="?table=${tableNum}" 
              target="_blank"
              class="px-3.5 py-2 rounded-2xl bg-[#FFEBE4] hover:bg-[#FFD9CD] text-[#FF7622] text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <span>📱 Open Guest Menu</span>
              <span>↗</span>
            </a>
          </div>

          <!-- Active Tickets Breakdown -->
          <div class="space-y-3 max-h-52 overflow-y-auto pr-1">
            ${tableOrders.length === 0 ? `
              <div class="py-8 text-center text-xs text-[#A0A5BA]">
                No active orders for Table ${tableNum}. Table is Vacant and ready.
              </div>
            ` : tableOrders.map(o => `
              <div class="bg-[#F7F8F9] border border-slate-100 rounded-2xl p-3.5 space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span class="font-black text-[#181C2E]">Order #${o.id}</span>
                  <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    o.status === 'Ready' ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-[#FFEBE4] text-[#FF7622]'
                  }">● ${o.status}</span>
                </div>
                <div class="space-y-1 text-[#646982] text-xs divide-y divide-slate-100">
                  ${o.items.map(it => `
                    <div class="pt-1 flex justify-between">
                      <span>${it.quantity}x ${it.name}</span>
                      <span class="font-bold text-[#181C2E]">₹${it.price * it.quantity}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Total & Bill Splitter -->
          <div class="p-4 rounded-2xl bg-[#F7F8F9] border border-slate-100 space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-[#646982] font-medium">Split Bill Across Guests</span>
              <div class="flex items-center gap-1.5">
                ${[1, 2, 3, 4, 5].map(n => `
                  <button 
                    data-modal-split="${n}"
                    class="w-7 h-7 rounded-xl text-xs font-black transition-all ${
                      splitCount === n ? 'bg-[#FF7622] text-white shadow-sm shadow-[#FF7622]/30' : 'bg-[#ECF0F4] text-[#646982] hover:text-[#181C2E]'
                    }"
                  >
                    ${n}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
              <span class="text-[#646982] font-semibold">Total Running Tab:</span>
              <span class="text-lg font-black text-[#FF7622]">₹${tabTotal.toLocaleString('en-IN')}</span>
            </div>

            ${splitCount > 1 ? `
              <div class="flex items-center justify-between text-xs text-[#059C6A] pt-1">
                <span class="font-medium">Per Guest (${splitCount} shares):</span>
                <span class="font-black">₹${shares[0].toFixed(2)} each</span>
              </div>
            ` : ''}
          </div>

          <!-- Table Transfer Option -->
          <div class="flex items-center gap-2 pt-1">
            <select id="transfer-table-select" class="flex-1 bg-[#F0F5FA] border border-slate-100 rounded-2xl px-3.5 py-2.5 text-xs text-[#181C2E] font-medium">
              <option value="">Transfer Table to...</option>
              ${otherTables.map(ot => `
                <option value="${ot.table_number}">Table ${ot.table_number} (${ot.zone || ot.section}) - ${ot.status || 'Vacant'}</option>
              `).join('')}
            </select>
            <button id="btn-execute-transfer" class="px-4 py-2.5 bg-[#ECF0F4] hover:bg-[#E2E8F0] text-[#181C2E] text-xs font-bold rounded-2xl cursor-pointer">
              Transfer
            </button>
          </div>

          <!-- Actions: Settle / Clear -->
          <div class="grid grid-cols-2 gap-3 pt-1">
            <button 
              id="btn-settle-tab-upi" 
              ${tabTotal === 0 ? 'disabled' : ''} 
              class="py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                tabTotal > 0 
                  ? 'bg-[#FF7622] hover:bg-[#F15B00] text-white shadow-md shadow-[#FF7622]/20 active:scale-98 cursor-pointer' 
                  : 'bg-[#F0F5FA] text-[#A0A5BA] cursor-not-allowed'
              }"
            >
              <span>⚡ Settle via UPI</span>
            </button>

            <button 
              id="btn-settle-tab-cash" 
              ${tabTotal === 0 ? 'disabled' : ''} 
              class="py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                tabTotal > 0 
                  ? 'bg-[#181C2E] hover:bg-[#121223] text-white active:scale-98 cursor-pointer' 
                  : 'bg-[#F0F5FA] text-[#A0A5BA] cursor-not-allowed'
              }"
            >
              <span>💵 Cash / Card Close</span>
            </button>
          </div>

          <!-- Sensitive Actions: Void Tab / Force Clear -->
          <div class="grid grid-cols-2 gap-3 pt-1">
            <button 
              id="btn-void-tab" 
              ${tabTotal === 0 ? 'disabled' : ''} 
              class="py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                tabTotal > 0 
                  ? 'bg-[#FFF0F2] hover:bg-[#FFE5E8] border border-rose-200 text-[#FF334B] active:scale-98 cursor-pointer' 
                  : 'bg-[#F0F5FA] text-[#A0A5BA] cursor-not-allowed'
              }"
            >
              <span>🗑️ Void Active Tab</span>
            </button>

            <button 
              id="btn-force-clear-table" 
              class="py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 bg-[#FFEBE4] hover:bg-[#FFD9CD] border border-orange-200 text-[#FF7622] active:scale-98 cursor-pointer"
            >
              <span>⚠️ Force Clear Table</span>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Table click
    container.querySelectorAll('[data-inspect-table]').forEach(card => {
      card.addEventListener('click', (e) => {
        selectedTableNum = parseInt(e.currentTarget.dataset.inspectTable, 10);
        inspectionSplitCount = 1;
        render();
      });
    });

    // Close modal
    const closeBtn = container.querySelector('#close-inspect-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        selectedTableNum = null;
        render();
      });
    }

    const modalBackdrop = container.querySelector('#inspect-modal-backdrop');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'inspect-modal-backdrop') {
          selectedTableNum = null;
          render();
        }
      });
    }

    // Modal Split buttons
    container.querySelectorAll('[data-modal-split]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        inspectionSplitCount = parseInt(e.currentTarget.dataset.modalSplit, 10);
        render();
      });
    });

    // Transfer Table Action
    const transferBtn = container.querySelector('#btn-execute-transfer');
    if (transferBtn) {
      transferBtn.addEventListener('click', () => {
        const sel = container.querySelector('#transfer-table-select');
        const targetNum = parseInt(sel?.value, 10);
        if (targetNum && selectedTableNum) {
          const success = reactiveStore.transferTable(selectedTableNum, targetNum);
          if (success) {
            alert(`✓ Transferred Table ${selectedTableNum} orders and tab to Table ${targetNum}!`);
            selectedTableNum = null;
            render();
          } else {
            alert('Could not transfer table.');
          }
        }
      });
    }

    // Settle UPI
    const settleUPIBtn = container.querySelector('#btn-settle-tab-upi');
    if (settleUPIBtn) {
      settleUPIBtn.addEventListener('click', () => {
        if (selectedTableNum) {
          reactiveStore.settleTable(selectedTableNum, 'UPI');
          selectedTableNum = null;
          render();
        }
      });
    }

    // Settle Cash
    const settleCashBtn = container.querySelector('#btn-settle-tab-cash');
    if (settleCashBtn) {
      settleCashBtn.addEventListener('click', () => {
        if (selectedTableNum) {
          reactiveStore.settleTable(selectedTableNum, 'CASH');
          selectedTableNum = null;
          render();
        }
      });
    }

    // Void Active Tab (with RBAC / Manager Override)
    const voidBtn = container.querySelector('#btn-void-tab');
    if (voidBtn) {
      voidBtn.addEventListener('click', async () => {
        if (!selectedTableNum) return;
        const targetTable = (reactiveStore.tables || []).find(t => (t.table_number || t.number) === selectedTableNum);
        const tabOrders = (reactiveStore.orders || []).filter(o => 
          (o.table_number || o.table) === selectedTableNum && o.status !== 'Completed' && o.status !== 'Cancelled'
        );
        const tabTotal = tabOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

        // RBAC Check: Order void requires PERMISSIONS.ORDER_VOID_ACTIVE
        const hasAuth = reactiveStore.hasPermission('orders:void') || reactiveStore.hasPermission('ORDER_VOID_ACTIVE');
        if (!hasAuth) {
          const overrideResult = await requestManagerOverride(reactiveStore, {
            actionType: 'ORDER_VOID_ACTIVE',
            actionLabel: `Void Active Bill (Table #${selectedTableNum})`,
            targetItem: `Table #${selectedTableNum} • ₹${tabTotal.toFixed(2)}`,
            initiator: reactiveStore.currentStaff
          });

          if (!overrideResult || !overrideResult.approved) {
            return;
          }
        }

        if (typeof reactiveStore.voidTable === 'function') {
          reactiveStore.voidTable(selectedTableNum);
        } else {
          tabOrders.forEach(o => { o.status = 'Cancelled'; });
          if (targetTable) {
            targetTable.status = 'Vacant';
            targetTable.party_size = 0;
            targetTable.seated_guests = 0;
            targetTable.seated_at = null;
            targetTable.active_order_id = null;
          }
          reactiveStore.save?.('ays_orders', reactiveStore.orders);
          reactiveStore.save?.('ays_tables', reactiveStore.tables);
          reactiveStore.playSound?.('pop');
          reactiveStore.notify?.();
        }

        selectedTableNum = null;
        render();
      });
    }

    // Force Clear Table (with RBAC / Manager Override)
    const forceClearBtn = container.querySelector('#btn-force-clear-table');
    if (forceClearBtn) {
      forceClearBtn.addEventListener('click', async () => {
        if (!selectedTableNum) return;
        const targetTable = (reactiveStore.tables || []).find(t => (t.table_number || t.number) === selectedTableNum);

        const hasAuth = reactiveStore.hasPermission('tables:force_clear') || reactiveStore.hasPermission('TABLE_FORCE_CLEAR');
        if (!hasAuth) {
          const overrideResult = await requestManagerOverride(reactiveStore, {
            actionType: 'TABLE_FORCE_CLEAR',
            actionLabel: `Force Clear Table #${selectedTableNum}`,
            targetItem: `Table #${selectedTableNum}`,
            initiator: reactiveStore.currentStaff
          });

          if (!overrideResult || !overrideResult.approved) {
            return;
          }
        }

        if (typeof reactiveStore.forceClearTable === 'function') {
          reactiveStore.forceClearTable(selectedTableNum);
        } else {
          if (targetTable) {
            targetTable.status = 'Vacant';
            targetTable.party_size = 0;
            targetTable.seated_guests = 0;
            targetTable.seated_at = null;
            targetTable.active_order_id = null;
          }
          reactiveStore.save?.('ays_tables', reactiveStore.tables);
          reactiveStore.playSound?.('pop');
          reactiveStore.notify?.();
        }

        selectedTableNum = null;
        render();
      });
    }

    // Realtime Incoming Order Toast & Ticket Popup Events
    container.querySelector('#btn-toast-view-order')?.addEventListener('click', () => {
      activeIncomingTicket = incomingToastOrder;
      incomingToastOrder = null;
      render();
    });
    container.querySelector('#btn-toast-dismiss')?.addEventListener('click', () => {
      incomingToastOrder = null;
      render();
    });
    container.querySelector('#btn-close-ticket-popup')?.addEventListener('click', () => {
      activeIncomingTicket = null;
      render();
    });
    container.querySelector('#btn-ticket-dismiss')?.addEventListener('click', () => {
      activeIncomingTicket = null;
      render();
    });
    container.querySelector('#btn-ticket-open-kds')?.addEventListener('click', () => {
      activeIncomingTicket = null;
      if (typeof window !== 'undefined' && window.location) {
        try {
          const u = new URL(window.location.href);
          u.searchParams.set('view', 'kds');
          window.history.pushState({}, '', u);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch {}
      }
    });
  }

  // Periodic ticker to increment running tab durations dynamically without manual reload
  const timerInterval = setInterval(() => {
    if (!selectedTableNum && reactiveStore.tables?.some(t => t.status && t.status !== 'Vacant' && t.status !== 'Available')) {
      render();
    }
  }, 30000);

  const unsubscribe = reactiveStore.subscribe((s, event) => {
    if (event?.type === 'ORDER_FIRED' && event.order) {
      activeIncomingTicket = event.order;
      incomingToastOrder = event.order;
      if (toastTimer) clearTimeout(toastTimer);
      if (typeof setTimeout !== 'undefined') {
        toastTimer = setTimeout(() => {
          incomingToastOrder = null;
          render();
        }, 8000);
      }
    }
    render();
  });

  render();

  return () => {
    clearInterval(timerInterval);
    if (toastTimer) clearTimeout(toastTimer);
    unsubscribe();
  };
}
