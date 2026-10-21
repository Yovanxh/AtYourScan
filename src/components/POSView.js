/**
 * Manager & Waiter POS Console
 * Interactive Table Floor Map, Live Revenue Counters, Omni-Channel Order Feed, and Service Calls.
 */

export function renderPOSView(container, store) {
  let selectedTable = null;
  let activeTabFilter = 'ALL';
  let showNewOrderModal = false;

  function render() {
    const venue = store.venue;
    const tables = store.tables;
    const orders = store.orders;
    const serviceRequests = store.serviceRequests;

    // Financial calculations
    const todayOrders = orders.filter(o => o.status !== 'Cancelled');
    const totalRevenue = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const activeTablesCount = tables.filter(t => t.status === 'Active' || t.status === 'Served').length;
    const activeOrdersCount = orders.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled').length;

    container.innerHTML = `
      <div class="pos-app min-h-screen bg-[#09090c] text-zinc-100 flex flex-col font-sans select-none">
        
        <!-- Header Bar -->
        <header class="bg-[#111116] border-b border-zinc-800/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono font-bold text-amber-400 text-sm">
              POS
            </div>
            <div>
              <h1 class="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
                ${venue.name} • Floor Manager
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              </h1>
              <p class="text-xs text-zinc-400 font-mono">UPI VPA: ${venue.upi_id}</p>
            </div>
          </div>

          <!-- Service Call Badges -->
          ${serviceRequests.length > 0 ? `
            <div class="flex items-center space-x-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
              <span class="text-xs animate-bounce">🛎️</span>
              <span class="text-xs font-semibold text-amber-300 font-mono">${serviceRequests.length} Table Alert(s)</span>
              ${serviceRequests.slice(0, 2).map(r => `
                <button data-dismiss-req="${r.id}" class="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                  <span>T-${r.table_number}: ${r.serviceType}</span>
                  <span>✕</span>
                </button>
              `).join('')}
            </div>
          ` : ''}

          <!-- Quick Actions -->
          <div class="flex items-center space-x-2">
            <button id="btn-quick-walkin" class="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm">
              <span>+ Quick Walk-In Order</span>
            </button>
          </div>
        </header>

        <!-- Live KPI Metric Cards -->
        <div class="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d0d10] border-b border-zinc-800/60">
          <div class="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Gross Sales Today</span>
            <div class="text-xl font-bold font-mono text-zinc-100 mt-1">₹${totalRevenue.toLocaleString('en-IN')}</div>
            <span class="text-[10px] text-emerald-400 font-mono">↑ 18% vs yesterday</span>
          </div>

          <div class="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Floor Occupancy</span>
            <div class="text-xl font-bold font-mono text-amber-400 mt-1">${activeTablesCount} / ${tables.length}</div>
            <span class="text-[10px] text-zinc-400 font-mono">${Math.round((activeTablesCount / tables.length) * 100)}% occupied</span>
          </div>

          <div class="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Kitchen Backlog</span>
            <div class="text-xl font-bold font-mono text-zinc-100 mt-1">${activeOrdersCount} Tickets</div>
            <span class="text-[10px] text-amber-400 font-mono">Avg prep: ~11 mins</span>
          </div>

          <div class="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Total Covers</span>
            <div class="text-xl font-bold font-mono text-zinc-100 mt-1">${todayOrders.length * 3} Diners</div>
            <span class="text-[10px] text-emerald-400 font-mono">Dine-in + Takeaway</span>
          </div>
        </div>

        <!-- Main Body: Two Columns (Floorplan + Order Stream) -->
        <main class="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- Left: Table Floorplan (7 cols) -->
          <div class="lg:col-span-7 space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-zinc-200">Interactive Floorplan & Table Tabs</h2>
              <div class="flex items-center gap-3 text-xs font-mono">
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"></span> Vacant</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Active/Ordering</span>
                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Served/Ready</span>
              </div>
            </div>

            <!-- Table Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              ${tables.map(table => {
                const tableOrders = orders.filter(
                  o => o.table_number === table.table_number && o.status !== 'Completed' && o.status !== 'Cancelled'
                );
                const hasOrders = tableOrders.length > 0;
                const tabTotal = tableOrders.reduce((sum, o) => sum + o.total_amount, 0);
                const isReady = tableOrders.some(o => o.status === 'Ready');

                let statusBadge = 'bg-zinc-900 text-zinc-500 border-zinc-800';
                if (isReady) {
                  statusBadge = 'bg-emerald-950/60 text-emerald-300 border-emerald-600';
                } else if (hasOrders) {
                  statusBadge = 'bg-amber-950/60 text-amber-300 border-amber-600/80';
                }

                return `
                  <div 
                    data-table-card="${table.table_number}" 
                    class="bg-[#131317] border border-zinc-800/80 hover:border-zinc-700 rounded-2xl p-3.5 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between h-32 ${
                      hasOrders ? 'border-amber-500/40 shadow-sm' : ''
                    }"
                  >
                    <div class="flex items-center justify-between">
                      <span class="font-mono font-bold text-sm text-zinc-100">Table ${table.table_number}</span>
                      <span class="text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge}">
                        ${isReady ? 'Food Ready' : hasOrders ? 'Ordering' : 'Vacant'}
                      </span>
                    </div>

                    <div class="space-y-0.5">
                      <p class="text-[11px] text-zinc-500 truncate">${table.section}</p>
                      <p class="text-[10px] text-zinc-600 font-mono">${table.capacity} Seats</p>
                    </div>

                    <div class="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-xs font-mono">
                      <span class="text-zinc-500">${hasOrders ? `${tableOrders.length} ticket(s)` : 'Available'}</span>
                      <span class="font-bold text-amber-400">${tabTotal > 0 ? `₹${tabTotal}` : '—'}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Right: Live Omni-channel Orders Feed (5 cols) -->
          <div class="lg:col-span-5 space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-zinc-200">Omni-Channel Stream</h2>
              <span class="text-xs font-mono text-zinc-500">${orders.length} total orders</span>
            </div>

            <!-- Orders Table List -->
            <div class="bg-[#131317] border border-zinc-800/80 rounded-2xl divide-y divide-zinc-800/60 overflow-hidden max-h-[580px] overflow-y-auto">
              ${orders.map(order => `
                <div class="p-3.5 hover:bg-zinc-800/30 transition-colors space-y-2">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <span class="font-mono font-bold text-xs text-zinc-100">#${order.id}</span>
                      <span class="text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        order.source === 'SWIGGY' ? 'bg-orange-950 text-orange-400' :
                        order.source === 'ZOMATO' ? 'bg-red-950 text-red-400' :
                        order.source === 'TAKEAWAY' ? 'bg-purple-950 text-purple-300' :
                        'bg-blue-950 text-blue-300'
                      }">
                        ${order.source}
                      </span>
                    </div>

                    <span class="text-xs font-mono font-bold text-amber-400">₹${order.total_amount}</span>
                  </div>

                  <div class="flex items-center justify-between text-xs text-zinc-400">
                    <span>${order.source === 'QR_DINE_IN' ? `Table ${order.table_number}` : 'Walk-in'} • ${order.items.length} items</span>
                    <span class="font-mono text-[11px] ${
                      order.status === 'Ready' ? 'text-emerald-400 font-semibold' :
                      order.status === 'Preparing' ? 'text-amber-400' : 'text-zinc-400'
                    }">
                      ● ${order.status}
                    </span>
                  </div>

                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[10px] text-zinc-500 font-mono">
                      ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div class="flex items-center space-x-1.5">
                      <button data-print-kot="${order.id}" class="px-2 py-0.5 text-[11px] font-mono rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                        Print KOT
                      </button>
                      ${order.status !== 'Completed' ? `
                        <button data-settle-order="${order.id}" class="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 font-semibold">
                          Settle Bill
                        </button>
                      ` : `
                        <span class="text-[10px] text-zinc-500 font-mono">Settled ✓</span>
                      `}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </main>

        <!-- Table Inspection Modal -->
        ${selectedTable ? renderTableModal(selectedTable, store) : ''}

        <!-- Quick Walk-in Modal -->
        ${showNewOrderModal ? renderWalkinModal(store) : ''}

      </div>
    `;

    bindEvents();
  }

  // Render Table Modal details
  function renderTableModal(tableNum, store) {
    const tableOrders = store.orders.filter(
      o => o.table_number === tableNum && o.status !== 'Completed' && o.status !== 'Cancelled'
    );
    const totalTab = tableOrders.reduce((sum, o) => sum + o.total_amount, 0);

    return `
      <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-[#141417] border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
          
          <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h3 class="text-base font-semibold text-zinc-100">Table ${tableNum} Tab Inspector</h3>
              <p class="text-xs text-zinc-400 font-mono">${tableOrders.length} active tickets</p>
            </div>
            <button id="close-table-modal" class="text-zinc-500 hover:text-zinc-200 text-sm p-1">✕</button>
          </div>

          <div class="space-y-3 max-h-72 overflow-y-auto">
            ${tableOrders.length === 0 ? `
              <p class="text-xs text-zinc-500 py-6 text-center">No active orders on Table ${tableNum}.</p>
            ` : tableOrders.map(o => `
              <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-mono font-bold text-amber-400">#${o.id} (${o.status})</span>
                  <span class="font-mono text-zinc-300">₹${o.total_amount}</span>
                </div>
                <div class="text-[11px] text-zinc-400 space-y-1 font-mono">
                  ${o.items.map(it => `<div>• ${it.quantity}x ${it.name}</div>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>

          <div class="pt-2 border-t border-zinc-800 flex items-center justify-between font-mono">
            <span class="text-xs text-zinc-400">Total Running Bill:</span>
            <span class="text-base font-bold text-amber-400">₹${totalTab}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2">
            <button id="btn-settle-table-tab" class="py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl font-mono active:scale-98 transition-all">
              ✓ Settle & Clear Table
            </button>
            <button id="btn-print-table-bill" class="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-xl font-mono">
              Print Tax Invoice
            </button>
          </div>

        </div>
      </div>
    `;
  }

  // Render Walk-In Order Modal
  function renderWalkinModal(store) {
    return `
      <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-[#141417] border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
          <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 class="text-sm font-semibold text-zinc-100">Create Walk-In / Takeaway Order</h3>
            <button id="close-walkin-modal" class="text-zinc-500 hover:text-zinc-200 text-sm">✕</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="text-xs text-zinc-400">Customer Name / Note</label>
              <input type="text" id="walkin-name" placeholder="Walk-in Guest" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 mt-1" />
            </div>

            <div>
              <label class="text-xs text-zinc-400">Select Item</label>
              <select id="walkin-item-select" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 mt-1 font-mono">
                ${store.menuItems.filter(m => m.is_available).map(m => `
                  <option value="${m.id}">${m.name} — ₹${m.price}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <button id="btn-submit-walkin" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl active:scale-98 transition-all">
            Confirm & Send to Kitchen
          </button>
        </div>
      </div>
    `;
  }

  // Bind Events
  function bindEvents() {
    // Table click
    container.querySelectorAll('[data-table-card]').forEach(card => {
      card.addEventListener('click', (e) => {
        selectedTable = parseInt(e.currentTarget.dataset.tableCard, 10);
        render();
      });
    });

    const closeTable = container.querySelector('#close-table-modal');
    if (closeTable) {
      closeTable.addEventListener('click', () => {
        selectedTable = null;
        render();
      });
    }

    const settleTableBtn = container.querySelector('#btn-settle-table-tab');
    if (settleTableBtn) {
      settleTableBtn.addEventListener('click', () => {
        const tableOrders = store.orders.filter(o => o.table_number === selectedTable);
        tableOrders.forEach(o => store.updateOrderStatus(o.id, 'Completed'));
        selectedTable = null;
        render();
      });
    }

    const printBillBtn = container.querySelector('#btn-print-table-bill');
    if (printBillBtn) {
      printBillBtn.addEventListener('click', () => {
        window.print();
      });
    }

    // Dismiss Service Requests
    container.querySelectorAll('[data-dismiss-req]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.dismissReq;
        store.dismissServiceRequest(id);
      });
    });

    // Settle single order
    container.querySelectorAll('[data-settle-order]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.settleOrder;
        store.updateOrderStatus(id, 'Completed');
      });
    });

    // Print KOT
    container.querySelectorAll('[data-print-kot]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.printKot;
        const ord = store.getOrderById(id);
        if (ord) {
          alert(`🖨️ Printing Kitchen Order Ticket (KOT):\nOrder #${ord.id}\nTable: ${ord.table_number}\nItems:\n${ord.items.map(i => `• ${i.quantity}x ${i.name}`).join('\n')}`);
        }
      });
    });

    // Walk-in modal
    const walkinBtn = container.querySelector('#btn-quick-walkin');
    if (walkinBtn) {
      walkinBtn.addEventListener('click', () => {
        showNewOrderModal = true;
        render();
      });
    }

    const closeWalkin = container.querySelector('#close-walkin-modal');
    if (closeWalkin) {
      closeWalkin.addEventListener('click', () => {
        showNewOrderModal = false;
        render();
      });
    }

    const submitWalkin = container.querySelector('#btn-submit-walkin');
    if (submitWalkin) {
      submitWalkin.addEventListener('click', () => {
        const sel = container.querySelector('#walkin-item-select');
        const nameInput = container.querySelector('#walkin-name');
        const item = store.menuItems.find(m => m.id === sel?.value);
        if (item) {
          store.createOrder({
            table_number: 99,
            source: 'TAKEAWAY',
            customer_name: nameInput?.value || 'Walk-in Guest',
            items: [{ id: item.id, name: item.name, quantity: 1, price: item.price }],
            notes: 'Counter Walk-in Order'
          });
          showNewOrderModal = false;
          render();
        }
      });
    }
  }

  const unsubscribe = store.subscribe(() => {
    render();
  });

  render();

  return () => unsubscribe();
}
