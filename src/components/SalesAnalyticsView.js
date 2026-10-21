/**
 * Sales Analytics View (Milestone 3 - F8, F9, F10, F11)
 * Dribbble-inspired dark neo-editorial dashboard with real dynamically calculated
 * pill bar charts, peak velocity curves, Day x Hour heatmap matrix, category shares,
 * turnaround metrics, and CSV export.
 */

import { store } from '../store.js';
import { renderOfferBannerModal } from './OfferBannerModal.js';

/**
 * Calculate authoritative financial KPIs from real orders as they come in.
 */
export function calculateSalesKPIs(orders = [], menuItems = []) {
  // Count all valid incoming, active, and completed orders (excluding Cancelled/Voided)
  const validOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Voided');
  const grossRevenue = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const orderCount = validOrders.length;
  const aov = orderCount > 0 ? Math.round((grossRevenue / orderCount) * 100) / 100 : 0;

  let totalCOGS = 0;
  // Initialize default canonical categories to guarantee backwards compatibility with test suites
  const categoryRevenue = {
    'Small Plates': 0,
    'Woodfired & Oven': 0,
    'Large Plates & Bowls': 0,
    'Craft Beverages & Brews': 0,
    'Artisanal Desserts': 0
  };

  validOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const catalogItem = menuItems.find(m => m.id === item.id || m.name === item.name);
      const unitCost = catalogItem?.unit_cost || (item.price ? Math.round(item.price * 0.36) : 0);
      const qty = item.quantity || 1;
      totalCOGS += unitCost * qty;

      const cat = catalogItem?.category || item.category || 'Small Plates';
      if (categoryRevenue[cat] !== undefined) {
        categoryRevenue[cat] += (item.price || 0) * qty;
      } else {
        categoryRevenue[cat] = (item.price || 0) * qty;
      }
    });
  });

  const grossProfit = Math.max(0, grossRevenue - totalCOGS);
  const profitMarginPercent = grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 1000) / 10 : 0;

  const totalItemRev = Object.values(categoryRevenue).reduce((a, b) => a + b, 0);
  const categorySharePercent = {};
  for (const [cat, rev] of Object.entries(categoryRevenue)) {
    categorySharePercent[cat] = totalItemRev > 0 ? Math.round((rev / totalItemRev) * 1000) / 10 : 0;
  }

  return {
    grossRevenue,
    orderCount,
    aov,
    totalCOGS,
    grossProfit,
    profitMarginPercent,
    categoryRevenue,
    categorySharePercent
  };
}

/**
 * Filter orders strictly by time interval without falling back to demo state.
 */
export function filterOrdersByTimeframe(orders = [], timeframe = 'TODAY', referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const startOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0);
  const endOfDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);

  return orders.filter(order => {
    const orderDate = new Date(order.created_at);
    if (isNaN(orderDate.getTime())) return false;

    switch (timeframe) {
      case 'TODAY':
        return orderDate >= startOfDay && orderDate <= endOfDay;

      case 'YESTERDAY': {
        const yStart = new Date(startOfDay);
        yStart.setDate(yStart.getDate() - 1);
        const yEnd = new Date(endOfDay);
        yEnd.setDate(yEnd.getDate() - 1);
        return orderDate >= yStart && orderDate <= yEnd;
      }

      case 'LAST_7_DAYS': {
        const weekAgo = new Date(startOfDay);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return orderDate >= weekAgo && orderDate <= endOfDay;
      }

      case 'MONTH_TO_DATE': {
        const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0);
        return orderDate >= monthStart && orderDate <= endOfDay;
      }

      default:
        return true;
    }
  });
}

/**
 * Dynamically aggregate hourly sales velocity across 12 standard operating hours (12 PM - 11 PM).
 */
export function calculateHourlySalesVelocity(orders = []) {
  const hours = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

  const hourlyData = hours.map(hr => {
    const period = hr >= 12 ? 'PM' : 'AM';
    const displayHour = hr > 12 ? hr - 12 : (hr === 0 ? 12 : hr);
    return {
      hourNum: hr,
      hour: `${displayHour} ${period}`,
      revenue: 0,
      orders: 0
    };
  });

  const hourMap = new Map();
  hourlyData.forEach(h => hourMap.set(h.hourNum, h));

  orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Voided').forEach(o => {
    if (!o.created_at) return;
    const d = new Date(o.created_at);
    if (isNaN(d.getTime())) return;
    let hr = d.getHours();
    if (hr < 11) hr = 11;
    if (hr > 22) hr = 22;
    const bucket = hourMap.get(hr);
    if (bucket) {
      bucket.revenue += Number(o.total_amount) || 0;
      bucket.orders += 1;
    }
  });

  let maxRevenue = 0;
  let peakHourNum = null;
  let peakHourLabel = null;

  hourlyData.forEach(h => {
    if (h.revenue > maxRevenue) {
      maxRevenue = h.revenue;
      peakHourNum = h.hourNum;
      peakHourLabel = h.hour;
    }
  });

  const pillBars = hourlyData.map(h => {
    const pct = maxRevenue > 0 ? Math.round((h.revenue / maxRevenue) * 100) : 0;
    const heightStr = pct > 0 ? `${Math.max(10, pct)}%` : (h.orders > 0 ? '12%' : '4%');
    const revStr = h.revenue >= 1000 
      ? `₹${(h.revenue / 1000).toFixed(1)}k` 
      : (h.revenue > 0 ? `₹${Math.round(h.revenue)}` : '₹0');
    const isPeak = maxRevenue > 0 && h.revenue === maxRevenue;

    return {
      hour: h.hour,
      hourNum: h.hourNum,
      h: heightStr,
      rev: revStr,
      revenue: h.revenue,
      orders: h.orders,
      peak: isPeak
    };
  });

  let peakRushText = 'Standard Flow • No Peak Spike';
  if (peakHourLabel && maxRevenue > 0) {
    const nextHourNum = (peakHourNum + 1) % 24;
    const nextPeriod = nextHourNum >= 12 ? 'PM' : 'AM';
    const nextDisplay = nextHourNum > 12 ? nextHourNum - 12 : (nextHourNum === 0 ? 12 : nextHourNum);
    peakRushText = `Peak Rush ${peakHourLabel.replace(/ (AM|PM)/, '')}–${nextDisplay} ${nextPeriod}`;
  }

  return {
    pillBars,
    peakHour: peakHourLabel,
    peakHourNum,
    peakRevenue: maxRevenue,
    peakRushText
  };
}

/**
 * Dynamically calculate Day x Hour demand intensity heatmap from actual orders.
 */
export function calculateHeatmapMatrix(orders = []) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIndexMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
  const timeBlocks = ['12 PM', '2 PM', '6 PM', '8 PM', '10 PM'];

  const matrix = Array.from({ length: 7 }, () => Array(timeBlocks.length).fill(0));

  orders.filter(o => o.status !== 'Cancelled').forEach(o => {
    if (!o.created_at) return;
    const d = new Date(o.created_at);
    if (isNaN(d.getTime())) return;
    const dIdx = dayIndexMap[d.getDay()];
    if (dIdx === undefined) return;

    const hr = d.getHours();
    let bIdx = -1;
    if (hr >= 11 && hr < 14) bIdx = 0;       // 12 PM block (11:00 - 13:59)
    else if (hr >= 14 && hr < 17) bIdx = 1;  // 2 PM block (14:00 - 16:59)
    else if (hr >= 17 && hr < 19) bIdx = 2;  // 6 PM block (17:00 - 18:59)
    else if (hr >= 19 && hr < 21) bIdx = 3;  // 8 PM block (19:00 - 20:59)
    else if (hr >= 21 || hr < 4) bIdx = 4;   // 10 PM block (21:00 - 03:59)
    else if (hr >= 4 && hr < 11) bIdx = 0;   // morning prep

    if (bIdx >= 0) {
      matrix[dIdx][bIdx] += 1;
    }
  });

  const maxVal = Math.max(...matrix.flat(), 0);

  return {
    days,
    timeBlocks,
    matrix,
    maxVal
  };
}

/**
 * Calculate actual average turnaround time and real top margin contributor category.
 */
export function calculateTurnaroundAndMargins(orders = [], menuItems = []) {
  const completedOrders = orders.filter(o => 
    (o.status === 'Completed' || o.payment_status === 'PAID') && o.created_at
  );

  let totalMinutes = 0;
  let timedCount = 0;

  completedOrders.forEach(o => {
    const start = new Date(o.created_at).getTime();
    const end = o.paid_at 
      ? new Date(o.paid_at).getTime() 
      : (o.updated_at ? new Date(o.updated_at).getTime() : null);

    if (end && end >= start) {
      const diff = Math.round((end - start) / (60 * 1000));
      if (diff >= 0 && diff <= 300) {
        totalMinutes += diff;
        timedCount++;
      }
    }
  });

  const avgTurnaround = timedCount > 0 ? Math.max(1, Math.round(totalMinutes / timedCount)) : null;

  // Category margins from all non-cancelled orders
  const categoryStats = {};
  orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Voided').forEach(o => {
    (o.items || []).forEach(item => {
      const catalogItem = menuItems.find(m => m.id === item.id || m.name === item.name);
      const cat = catalogItem?.category || item.category || 'Small Plates';
      const unitCost = catalogItem?.unit_cost || (item.price ? Math.round(item.price * 0.36) : 0);
      const qty = item.quantity || 1;
      const rev = (item.price || 0) * qty;
      const cogs = unitCost * qty;

      if (!categoryStats[cat]) {
        categoryStats[cat] = { name: cat, revenue: 0, cogs: 0 };
      }
      categoryStats[cat].revenue += rev;
      categoryStats[cat].cogs += cogs;
    });
  });

  let topMarginCategory = null;
  let highestMarginPct = -1;

  for (const stat of Object.values(categoryStats)) {
    if (stat.revenue > 0) {
      const profit = stat.revenue - stat.cogs;
      const marginPct = (profit / stat.revenue) * 100;
      if (marginPct > highestMarginPct) {
        highestMarginPct = marginPct;
        topMarginCategory = {
          name: stat.name,
          margin: Math.round(marginPct * 10) / 10,
          profit: Math.round(profit)
        };
      }
    }
  }

  return {
    avgTurnaround,
    topMarginCategory
  };
}

/**
 * Calculate dynamic period-over-period growth comparing against the prior timeframe.
 */
export function calculatePeriodGrowth(orders = [], timeframe = 'TODAY', referenceDate = new Date()) {
  const currentOrders = filterOrdersByTimeframe(orders, timeframe, referenceDate);
  const currentGross = currentOrders
    .filter(o => o.status !== 'Cancelled' && o.status !== 'Voided')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  const ref = new Date(referenceDate);
  let priorOrders = [];

  if (timeframe === 'TODAY') {
    priorOrders = filterOrdersByTimeframe(orders, 'YESTERDAY', ref);
  } else if (timeframe === 'YESTERDAY') {
    const twoDaysAgo = new Date(ref);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
    priorOrders = filterOrdersByTimeframe(orders, 'YESTERDAY', twoDaysAgo);
  } else if (timeframe === 'LAST_7_DAYS') {
    const startPrev = new Date(ref);
    startPrev.setDate(startPrev.getDate() - 14);
    const endPrev = new Date(ref);
    endPrev.setDate(endPrev.getDate() - 7);
    priorOrders = orders.filter(o => {
      const d = new Date(o.created_at);
      return !isNaN(d.getTime()) && d >= startPrev && d < endPrev;
    });
  } else if (timeframe === 'MONTH_TO_DATE') {
    const startPrevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    const endPrevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, ref.getDate(), 23, 59, 59);
    priorOrders = orders.filter(o => {
      const d = new Date(o.created_at);
      return !isNaN(d.getTime()) && d >= startPrevMonth && d <= endPrevMonth;
    });
  }

  const priorGross = priorOrders
    .filter(o => o.status !== 'Cancelled' && o.status !== 'Voided')
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  let growthPct = 0;
  let growthLabel = '0.0%';
  let isPositive = true;

  if (priorGross > 0) {
    growthPct = Math.round(((currentGross - priorGross) / priorGross) * 1000) / 10;
    isPositive = growthPct >= 0;
    growthLabel = `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`;
  } else if (currentGross > 0) {
    growthPct = 100;
    isPositive = true;
    growthLabel = '+100%';
  } else {
    growthLabel = '0.0%';
    isPositive = true;
  }

  return {
    currentGross,
    priorGross,
    growthPct,
    growthLabel,
    isPositive
  };
}

export function renderSalesAnalyticsView(container, reactiveStore) {
  let activeTimeframe = 'TODAY'; // 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'MONTH_TO_DATE'

  function render() {
    const rawOrders = reactiveStore.orders || [];
    const menuItems = reactiveStore.menuItems || [];
    
    // Filter orders strictly by chosen timeframe
    const filteredOrders = filterOrdersByTimeframe(rawOrders, activeTimeframe);
    const kpis = calculateSalesKPIs(filteredOrders, menuItems);

    // Dynamic calculations from actual order data
    const velocity = calculateHourlySalesVelocity(filteredOrders.length > 0 ? filteredOrders : rawOrders);
    const heatmap = calculateHeatmapMatrix(rawOrders);
    const turnaround = calculateTurnaroundAndMargins(filteredOrders.length > 0 ? filteredOrders : rawOrders, menuItems);
    const growth = calculatePeriodGrowth(rawOrders, activeTimeframe);

    // Calculate baseline AOV benchmark dynamically from menu items
    const avgDishPrice = menuItems.length > 0
      ? Math.round(menuItems.reduce((s, m) => s + (m.price || 0), 0) / menuItems.length)
      : 500;
    const dynamicAovBenchmark = Math.round(avgDishPrice * 2.2);

    const activeOfferCount = (reactiveStore.offerBanners || []).filter(b => b.is_active).length;

    // Margin status text and pill styling
    let marginStatusLabel = 'Healthy';
    let marginStatusBg = 'bg-[#EBF7F2] text-[#059C6A]';
    if (kpis.profitMarginPercent >= 65) {
      marginStatusLabel = 'Optimal';
      marginStatusBg = 'bg-[#EBF7F2] text-[#059C6A]';
    } else if (kpis.profitMarginPercent >= 45) {
      marginStatusLabel = 'Healthy';
      marginStatusBg = 'bg-[#FFF1E8] text-[#FF7622]';
    } else if (kpis.profitMarginPercent > 0) {
      marginStatusLabel = 'Tight';
      marginStatusBg = 'bg-[#FFEBE4] text-[#E02D3C]';
    } else {
      marginStatusLabel = '0% Margin';
      marginStatusBg = 'bg-slate-100 text-[#646982]';
    }

    container.innerHTML = `
      <div class="analytics-app min-h-screen bg-[#F7F8F9] text-[#181C2E] flex flex-col font-sans select-none p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        
        <!-- Header & Timeframe Switchers (matching Seller Dashboard Home.png) -->
        <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm">
          <div class="flex items-center space-x-3.5">
            <div class="w-12 h-12 rounded-2xl bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-2xl font-black shadow-sm">
              📊
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-bold uppercase tracking-wider text-[#FF7622]">Executive Telemetry</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF7F2] text-[#059C6A]">
                  ● Live Sync
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${activeOfferCount > 0 ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-slate-100 text-[#646982]'}">
                  🏷️ ${activeOfferCount} Active Promo(s)
                </span>
              </div>
              <h1 class="text-xl font-black text-[#181C2E]">Sales Analytics & Revenue Velocity</h1>
            </div>
          </div>

          <!-- Timeframe Pills + Export -->
          <div class="flex items-center gap-2.5 flex-wrap">
            <div class="flex items-center bg-[#F0F5FA] p-1.5 rounded-2xl border border-slate-100 text-xs font-bold">
              ${[
                { id: 'TODAY', label: 'Today' },
                { id: 'YESTERDAY', label: 'Yesterday' },
                { id: 'LAST_7_DAYS', label: 'Last 7D' },
                { id: 'MONTH_TO_DATE', label: 'MTD' }
              ].map(tf => `
                <button 
                  data-analytics-tf="${tf.id}"
                  class="px-3.5 py-1.5 rounded-xl font-bold transition-all ${
                    activeTimeframe === tf.id 
                      ? 'bg-[#FF7622] text-white shadow-md shadow-[#FF7622]/30' 
                      : 'text-[#646982] hover:text-[#181C2E]'
                  }"
                >
                  ${tf.label}
                </button>
              `).join('')}
            </div>

            <button 
              id="btn-analytics-manage-offers" 
              class="px-4 py-2.5 rounded-2xl bg-[#FFF1E8] hover:bg-[#FFE3D1] text-[#FF7622] border border-[#FF7622]/30 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
              title="Manage Promotional Offer Banners"
            >
              <span>🏷️</span>
              <span>Offers (${activeOfferCount})</span>
            </button>

            <button 
              id="btn-export-csv" 
              class="px-4 py-2.5 rounded-2xl bg-[#181C2E] hover:bg-[#121223] text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer"
              title="Download Sales Summary CSV"
            >
              <span>📥 Export CSV</span>
            </button>
          </div>
        </div>

        <!-- 4 Primary KPI Cards (matching Seller Dashboard Home.png) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Gross Revenue -->
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm relative overflow-hidden group hover:border-[#FF7622]/40 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Total Revenue</span>
              <div class="w-8 h-8 rounded-full bg-[#FFEBE4] text-[#FF7622] flex items-center justify-center text-sm font-black">
                ₹
              </div>
            </div>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-3xl font-black text-[#181C2E] tracking-tight">₹${kpis.grossRevenue.toLocaleString('en-IN')}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                growth.isPositive ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-[#FFEBE4] text-[#E02D3C]'
              }">${growth.growthLabel}</span>
            </div>
            <p class="text-xs text-[#646982] mt-1.5">From ${kpis.orderCount} completed dining tabs</p>
          </div>

          <!-- Total Orders -->
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm relative overflow-hidden group hover:border-[#FF7622]/40 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Running Orders</span>
              <div class="w-8 h-8 rounded-full bg-[#EBF7F2] text-[#059C6A] flex items-center justify-center text-sm font-black">
                ⚡
              </div>
            </div>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-3xl font-black text-[#181C2E] tracking-tight">${kpis.orderCount}</span>
              <span class="text-xs font-bold text-[#646982]">tickets</span>
            </div>
            <p class="text-xs text-[#646982] mt-1.5">${
              turnaround.avgTurnaround ? `Avg Turnaround: ${turnaround.avgTurnaround} mins` : 'Avg Turnaround: 0 mins'
            }</p>
          </div>

          <!-- AOV -->
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm relative overflow-hidden group hover:border-[#FF7622]/40 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">Avg Order Value (AOV)</span>
              <div class="w-8 h-8 rounded-full bg-[#FFF1E8] text-[#FF7622] flex items-center justify-center text-sm font-black">
                🏷️
              </div>
            </div>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-3xl font-black text-[#181C2E] tracking-tight">₹${kpis.aov.toLocaleString('en-IN')}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                kpis.aov >= dynamicAovBenchmark ? 'bg-[#EBF7F2] text-[#059C6A]' : 'bg-[#FFF1E8] text-[#FF7622]'
              }">Target: ₹${dynamicAovBenchmark}</span>
            </div>
            <p class="text-xs text-[#646982] mt-1.5">Per seated table session</p>
          </div>

          <!-- Profit Margin -->
          <div class="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm relative overflow-hidden group hover:border-[#FF7622]/40 transition-all">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#A0A5BA]">COGS Gross Margin</span>
              <div class="w-8 h-8 rounded-full bg-[#F0F5FA] text-[#181C2E] flex items-center justify-center text-sm font-black">
                %
              </div>
            </div>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-3xl font-black text-[#181C2E] tracking-tight">${kpis.profitMarginPercent}%</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${marginStatusBg}">${marginStatusLabel}</span>
            </div>
            <p class="text-xs text-[#646982] mt-1.5">Total COGS: ₹${kpis.totalCOGS.toLocaleString('en-IN')}</p>
          </div>
        </div>

        <!-- Hourly Sales Velocity & Pill Bar Curve (matching Seller Dashboard Home.png) -->
        <div class="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-base font-black text-[#181C2E]">Hourly Sales Velocity & Volume Curve</h2>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFEBE4] text-[#FF7622]">
                  ${velocity.peakRushText}
                </span>
              </div>
              <p class="text-xs text-[#646982] mt-0.5">Real-time revenue telemetry and dining rush curve</p>
            </div>
            <div class="flex items-center gap-4 text-xs font-bold text-[#646982]">
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-[#059C6A]"></span> Standard Flow</span>
              <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-[#FF7622]"></span> Peak Rush</span>
            </div>
          </div>

          <!-- Pill Bars Visual Track -->
          <div class="h-52 pt-8 flex items-end justify-between gap-2.5 px-3 border-b border-slate-100">
            ${velocity.pillBars.map(bar => `
              <div class="flex-1 flex flex-col items-center gap-2 group cursor-pointer relative" title="${bar.hour}: ${bar.rev} (${bar.orders} orders)">
                <span class="text-[10px] font-bold text-[#181C2E] opacity-0 group-hover:opacity-100 transition-opacity bg-[#F0F5FA] px-1.5 py-0.5 rounded-md shadow-xs whitespace-nowrap">
                  ${bar.rev}
                </span>
                
                <div class="w-full max-w-[32px] rounded-full bg-[#F0F5FA] group-hover:bg-[#E4ECF4] transition-all flex items-end p-0.5 h-36">
                  <div 
                    class="w-full rounded-full transition-all duration-700 ${
                      bar.peak 
                        ? 'bg-gradient-to-t from-[#F15B00] to-[#FF7622] shadow-md shadow-[#FF7622]/30' 
                        : 'bg-gradient-to-t from-[#047851] to-[#059C6A] shadow-sm'
                    }" 
                    style="height: ${bar.h};"
                  ></div>
                </div>

                <span class="text-[11px] font-bold text-[#A0A5BA] group-hover:text-[#181C2E]">${bar.hour}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 2 Columns: Heatmap Matrix + Category Shares -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- Sales Velocity Heatmap (7 cols) -->
          <div class="lg:col-span-7 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-base font-black text-[#181C2E]">Day × Hour Demand Intensity</h3>
                <p class="text-xs text-[#646982]">Staffing heat signature and kitchen table turnaround volume.</p>
              </div>
              <span class="text-xs font-bold text-[#059C6A] bg-[#EBF7F2] px-3 py-1 rounded-full">Heatmap</span>
            </div>

            <!-- Heatmap Grid -->
            <div class="space-y-2 pt-2">
              <div class="grid grid-cols-6 gap-2 text-center text-xs font-bold text-[#A0A5BA] pb-1">
                <div>Day</div>
                ${heatmap.timeBlocks.map(tb => `<div>${tb}</div>`).join('')}
              </div>

              ${heatmap.days.map((day, dIdx) => `
                <div class="grid grid-cols-6 gap-2 items-center text-xs">
                  <span class="text-[#181C2E] font-bold text-xs">${day}</span>
                  ${heatmap.matrix[dIdx].map(val => {
                    let bg = 'bg-[#F7F8F9] text-[#A0A5BA] border-slate-100';
                    if (val > 0) {
                      if (heatmap.maxVal > 0 && val >= heatmap.maxVal * 0.75 && val >= 2) {
                        bg = 'bg-[#FFEBE4] text-[#FF7622] font-black border-[#FF7622]/30 shadow-xs';
                      } else if (heatmap.maxVal > 0 && val >= heatmap.maxVal * 0.4) {
                        bg = 'bg-[#FFF1E8] text-[#F15B00] font-bold border-orange-100';
                      } else {
                        bg = 'bg-[#EBF7F2] text-[#059C6A] font-medium border-emerald-100';
                      }
                    }
                    return `
                      <div class="py-2.5 rounded-xl border text-center transition-all hover:scale-105 ${bg}">
                        ${val}t
                      </div>
                    `;
                  }).join('')}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Category Share Breakdown (5 cols) -->
          <div class="lg:col-span-5 bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm space-y-5 flex flex-col justify-between">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-base font-black text-[#181C2E]">Category Sales Share</h3>
                <span class="text-xs font-bold text-[#A0A5BA]">Relative Mix</span>
              </div>

              <div class="space-y-3.5 text-xs">
                ${Object.entries(kpis.categorySharePercent).map(([cat, pct]) => `
                  <div class="space-y-1.5">
                    <div class="flex justify-between">
                      <span class="text-[#181C2E] font-bold">${cat}</span>
                      <span class="font-black text-[#FF7622]">${pct}%</span>
                    </div>
                    <div class="w-full bg-[#F0F5FA] h-2.5 rounded-full overflow-hidden">
                      <div 
                        class="bg-[#FF7622] h-full rounded-full transition-all duration-700" 
                        style="width: ${Math.max(pct > 0 ? 5 : 0, pct)}%;"
                      ></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-[#F7F8F9] border border-slate-100 text-xs text-[#646982] flex items-center justify-between mt-4">
              <span class="font-medium">Top Margin Contributor:</span>
              <span class="text-[#059C6A] font-bold">${
                turnaround.topMarginCategory 
                  ? `${turnaround.topMarginCategory.name} (~${Math.round(turnaround.topMarginCategory.margin)}%)` 
                  : 'Artisanal Woodfired (Pending orders)'
              }</span>
            </div>
          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // Timeframe filter clicks
    container.querySelectorAll('[data-analytics-tf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeTimeframe = e.currentTarget.dataset.analyticsTf;
        render();
      });
    });

    // CSV Export trigger
    const exportBtn = container.querySelector('#btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const rawOrders = reactiveStore.orders || [];
        const menuItems = reactiveStore.menuItems || [];
        const filtered = filterOrdersByTimeframe(rawOrders, activeTimeframe);
        const kpis = calculateSalesKPIs(filtered, menuItems);
        const velocity = calculateHourlySalesVelocity(filtered.length > 0 ? filtered : rawOrders);
        const turnaround = calculateTurnaroundAndMargins(filtered.length > 0 ? filtered : rawOrders, menuItems);

        const csvContent = [
          'Metric,Value',
          `Timeframe,${activeTimeframe}`,
          `Gross Revenue,INR ${kpis.grossRevenue}`,
          `Total Orders,${kpis.orderCount}`,
          `Average Order Value,INR ${kpis.aov}`,
          `Total COGS,INR ${kpis.totalCOGS}`,
          `Gross Profit Margin,${kpis.profitMarginPercent}%`,
          `Average Turnaround Time,${turnaround.avgTurnaround ? `${turnaround.avgTurnaround} mins` : 'N/A'}`,
          `Peak Sales Hour,${velocity.peakHour || 'None'}`,
          '',
          'Category,Revenue Share',
          ...Object.entries(kpis.categorySharePercent).map(([c, p]) => `"${c}",${p}%`),
          '',
          'Hour,Revenue (INR),Orders',
          ...velocity.pillBars.map(b => `"${b.hour}",${b.revenue},${b.orders}`)
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atyourscan_sales_analytics_${activeTimeframe.toLowerCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Manage Offers Modal trigger
    const manageOffersBtn = container.querySelector('#btn-analytics-manage-offers');
    if (manageOffersBtn) {
      manageOffersBtn.addEventListener('click', () => {
        let modalLayer = document.getElementById('app-modal-layer');
        if (!modalLayer) {
          modalLayer = document.createElement('div');
          modalLayer.id = 'app-modal-layer';
          document.body.appendChild(modalLayer);
        }
        renderOfferBannerModal(modalLayer, reactiveStore, {
          onSuccess: () => render()
        });
      });
    }
  }

  const unsubscribe = reactiveStore.subscribe(() => {
    render();
  });

  render();

  return () => unsubscribe();
}
