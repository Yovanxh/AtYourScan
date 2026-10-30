/**
 * Kitchen Display System (KDS) View
 * Designed for kitchen tablets and wall-mounted touch displays.
 * Realtime order tickets, bump bar, urgency timers, prep aggregate summary, audio chimes.
 */

export function renderKDSView(container, store) {
  let filterSource = 'ALL'; // 'ALL' | 'QR_DINE_IN' | 'DELIVERY' | 'TAKEAWAY'
  let timerInterval = null;
  let latestPaidAlert = null;

  const onOrderPaid = (e) => {
    try {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
    } catch (_) {}
    const detail = e.detail || {};
    const tableNum = detail.order?.table_number || detail.order?.table_id || 'QR';
    const amt = detail.order?.bill_amount || detail.order?.total_amount || '—';
    const utr = detail.utrNumber || detail.order?.utr_number || 'VERIFIED';
    latestPaidAlert = {
      message: `Table ${tableNum} successfully verified! Total ₹${amt} received via UTR: ${utr}`
    };
    render();
  };

  const onUtrSubmitted = (e) => {
    try {
      new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
    } catch (_) {}
    render();
  };

  window.removeEventListener('ORDER_PAID', onOrderPaid);
  window.addEventListener('ORDER_PAID', onOrderPaid);
  window.removeEventListener('ORDER_UTR_SUBMITTED', onUtrSubmitted);
  window.addEventListener('ORDER_UTR_SUBMITTED', onUtrSubmitted);

  function render() {
    const currentVenueId = store.venue?.id || store.venue?.cafe_id;
    const pendingUtrOrders = (store.orders || []).filter(o => {
      return (o.payment_status === 'UTR_SUBMITTED' || o.verification_status === 'PENDING_ADMIN_APPROVAL') && o.status !== 'Completed' && o.status !== 'Cancelled';
    });

    const activeOrders = (store.orders || []).filter(o => {
      if (o.status === 'Completed' || o.status === 'Cancelled') return false;
      // DO NOT route to kitchen display while awaiting admin UTR verification
      if (o.status === 'AWAITING_VERIFICATION' || o.verification_status === 'PENDING_ADMIN_APPROVAL' || o.payment_status === 'UTR_SUBMITTED') {
        return false;
      }
      // Filter out phantom/dummy tickets with empty items
      if (!Array.isArray(o.items) || o.items.length === 0) return false;
      // Scope strictly to active venue
      if (currentVenueId && o.venue_id && o.venue_id !== currentVenueId && o.cafe_id !== currentVenueId) {
        return false;
      }
      return true;
    });
    
    // Filter by channel
    const filteredOrders = activeOrders.filter(o => {
      if (filterSource === 'ALL') return true;
      if (filterSource === 'QR_DINE_IN') return o.source === 'QR_DINE_IN';
      if (filterSource === 'DELIVERY') return o.source === 'SWIGGY' || o.source === 'ZOMATO';
      if (filterSource === 'TAKEAWAY') return o.source === 'TAKEAWAY';
      return true;
    });

    // Compute aggregated kitchen prep tally (e.g. 5x Truffle Fries across tickets)
    const prepTally = {};
    activeOrders.forEach(o => {
      if (o.status === 'New' || o.status === 'Preparing' || o.status === 'in_kitchen') {
        (o.items || []).forEach(it => {
          const dishName = it.dish_name || it.name;
          if (dishName) {
            prepTally[dishName] = (prepTally[dishName] || 0) + (it.quantity || 1);
          }
        });
      }
    });

    container.innerHTML = `
      <div class="kds-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none">
        
        ${pendingUtrOrders.map(pOrder => `
          <div class="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white px-6 py-4 font-black text-sm flex flex-wrap items-center justify-between gap-4 shadow-xl border-b border-amber-300 animate-pulse sticky top-0 z-50">
            <div class="flex items-center gap-3">
              <span class="text-2xl animate-bounce">🔔</span>
              <div>
                <div class="text-sm font-extrabold">Table ${pOrder.table_number || pOrder.table_id || 'QR'} Payment Submitted!</div>
                <div class="text-xs text-amber-100 font-medium mt-0.5">
                  Amount: ₹${Number(pOrder.total_amount).toFixed(2)} | UTR: <span class="font-mono font-bold text-white bg-black/25 px-2 py-0.5 rounded-md">${pOrder.utr_number || 'Pending'}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button data-approve-utr="${pOrder.id}" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">
                ✅ Verify & Accept Order
              </button>
              <button data-reject-utr="${pOrder.id}" class="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">
                ❌ Reject / Invalid UTR
              </button>
            </div>
          </div>
        `).join('')}

        ${latestPaidAlert ? `
        <div class="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 font-black text-sm flex items-center justify-between shadow-lg animate-pulse sticky top-0 z-40">
          <div class="flex items-center gap-2">
            <span class="text-base">🔔</span>
            <span>${latestPaidAlert.message}</span>
          </div>
          <button id="btn-dismiss-paid-alert" class="text-white/80 hover:text-white text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-xl cursor-pointer">
            Dismiss
          </button>
        </div>
      ` : ''}
        <!-- KDS Control Bar Header (matching Running Orders.png) -->
        <header class="bg-white border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2.5">
              <span class="w-3 h-3 rounded-full bg-[#059C6A] animate-pulse"></span>
              <h1 class="text-lg font-black tracking-tight text-[#181C2E]">
                Kitchen Display Rail
              </h1>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-[#FFEBE4] text-[#FF7622]">
              ${activeOrders.length} Active Tickets
            </span>
          </div>

          <!-- Channel Filter Pills -->
          <div class="flex items-center space-x-2 text-xs font-bold">
            ${[
              { id: 'ALL', label: 'All Channels' },
              { id: 'QR_DINE_IN', label: 'QR Dine-In' },
              { id: 'DELIVERY', label: 'Swiggy / Zomato' },
              { id: 'TAKEAWAY', label: 'Takeaway' },
            ].map(f => `
              <button 
                data-kds-filter="${f.id}" 
                class="px-3.5 py-2 rounded-2xl border text-xs font-bold transition-all ${
                  filterSource === f.id 
                    ? 'bg-[#FF7622] text-white border-[#FF7622] shadow-sm shadow-[#FF7622]/20' 
                    : 'bg-[#F0F5FA] text-[#646982] border-slate-100 hover:text-[#181C2E]'
                }"
              >
                ${f.label}
              </button>
            `).join('')}
          </div>

          <!-- Kitchen Chime & Quick Action -->
          <div class="flex items-center space-x-3">
            <button id="btn-toggle-sound" class="px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              store.soundEnabled 
                ? 'bg-[#EBF7F2] text-[#059C6A] border-emerald-200' 
                : 'bg-[#F0F5FA] text-[#A0A5BA] border-slate-100'
            }">
              <span>${store.soundEnabled ? '🔔 Chime On' : '🔕 Muted'}</span>
            </button>
          </div>
        </header>

        <!-- Live Kitchen Prep Tally Strip -->
        ${Object.keys(prepTally).length > 0 ? `
          <div class="bg-white border-b border-slate-100 px-6 py-3 overflow-x-auto no-scrollbar flex items-center space-x-3 text-xs shadow-xs">
            <span class="text-[#A0A5BA] text-[11px] uppercase tracking-wider flex-shrink-0 font-bold">
              Live Cooking Tally:
            </span>
            <div class="flex items-center space-x-2">
              ${Object.entries(prepTally).map(([name, qty]) => `
                <div class="px-3 py-1.5 rounded-2xl bg-[#F7F8F9] border border-slate-100 flex items-center space-x-1.5 flex-shrink-0">
                  <span class="font-black text-[#FF7622] text-xs">${qty}x</span>
                  <span class="text-[#181C2E] font-medium text-xs">${name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Main Ticket Grid -->
        <main class="flex-1 p-6 overflow-y-auto">
          ${filteredOrders.length === 0 ? `
            <div class="h-80 flex flex-col items-center justify-center text-center">
              <div class="w-16 h-16 rounded-full bg-[#EBF7F2] text-[#059C6A] flex items-center justify-center text-3xl font-black mb-3">
                ✓
              </div>
              <h3 class="text-lg font-black text-[#181C2E]">No active tickets in kitchen</h3>
              <p class="text-xs text-[#646982] mt-1 max-w-sm">No active preparation tickets in the queue. New QR scans will appear here instantly with an audible chime.</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              ${filteredOrders.map(order => renderTicket(order)).join('')}
            </div>
          `}
        </main>

      </div>
    `;

    bindEvents();
  }

  // Render Individual Kitchen Ticket (matching Running Orders.png)
  function renderTicket(order) {
    const elapsedMs = Date.now() - new Date(order.created_at).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
    const timeStr = `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSeconds).padStart(2, '0')}`;

    // Urgency styling
    let urgencyBadge = 'text-[#059C6A] bg-[#EBF7F2] border-emerald-100';
    let cardBorder = 'border-slate-100';
    if (elapsedMinutes >= 15) {
      urgencyBadge = 'text-[#FF334B] bg-[#FFF0F2] border-rose-200 animate-pulse font-black';
      cardBorder = 'border-rose-300 ring-2 ring-rose-100';
    } else if (elapsedMinutes >= 8) {
      urgencyBadge = 'text-[#FF7622] bg-[#FFEBE4] border-orange-200 font-bold';
      cardBorder = 'border-orange-200';
    }

    const isReady = order.status === 'Ready' || order.status === 'Served';
    const isPreparing = order.status === 'Preparing';
    const isNew = order.status === 'New' || order.status === 'in_kitchen';

    return `
      <div class="bg-white border ${cardBorder} rounded-[28px] flex flex-col justify-between overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md">
        
        <!-- Ticket Header -->
        <div class="p-4 border-b border-slate-100 bg-[#FDFEFE]">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="font-black text-sm text-[#181C2E]">#${order.id}</span>
              <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                order.source === 'SWIGGY' ? 'bg-[#FFEBE4] text-[#FF7622]' :
                order.source === 'ZOMATO' ? 'bg-[#FFF0F2] text-[#FF334B]' :
                order.source === 'TAKEAWAY' ? 'bg-[#F0F5FA] text-[#646982]' :
                'bg-[#EBF7F2] text-[#059C6A]'
              }">
                ${(order.source || 'QR_DINE_IN').replace('_', ' ')}
              </span>
              ${order.is_pay_later ? `
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  🍽️ Pay Later (Tab Open)
                </span>
              ` : ''}
            </div>

            <!-- Elapsed Timer -->
            <div class="flex items-center gap-1.5">
              ${order.payment_status === 'PAID' ? `
                <span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                  PAID • UTR: ${order.utr_number || 'VERIFIED'}
                </span>
              ` : ''}
              <span class="text-xs font-bold px-2.5 py-0.5 rounded-full border ${urgencyBadge}">
                ⏱ ${timeStr}
              </span>
            </div>
          </div>

          <div class="flex items-center justify-between mt-2.5">
            <span class="text-sm font-black text-[#FF7622]">
              ${order.source === 'QR_DINE_IN' ? `Table ${order.table_number || order.table_id || 'QR'}` : `Takeaway / Counter`}
            </span>
            <span class="text-xs font-medium text-[#646982]">
              ${order.customer_name || 'Guest'}
            </span>
          </div>

          ${order.notes ? `
            <div class="mt-2 text-xs font-medium text-[#FF7622] bg-[#FFEBE4] rounded-xl px-3 py-1.5">
              ⚠️ ${order.notes}
            </div>
          ` : ''}
        </div>

        <!-- Items Checklist -->
        <div class="p-4 flex-1 space-y-2.5 overflow-y-auto max-h-64 divide-y divide-slate-100">
          ${(order.items || []).map(it => `
            <div class="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
              <div class="flex items-start space-x-2.5">
                <span class="font-black text-[#FF7622] bg-[#FFEBE4] px-2 py-0.5 rounded-lg text-xs">
                  ${it.quantity}x
                </span>
                <div>
                  <span class="font-bold text-[#181C2E] text-xs">${it.dish_name || it.name}</span>
                  ${(it.notes || it.customization) ? `
                    <p class="text-[11px] text-[#FF7622] font-medium mt-0.5">↳ ${it.notes || it.customization}</p>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Bump Bar Action Buttons (matching Running Orders.png Done / Cancel) -->
        <div class="p-3.5 border-t border-slate-100 bg-[#FDFEFE] grid grid-cols-2 gap-2">
          ${isNew ? `
            <button 
              data-bump-order="${order.id}" 
              data-next-status="Preparing"
              class="col-span-2 py-3 bg-[#FF7622] hover:bg-[#F15B00] text-white font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#FF7622]/20 cursor-pointer"
            >
              <span>🔥 Start Cooking</span>
            </button>
          ` : isPreparing ? `
            <button 
              data-bump-order="${order.id}" 
              data-next-status="Ready"
              class="col-span-2 py-3 bg-[#059C6A] hover:bg-[#047851] text-white font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#059C6A]/20 cursor-pointer"
            >
              <span>✓ Mark Plated & Ready</span>
            </button>
          ` : `
            <button 
              data-bump-order="${order.id}" 
              data-next-status="Completed"
              class="col-span-2 py-3 bg-[#181C2E] hover:bg-[#121223] text-white font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>🎉 Clear & Fulfill</span>
            </button>
          `}
          ${order.payment_status !== 'PAID' ? `
            <button 
              data-staff-override="${order.id}" 
              class="col-span-2 py-1 text-[11px] font-bold text-slate-400 hover:text-emerald-700 underline text-center cursor-pointer"
            >
              Staff Cash Override (Bypass UTR)
            </button>
          ` : ''}
        </div>

      </div>
    `;
  }

  // Bind DOM Events
  function bindEvents() {
    container.querySelectorAll('[data-kds-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterSource = e.currentTarget.dataset.kdsFilter;
        render();
      });
    });

    const toggleSoundBtn = container.querySelector('#btn-toggle-sound');
    if (toggleSoundBtn) {
      toggleSoundBtn.addEventListener('click', () => {
        store.soundEnabled = !store.soundEnabled;
        if (store.soundEnabled) store.playSound('bell');
        render();
      });
    }

    // Dismiss paid alert
    container.querySelector('#btn-dismiss-paid-alert')?.addEventListener('click', () => {
      latestPaidAlert = null;
      render();
    });

    container.querySelectorAll('[data-approve-utr]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.approveUtr;
        if (typeof store.adminApproveOrderUtr === 'function') {
          await store.adminApproveOrderUtr(orderId);
        }
        render();
      });
    });

    container.querySelectorAll('[data-reject-utr]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.rejectUtr;
        const reason = prompt('Reason for rejecting UTR reference:', 'Invalid UTR reference');
        if (reason && typeof store.adminRejectOrderUtr === 'function') {
          await store.adminRejectOrderUtr(orderId, reason);
        }
        render();
      });
    });

    // Staff cash override
    container.querySelectorAll('[data-staff-override]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.staffOverride;
        if (confirm('Authorize staff cash payment override for Order #' + orderId + '?')) {
          if (typeof store.manualCashPaymentOverride === 'function') {
            await store.manualCashPaymentOverride(orderId, 'STAFF_KITCHEN');
          }
          render();
        }
      });
    });

    // Bump Order button
    container.querySelectorAll('[data-bump-order]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const orderId = e.currentTarget.dataset.bumpOrder;
        const nextStatus = e.currentTarget.dataset.nextStatus;
        store.updateOrderStatus(orderId, nextStatus);
      });
    });
  }

  // Periodic interval to tick elapsed second timers
  timerInterval = setInterval(() => {
    // Only re-render if active orders exist to update timer displays
    if (store.orders.some(o => o.status !== 'Completed' && o.status !== 'Cancelled')) {
      render();
    }
  }, 2000);

  const unsubscribe = store.subscribe(() => {
    render();
  });

  render();

  return () => {
    clearInterval(timerInterval);
    unsubscribe();
  };
}
