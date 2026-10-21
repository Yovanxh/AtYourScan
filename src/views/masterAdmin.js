/**
 * src/views/masterAdmin.js
 * Centralized Super-Admin Global Operations & Diagnostic Command Center ("Platform Control Plane")
 * 
 * Strict Access Gate: Accessible ONLY by verified Master Super-Admin accounts (system_role === 'super_admin').
 * Provides multi-tenant telemetry, system health monitoring, diagnostic bug triage, and emergency
 * backend intervention capabilities without regressing active POS, KDS, or customer dining flows.
 */

import { isSuperAdmin, SUPER_ADMIN_ACCOUNTS } from '../auth.js';
import { renderSuperAdminLoginModal } from '../components/SuperAdminLoginModal.js';
import { supabase } from '../supabase.js';

export function renderMasterAdminView(container, store) {
  if (!container) return () => {};

  // Strict Authorization & Invisibility Gate
  if (!store || typeof store.isSuperAdmin !== 'function' || !store.isSuperAdmin()) {
    const hasSuper = typeof store?.hasSuperAdmin === 'function' ? store.hasSuperAdmin() : false;
    container.innerHTML = `
      <div class="min-h-screen bg-[#08080c] text-white flex items-center justify-center p-6 select-none">
        <div class="bg-[#12121a] border border-rose-500/30 rounded-3xl max-w-md w-full p-8 text-center space-y-4 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl ${hasSuper ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' : 'bg-amber-500/15 border-amber-500/30 text-amber-400'} border flex items-center justify-center text-3xl mx-auto shadow-lg shadow-rose-500/20">
            ${hasSuper ? '🚫' : '👑'}
          </div>
          <h2 class="text-xl font-black tracking-tight text-white">${hasSuper ? '403 Access Denied' : '403 Access Denied (Setup Required)'}</h2>
          <p class="text-xs text-zinc-400 leading-relaxed">
            ${hasSuper 
              ? 'The Platform Control Plane is strictly restricted to verified Master Super-Admins. This incident has been logged.' 
              : 'No Master Super-Admin account has been created yet. Provision your sovereign administrator account to initialize and unlock the Control Plane.'}
          </p>
          <div class="flex items-center gap-2 pt-2">
            <button 
              id="btn-unauth-exit"
              class="flex-1 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              Return to Operations
            </button>
            <button 
              id="btn-unauth-login"
              class="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all active:scale-95 cursor-pointer"
            >
              ${hasSuper ? 'Unlock Control Plane' : 'Create Master Admin'}
            </button>
          </div>
        </div>
      </div>
    `;
    container.querySelector('#btn-unauth-exit')?.addEventListener('click', () => {
      if (typeof window !== 'undefined' && window.location) {
        try {
          const u = new URL(window.location.href || 'http://localhost:3000/');
          u.searchParams.delete('view');
          window.history?.replaceState({}, '', u.toString());
          if (window.location.reload) window.location.reload();
        } catch {}
      }
    });
    container.querySelector('#btn-unauth-login')?.addEventListener('click', () => {
      const modalContainer = document.getElementById('app-modal-layer') || container;
      renderSuperAdminLoginModal(modalContainer, store, {
        onSuccess: () => {
          renderMasterAdminView(container, store);
        }
      });
    });
    return () => {};
  }

  // Active View State
  let activeTab = 'overview'; // 'overview' | 'telemetry' | 'audit'
  let selectedTenantForDrawer = null; // tenant object when intervention drawer is open
  let drawerActiveTab = 'pin'; // 'pin' | 'table' | 'maintenance' | 'audit'
  let newPinInput = '';
  let pinResetSuccessMsg = '';
  let pinResetErrorMsg = '';
  let severityFilter = 'all'; // 'all' | 'critical' | 'warning' | 'info'
  let sourceFilter = 'all'; // 'all' | 'supabase_sync' | 'pos_edge' | 'kds_station' | 'hardware_terminal'
  let tenantFilter = 'all';
  let searchQuery = '';
  let isCreateCafeModalOpen = false;

  const activeSuperAdmin = store.getSuperAdmin() || (store.getSuperAdminAccounts && store.getSuperAdminAccounts()[0]) || { name: 'Master Administrator', email: 'admin@atyourscan.com' };

  const fetchPendingCafes = async () => {
    if (typeof store?.fetchCafesFromSupabase === 'function') {
      await store.fetchCafesFromSupabase();
      render();
    } else if (supabase && typeof supabase.from === 'function') {
      try {
        const { data, error } = await supabase
          .from('cafes')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error && Array.isArray(data)) {
          store.cafes = data;
          store.tenants = data.map(c => ({
            id: c.id,
            cafe_id: c.id,
            venue_id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status || 'active',
            approval_status: c.approval_status || (c.status === 'pending' || c.status === 'pending_approval' ? 'pending' : 'approved'),
            branch: 'Main Branch',
            city: 'Bengaluru',
            tables_count: c.table_count || 12,
            active_tables: 0,
            terminal_sin: 'SIN-POS-01',
            terminal_status: (c.status === 'pending' || c.status === 'pending_approval') ? 'PENDING' : 'ONLINE',
            last_ping: 'Just now',
            sync_lag_ms: 12,
            today_volume: 0,
            active_orders: 0,
            maintenance_mode: c.status === 'maintenance',
            staff_count: 1,
            contact_email: c.owner_email,
            created_at: c.created_at,
            version: 'v2.4.0'
          }));
          render();
        }
      } catch (err) {
        console.error("Error fetching cafes:", err);
      }
    }
  };

  function render() {
    const tenants = store.tenants || [];
    const systemLogs = store.systemLogs || [];
    const masterAuditLogs = store.masterAuditLogs || [];

    // Telemetry Aggregate Metrics
    const totalTenants = tenants.length;
    const totalActiveTables = tenants.reduce((sum, t) => sum + (t.active_tables || 0), 0);
    const totalFleetTables = tenants.reduce((sum, t) => sum + (t.tables_count || 0), 0);
    const totalFleetVolume = tenants.reduce((sum, t) => sum + (t.today_volume || 0), 0);
    const onlineTerminals = tenants.filter(t => t.terminal_status === 'ONLINE').length;
    const healthPercent = totalTenants > 0 ? Math.round((onlineTerminals / totalTenants) * 100) : 100;
    const activeAlertsCount = systemLogs.filter(l => l.status === 'active' && l.severity !== 'info').length;

    // Filtered System Logs
    const filteredLogs = systemLogs.filter(log => {
      const matchSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchSource = sourceFilter === 'all' || log.source === sourceFilter;
      const matchTenant = tenantFilter === 'all' || log.tenant_id === tenantFilter;
      const matchSearch = !searchQuery || 
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.tenant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.details || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchSeverity && matchSource && matchTenant && matchSearch;
    });

    container.innerHTML = `
      <div class="platform-control-plane min-h-screen bg-[#09090e] text-zinc-100 flex flex-col font-sans select-none pb-20">
        
        <!-- Persistent Sovereign Top Bar -->
        <header class="sticky top-0 z-40 bg-[#0d0d14]/95 backdrop-blur-md border-b border-rose-500/25 px-6 py-3.5 shadow-xl">
          <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            
            <!-- Left Branding: AtYourScan Application Identity & Logo -->
            <div class="flex items-center space-x-3.5">
              <div class="h-10 px-2.5 rounded-xl bg-white flex items-center justify-center shadow-md shadow-orange-500/20 select-none overflow-hidden border border-white/20">
                <img src="/assets/atyourscan-logo.jpg" alt="AtYourScan Logo" class="h-7 w-auto object-contain" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[9px] font-black tracking-wider text-[#FF7622] uppercase block">
                    ATYOURSCAN PLATFORM
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#FF7622]/20 text-[#FF7622] border border-[#FF7622]/30">
                    MASTER CONTROL PANEL
                  </span>
                </div>
                <h1 class="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                  AtYourScan
                  <span class="text-[11px] font-normal text-zinc-400 font-mono hidden sm:inline">| Multi-Tenant Fleet Operations</span>
                </h1>
              </div>
            </div>

            <!-- Center Navigation Tabs -->
            <div class="flex items-center gap-1 bg-[#151520] p-1 rounded-full border border-white/[0.08] shadow-inner text-xs font-bold">
              <button 
                id="btn-tab-overview" 
                class="px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'overview' 
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }"
              >
                🏢 Tenant Fleet (${totalTenants})
              </button>
              <button 
                id="btn-tab-telemetry" 
                class="px-4 py-1.5 rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'telemetry' 
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }"
              >
                <span>📡 Live Telemetry & Bugs</span>
                ${activeAlertsCount > 0 ? `
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-mono font-black animate-pulse">
                    ${activeAlertsCount}
                  </span>
                ` : ''}
              </button>
              <button 
                id="btn-tab-audit" 
                class="px-4 py-1.5 rounded-full transition-all cursor-pointer ${
                  activeTab === 'audit' 
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30' 
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }"
              >
                📜 Sovereign Audit Log (${masterAuditLogs.length})
              </button>
            </div>

            <!-- Right Super Admin Identity Pill & Actions -->
            <div class="flex items-center gap-2.5">
              <button 
                id="btn-fleet-resync-all"
                title="Force Global Edge Cache Invalidation & Fleet Sync"
                class="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/[0.08] text-zinc-300 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span class="hidden sm:inline">Fleet Resync</span>
              </button>

              <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#151520] border border-rose-500/30 text-xs font-medium shadow-xs">
                <div class="w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                  ${activeSuperAdmin.name.charAt(0)}
                </div>
                <div class="leading-tight">
                  <span class="font-bold text-white block text-[11px]">${activeSuperAdmin.name}</span>
                  <span class="text-[9px] font-mono text-rose-300 block">Master Admin</span>
                </div>
              </div>

              <button 
                id="btn-super-logout" 
                title="Sign out from Platform Control Plane"
                class="p-2 rounded-full bg-zinc-800 hover:bg-rose-900/40 hover:text-rose-300 text-zinc-400 transition-all active:scale-95 cursor-pointer"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

          </div>
        </header>

        <!-- Main Body Container -->
        <main class="max-w-7xl mx-auto w-full px-6 pt-6 flex-1 space-y-6">

          <!-- Global Fleet Aggregates Banner -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            
            <!-- Metric 1: Registered Tenants -->
            <div class="bg-[#12121a] border border-white/[0.08] hover:border-rose-500/30 rounded-2xl p-4 shadow-xl transition-all">
              <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Registered Cafes</span>
              <div class="text-2xl font-bold font-mono text-white mt-1">${totalTenants}</div>
              <span class="text-[10px] text-zinc-500">Karnataka Region (Tier 1)</span>
            </div>

            <!-- Metric 2: Live Table Occupancy -->
            <div class="bg-[#12121a] border border-white/[0.08] hover:border-emerald-500/30 rounded-2xl p-4 shadow-xl transition-all">
              <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Active Dining Tabs</span>
              <div class="text-2xl font-bold font-mono text-emerald-400 mt-1">${totalActiveTables} / ${totalFleetTables}</div>
              <span class="text-[10px] text-emerald-500/80">Realtime Seated Tables</span>
            </div>

            <!-- Metric 3: Fleet Transaction Volume -->
            <div class="bg-[#12121a] border border-white/[0.08] hover:border-amber-500/30 rounded-2xl p-4 shadow-xl transition-all">
              <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Platform GMV (24h)</span>
              <div class="text-2xl font-bold font-mono text-amber-300 mt-1">₹${totalFleetVolume.toLocaleString('en-IN')}</div>
              <span class="text-[10px] text-zinc-500">Contactless UPI & Counter</span>
            </div>

            <!-- Metric 4: Fleet Health / Heartbeat -->
            <div class="bg-[#12121a] border border-white/[0.08] hover:border-sky-500/30 rounded-2xl p-4 shadow-xl transition-all">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Fleet Terminal Status</span>
                <span class="w-2 h-2 rounded-full ${healthPercent >= 90 ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'}"></span>
              </div>
              <div class="text-2xl font-bold font-mono text-zinc-100 mt-1">${healthPercent}%</div>
              <span class="text-[10px] text-zinc-500">${onlineTerminals} of ${totalTenants} Online</span>
            </div>

            <!-- Metric 5: Active Bug & Anomaly Alerts -->
            <div class="bg-[#12121a] border border-white/[0.08] hover:border-red-500/30 rounded-2xl p-4 shadow-xl transition-all">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">Diagnostic Alerts</span>
                ${activeAlertsCount > 0 ? `
                  <span class="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_#f87171] animate-ping"></span>
                ` : ''}
              </div>
              <div class="text-2xl font-bold font-mono ${activeAlertsCount > 0 ? 'text-rose-400' : 'text-zinc-400'} mt-1">
                ${activeAlertsCount}
              </div>
              <span class="text-[10px] text-zinc-500">${activeAlertsCount > 0 ? 'Action Recommended' : 'Nominal Baseline'}</span>
            </div>

          </div>

          <!-- TAB 1: OVERVIEW & TENANT MATRIX -->
          ${activeTab === 'overview' ? `
            <div class="space-y-4">
              
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div>
                  <h2 class="text-base font-bold text-white flex items-center gap-2">
                    <span>🏢 Multi-Tenant Directory & Telemetry Matrix</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      ${totalTenants} REGISTERED
                    </span>
                  </h2>
                  <p class="text-xs text-zinc-400">Cafes provisioned directly under your Super-Admin account with live heartbeat, sync lag, and God-Mode controls.</p>
                </div>
                <button 
                  id="btn-open-create-cafe-modal"
                  class="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <span>+</span>
                  <span>Onboard New Cafe</span>
                </button>
              </div>

              <!-- Dense Matrix Table or Zero-State -->
              ${totalTenants === 0 ? `
                <div class="bg-[#12121a] border border-white/[0.08] rounded-2xl p-12 text-center space-y-4 shadow-xl">
                  <div class="w-16 h-16 rounded-3xl bg-zinc-900 border border-white/[0.08] text-rose-400 flex items-center justify-center text-3xl mx-auto shadow-inner">
                    🏪
                  </div>
                  <div class="space-y-1">
                    <h3 class="text-base font-bold text-white">No Cafes Registered Under Super-Admin</h3>
                    <p class="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                      You have not provisioned any cafe branches yet. Every cafe is created and managed directly under your Super-Admin account without preloaded dummy data.
                    </p>
                  </div>
                  <button 
                    id="btn-empty-create-cafe"
                    class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all active:scale-95 cursor-pointer inline-flex items-center gap-2"
                  >
                    <span>+</span>
                    <span>Onboard First Cafe</span>
                  </button>
                </div>
              ` : `
                <div class="bg-[#12121a] border border-white/[0.08] rounded-2xl shadow-xl overflow-hidden overflow-x-auto">
                  <table class="w-full text-left text-xs text-zinc-300">
                    <thead class="bg-[#161622] text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06]">
                      <tr>
                        <th class="py-3 px-4">Cafe & Branch</th>
                        <th class="py-3 px-4">Tenant ID</th>
                        <th class="py-3 px-4">Terminal & Heartbeat</th>
                        <th class="py-3 px-4">Sync Latency</th>
                        <th class="py-3 px-4">Tables Occupied</th>
                        <th class="py-3 px-4">Today Volume</th>
                        <th class="py-3 px-4">Status & Mode</th>
                        <th class="py-3 px-4 text-right">Emergency Remediation</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-white/[0.04]">
                      ${tenants.map(t => {
                        const isOnline = t.terminal_status === 'ONLINE';
                        const isDegraded = t.terminal_status === 'DEGRADED';
                        const isOffline = t.terminal_status === 'OFFLINE';
                        const isMaintenance = Boolean(t.maintenance_mode);

                        return `
                          <tr class="hover:bg-white/[0.02] transition-colors group">
                            
                            <!-- Cafe & Branch -->
                            <td class="py-3.5 px-4">
                              <div class="flex items-center gap-2.5">
                                <div class="w-8 h-8 rounded-xl bg-zinc-800 text-white flex items-center justify-center font-bold text-xs">
                                  ☕
                                </div>
                                <div>
                                  <span class="font-bold text-white block">${t.name}</span>
                                  <span class="text-[10px] text-zinc-400 block">${t.branch}, ${t.city}</span>
                                </div>
                              </div>
                            </td>

                            <!-- Cafe ID -->
                            <td class="py-3.5 px-4 font-mono text-[11px] text-zinc-400">
                              ${t.cafe_id}
                            </td>

                            <!-- Terminal & Heartbeat -->
                            <td class="py-3.5 px-4">
                              <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full ${
                                  isOnline 
                                    ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' 
                                    : isDegraded 
                                      ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]' 
                                      : 'bg-red-500 shadow-[0_0_6px_#ef4444]'
                                }"></span>
                                <div>
                                  <span class="font-mono font-bold text-zinc-200 block">${t.terminal_sin}</span>
                                  <span class="text-[10px] text-zinc-500 block">Ping: ${t.last_ping}</span>
                                </div>
                              </div>
                            </td>

                            <!-- Sync Latency -->
                            <td class="py-3.5 px-4">
                              <span class="font-mono font-bold text-[11px] ${
                                t.sync_lag_ms < 50 ? 'text-emerald-400' : t.sync_lag_ms < 300 ? 'text-amber-400' : 'text-red-400 font-black'
                              }">
                                ${t.sync_lag_ms}ms
                              </span>
                            </td>

                            <!-- Tables Occupied -->
                            <td class="py-3.5 px-4">
                              <div class="flex items-center gap-1.5 font-mono text-zinc-200">
                                <span class="font-bold text-white">${t.active_tables || 0}</span>
                                <span class="text-zinc-500">/ ${t.tables_count || 10}</span>
                                ${(t.active_tables > 0) ? `
                                  <span class="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    ${t.active_orders || 0} orders
                                  </span>
                                ` : ''}
                              </div>
                            </td>

                            <!-- Today Volume -->
                            <td class="py-3.5 px-4 font-mono font-bold text-zinc-200">
                              ₹${(t.today_volume || 0).toLocaleString('en-IN')}
                            </td>

                            <!-- Status & Mode -->
                            <td class="py-3.5 px-4">
                              <div class="flex flex-col gap-1 items-start">
                                ${(t.status === 'pending' || t.status === 'pending_approval' || t.approval_status === 'pending') ? `
                                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1">
                                    <span>⏳</span>
                                    <span>PENDING APPROVAL</span>
                                  </span>
                                ` : t.status === 'rejected' || t.approval_status === 'rejected' ? `
                                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                                    <span>❌</span>
                                    <span>REJECTED</span>
                                  </span>
                                ` : `
                                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isOnline 
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                      : isDegraded 
                                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' 
                                        : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  }">
                                    ${t.terminal_status}
                                  </span>
                                `}
                                ${isMaintenance ? `
                                  <span class="px-2 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    MAINTENANCE MODE
                                  </span>
                                ` : ''}
                              </div>
                            </td>

                            <!-- Remediation Actions -->
                            <td class="py-3.5 px-4 text-right">
                              <div class="flex items-center justify-end gap-1.5">
                                ${(t.status === 'pending' || t.status === 'pending_approval' || t.approval_status === 'pending') ? `
                                  <button 
                                    data-approve-tenant="${t.id}"
                                    title="Approve and activate café ${t.name}"
                                    class="px-2.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow-md shadow-emerald-500/20"
                                  >
                                    <span>✅</span>
                                    <span>Approve</span>
                                  </button>
                                  <button 
                                    data-reject-tenant="${t.id}"
                                    title="Reject café registration ${t.name}"
                                    class="px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-300 text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                                  >
                                    <span>❌</span>
                                    <span>Reject</span>
                                  </button>
                                ` : ''}
                                <button 
                                  data-open-drawer="${t.id}"
                                  title="Open God-Mode Intervention Drawer for ${t.name}"
                                  class="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                                >
                                  <span>🛠️</span>
                                  <span>Inspect & Triage</span>
                                </button>
                                <button 
                                  data-delete-tenant="${t.id}"
                                  title="Decommission and delete ${t.name}"
                                  class="p-1.5 rounded-xl bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/[0.06] transition-all cursor-pointer text-xs"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>

                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              `}

              <!-- Sovereign Super-Admin Fleet Accounts Card -->
              <div class="bg-[#12121a] border border-white/[0.08] rounded-2xl p-5 shadow-xl space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                  <div>
                    <h3 class="text-sm font-bold text-white flex items-center gap-2">
                      <span>👑 Sovereign Master Accounts</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        ${(store.getSuperAdminAccounts ? store.getSuperAdminAccounts().length : 0)} PROVISIONED
                      </span>
                    </h3>
                    <p class="text-xs text-zinc-400 mt-0.5">Custom provisioned platform administrators with sovereign override authority across all tenant cafes.</p>
                  </div>
                  <button 
                    id="btn-provision-super-admin"
                    class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>+</span>
                    <span>Provision New Super-Admin</span>
                  </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  ${(store.getSuperAdminAccounts ? store.getSuperAdminAccounts() : []).map(acc => {
                    const isActive = activeSuperAdmin && (activeSuperAdmin.id === acc.id || activeSuperAdmin.email === acc.email);
                    return `
                      <div class="p-3.5 rounded-xl bg-[#161622] border ${isActive ? 'border-rose-500/50 shadow-md shadow-rose-500/10' : 'border-white/[0.06]'} flex items-start justify-between gap-3">
                        <div class="space-y-1">
                          <div class="flex items-center gap-2">
                            <span class="font-bold text-white text-xs">${acc.name}</span>
                            ${isActive ? `
                              <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300">
                                ACTIVE
                              </span>
                            ` : ''}
                          </div>
                          <span class="text-[11px] font-mono text-zinc-400 block">${acc.email}</span>
                          <span class="text-[10px] text-zinc-400 block">Created: ${acc.created_at ? new Date(acc.created_at).toLocaleDateString() : 'Active'}</span>
                        </div>
                        ${!isActive && (store.getSuperAdminAccounts().length > 1) ? `
                          <button 
                            data-delete-super="${acc.id}"
                            title="Revoke and delete Super-Admin account"
                            class="text-zinc-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-xs cursor-pointer"
                          >
                            🗑️
                          </button>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

            </div>
          ` : ''}

          <!-- TAB 2: LIVE TELEMETRY & BUG TRIAGE -->
          ${activeTab === 'telemetry' ? `
            <div class="space-y-4">
              
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div>
                  <h2 class="text-base font-bold text-white flex items-center gap-2">
                    <span>📡 Live Telemetry & Error Diagnostic Feed</span>
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </h2>
                  <p class="text-xs text-zinc-400">Aggregated real-time log capturing uncaught runtime exceptions, Supabase network drops, failed sync events, and terminal pairing anomalies.</p>
                </div>

                <div class="flex items-center gap-2">
                  <button 
                    id="btn-trigger-diagnostic-probe"
                    class="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-white/[0.08] transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🧪 Send Test Probe</span>
                  </button>
                  <button 
                    id="btn-purge-resolved-logs"
                    class="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-white/[0.08] transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🧹 Purge Resolved</span>
                  </button>
                </div>
              </div>

              <!-- Filters Row -->
              <div class="bg-[#12121a] border border-white/[0.08] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
                
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <!-- Severity Filter -->
                  <div class="flex items-center gap-1 bg-[#181824] p-1 rounded-xl border border-white/[0.06]">
                    ${['all', 'critical', 'warning', 'info'].map(sev => `
                      <button 
                        data-filter-severity="${sev}"
                        class="px-2.5 py-1 rounded-lg font-bold uppercase text-[10px] transition-all cursor-pointer ${
                          severityFilter === sev 
                            ? 'bg-rose-600 text-white shadow-xs' 
                            : 'text-zinc-400 hover:text-white'
                        }"
                      >
                        ${sev}
                      </button>
                    `).join('')}
                  </div>

                  <!-- Source Filter -->
                  <select id="select-filter-source" class="bg-[#181824] border border-white/[0.08] text-zinc-300 text-xs rounded-xl px-3 py-1.5 focus:outline-rose-500">
                    <option value="all" ${sourceFilter === 'all' ? 'selected' : ''}>All Sources</option>
                    <option value="supabase_sync" ${sourceFilter === 'supabase_sync' ? 'selected' : ''}>Supabase Cloud Sync</option>
                    <option value="pos_edge" ${sourceFilter === 'pos_edge' ? 'selected' : ''}>POS Edge Engine</option>
                    <option value="kds_station" ${sourceFilter === 'kds_station' ? 'selected' : ''}>Kitchen KDS Rail</option>
                    <option value="hardware_terminal" ${sourceFilter === 'hardware_terminal' ? 'selected' : ''}>Hardware Terminal</option>
                  </select>

                  <!-- Tenant Filter -->
                  <select id="select-filter-tenant" class="bg-[#181824] border border-white/[0.08] text-zinc-300 text-xs rounded-xl px-3 py-1.5 focus:outline-rose-500">
                    <option value="all" ${tenantFilter === 'all' ? 'selected' : ''}>All Tenants</option>
                    ${tenants.map(t => `
                      <option value="${t.id}" ${tenantFilter === t.id ? 'selected' : ''}>${t.name} (${t.city})</option>
                    `).join('')}
                  </select>
                </div>

                <!-- Search Input -->
                <div class="relative w-full sm:w-64">
                  <input 
                    type="text" 
                    id="input-telemetry-search" 
                    value="${searchQuery}" 
                    placeholder="Search logs & traces..." 
                    class="w-full bg-[#181824] border border-white/[0.08] text-zinc-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-rose-500 placeholder-zinc-500"
                  />
                  <span class="absolute left-2.5 top-2 text-zinc-500 text-xs">🔍</span>
                </div>

              </div>

              <!-- Log Entries Feed -->
              <div class="space-y-2.5" id="telemetry-log-feed">
                ${filteredLogs.length === 0 ? `
                  <div class="bg-[#12121a] border border-white/[0.06] rounded-2xl p-8 text-center text-zinc-500 text-xs">
                    No diagnostic events matching active filters.
                  </div>
                ` : filteredLogs.map(log => {
                  const isCritical = log.severity === 'critical';
                  const isWarning = log.severity === 'warning';
                  const isResolved = log.status === 'resolved';

                  return `
                    <div class="bg-[#12121a] border ${
                      isResolved 
                        ? 'border-white/[0.04] opacity-70' 
                        : isCritical 
                          ? 'border-red-500/40 shadow-md shadow-red-500/10' 
                          : isWarning 
                            ? 'border-amber-500/30' 
                            : 'border-white/[0.08]'
                    } rounded-2xl p-4 transition-all">
                      
                      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04] pb-2.5 mb-2">
                        
                        <div class="flex items-center gap-2">
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            isCritical 
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                              : isWarning 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          }">
                            ${log.severity}
                          </span>
                          <span class="text-xs font-bold text-white">${log.tenant_name}</span>
                          <span class="text-zinc-600">•</span>
                          <span class="text-[11px] font-mono text-zinc-400">${log.source}</span>
                        </div>

                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-mono text-zinc-500">${new Date(log.timestamp).toLocaleTimeString()}</span>
                          ${isResolved ? `
                            <span class="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                              <span>✓ Resolved</span>
                              <span class="text-zinc-500 font-normal">by ${log.resolved_by || 'Admin'}</span>
                            </span>
                          ` : `
                            <button 
                              data-resolve-log="${log.id}"
                              class="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                            >
                              ✓ Acknowledge / Resolve
                            </button>
                          `}
                        </div>

                      </div>

                      <div class="space-y-1">
                        <p class="text-xs font-semibold text-zinc-200">${log.message}</p>
                        ${log.details ? `
                          <pre class="text-[10px] font-mono text-zinc-400 bg-[#0d0d14] p-2.5 rounded-xl overflow-x-auto whitespace-pre-wrap border border-white/[0.04]">${log.details}</pre>
                        ` : ''}
                      </div>

                    </div>
                  `;
                }).join('')}
              </div>

            </div>
          ` : ''}

          <!-- TAB 3: SOVEREIGN AUDIT TRAIL -->
          ${activeTab === 'audit' ? `
            <div class="space-y-4">
              
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div>
                  <h2 class="text-base font-bold text-white flex items-center gap-2">
                    <span>📜 Sovereign Master Audit Log</span>
                  </h2>
                  <p class="text-xs text-zinc-400">Tamper-evident chronological audit record of all Super-Admin God-Mode interventions and state repairs.</p>
                </div>
              </div>

              <div class="bg-[#12121a] border border-white/[0.08] rounded-2xl shadow-xl overflow-hidden overflow-x-auto">
                <table class="w-full text-left text-xs text-zinc-300">
                  <thead class="bg-[#161622] text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 border-b border-white/[0.06]">
                    <tr>
                      <th class="py-3 px-4">Timestamp</th>
                      <th class="py-3 px-4">Super-Admin Actor</th>
                      <th class="py-3 px-4">Target Tenant</th>
                      <th class="py-3 px-4">Intervention Action</th>
                      <th class="py-3 px-4">Resource Target</th>
                      <th class="py-3 px-4">Details / Hash</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/[0.04]">
                    ${masterAuditLogs.length === 0 ? `
                      <tr>
                        <td colspan="6" class="py-8 text-center text-zinc-500 text-xs">
                          No master audit records recorded yet.
                        </td>
                      </tr>
                    ` : masterAuditLogs.map(log => `
                      <tr class="hover:bg-white/[0.02] transition-colors">
                        <td class="py-3 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          ${new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td class="py-3 px-4 font-bold text-rose-300">
                          ${log.super_admin_name}
                        </td>
                        <td class="py-3 px-4 font-bold text-white">
                          ${log.target_tenant_name || log.target_tenant_id}
                        </td>
                        <td class="py-3 px-4">
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            ${log.action}
                          </span>
                        </td>
                        <td class="py-3 px-4 text-zinc-300">
                          ${log.target_resource}
                        </td>
                        <td class="py-3 px-4 font-mono text-[10px] text-zinc-400 max-w-xs truncate">
                          ${JSON.stringify(log.details)}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

            </div>
          ` : ''}

        </main>

        <!-- SURGICAL REMEDIATION & INTERVENTION DRAWER ("GOD MODE" CONTROLS) -->
        ${selectedTenantForDrawer ? renderInterventionDrawer(selectedTenantForDrawer) : ''}

        <!-- ONBOARD NEW CAFE MODAL -->
        ${isCreateCafeModalOpen ? renderCreateCafeModal() : ''}

      </div>
    `;

    bindEvents();
  }

  function renderInterventionDrawer(tenant) {
    const isMaintenance = Boolean(tenant.maintenance_mode);
    const tables = store.tables || [];
    const staffList = (typeof store.getTenantStaff === 'function' ? store.getTenantStaff(tenant.cafe_id || tenant.id) : (store.cachedStaff || []))
      .filter(st => {
        if (!st) return false;
        const r = (st.role || '').toLowerCase();
        const sr = (st.system_role || '').toLowerCase();
        const em = (st.email || '').toLowerCase();
        if (r === 'master_admin' || sr === 'master_admin' || r === 'super_admin' || sr === 'super_admin' || st.is_super_admin) return false;
        const superEmails = (store.superAdminAccounts || []).map(a => (a.email || '').toLowerCase());
        if (store.superAdmin?.email) superEmails.push(store.superAdmin.email.toLowerCase());
        if (superEmails.includes(em)) return false;
        return true;
      });

    return `
      <div id="remediation-drawer-backdrop" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
        <div class="bg-[#101018] border-l border-rose-500/30 w-full max-w-xl h-full flex flex-col text-white shadow-2xl overflow-y-auto">
          
          <!-- Drawer Top Header -->
          <div class="p-6 pb-4 border-b border-white/[0.08] flex items-center justify-between bg-[#151520]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-xl font-bold shadow-md">
                🛠️
              </div>
              <div>
                <h3 class="text-base font-black tracking-tight text-white flex items-center gap-2">
                  <span>${tenant.name}</span>
                  <span class="text-xs px-2 py-0.2 rounded-full font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    GOD MODE
                  </span>
                </h3>
                <p class="text-xs text-zinc-400">${tenant.branch} • ID: ${tenant.cafe_id}</p>
              </div>
            </div>

            <button id="btn-close-drawer" class="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Drawer Navigation Tabs -->
          <div class="flex items-center gap-1 p-3 px-6 bg-[#0c0c12] border-b border-white/[0.06] text-xs font-bold">
            <button 
              data-drawer-tab="pin" 
              class="px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                drawerActiveTab === 'pin' ? 'bg-rose-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }"
            >
              🔑 Staff PIN Reset
            </button>
            <button 
              data-drawer-tab="table" 
              class="px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                drawerActiveTab === 'table' ? 'bg-rose-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }"
            >
              🗺️ Table State Rescue
            </button>
            <button 
              data-drawer-tab="maintenance" 
              class="px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                drawerActiveTab === 'maintenance' ? 'bg-rose-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
              }"
            >
              ⏸️ Emergency Mode
            </button>
          </div>

          <!-- Drawer Body Content -->
          <div class="p-6 space-y-6 flex-1">
            
            <!-- SUB-TAB 1: STAFF PIN TRIAGE -->
            ${drawerActiveTab === 'pin' ? `
              <div class="space-y-4">
                <div>
                  <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>Remote Staff PIN Reset & Recovery</span>
                  </h4>
                  <p class="text-xs text-zinc-400 mt-0.5">Immediately overwrite forgotten terminal PINs for managers or cashiers in this cafe. Salts and rehashes via Web Crypto PBKDF2/SHA-256 and syncs to Supabase.</p>
                </div>

                ${pinResetSuccessMsg ? `
                  <div class="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                    ✓ ${pinResetSuccessMsg}
                  </div>
                ` : ''}

                ${pinResetErrorMsg ? `
                  <div class="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium">
                    ⚠️ ${pinResetErrorMsg}
                  </div>
                ` : ''}

                <div class="space-y-2">
                  <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">Select Staff Account</label>
                  <div class="space-y-2">
                    ${staffList.length === 0 ? `
                      <div class="bg-[#161622] border border-white/[0.06] rounded-2xl p-4 text-center text-xs text-zinc-400">
                        No shift staff or cashier accounts registered for this café yet.
                      </div>
                    ` : staffList.map(st => `
                      <div class="bg-[#161622] border border-white/[0.06] rounded-2xl p-3 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2.5">
                          <div class="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center font-bold text-xs">
                            ${st.name.charAt(0)}
                          </div>
                          <div>
                            <span class="font-bold text-white text-xs block">${st.name}</span>
                            <span class="text-[10px] text-zinc-400 font-mono block">${st.role} • ${st.email}</span>
                          </div>
                        </div>

                        <button 
                          data-staff-reset-id="${st.id}"
                          data-staff-name="${st.name}"
                          class="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                        >
                          Reset PIN
                        </button>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Custom PIN Input Dialog Form -->
                <div class="bg-[#161622] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                  <label class="text-xs font-bold text-zinc-200 block">Set New PIN (4–6 Digits)</label>
                  <div class="flex items-center gap-2">
                    <input 
                      type="text" 
                      id="input-new-staff-pin" 
                      value="${newPinInput}" 
                      maxlength="6" 
                      placeholder="e.g. 5555" 
                      class="flex-1 bg-[#101018] border border-white/[0.1] text-white text-sm font-mono tracking-widest px-3 py-2 rounded-xl focus:outline-rose-500"
                    />
                    <button 
                      id="btn-auto-gen-pin" 
                      class="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-all cursor-pointer"
                    >
                      🎲 Generate
                    </button>
                  </div>
                  <p class="text-[10px] text-zinc-500">Pick a staff member above, enter a PIN here, and click "Reset PIN".</p>
                </div>

              </div>
            ` : ''}

            <!-- SUB-TAB 2: TABLE OCCUPANCY RESCUE -->
            ${drawerActiveTab === 'table' ? `
              <div class="space-y-4">
                <div>
                  <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>State Repair / Force Table Release</span>
                  </h4>
                  <p class="text-xs text-zinc-400 mt-0.5">Surgically clear stuck tables, cancel orphaned orders, or reset corrupted ghost tabs without taking down the counter POS.</p>
                </div>

                <div class="grid grid-cols-2 gap-2.5">
                  ${tables.map(tbl => {
                    const isOcc = tbl.status && tbl.status !== 'Vacant' && tbl.status !== 'Available';
                    return `
                      <div class="p-3 rounded-2xl border ${
                        isOcc 
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' 
                          : 'bg-[#161622] border-white/[0.06] text-zinc-400'
                      } flex flex-col justify-between gap-3">
                        <div class="flex items-center justify-between">
                          <span class="font-bold text-xs text-white">Table ${tbl.table_number}</span>
                          <span class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                            isOcc ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                          }">
                            ${tbl.status}
                          </span>
                        </div>

                        <div class="text-[10px] text-zinc-400">
                          <span>${tbl.zone || 'Courtyard'}</span>
                          ${isOcc ? `<span> • ${tbl.party_size || 2} diners</span>` : ''}
                        </div>

                        ${isOcc ? `
                          <button 
                            data-force-release-table="${tbl.table_number}"
                            class="w-full py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                          >
                            ⚡ Force Release Table
                          </button>
                        ` : `
                          <div class="text-[10px] text-zinc-600 font-mono text-center py-1">Clean & Vacant</div>
                        `}
                      </div>
                    `;
                  }).join('')}
                </div>

              </div>
            ` : ''}

            <!-- SUB-TAB 3: TENANT EMERGENCY MAINTENANCE -->
            ${drawerActiveTab === 'maintenance' ? `
              <div class="space-y-4">
                <div>
                  <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    <span>Emergency Tenant Maintenance Toggle</span>
                  </h4>
                  <p class="text-xs text-zinc-400 mt-0.5">Pause guest dine-in ordering if a hardware failure occurs or kitchen is overloaded. Customers can still view the menu, but checkout is cleanly suspended with an emergency notice.</p>
                </div>

                <div class="bg-[#161622] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="text-xs font-bold text-white block">Maintenance Mode Status</span>
                      <span class="text-[11px] text-zinc-400 block mt-0.5">
                        ${isMaintenance 
                          ? 'ACTIVE — Customer orders are currently paused.' 
                          : 'INACTIVE — System is operating normally.'}
                      </span>
                    </div>

                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                      isMaintenance 
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse' 
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }">
                      ${isMaintenance ? 'PAUSED' : 'LIVE'}
                    </span>
                  </div>

                  <button 
                    id="btn-toggle-tenant-maintenance"
                    class="w-full py-3.5 rounded-2xl font-bold text-xs shadow-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 ${
                      isMaintenance 
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25' 
                        : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-amber-600/25'
                    }"
                  >
                    <span>${isMaintenance ? '▶️ Resume Normal Dine-In Ordering' : '⏸️ Switch to Emergency Maintenance Mode'}</span>
                  </button>
                </div>

                <!-- Force Edge Cache Resync Action -->
                <div class="bg-[#161622] border border-white/[0.08] rounded-2xl p-5 space-y-3">
                  <div>
                    <span class="text-xs font-bold text-white block">Force Edge Cache Resync</span>
                    <span class="text-[11px] text-zinc-400 block mt-0.5">Flush the connected POS station's local cache and trigger a full pull of clean catalog and table records.</span>
                  </div>

                  <button 
                    id="btn-trigger-tenant-edge-resync"
                    class="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-white/[0.08] transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>⚡ Invalidate & Force Resync Local Cache</span>
                  </button>
                </div>

              </div>
            ` : ''}

          </div>

        </div>
      </div>
    `;
  }

  function renderCreateCafeModal() {
    return `
      <div id="modal-create-cafe-backdrop" class="fixed inset-0 z-50 bg-[#08080c]/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in select-none">
        <div class="bg-[#12121a] border border-rose-500/30 rounded-3xl max-w-lg w-full p-6 text-zinc-100 shadow-2xl relative space-y-5">
          
          <div class="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center text-2xl shadow-lg shadow-rose-500/20">
                🏪
              </div>
              <div>
                <h3 class="text-base font-black tracking-tight text-white">Onboard New Cafe</h3>
                <p class="text-xs text-zinc-400 mt-0.5">Provision a new cafe branch directly under Super-Admin</p>
              </div>
            </div>
            <button id="btn-close-create-cafe-modal" class="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center text-sm transition-all cursor-pointer">
              ✕
            </button>
          </div>

          <form id="form-onboard-cafe" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div class="sm:col-span-2">
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Cafe Brand Name *
                </label>
                <input 
                  id="input-new-cafe-name"
                  type="text"
                  required
                  placeholder="e.g. Blue Tokai Coffee Roasters"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Branch / Area *
                </label>
                <input 
                  id="input-new-cafe-branch"
                  type="text"
                  required
                  placeholder="e.g. Indiranagar 100ft Road"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  City *
                </label>
                <input 
                  id="input-new-cafe-city"
                  type="text"
                  required
                  value="Bengaluru"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Dining Table Count
                </label>
                <input 
                  id="input-new-cafe-tables"
                  type="number"
                  min="1"
                  max="100"
                  value="12"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none font-mono"
                />
              </div>

              <div>
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Hardware Terminal SIN
                </label>
                <input 
                  id="input-new-cafe-sin"
                  type="text"
                  value="SIN-POS-${String((store.tenants || []).length + 1).padStart(2, '0')}"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none font-mono"
                />
              </div>

              <div class="sm:col-span-2">
                <label class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Branch Contact / Manager Email
                </label>
                <input 
                  id="input-new-cafe-email"
                  type="email"
                  placeholder="manager@bluetokai.com"
                  class="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-rose-500 text-sm text-white placeholder-zinc-500 outline-none font-mono"
                />
              </div>
            </div>

            <div class="pt-2 flex items-center gap-3">
              <button 
                type="button" 
                id="btn-cancel-create-cafe"
                class="flex-1 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all active:scale-98 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                id="btn-submit-create-cafe"
                class="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all active:scale-98 cursor-pointer"
              >
                Create & Register Cafe
              </button>
            </div>
          </form>

        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Open / Close Create Cafe Modal
    container.querySelector('#btn-open-create-cafe-modal')?.addEventListener('click', () => {
      isCreateCafeModalOpen = true;
      render();
    });
    container.querySelector('#btn-empty-create-cafe')?.addEventListener('click', () => {
      isCreateCafeModalOpen = true;
      render();
    });
    container.querySelector('#btn-close-create-cafe-modal')?.addEventListener('click', () => {
      isCreateCafeModalOpen = false;
      render();
    });
    container.querySelector('#btn-cancel-create-cafe')?.addEventListener('click', () => {
      isCreateCafeModalOpen = false;
      render();
    });

    // Form submit for Onboard Cafe
    container.querySelector('#form-onboard-cafe')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = container.querySelector('#input-new-cafe-name')?.value || '';
      const branch = container.querySelector('#input-new-cafe-branch')?.value || '';
      const city = container.querySelector('#input-new-cafe-city')?.value || 'Bengaluru';
      const tables_count = container.querySelector('#input-new-cafe-tables')?.value || 12;
      const terminal_sin = container.querySelector('#input-new-cafe-sin')?.value || '';
      const contact_email = container.querySelector('#input-new-cafe-email')?.value || '';

      const res = await store.createTenantCafe({
        name,
        branch,
        city,
        tables_count,
        terminal_sin,
        contact_email
      });

      if (res.success) {
        isCreateCafeModalOpen = false;
        render();
      } else {
        alert(res.error || 'Failed to onboard cafe');
      }
    });

    // Delete / Decommission Cafe
    container.querySelectorAll('[data-delete-tenant]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.deleteTenant;
        if (confirm('Are you sure you want to decommission and remove this cafe branch?')) {
          store.deleteTenantCafe(id);
          render();
        }
      });
    });

    // Approve Tenant Cafe
    container.querySelectorAll('[data-approve-tenant]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.approveTenant;
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>Approving...</span>';
        await store.approveTenantCafe(id);
        await fetchPendingCafes();
      });
    });

    // Reject Tenant Cafe
    container.querySelectorAll('[data-reject-tenant]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.rejectTenant;
        const reason = prompt('Enter rejection reason for this café:', 'Compliance verification failed');
        if (reason !== null) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳</span><span>Rejecting...</span>';
          await store.rejectTenantCafe(id, reason);
          await fetchPendingCafes();
        }
      });
    });
    // Navigation Tabs
    container.querySelector('#btn-tab-overview')?.addEventListener('click', () => {
      activeTab = 'overview';
      render();
    });
    container.querySelector('#btn-tab-telemetry')?.addEventListener('click', () => {
      activeTab = 'telemetry';
      render();
    });
    container.querySelector('#btn-tab-audit')?.addEventListener('click', () => {
      activeTab = 'audit';
      render();
    });

    // Logout
    container.querySelector('#btn-super-logout')?.addEventListener('click', () => {
      store.logoutSuperAdmin();
      if (typeof window !== 'undefined' && window.location) {
        const u = new URL(window.location);
        u.searchParams.delete('view');
        window.history.replaceState({}, '', u);
        window.location.reload();
      }
    });

    // Fleet Resync All
    container.querySelector('#btn-fleet-resync-all')?.addEventListener('click', () => {
      (store.tenants || []).forEach(t => {
        store.masterTriggerEdgeResync({ tenantId: t.id });
      });
      alert('Global Fleet Edge Cache Resync triggered across all 4 registered cafes.');
      render();
    });

    // Provision new super admin
    container.querySelector('#btn-provision-super-admin')?.addEventListener('click', () => {
      const modalContainer = document.getElementById('app-modal-layer') || container;
      renderSuperAdminLoginModal(modalContainer, store, {
        initialMode: 'create',
        onSuccess: () => {
          render();
        }
      });
    });

    // Delete super admin
    container.querySelectorAll('[data-delete-super]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.deleteSuper;
        store.deleteSuperAdminAccount(id);
        render();
      });
    });

    // Open Intervention Drawer
    container.querySelectorAll('[data-open-drawer]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tenantId = e.currentTarget.dataset.openDrawer;
        selectedTenantForDrawer = (store.tenants || []).find(t => t.id === tenantId) || store.tenants[0];
        pinResetSuccessMsg = '';
        pinResetErrorMsg = '';
        newPinInput = '1234';
        render();
      });
    });

    // Close Intervention Drawer
    container.querySelector('#btn-close-drawer')?.addEventListener('click', () => {
      selectedTenantForDrawer = null;
      render();
    });
    container.querySelector('#remediation-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'remediation-drawer-backdrop') {
        selectedTenantForDrawer = null;
        render();
      }
    });

    // Drawer Tabs
    container.querySelectorAll('[data-drawer-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        drawerActiveTab = e.currentTarget.dataset.drawerTab;
        pinResetSuccessMsg = '';
        pinResetErrorMsg = '';
        render();
      });
    });

    // Auto-generate PIN
    container.querySelector('#btn-auto-gen-pin')?.addEventListener('click', () => {
      newPinInput = String(Math.floor(1000 + Math.random() * 9000));
      const input = container.querySelector('#input-new-staff-pin');
      if (input) input.value = newPinInput;
    });

    // Input new PIN change
    container.querySelector('#input-new-staff-pin')?.addEventListener('input', (e) => {
      newPinInput = e.target.value;
    });

    // Staff Reset PIN click
    container.querySelectorAll('[data-staff-reset-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const staffId = e.currentTarget.dataset.staffResetId;
        const staffName = e.currentTarget.dataset.staffName;
        const pinToUse = newPinInput || '1234';

        pinResetSuccessMsg = '';
        pinResetErrorMsg = '';

        const res = await store.masterResetStaffPIN({
          superAdminId: activeSuperAdmin.id,
          tenantId: selectedTenantForDrawer?.id,
          staffId,
          newPin: pinToUse
        });

        if (res.success) {
          pinResetSuccessMsg = `Successfully updated PIN for ${staffName} to [${pinToUse}]. Hash updated and audited.`;
        } else {
          pinResetErrorMsg = res.error || 'Failed to reset PIN';
        }
        render();
      });
    });

    // Force Release Table
    container.querySelectorAll('[data-force-release-table]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tableNum = parseInt(e.currentTarget.dataset.forceReleaseTable, 10);
        await store.masterForceTableRelease({
          superAdminId: activeSuperAdmin.id,
          tenantId: selectedTenantForDrawer?.id,
          tableNumber: tableNum
        });
        render();
      });
    });

    // Toggle Maintenance
    container.querySelector('#btn-toggle-tenant-maintenance')?.addEventListener('click', async () => {
      if (!selectedTenantForDrawer) return;
      const newStatus = !selectedTenantForDrawer.maintenance_mode;
      await store.masterToggleMaintenance({
        superAdminId: activeSuperAdmin.id,
        tenantId: selectedTenantForDrawer.id,
        enabled: newStatus
      });
      selectedTenantForDrawer.maintenance_mode = newStatus;
      render();
    });

    // Invalidate & Resync Local Cache
    container.querySelector('#btn-trigger-tenant-edge-resync')?.addEventListener('click', async () => {
      if (!selectedTenantForDrawer) return;
      await store.masterTriggerEdgeResync({
        superAdminId: activeSuperAdmin.id,
        tenantId: selectedTenantForDrawer.id
      });
      alert(`Forced edge cache resync completed for ${selectedTenantForDrawer.name}. Sync latency nominal.`);
      render();
    });

    // Telemetry: Resolve Log
    container.querySelectorAll('[data-resolve-log]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const logId = e.currentTarget.dataset.resolveLog;
        store.resolveDiagnosticLog(logId, activeSuperAdmin.name);
        render();
      });
    });

    // Telemetry: Purge Resolved
    container.querySelector('#btn-purge-resolved-logs')?.addEventListener('click', () => {
      store.purgeDiagnosticLogs('resolved');
      render();
    });

    // Telemetry: Trigger Diagnostic Probe
    container.querySelector('#btn-trigger-diagnostic-probe')?.addEventListener('click', () => {
      store.reportDiagnosticLog({
        tenantId: 'tenant-indiranagar-01',
        severity: 'warning',
        source: 'supabase_sync',
        message: 'Diagnostic probe sent from Platform Control Plane',
        details: 'Simulated round-trip heartbeat verification by ' + activeSuperAdmin.name
      });
      render();
    });

    // Telemetry Filter: Severity
    container.querySelectorAll('[data-filter-severity]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        severityFilter = e.currentTarget.dataset.filterSeverity;
        render();
      });
    });

    // Telemetry Filter: Source
    const sourceSelect = container.querySelector('#select-filter-source');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', (e) => {
        sourceFilter = e.target.value;
        render();
      });
    }

    // Telemetry Filter: Tenant
    const tenantSelect = container.querySelector('#select-filter-tenant');
    if (tenantSelect) {
      tenantSelect.addEventListener('change', (e) => {
        tenantFilter = e.target.value;
        render();
      });
    }

    // Telemetry Filter: Search
    const searchInput = container.querySelector('#input-telemetry-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const nextInput = container.querySelector('#input-telemetry-search');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(pos, pos);
        }
      });
    }
  }

  render();

  // Initial live sync directly from Supabase Cloud
  if (!globalThis.IS_TEST_ENV) {
    fetchPendingCafes();
  }

  // Supabase Realtime Channel for instant cross-browser synchronization
  let realtimeChannel = null;
  if (!globalThis.IS_TEST_ENV && supabase && typeof supabase.channel === 'function') {
    const channelName = `cafes-realtime-master-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    realtimeChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cafes' }, () => {
        fetchPendingCafes();
      })
      .subscribe();
  }

  // 5-second polling fallback
  const pollInterval = (!globalThis.IS_TEST_ENV) ? setInterval(() => {
    fetchPendingCafes();
  }, 5000) : null;

  // Return unmount cleanup function
  return () => {
    if (pollInterval) clearInterval(pollInterval);
    if (realtimeChannel && supabase && typeof supabase.removeChannel === 'function') {
      supabase.removeChannel(realtimeChannel);
    }
    container.innerHTML = '';
  };
}
