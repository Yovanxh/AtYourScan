/**
 * AtYourScan Test Helpers & Authoritative Reference Engines
 * Reference derivations based on PROJECT.md and ORIGINAL_REQUEST.md.
 */

import assert from 'node:assert/strict';

// --- MOCK ENVIRONMENT SETUP FOR NODE.JS RUNTIME ---
export function setupTestEnvironment() {
  globalThis.IS_TEST_ENV = true;
  if (typeof process !== 'undefined' && process.env) {
    process.env.NODE_ENV = 'test';
  }
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
      _data: store,
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
      clear() { store.clear(); }
    };
  }

  if (!globalThis.KeyboardEvent) {
    globalThis.KeyboardEvent = class KeyboardEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.key = init.key || '';
        this.code = init.code || '';
        this.defaultPrevented = false;
      }
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
  }

  if (!globalThis.window) {
    const windowListeners = new Map();
    globalThis.window = {
      location: {
        href: 'http://localhost:3000/?view=customer&table=4',
        search: '?view=customer&table=4',
        origin: 'http://localhost:3000',
        pathname: '/',
        toString() { return this.href || 'http://localhost:3000/'; }
      },
      history: {
        replaceState: () => {}
      },
      addEventListener: (type, handler) => {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(handler);
      },
      removeEventListener: (type, handler) => {
        if (windowListeners.has(type)) {
          const list = windowListeners.get(type).filter(h => h !== handler);
          windowListeners.set(type, list);
        }
      },
      dispatchEvent: (event) => {
        const handlers = windowListeners.get(event.type) || [];
        handlers.forEach(h => h(event));
        return true;
      }
    };
  }

  if (!globalThis.document) {
    const elementMap = new Map();
    globalThis.document = {
      getElementById(id) {
        if (!elementMap.has(id)) {
          elementMap.set(id, {
            id,
            innerHTML: '',
            children: [],
            classList: {
              add: () => {},
              remove: () => {},
              contains: () => false
            },
            querySelector: (selector) => {
              return {
                value: '',
                dataset: {},
                classList: { add: () => {}, remove: () => {}, contains: () => false },
                addEventListener: () => {},
                dispatchEvent: () => {},
                click: () => {}
              };
            },
            querySelectorAll: () => [],
            appendChild: () => {},
            addEventListener: () => {}
          });
        }
        return elementMap.get(id);
      },
      createElement(tag) {
        const listeners = new Map();
        let _innerHTML = '';
        const elementCache = new Map();
        const el = {
          tagName: tag.toUpperCase(),
          className: '',
          get innerHTML() { return _innerHTML; },
          set innerHTML(val) { 
            _innerHTML = String(val);
            elementCache.clear();
          },
          children: [],
          appendChild: (c) => {
            el.children.push(c);
            if (c) _innerHTML += (c.innerHTML || '');
          },
          setAttribute: () => {},
          addEventListener: () => {},
          querySelector: (selector) => {
            if (selector.startsWith('#')) {
              const id = selector.slice(1);
              if (!_innerHTML.includes(`id="${id}"`) && !_innerHTML.includes(`id='${id}'`)) {
                return null;
              }
            }
            if (!elementCache.has(selector)) {
              const targetEl = {
                value: '',
                dataset: {},
                classList: { add: () => {}, remove: () => {}, contains: () => false },
                addEventListener: (event, handler) => {
                  if (!listeners.has(selector + ':' + event)) listeners.set(selector + ':' + event, []);
                  listeners.get(selector + ':' + event).push(handler);
                },
                dispatchEvent: (event) => {
                  if (event) {
                    try {
                      Object.defineProperty(event, 'target', { value: targetEl, configurable: true });
                      Object.defineProperty(event, 'currentTarget', { value: targetEl, configurable: true });
                    } catch {}
                  }
                  const handlers = listeners.get(selector + ':' + event.type) || [];
                  handlers.forEach(h => h(event));
                },
                click: () => {
                  const event = { type: 'click', target: targetEl, currentTarget: targetEl };
                  const handlers = listeners.get(selector + ':click') || [];
                  handlers.forEach(h => h(event));
                }
              };
              elementCache.set(selector, targetEl);
            }
            return elementCache.get(selector);
          },
          querySelectorAll: (selector) => []
        };
        return el;
      }
    };
  }

  if (!globalThis.document.body) {
    globalThis.document.body = globalThis.document.createElement('body');
  }
}

// Ensure environment is initialized immediately
setupTestEnvironment();

// --- TEST SUITE HARNESS ---
export function createTestSuite(suiteName) {
  const tests = [];
  
  function test(name, fn) {
    tests.push({ name, fn });
  }

  async function run() {
    const results = {
      name: suiteName,
      total: tests.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      details: []
    };

    const startTime = Date.now();
    console.log(`\n\x1b[36m=== Running Suite: ${suiteName} (${tests.length} tests) ===\x1b[0m`);

    for (const t of tests) {
      const testStart = Date.now();
      try {
        await t.fn();
        const duration = Date.now() - testStart;
        results.passed++;
        results.details.push({ name: t.name, status: 'PASS', durationMs: duration });
        console.log(`  \x1b[32m✔\x1b[0m ${t.name} \x1b[90m(${duration}ms)\x1b[0m`);
      } catch (err) {
        const duration = Date.now() - testStart;
        results.failed++;
        results.details.push({ name: t.name, status: 'FAIL', durationMs: duration, error: err.message, stack: err.stack });
        console.log(`  \x1b[31m✖\x1b[0m ${t.name} \x1b[90m(${duration}ms)\x1b[0m`);
        console.log(`    \x1b[31mError:\x1b[0m ${err.message}`);
      }
    }

    results.durationMs = Date.now() - startTime;
    return results;
  }

  return { test, run };
}

// --- AUTHORITATIVE REFERENCE ENGINES (Per PROJECT.md Specifications) ---

/**
 * Authoritative UPI Deep-Link URI Builder (RFC 3986 compliant)
 * Spec: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
 */
export function buildUPIDeepLink({ upiId, payeeName, amount, currency = 'INR', transactionNote = '' }) {
  if (!upiId) throw new Error('UPI ID (pa) is mandatory');
  if (amount === undefined || amount === null || Number(amount) < 0) {
    throw new Error('Valid non-negative amount (am) is mandatory');
  }

  const formattedAmount = (Math.round(Number(amount) * 100) / 100).toFixed(2);
  const params = new URLSearchParams();
  params.set('pa', upiId);
  if (payeeName) params.set('pn', payeeName);
  params.set('am', formattedAmount);
  params.set('cu', currency);
  if (transactionNote) params.set('tn', transactionNote);

  return `upi://pay?${params.toString()}`;
}

/**
 * Authoritative Bill Splitting Algorithm (Penny-Exact Invariant)
 * Guarantees sum(shares) === totalAmount exactly.
 */
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

  // Authoritative check
  const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 100);
  assert.equal(sum, total, 'Split penny invariant broken');
  return shares;
}

/**
 * Authoritative OCR Text / Invoice Line Parser
 * Extracts { name, quantity, unit_cost, total } from multi-line invoice strings.
 * Supports patterns:
 * - "10x Truffle Polenta Fries @ 140"
 * - "Burrata 5 Qty 180 Cost"
 * - "Awadhi Lamb Shank Rogan, Qty: 8, Rate: 320"
 */
export function parseInvoiceTextLines(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];

  for (const line of lines) {
    // Skip invoice metadata headers, footers, totals, taxes, slips, dates
    if (/^(invoice|supplier|date|total|grand|subtotal|tax|bill|gstin|receipt|slip|phone|time)/i.test(line)) {
      continue;
    }

    // Pattern 1: (\d+)\s*[xX*]\s*(.+?)(?:[@:]\s*(\d+(?:\.\d+)?))?$
    const match1 = line.match(/^(\d+)\s*[xX*]\s*([^@:,\d]+)(?:[@:]\s*(\d+(?:\.\d+)?))?/);
    if (match1) {
      const quantity = parseInt(match1[1], 10);
      const name = match1[2].trim();
      const unit_cost = match1[3] ? parseFloat(match1[3]) : 0;
      parsed.push({ name, quantity, unit_cost });
      continue;
    }

    // Pattern 2: (.+?)\s+(\d+)\s*(?:qty|units|pieces|nos)?\s*[@:]?\s*(\d+(?:\.\d+)?)?/i
    const match2 = line.match(/^([^,]+?)\s+(\d+)\s*(?:qty|units|pieces|nos)?\s*[@:]?\s*(\d+(?:\.\d+)?)?$/i);
    if (match2) {
      const name = match2[1].trim();
      const quantity = parseInt(match2[2], 10);
      const unit_cost = match2[3] ? parseFloat(match2[3]) : 0;
      parsed.push({ name, quantity, unit_cost });
      continue;
    }

    // Pattern 3: Key-Value style: Name: X, Qty: Y, Rate: Z
    const nameMatch = line.match(/name[:=\s]+([^,;]+)/i);
    const qtyMatch = line.match(/qty[:=\s]+(\d+)/i);
    const rateMatch = line.match(/(?:rate|cost|price)[:=\s]+(\d+(?:\.\d+)?)/i);
    if (nameMatch && qtyMatch) {
      parsed.push({
        name: nameMatch[1].trim(),
        quantity: parseInt(qtyMatch[1], 10),
        unit_cost: rateMatch ? parseFloat(rateMatch[1]) : 0
      });
      continue;
    }

    // Fallback: Valid non-metadata line contains an item name
    if (line.length > 2) {
      parsed.push({ name: line, quantity: 1, unit_cost: 0 });
    }
  }

  return parsed;
}

/**
 * Authoritative Sales KPIs & Margin Calculator
 * Calculates: Gross Revenue, COGS, Profit Margins, AOV, and Category Share
 */
export function calculateSalesKPIs(orders = [], menuItems = []) {
  const completedOrders = orders.filter(o => o.status === 'Completed' || o.payment_status === 'PAID');
  
  const grossRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const orderCount = completedOrders.length;
  const aov = orderCount > 0 ? Math.round((grossRevenue / orderCount) * 100) / 100 : 0;

  // Calculate COGS from ordered items
  let totalCOGS = 0;
  const categoryRevenue = {
    'Small Plates': 0,
    'Woodfired & Oven': 0,
    'Mains & Bowls': 0,
    'Artisanal Desserts': 0,
    'Craft Brews & Elixirs': 0
  };

  completedOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const catalogItem = menuItems.find(m => m.id === item.id || m.name === item.name);
      const unitCost = catalogItem?.unit_cost || (item.price ? Math.round(item.price * 0.36) : 0);
      const qty = item.quantity || 1;
      totalCOGS += unitCost * qty;

      const cat = catalogItem?.category || 'Small Plates';
      if (categoryRevenue[cat] !== undefined) {
        categoryRevenue[cat] += (item.price || 0) * qty;
      } else {
        categoryRevenue[cat] = (item.price || 0) * qty;
      }
    });
  });

  const grossProfit = Math.max(0, grossRevenue - totalCOGS);
  const profitMarginPercent = grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 1000) / 10 : 0;

  // Category shares
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
 * Timeframe Filter for Orders
 * Supports: 'TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'MONTH_TO_DATE'
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
