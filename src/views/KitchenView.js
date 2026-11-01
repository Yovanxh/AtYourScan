/**
 * Kitchen Display Rail (KDS) View
 * Full preparation ticket management, unified status & channel filtering,
 * instant UTR verification banner, and Supabase realtime synchronization.
 */

import { supabase } from '../supabaseClient.js';

export class KitchenView {
  constructor(container, store) {
    this.container = container;
    this.store = store || window.store;
    this.orders = this.store?.orders ? [...this.store.orders] : [];
    this.currentChannel = 'All Channels';
    this.supabase = window.store?.supabase || window.supabase || supabase;
    this.timerInterval = null;
    this.realtimeChannel = null;

    // Expose kitchenView globally so inline onclick handlers succeed
    window.kitchenView = this;

    this.onOrderApproved = (e) => {
      try {
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
      } catch (_) {}
      const detail = e.detail || {};
      if (detail.order) {
        const existing = this.orders.find(o => o.id === detail.order.id);
        if (existing) {
          Object.assign(existing, detail.order);
        } else {
          this.orders.unshift(detail.order);
        }
      }
      this.render();
    };

    this.onOrderPaid = () => {
      try {
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
      } catch (_) {}
      this.render();
    };

    this.onUtrSubmitted = () => {
      try {
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {});
      } catch (_) {}
      this.render();
    };

    if (typeof window !== 'undefined') {
      window.removeEventListener('ORDER_APPROVED', this.onOrderApproved);
      window.addEventListener('ORDER_APPROVED', this.onOrderApproved);
      window.removeEventListener('ORDER_PAID', this.onOrderPaid);
      window.addEventListener('ORDER_PAID', this.onOrderPaid);
      window.removeEventListener('ORDER_UTR_SUBMITTED', this.onUtrSubmitted);
      window.addEventListener('ORDER_UTR_SUBMITTED', this.onUtrSubmitted);
    }

    if (this.store && typeof this.store.subscribe === 'function') {
      this.unsubscribeStore = this.store.subscribe(() => {
        if (this.store.orders) {
          // Merge with current in-memory orders
          this.orders = [...this.store.orders];
        }
        this.render();
      });
    }

    this.initRealtime();

    this.timerInterval = setInterval(() => {
      const active = this.getActiveKitchenTickets();
      if (active.length > 0) {
        this.render();
      }
    }, 5000);

    this.render();
  }

  // 1. Unified Status & Channel Filtering
  getActiveKitchenTickets() {
    const currentOrders = this.orders || window.store?.orders || [];
    
    return currentOrders.filter(order => {
      // 1. Accept any order verified by admin, prepaid, or on an active dine-in tab
      const isApproved = 
        order.verification_status === 'APPROVED' || 
        order.payment_status === 'PAID' || 
        order.payment_method === 'PAY_LATER';

      // 2. Keep active until physically marked completed or served by kitchen
      const st = String(order.status || '').toUpperCase();
      const isPendingKitchenAction = 
        st !== 'COMPLETED' && 
        st !== 'SERVED' && 
        st !== 'CANCELLED';

      // 3. Fallback gracefully if channel is undefined (default to QR Dine-In)
      const orderChannel = order.channel || (order.source === 'SWIGGY' || order.source === 'ZOMATO' ? 'Swiggy / Zomato' : order.source === 'TAKEAWAY' ? 'Takeaway' : 'QR Dine-In');
      const matchesChannel = 
        !this.currentChannel || 
        this.currentChannel === 'All Channels' || 
        this.currentChannel === 'ALL' ||
        orderChannel === this.currentChannel ||
        (this.currentChannel === 'QR Dine-In' && (orderChannel === 'QR Dine-In' || orderChannel === 'QR_DINE_IN')) ||
        (this.currentChannel === 'Swiggy / Zomato' && (orderChannel === 'Swiggy / Zomato' || orderChannel === 'DELIVERY')) ||
        (this.currentChannel === 'Takeaway' && (orderChannel === 'Takeaway' || orderChannel === 'TAKEAWAY'));

      return isApproved && isPendingKitchenAction && matchesChannel;
    });
  }

  // 2. Universal Ticket Card Component & Preparation Pipeline
  renderTicketCard(order) {
    const itemsHtml = (order.items || []).map(item => `
      <div class="flex justify-between py-1 text-sm border-b border-gray-100">
        <span class="font-medium text-gray-800">${item.quantity || 1}x ${item.name || item.dish_name || 'Item'}</span>
        ${item.notes ? `<span class="text-xs text-amber-600 block">${item.notes}</span>` : ''}
      </div>
    `).join('');

    // Dynamic Status Actions
    let actionButton = '';
    const statusUpper = String(order.status || '').toUpperCase();
    if (statusUpper === 'CONFIRMED' || !order.status || statusUpper === 'PAID' || statusUpper === 'NEW') {
      actionButton = `<button class="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-sm transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'PREPARING')">🔥 Start Cooking</button>`;
    } else if (statusUpper === 'PREPARING' || statusUpper === 'IN_KITCHEN') {
      actionButton = `<button class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-sm transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'READY')">✅ Mark Ready to Serve</button>`;
    } else if (statusUpper === 'READY') {
      actionButton = `<button class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-sm transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'COMPLETED')">🍽️ Handover / Complete</button>`;
    }

    return `
      <div class="bg-white rounded-xl shadow-md border border-gray-200 p-4 flex flex-col justify-between" id="ticket-${order.id}">
        <div>
          <div class="flex justify-between items-center pb-2 border-b">
            <span class="text-base font-bold text-gray-900">Table ${order.table_number || order.table_id || '?'}</span>
            <span class="px-2 py-0.5 text-[11px] font-bold rounded-full ${order.payment_method === 'PAY_LATER' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}">
              ${order.payment_method === 'PAY_LATER' ? 'TAB' : 'PAID'}
            </span>
          </div>
          <div class="text-[11px] text-gray-400 font-mono mt-1 mb-2">Order #${String(order.id).slice(-6)}</div>
          <div class="py-2 space-y-1">
            ${itemsHtml}
          </div>
        </div>
        <div class="pt-3">
          ${actionButton}
        </div>
      </div>
    `;
  }

  // 3. Preparation Status Updates & Global Realtime Reactivity
  async updateOrderStatus(orderId, nextStatus) {
    const statusMap = {
      'PREPARING': 'Preparing',
      'READY': 'Ready',
      'COMPLETED': 'Completed',
      'CANCELLED': 'Cancelled',
      'NEW': 'New',
      'IN_KITCHEN': 'Preparing'
    };
    const normalizedStatus = statusMap[String(nextStatus).toUpperCase()] || nextStatus;

    const client = this.supabase || window.store?.supabase || window.supabase || supabase;
    if (client && typeof client.from === 'function') {
      try {
        let res = await client
          .from('orders')
          .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId);

        if (res.error && res.error.message?.includes('updated_at')) {
          res = await client
            .from('orders')
            .update({ status: normalizedStatus })
            .eq('id', orderId);
        }

        if (res.error) {
          console.error('Failed to update order status in Supabase:', res.error);
        }
      } catch (err) {
        console.error('Error updating order status:', err);
      }
    }

    // Also update via window.store if present for table occupancy sync
    if (window.store && typeof window.store.updateOrderStatus === 'function') {
      window.store.updateOrderStatus(orderId, normalizedStatus);
    }

    // Update in memory and re-render immediately
    const target = (this.orders || []).find(o => o.id === orderId);
    if (target) {
      target.status = normalizedStatus;
    }
    this.render();
  }

  initRealtime() {
    const client = this.supabase || window.store?.supabase || window.supabase || supabase;
    if (!client || typeof client.channel !== 'function') return;

    if (this.realtimeChannel) {
      try { client.removeChannel(this.realtimeChannel); } catch (_) {}
    }

    // Listen for all table order events
    this.realtimeChannel = client
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const exists = (this.orders || []).some(o => o.id === payload.new.id);
          if (!exists) {
            this.orders.unshift(payload.new);
          }
        } else if (payload.eventType === 'UPDATE') {
          const index = this.orders.findIndex(o => o.id === payload.new.id);
          if (index !== -1) {
            this.orders[index] = payload.new;
          } else {
            this.orders.unshift(payload.new);
          }
        }
        if (window.store && Array.isArray(window.store.orders)) {
          if (payload.eventType === 'INSERT') {
            const ex = window.store.orders.some(o => o.id === payload.new.id);
            if (!ex) window.store.orders.unshift(payload.new);
          } else if (payload.eventType === 'UPDATE') {
            const idx = window.store.orders.findIndex(o => o.id === payload.new.id);
            if (idx !== -1) window.store.orders[idx] = payload.new;
            else window.store.orders.unshift(payload.new);
          }
        }
        this.render(); // Re-render ticket grid
      })
      .subscribe();
  }

  render() {
    if (!this.container) return;

    // Check for pending UTR orders awaiting verification
    const currentOrders = this.orders || window.store?.orders || [];
    const pendingUtrOrders = currentOrders.filter(o => {
      const isUnverifiedInstant = (o.payment_method === 'UPI' || !o.is_pay_later) && o.verification_status !== 'APPROVED';
      const isUtrSubmitted = o.payment_status === 'UTR_SUBMITTED' || (Boolean(o.utr_number) && String(o.utr_number).trim().length === 12);
      return isUnverifiedInstant && isUtrSubmitted && o.status !== 'Completed' && o.status !== 'Cancelled' && o.verification_status !== 'REJECTED';
    });

    const activeTickets = this.getActiveKitchenTickets();

    const channels = [
      { id: 'All Channels', label: 'All Channels' },
      { id: 'QR Dine-In', label: 'QR Dine-In' },
      { id: 'Swiggy / Zomato', label: 'Swiggy / Zomato' },
      { id: 'Takeaway', label: 'Takeaway' }
    ];

    this.container.innerHTML = `
      <div class="kds-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none">
        
        ${pendingUtrOrders.map(pOrder => `
          <div class="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white px-6 py-4 font-black text-sm flex flex-wrap items-center justify-between gap-4 shadow-xl border-b border-amber-300 animate-pulse sticky top-0 z-50">
            <div class="flex items-center gap-3">
              <span class="text-2xl animate-bounce">🔔</span>
              <div>
                <div class="text-sm font-extrabold">🔔 Payment Verification: Table ${pOrder.table_number || pOrder.table_id || 'QR'}</div>
                <div class="text-xs text-amber-100 font-medium mt-0.5">
                  Amount: ₹${Number(pOrder.total_amount || pOrder.bill_amount || 0).toFixed(2)} | UTR: <span class="font-mono font-bold text-white bg-black/25 px-2 py-0.5 rounded-md">${pOrder.utr_number || 'Pending'}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button data-approve-utr="${pOrder.id}" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">
                ✅ Accept & Confirm
              </button>
              <button data-reject-utr="${pOrder.id}" class="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">
                ❌ Reject / Invalid UTR
              </button>
            </div>
          </div>
        `).join('')}

        <!-- Header -->
        <header class="bg-white border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2.5">
              <span class="w-3 h-3 rounded-full bg-[#059C6A] animate-pulse"></span>
              <h1 class="text-lg font-black tracking-tight text-[#181C2E]">Kitchen Display Rail</h1>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-[#FFEBE4] text-[#FF7622]">
              ${activeTickets.length} Active Tickets
            </span>
          </div>

          <!-- Channel Filter Pills -->
          <div class="flex items-center space-x-2 text-xs font-bold">
            ${channels.map(ch => `
              <button 
                data-channel-filter="${ch.id}" 
                class="px-3.5 py-2 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  this.currentChannel === ch.id 
                    ? 'bg-[#FF7622] text-white border-[#FF7622] shadow-sm shadow-[#FF7622]/20' 
                    : 'bg-[#F0F5FA] text-[#646982] border-slate-100 hover:text-[#181C2E]'
                }"
              >
                ${ch.label}
              </button>
            `).join('')}
          </div>

          <!-- Sound Controls -->
          <div class="flex items-center space-x-3">
            <button id="btn-kds-sound" class="px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              window.store?.soundEnabled 
                ? 'bg-[#EBF7F2] text-[#059C6A] border-emerald-200' 
                : 'bg-[#F0F5FA] text-[#A0A5BA] border-slate-100'
            }">
              <span>${window.store?.soundEnabled ? '🔔 Chime On' : '🔕 Muted'}</span>
            </button>
          </div>
        </header>

        <!-- Main Ticket Grid -->
        <main class="flex-1 p-6 overflow-y-auto">
          ${activeTickets.length === 0 ? `
            <div class="h-80 flex flex-col items-center justify-center text-center">
              <div class="w-16 h-16 rounded-full bg-[#EBF7F2] text-[#059C6A] flex items-center justify-center text-3xl font-black mb-3">✓</div>
              <h3 class="text-lg font-black text-[#181C2E]">No active tickets in kitchen</h3>
              <p class="text-xs text-[#646982] mt-1 max-w-sm">No active preparation tickets in the queue. New verified orders will appear here automatically.</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              ${activeTickets.map(order => this.renderTicketCard(order)).join('')}
            </div>
          `}
        </main>

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    if (!this.container) return;

    this.container.querySelectorAll('[data-channel-filter]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentChannel = e.currentTarget.dataset.channelFilter;
        this.render();
      });
    });

    const soundBtn = this.container.querySelector('#btn-kds-sound');
    if (soundBtn && window.store) {
      soundBtn.addEventListener('click', () => {
        window.store.soundEnabled = !window.store.soundEnabled;
        if (window.store.soundEnabled && typeof window.store.playSound === 'function') {
          window.store.playSound('bell');
        }
        this.render();
      });
    }

    this.container.querySelectorAll('[data-approve-utr]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.approveUtr;
        if (window.store && typeof window.store.adminApproveOrderUtr === 'function') {
          await window.store.adminApproveOrderUtr(orderId);
        }
        this.render();
      });
    });

    this.container.querySelectorAll('[data-reject-utr]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.rejectUtr;
        const reason = prompt('Reason for rejecting UTR reference:', 'Invalid UTR reference');
        if (reason && window.store && typeof window.store.adminRejectOrderUtr === 'function') {
          await window.store.adminRejectOrderUtr(orderId, reason);
        }
        this.render();
      });
    });
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.unsubscribeStore) this.unsubscribeStore();
    if (typeof window !== 'undefined') {
      window.removeEventListener('ORDER_APPROVED', this.onOrderApproved);
      window.removeEventListener('ORDER_PAID', this.onOrderPaid);
      window.removeEventListener('ORDER_UTR_SUBMITTED', this.onUtrSubmitted);
    }
    const client = this.supabase || window.store?.supabase || window.supabase || supabase;
    if (client && this.realtimeChannel) {
      try { client.removeChannel(this.realtimeChannel); } catch (_) {}
    }
  }
}

export function renderKitchenView(container, store) {
  const instance = new KitchenView(container, store);
  return () => instance.destroy();
}

export const renderKDSView = renderKitchenView;
export default KitchenView;
