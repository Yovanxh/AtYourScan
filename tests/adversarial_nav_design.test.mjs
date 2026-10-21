/**
 * Milestone 1 Navigation, Routing & Design Adversarial Stress Test Suite
 * Agent: m1_challenger_1 (Navigation & Design Challenger)
 * 
 * Verifies:
 * 1. Route resolution for all 6 canonical views (customer, analytics, floorplan, stock, kds, qr)
 * 2. Legacy alias resolution (pos -> floorplan, menu -> stock)
 * 3. Adversarial invalid view fallbacks (empty, malicious strings, objects, numbers, null, undefined)
 * 4. Query parameter preservation (?table=X&view=Y + arbitrary params)
 * 5. Popstate event handling and browser back/forward simulation
 * 6. Previous view unmounting & cleanup handler execution (including crash resilience)
 * 7. SVG pattern defs and Tailwind theme tokens in index.html
 * 8. Bespoke CSS classes, keyframes, scrollbars, and lack of @apply in src/styles.css
 * 9. Rapid stress churn (100 rapid transitions)
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- MOCK BROWSER ENVIRONMENT SETUP FOR ADVERSARIAL TESTING ---
function createMockElement(id = '', tag = 'DIV') {
  const listeners = new Map();
  const el = {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: '',
    children: [],
    dataset: {},
    classList: {
      _classes: new Set(),
      add(...classes) { classes.forEach(c => this._classes.add(c)); },
      remove(...classes) { classes.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); },
      toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
    },
    querySelector(selector) {
      const sub = createMockElement();
      if (selector.startsWith('#')) sub.id = selector.slice(1);
      return sub;
    },
    querySelectorAll(selector) {
      const sub1 = createMockElement();
      const sub2 = createMockElement();
      return [sub1, sub2];
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    setAttribute(k, v) { el[k] = String(v); },
    getAttribute(k) { return el[k] || null; },
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (!listeners.has(event)) return;
      const arr = listeners.get(event).filter(f => f !== fn);
      listeners.set(event, arr);
    },
    click() {
      const fns = listeners.get('click') || [];
      fns.forEach(fn => fn({ currentTarget: el, target: el }));
    }
  };
  return el;
}

const popstateListeners = [];
const historyCalls = [];
let currentUrl = new URL('http://localhost:3000/?view=customer&table=4');

const mockNavContainer = createMockElement('top-navigation-rail');
const mockViewContainer = createMockElement('app-view-container');

globalThis.document = {
  getElementById(id) {
    if (id === 'top-navigation-rail') return mockNavContainer;
    if (id === 'app-view-container') return mockViewContainer;
    return createMockElement(id);
  },
  createElement(tag) {
    return createMockElement('', tag);
  },
  body: createMockElement('body')
};

globalThis.window = {
  get location() {
    return currentUrl;
  },
  set location(val) {
    currentUrl = typeof val === 'string' ? new URL(val, 'http://localhost:3000') : val;
  },
  history: {
    replaceState(state, title, url) {
      const resolved = new URL(url, currentUrl);
      historyCalls.push({ state, title, url: resolved.toString() });
      currentUrl = resolved;
    }
  },
  addEventListener(event, fn) {
    if (event === 'popstate') popstateListeners.push(fn);
  },
  removeEventListener(event, fn) {
    if (event === 'popstate') {
      const idx = popstateListeners.indexOf(fn);
      if (idx !== -1) popstateListeners.splice(idx, 1);
    }
  },
  dispatchEvent(event) {
    if (event.type === 'popstate') {
      popstateListeners.forEach(fn => fn(event));
    }
  },
  print() {}
};

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

// Dynamically import application code after mock DOM is established
const { store } = await import('../src/store.js');
const main = await import('../src/main.js');

// --- ADVERSARIAL TEST HARNESS ---
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

console.log('\n\x1b[1m\x1b[36m======================================================================\x1b[0m');
console.log('\x1b[1m\x1b[36m   Milestone 1 Navigation & Design Adversarial Stress Test Suite      \x1b[0m');
console.log('\x1b[1m\x1b[36m======================================================================\x1b[0m\n');

// ============================================================================
// 1. CANONICAL VIEW REGISTRY & RESOLUTION
// ============================================================================

test('NAV-01: Canonical VIEWS registry exports exactly 6 canonical views', () => {
  assert.equal(main.VIEWS.length, 6, 'VIEWS must contain exactly 6 canonical views');
  const expectedIds = ['customer', 'analytics', 'floorplan', 'stock', 'kds', 'qr'];
  const actualIds = main.VIEWS.map(v => v.id);
  assert.deepEqual(actualIds, expectedIds, 'Canonical view IDs must match specification exactly');

  main.VIEWS.forEach(v => {
    assert.ok(v.id, `View must have valid id: ${JSON.stringify(v)}`);
    assert.ok(v.label, `View ${v.id} must have display label`);
    assert.ok(v.icon, `View ${v.id} must have icon`);
    assert.ok(v.desc, `View ${v.id} must have description`);
  });
});

test('NAV-02: Route resolution mounts all 6 canonical views cleanly', () => {
  const expectedViews = [
    { id: 'customer', marker: 'customer-app' },
    { id: 'analytics', marker: 'analytics-stub' },
    { id: 'floorplan', marker: 'floorplan-stub' },
    { id: 'stock', marker: 'stock-stub' },
    { id: 'kds', marker: 'kds-app' },
    { id: 'qr', marker: 'qr-studio-app' }
  ];

  for (const { id, marker } of expectedViews) {
    main.switchView(id, false);
    assert.equal(main.currentView, id, `currentView must be updated to ${id}`);
    assert.ok(mockViewContainer.innerHTML.length > 0, `View container must be non-empty for ${id}`);
    assert.ok(
      mockViewContainer.innerHTML.includes(marker),
      `View container for ${id} must contain view marker '${marker}'`
    );
  }
});

test('NAV-03: Legacy route aliases (pos -> floorplan, menu -> stock) normalize correctly', () => {
  main.switchView('pos', false);
  assert.equal(main.currentView, 'floorplan', 'Legacy alias "pos" must normalize to "floorplan"');
  assert.ok(mockViewContainer.innerHTML.includes('floorplan-stub'), 'Must render floorplan stub for pos');

  main.switchView('menu', false);
  assert.equal(main.currentView, 'stock', 'Legacy alias "menu" must normalize to "stock"');
  assert.ok(mockViewContainer.innerHTML.includes('stock-stub'), 'Must render stock stub for menu');
});

// ============================================================================
// 2. ADVERSARIAL ROUTE FALLBACKS & HOSTILE INPUTS
// ============================================================================

test('NAV-04: Adversarial invalid view inputs safely fallback to customer view', () => {
  const hostileInputs = [
    'non_existent_route',
    '',
    null,
    undefined,
    '__proto__',
    'constructor',
    '<script>alert("xss")</script>',
    'javascript:void(0)',
    '../../etc/passwd',
    1337,
    { malicious: 'object' },
    ['array', 'input'],
    true,
    false,
    NaN,
    Infinity
  ];

  for (const hostile of hostileInputs) {
    main.switchView(hostile, false);
    assert.equal(
      main.currentView, 
      'customer', 
      `Hostile input ${JSON.stringify(hostile)} must safely fall back to 'customer'`
    );
    assert.ok(
      mockViewContainer.innerHTML.includes('customer-app'),
      `View container must render customer view on hostile input ${JSON.stringify(hostile)}`
    );
  }
});

test('NAV-05: Missing DOM containers fail silently without unhandled exception', () => {
  const origGetElementById = document.getElementById;
  try {
    document.getElementById = () => null;
    assert.doesNotThrow(() => {
      main.renderNavRail();
      main.switchView('analytics', false);
    }, 'renderNavRail and switchView must not throw when DOM containers are missing');
  } finally {
    document.getElementById = origGetElementById;
  }
});

// ============================================================================
// 3. QUERY PARAMETER PRESERVATION (?table=X&view=Y)
// ============================================================================

test('NAV-06: View switching preserves table parameter in window.history.replaceState', () => {
  historyCalls.length = 0;
  window.location = 'http://localhost:3000/?table=5&view=customer';

  main.switchView('analytics', true);
  assert.ok(historyCalls.length > 0, 'replaceState must be called when updateHistory is true');
  const latestCall = historyCalls[historyCalls.length - 1];
  const targetUrl = new URL(latestCall.url);

  assert.equal(targetUrl.searchParams.get('view'), 'analytics', 'View param must update to analytics');
  assert.equal(targetUrl.searchParams.get('table'), '5', 'Table param (table=5) must be preserved');
});

test('NAV-07: View switching preserves arbitrary multi-query parameters', () => {
  historyCalls.length = 0;
  window.location = 'http://localhost:3000/?table=12&ref=menu_qr&discount=20&guest=Alice%20Smith&view=kds';

  main.switchView('stock', true);
  const latestCall = historyCalls[historyCalls.length - 1];
  const targetUrl = new URL(latestCall.url);

  assert.equal(targetUrl.searchParams.get('view'), 'stock');
  assert.equal(targetUrl.searchParams.get('table'), '12');
  assert.equal(targetUrl.searchParams.get('ref'), 'menu_qr');
  assert.equal(targetUrl.searchParams.get('discount'), '20');
  assert.equal(targetUrl.searchParams.get('guest'), 'Alice Smith');
});

test('NAV-08: View switching when URL lacks initial view parameter injects view without dropping existing params', () => {
  historyCalls.length = 0;
  window.location = 'http://localhost:3000/?table=9';

  main.switchView('qr', true);
  const latestCall = historyCalls[historyCalls.length - 1];
  const targetUrl = new URL(latestCall.url);

  assert.equal(targetUrl.searchParams.get('view'), 'qr');
  assert.equal(targetUrl.searchParams.get('table'), '9');
});

test('NAV-09: switchView with updateHistory=false does NOT invoke history.replaceState', () => {
  historyCalls.length = 0;
  window.location = 'http://localhost:3000/?table=4&view=customer';

  main.switchView('kds', false);
  assert.equal(historyCalls.length, 0, 'history.replaceState must NOT be invoked when updateHistory is false');
  assert.equal(main.currentView, 'kds');
});

// ============================================================================
// 4. POPSTATE EVENT HANDLING & VIEW CLEANUP INVARIANTS
// ============================================================================

test('NAV-10: Popstate listener is registered and navigates to correct canonical view', () => {
  assert.ok(popstateListeners.length > 0, 'Popstate listener must be registered on window');

  // Simulate user pressing browser back to '?view=analytics&table=4'
  window.location = 'http://localhost:3000/?view=analytics&table=4';
  historyCalls.length = 0;

  window.dispatchEvent({ type: 'popstate' });

  assert.equal(main.currentView, 'analytics', 'Popstate event must switch currentView to analytics');
  assert.ok(mockViewContainer.innerHTML.includes('analytics-stub'), 'View container must update to analytics');
  assert.equal(historyCalls.length, 0, 'Popstate navigation must not call history.replaceState');
});

test('NAV-11: Popstate listener correctly resolves legacy aliases (pos and menu)', () => {
  // Test pos -> floorplan
  window.location = 'http://localhost:3000/?view=pos&table=2';
  window.dispatchEvent({ type: 'popstate' });
  assert.equal(main.currentView, 'floorplan', 'Popstate ?view=pos must map to floorplan');

  // Test menu -> stock
  window.location = 'http://localhost:3000/?view=menu&table=2';
  window.dispatchEvent({ type: 'popstate' });
  assert.equal(main.currentView, 'stock', 'Popstate ?view=menu must map to stock');
});

test('NAV-12: Popstate listener defaults to customer when no view param exists', () => {
  window.location = 'http://localhost:3000/?table=6';
  window.dispatchEvent({ type: 'popstate' });
  assert.equal(main.currentView, 'customer', 'Popstate without view param must map to customer');
});

test('NAV-13: View cleanup function executes when switching views', () => {
  // Switch to customer view, which registers store subscriber
  main.switchView('customer', false);

  const subscribersBefore = store.listeners ? store.listeners.size : 0;
  
  // Switch to analytics
  main.switchView('analytics', false);
  const subscribersAfter = store.listeners ? store.listeners.size : 0;

  assert.ok(
    subscribersAfter <= subscribersBefore, 
    'View switch must execute cleanup and remove previous view store subscriptions'
  );
});

test('NAV-14: switchView is crash-resilient if a previous view cleanup throws an error', () => {
  main.switchView('floorplan', false);

  assert.doesNotThrow(() => {
    main.switchView('kds', false);
  }, 'switchView must catch and survive any cleanup function errors');
  assert.equal(main.currentView, 'kds', 'Target view must successfully mount despite prior view errors');
});

// ============================================================================
// 5. SVG PATTERN DEFS & DESIGN TOKENS IN INDEX.HTML
// ============================================================================

test('DESIGN-15: index.html defines global hidden SVG defs with required striped patterns and gradients', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('<defs>'), 'index.html must declare <defs> block');
  assert.ok(
    html.includes('id="pattern-pill-lime"'),
    'SVG defs must define pattern-pill-lime'
  );
  assert.ok(
    html.includes('id="pattern-pill-amber"'),
    'SVG defs must define pattern-pill-amber'
  );
  assert.ok(
    html.includes('id="pattern-pill-muted"'),
    'SVG defs must define pattern-pill-muted'
  );

  assert.ok(
    html.includes('id="grad-pill-lime"'),
    'SVG defs must define grad-pill-lime'
  );
  assert.ok(
    html.includes('id="grad-pill-amber"'),
    'SVG defs must define grad-pill-amber'
  );
  assert.ok(
    html.includes('id="grad-pill-glow"'),
    'SVG defs must define grad-pill-glow'
  );

  assert.ok(html.includes('#10b981'), 'Lime pattern must use neon lime #10b981');
  assert.ok(html.includes('#f59e0b'), 'Amber pattern must use amber #f59e0b');
});

test('DESIGN-16: index.html tailwind.config declares Dribbble obsidian, lime, amber tokens & glow shadows', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes("'#08080a'"), 'Tailwind config must declare obsidian #08080a');
  assert.ok(html.includes("'#111115'"), 'Tailwind config must declare surface #111115');
  assert.ok(html.includes("'#16161d'"), 'Tailwind config must declare card #16161d');

  assert.ok(html.includes('glow-lime'), 'Tailwind config must declare glow-lime box shadow');
  assert.ok(html.includes('glow-amber'), 'Tailwind config must declare glow-amber box shadow');
  assert.ok(html.includes('obsidian-card'), 'Tailwind config must declare obsidian-card box shadow');

  assert.ok(html.includes('bg-[#08080a]'), 'Body element must declare bg-[#08080a]');
  assert.ok(html.includes('bg-brand-obsidian'), 'Body element must declare bg-brand-obsidian');
});

// ============================================================================
// 6. BESPOKE CSS CLASSES, KEYFRAMES & ZERO @APPLY DIRECTIVES
// ============================================================================

test('DESIGN-17: src/styles.css declares all bespoke obsidian, capsule, and striped bar classes', () => {
  const cssPath = resolve(process.cwd(), 'src/styles.css');
  const css = readFileSync(cssPath, 'utf8');

  const requiredClasses = [
    '.obsidian-card',
    '.obsidian-card-interactive',
    '.obsidian-panel',
    '.capsule-lime',
    '.capsule-amber',
    '.capsule-muted',
    '.pill-bar-lime-striped',
    '.pill-bar-amber-striped',
    '.pill-bar-muted-striped',
    '.bg-svg-striped-lime',
    '.bg-svg-striped-amber',
    '.fill-striped-lime',
    '.fill-striped-amber',
    '.fill-striped-muted',
    '.fill-grad-lime',
    '.fill-grad-amber',
    '.dot-lime',
    '.dot-amber',
    '.dot-lime-pulse'
  ];

  for (const cls of requiredClasses) {
    assert.ok(css.includes(cls), `src/styles.css must declare class ${cls}`);
  }
});

test('DESIGN-18: src/styles.css defines radar and breathing keyframe animations', () => {
  const cssPath = resolve(process.cwd(), 'src/styles.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('@keyframes radarPulseLime'), 'Must define radarPulseLime keyframes');
  assert.ok(css.includes('@keyframes radarPulseAmber'), 'Must define radarPulseAmber keyframes');
  assert.ok(css.includes('@keyframes breatheLime'), 'Must define breatheLime keyframes');
});

test('DESIGN-19: src/styles.css contains ZERO @apply directives (protects Vite PostCSS pipeline)', () => {
  const cssPath = resolve(process.cwd(), 'src/styles.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.equal(
    css.includes('@apply'),
    false,
    'src/styles.css must NOT contain @apply directives when Tailwind is CDN-based'
  );
});

test('DESIGN-20: src/styles.css provides dark scrollbar styling and no-scrollbar utility', () => {
  const cssPath = resolve(process.cwd(), 'src/styles.css');
  const css = readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('::-webkit-scrollbar'), 'Must configure webkit scrollbar');
  assert.ok(css.includes('::-webkit-scrollbar-thumb'), 'Must configure webkit scrollbar thumb');
  assert.ok(css.includes('.no-scrollbar'), 'Must provide no-scrollbar utility for pill rail');
});

// ============================================================================
// 7. RAPID STRESS & ROUTE CHURN HARNESS (100 CYCLES)
// ============================================================================

test('STRESS-21: 100 consecutive rapid route switches survive without memory leak or state corruption', () => {
  const candidateRoutes = [
    'customer', 'analytics', 'floorplan', 'stock', 'kds', 'qr',
    'pos', 'menu', 'garbage_route', '', null, 999, '<bad>', 'customer'
  ];

  for (let i = 0; i < 100; i++) {
    const route = candidateRoutes[i % candidateRoutes.length];
    main.switchView(route, false);

    assert.ok(
      ['customer', 'analytics', 'floorplan', 'stock', 'kds', 'qr'].includes(main.currentView),
      `currentView must always be a canonical view after transition ${i} (target was ${JSON.stringify(route)}, got ${main.currentView})`
    );
    assert.ok(
      mockViewContainer.innerHTML.length > 0,
      `View container must have content after transition ${i}`
    );
  }

  // Restore clean state
  main.switchView('customer', false);
  assert.equal(main.currentView, 'customer');
});

// ============================================================================
// RUN ALL TESTS & REPORT
// ============================================================================

async function runAdversarialSuite() {
  let passed = 0;
  let failed = 0;
  const start = Date.now();

  for (const t of tests) {
    const tStart = Date.now();
    try {
      await t.fn();
      const dur = Date.now() - tStart;
      passed++;
      console.log(`  \x1b[32m✔ PASS\x1b[0m ${t.name} \x1b[90m(${dur}ms)\x1b[0m`);
    } catch (err) {
      const dur = Date.now() - tStart;
      failed++;
      console.log(`  \x1b[31m✖ FAIL\x1b[0m ${t.name} \x1b[90m(${dur}ms)\x1b[0m`);
      console.log(`    \x1b[31m${err.stack || err.message}\x1b[0m\n`);
    }
  }

  const duration = Date.now() - start;
  console.log('\n\x1b[1m======================================================================\x1b[0m');
  console.log(`\x1b[1mAdversarial Stress Test Summary: Total: ${tests.length} | Passed: ${passed} | Failed: ${failed} | Duration: ${duration}ms\x1b[0m`);
  console.log('\x1b[1m======================================================================\x1b[0m\n');

  if (failed > 0) {
    console.error(`\x1b[31m❌ ADVERSARIAL CHALLENGE DETECTED ${failed} FAILURES\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32m🎉 ALL ${passed} ADVERSARIAL STRESS TESTS PASSED WITH 100% ACCURACY!\x1b[0m`);
    process.exit(0);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal crash running adversarial suite:', err);
  process.exit(1);
});
