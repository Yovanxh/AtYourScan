/**
 * Kitchen Display Rail (KDS) View
 * Milestone M3 (Requirement R4)
 * 
 * Features:
 * - Realtime order ticket rendering with complete item details & customizations
 * - Immediate rendering from orders.items JSONB with fallback to order_items
 * - Human-readable creation timestamps & elapsed urgency timers (<10m, 10-20m, >20m)
 * - Fulfillment channel badges (QR Dine-In, Takeaway, Delivery, POS)
 * - Ticket deduplication by order ID
 * - "Recently Completed" recall drawer for un-bumping accidentally completed tickets
 * - Centralized audio notification integration via audioAlertManager
 */

import { supabase } from '../supabaseClient.js';
import { audioAlertManager } from '../utils/audioAlerts.js';

export function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export class KitchenView {
  constructor(container, store) {
    this.container = container;
    this.store = store || window.store;
    this.orders = this.store?.orders ? [...this.store.orders] : [];
    this.currentChannel = 'All Channels';
    this.supabase = window.store?.supabase || window.supabase || supabase;
    this.timerInterval = null;
    this.realtimeChannel = null;
    this.isRecallDrawerOpen = false;
    this._fetchingItems = new Set();

    // Expose kitchenView globally so inline onclick handlers succeed
    window.kitchenView = this;

    this.onOrderApproved = (e) => {
      const detail = e.detail || {};
      if (detail.order) {
        audioAlertManager.playNewOrderAlert(detail.order.id);
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
      this.render();
    };

    this.onUtrSubmitted = (e) => {
      const detail = e?.detail || {};
      if (detail.order) {
        audioAlertManager.playNewOrderAlert(detail.order.id);
      }
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
          this.orders = [...this.store.orders];
        }
        this.render();
      });
    }

    this.initRealtime();

    // Urgent timer re-render tick every 10 seconds
    this.timerInterval = setInterval(() => {
      const active = this.getActiveKitchenTickets();
      if (active.length > 0) {
        this.render();
      }
    }, 10000);

    this.render();
  }

  // 1. Unified Status & Channel Filtering with Ticket Deduplication
  getActiveKitchenTickets() {
    const currentOrders = this.orders || window.store?.orders || [];
    const seenOrderIds = new Set();
    const dedupedTickets = [];
    
    for (const order of currentOrders) {
      if (!order || !order.id || seenOrderIds.has(order.id)) continue;

      // 1. Accept any order verified by admin, prepaid, or on an active dine-in tab
      const isApproved = 
        order.status === 'in_kitchen' ||
        order.status === 'Preparing' ||
        order.verification_status === 'APPROVED' || 
        order.payment_status === 'PAID' || 
        order.payment_method === 'PAY_LATER';

      // 2. Keep active until physically marked completed or served by kitchen
      const st = String(order.status || '').toUpperCase();
      const isPendingKitchenAction = 
        st !== 'COMPLETED' && 
        st !== 'SERVED' && 
        st !== 'CANCELLED' &&
        st !== 'VOIDED';

      // 3. Fallback gracefully if channel is undefined (default to QR Dine-In)
      const orderChannel = order.channel || (
        order.source === 'SWIGGY' || order.source === 'ZOMATO' || order.source === 'DELIVERY'
          ? 'Swiggy / Zomato' 
          : (order.source === 'TAKEAWAY' ? 'Takeaway' : 'QR Dine-In')
      );

      const matchesChannel = 
        !this.currentChannel || 
        this.currentChannel === 'All Channels' || 
        this.currentChannel === 'ALL' ||
        orderChannel === this.currentChannel ||
        (this.currentChannel === 'QR Dine-In' && (orderChannel === 'QR Dine-In' || orderChannel === 'QR_DINE_IN')) ||
        (this.currentChannel === 'Swiggy / Zomato' && (orderChannel === 'Swiggy / Zomato' || orderChannel === 'DELIVERY')) ||
        (this.currentChannel === 'Takeaway' && (orderChannel === 'Takeaway' || orderChannel === 'TAKEAWAY'));

      if (isApproved && isPendingKitchenAction && matchesChannel) {
        seenOrderIds.add(order.id);
        dedupedTickets.push(order);
      }
    }

    return dedupedTickets;
  }

  // Get recently completed tickets for recall drawer
  getRecentlyCompletedTickets() {
    const currentOrders = this.orders || window.store?.orders || [];
    const seenOrderIds = new Set();
    const completed = [];

    for (const order of currentOrders) {
      if (!order || !order.id || seenOrderIds.has(order.id)) continue;
      const st = String(order.status || '').toUpperCase();
      if (st === 'COMPLETED' || st === 'SERVED') {
        seenOrderIds.add(order.id);
        completed.push(order);
      }
    }

    // Sort by updated_at or created_at descending (most recent first)
    completed.sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return completed.slice(0, 10);
  }

  // Fetch child order_items if order.items is missing or empty
  fetchOrderItemsIfMissing(order) {
    if (!order || !order.id) return;
    if (this._fetchingItems.has(order.id)) return;
    const client = this.supabase || window.store?.supabase || window.supabase || supabase;
    if (!client || typeof client.from !== 'function') return;

    this._fetchingItems.add(order.id);
    client
      .from('order_items')
      .select('*')
      .eq('order_id', order.id)
      .then(({ data, error }) => {
        this._fetchingItems.delete(order.id);
        if (!error && data && data.length > 0) {
          order.items = data.map(it => ({
            id: it.menu_item_id || it.id,
            dish_id: it.menu_item_id,
            name: it.item_name || 'Item',
            dish_name: it.item_name || 'Item',
            quantity: it.quantity || 1,
            unit_price: it.unit_price || 0,
            price: it.unit_price || 0,
            notes: it.notes || '',
            customization: it.notes || ''
          }));
          this.render();
        }
      })
      .catch(() => {
        this._fetchingItems.delete(order.id);
      });
  }

  // 2. Universal Ticket Card Component & Preparation Pipeline
  renderTicketCard(order) {
    let items = (order.items && Array.isArray(order.items) && order.items.length > 0) ? order.items : [];
    if (items.length === 0 && window.store?.orders) {
      const match = window.store.orders.find(o => 
        (o.id === order.id || o.table_number === order.table_number || String(o.table_number) === String(order.table_number)) && 
        o.items && o.items.length > 0
      );
      if (match) items = match.items;
    }

    // If still empty on a remote KDS, trigger background fetch of order_items
    if (items.length === 0 && order.id) {
      this.fetchOrderItemsIfMissing(order);
    }

    // Creation timestamp
    const createdAtFormatted = order.created_at ? formatTime(order.created_at) : '';

    // Elapsed urgency styling (<10m green/normal, 10-20m amber/urgent, >20m red/critical)
    const createdMs = order.created_at ? new Date(order.created_at).getTime() : Date.now();
    const elapsedMins = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));

    let urgencyBorder = 'border-gray-200';
    let urgencyBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    let urgencyLabel = `${elapsedMins}m`;

    if (elapsedMins >= 20) {
      urgencyBorder = 'border-rose-500 ring-2 ring-rose-300 bg-rose-50/20';
      urgencyBadge = 'bg-rose-100 text-rose-800 border-rose-300 font-black animate-pulse';
      urgencyLabel = `🔥 CRITICAL ${elapsedMins}m`;
    } else if (elapsedMins >= 10) {
      urgencyBorder = 'border-amber-400 ring-1 ring-amber-300 bg-amber-50/20';
      urgencyBadge = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      urgencyLabel = `⚠️ Urgent ${elapsedMins}m`;
    } else {
      urgencyBorder = 'border-emerald-200';
      urgencyBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      urgencyLabel = `⏱️ ${elapsedMins}m`;
    }

    // Fulfillment Channel Badge
    const rawSource = String(order.channel || order.source || 'QR_DINE_IN').toUpperCase();
    let channelBadge = {
      label: 'QR Dine-In',
      classes: 'bg-indigo-50 text-indigo-700 border-indigo-200'
    };
    if (rawSource.includes('TAKEAWAY')) {
      channelBadge = { label: 'Takeaway', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
    } else if (rawSource.includes('SWIGGY') || rawSource.includes('ZOMATO') || rawSource.includes('DELIVERY')) {
      channelBadge = { label: 'Delivery', classes: 'bg-purple-50 text-purple-700 border-purple-200' };
    } else if (rawSource.includes('POS')) {
      channelBadge = { label: 'POS Terminal', classes: 'bg-slate-100 text-slate-700 border-slate-300' };
    }

    const itemsHtml = items.length > 0 ? items.map(item => `
      <div class="flex justify-between py-1.5 text-sm border-b border-gray-100 last:border-0">
        <div>
          <span class="font-bold text-gray-900">${item.quantity || 1}x ${item.name || item.dish_name || item.item_name || 'Dish'}</span>
          ${(item.notes || item.customization) ? `
            <span class="text-xs text-amber-700 font-medium block mt-0.5 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
              📝 ${item.notes || item.customization}
            </span>
          ` : ''}
        </div>
        ${item.price ? `<span class="text-xs text-gray-400 font-mono self-start">₹${(Number(item.price) * (item.quantity || 1)).toFixed(0)}</span>` : ''}
      </div>
    `).join('') : `
      <div class="py-2 text-center text-xs text-gray-500 font-medium bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <span>Loading ticket items...</span>
      </div>
    `;

    // Dynamic Status Actions
    let actionButton = '';
    const statusUpper = String(order.status || '').toUpperCase();
    const isApprovedOrPaid = order.verification_status === 'APPROVED' || order.payment_status === 'PAID';

    if (!isApprovedOrPaid && (order.verification_status === 'PENDING_APPROVAL' || order.payment_status === 'UTR_SUBMITTED')) {
      actionButton = `
        <div class="space-y-1.5">
          <div class="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-1.5 text-center font-mono">
            UTR: ${order.utr_number || 'Awaiting Approval'}
          </div>
          <button class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs cursor-pointer shadow-sm transition-all active:scale-98" data-approve-utr="${order.id}">
            ✓ Verify & Send to Kitchen
          </button>
        </div>
      `;
    } else if (statusUpper === 'PREPARING' || statusUpper === 'IN_KITCHEN' || statusUpper === 'COOKING') {
      actionButton = `<button class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'READY')">✅ Mark Ready to Serve</button>`;
    } else if (statusUpper === 'READY') {
      actionButton = `<button class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-md transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'COMPLETED')">🍽️ Handover / Complete</button>`;
    } else {
      // Default for any active confirmed/paid/new ticket
      actionButton = `<button class="w-full py-2.5 bg-[#FF7622] hover:bg-[#F15B00] text-white font-bold rounded-xl text-xs cursor-pointer shadow-md transition-all active:scale-98" onclick="window.kitchenView.updateOrderStatus('${order.id}', 'PREPARING')">🔥 Start Cooking</button>`;
    }

    return `
      <div class="bg-white rounded-2xl shadow-md border ${urgencyBorder} p-4 flex flex-col justify-between transition-all" id="ticket-${order.id}">
        <div>
          <!-- Ticket Header: Table + Badges -->
          <div class="flex justify-between items-center pb-2.5 border-b border-gray-100">
            <div>
              <span class="text-base font-black text-gray-900">Table ${order.table_number || order.table_id || '?'}</span>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-md border ${channelBadge.classes}">
                  ${channelBadge.label}
                </span>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-md border ${urgencyBadge}">
                  ${urgencyLabel}
                </span>
              </div>
            </div>
            
            <div class="text-right">
              <span class="px-2 py-0.5 text-[10px] font-black rounded-full ${order.payment_method === 'PAY_LATER' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                ${order.payment_method === 'PAY_LATER' ? 'TAB' : 'PAID'}
              </span>
              ${createdAtFormatted ? `<div class="text-[10px] text-gray-400 font-mono mt-1 font-semibold">${createdAtFormatted}</div>` : ''}
            </div>
          </div>

          <!-- Ticket Sub-header: Order ID & Status -->
          <div class="flex justify-between items-center text-[11px] text-gray-400 font-mono mt-2 mb-2">
            <span>Order #${String(order.id).slice(-6)}</span>
            <span class="font-bold text-gray-600 uppercase text-[10px]">${order.status || 'New'}</span>
          </div>

          <!-- Items List with Quantities & Cooking Customizations -->
          <div class="py-1 space-y-1">
            ${itemsHtml}
          </div>
        </div>

        <!-- Action Controls -->
        <div class="pt-3 border-t border-gray-100 mt-2">
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

    const isTestRuntime = Boolean(globalThis.IS_TEST_ENV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'));
    const client = this.supabase || window.store?.supabase || window.supabase || supabase;
    if (client && typeof client.from === 'function' && !isTestRuntime) {
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
      target.updated_at = new Date().toISOString();
    }
    this.render();
  }

  // Recall accidentally completed order back to the preparation board
  async recallOrder(orderId) {
    await this.updateOrderStatus(orderId, 'Preparing');
    this.render();
  }

  initRealtime() {
    const isTestRuntime = Boolean(globalThis.IS_TEST_ENV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'));
    if (isTestRuntime || typeof window === 'undefined') return;

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
            // Play crystal chime exclusively for new incoming orders
            audioAlertManager.playNewOrderAlert(payload.new.id);
            // If items is empty in incoming payload, fetch order_items
            if (!payload.new.items || payload.new.items.length === 0) {
              this.fetchOrderItemsIfMissing(payload.new);
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          const index = this.orders.findIndex(o => o.id === payload.new.id);
          if (index !== -1) {
            // Preserve merged items if payload omits them
            const existing = this.orders[index];
            const mergedItems = (payload.new.items && Array.isArray(payload.new.items) && payload.new.items.length > 0)
              ? payload.new.items
              : existing.items;
            this.orders[index] = { ...existing, ...payload.new, items: mergedItems };
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
    const recentlyCompleted = this.getRecentlyCompletedTickets();

    const channels = [
      { id: 'All Channels', label: 'All Channels' },
      { id: 'QR Dine-In', label: 'QR Dine-In' },
      { id: 'Swiggy / Zomato', label: 'Swiggy / Zomato' },
      { id: 'Takeaway', label: 'Takeaway' }
    ];

    this.container.innerHTML = `
      <div class="kds-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none relative">
        
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

          <!-- Recall Drawer & Sound Controls -->
          <div class="flex items-center space-x-3">
            <button id="btn-toggle-recall" class="px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              this.isRecallDrawerOpen 
                ? 'bg-[#181C2E] text-white border-[#181C2E]' 
                : 'bg-[#F0F5FA] text-[#646982] border-slate-100 hover:text-[#181C2E]'
            }">
              <span>↺ Recall (${recentlyCompleted.length})</span>
            </button>

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

        <!-- Recently Completed Recall Drawer Slide-Over -->
        ${this.isRecallDrawerOpen ? `
          <div id="recall-drawer-backdrop" class="fixed inset-0 bg-black/40 z-40 flex justify-end transition-opacity">
            <div class="w-full max-w-md bg-white h-full shadow-2xl z-50 flex flex-col p-6 overflow-y-auto">
              <div class="flex items-center justify-between pb-4 border-b border-gray-100">
                <div class="flex items-center gap-2">
                  <span class="text-lg">↺</span>
                  <h2 class="text-base font-black text-gray-900">Recently Completed Tickets</h2>
                </div>
                <button id="btn-close-recall" class="p-2 text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer">
                  ✕
                </button>
              </div>

              <div class="py-4 space-y-4 flex-1">
                ${recentlyCompleted.length === 0 ? `
                  <div class="text-center py-12 text-gray-400 text-xs">
                    No recently completed tickets to recall.
                  </div>
                ` : recentlyCompleted.map(cOrder => `
                  <div class="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col justify-between space-y-2">
                    <div class="flex justify-between items-start">
                      <div>
                        <span class="font-black text-sm text-gray-900">Table ${cOrder.table_number || '?'}</span>
                        <div class="text-[11px] text-gray-400 font-mono">Order #${String(cOrder.id).slice(-6)}</div>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                        ${cOrder.status}
                      </span>
                    </div>

                    <div class="text-xs text-gray-600">
                      ${(cOrder.items || []).map(it => `${it.quantity || 1}x ${it.name || it.dish_name || 'Dish'}`).join(', ') || 'Order items'}
                    </div>

                    <div class="pt-2">
                      <button 
                        data-recall-order-id="${cOrder.id}" 
                        class="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-all active:scale-98 shadow-sm cursor-pointer"
                      >
                        ↺ Recall to Kitchen Board
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

      </div>
    `;

    // Render autoplay unlock banner if required
    audioAlertManager.renderAutoplayBanner(this.container);

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

    const recallToggleBtn = this.container.querySelector('#btn-toggle-recall');
    if (recallToggleBtn) {
      recallToggleBtn.addEventListener('click', () => {
        this.isRecallDrawerOpen = !this.isRecallDrawerOpen;
        this.render();
      });
    }

    const closeRecallBtn = this.container.querySelector('#btn-close-recall');
    if (closeRecallBtn) {
      closeRecallBtn.addEventListener('click', () => {
        this.isRecallDrawerOpen = false;
        this.render();
      });
    }

    const recallBackdrop = this.container.querySelector('#recall-drawer-backdrop');
    if (recallBackdrop) {
      recallBackdrop.addEventListener('click', (e) => {
        if (e.target === recallBackdrop) {
          this.isRecallDrawerOpen = false;
          this.render();
        }
      });
    }

    this.container.querySelectorAll('[data-recall-order-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const orderId = e.currentTarget.dataset.recallOrderId;
        await this.recallOrder(orderId);
      });
    });

    const soundBtn = this.container.querySelector('#btn-kds-sound');
    if (soundBtn && window.store) {
      soundBtn.addEventListener('click', () => {
        window.store.soundEnabled = !window.store.soundEnabled;
        audioAlertManager.setSoundEnabled(window.store.soundEnabled);
        if (window.store.soundEnabled) {
          audioAlertManager.playNewOrderAlert('test-sound', { force: true });
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
