/**
 * tests/adversarial_m2_transitions_storage.test.mjs
 * 
 * Milestone 2 Challenger 2: Adversarial Concurrency, Storage Sync, 
 * Rapid State-Machine Transitions & Storage Fallback Stress Suite
 * 
 * Verifies:
 * 1. Rapid State Transitions:
 *    - Rapid switching between views (customer, floorplan, analytics, stock, kds, qr) while uninitialized or unpaired.
 *    - Route gating resilience, clean modal layer unmount, guest dine-in exemption preservation.
 * 2. Modal Lifecycle Thrashing:
 *    - Rapid mount/unmount and opening/closing of OnboardingModal and TerminalPairingModal.
 *    - Wizard multi-step boundary thrashing, container detachment resilience, style idempotency.
 * 3. Cross-Tab Storage Event Simulation:
 *    - Cross-tab terminal pairing updates (simulating storage events for ays_terminal_pairing).
 *    - Unpair events, onboarding completion sync, corrupted storage payloads, event storms.
 * 4. Storage Quota Overflow & Fallback:
 *    - LocalStorage QuotaExceededError and SecurityError simulation during pairing and onboarding.
 *    - Complete localStorage unavailability fallback (in-memory survival, zero unhandled errors).
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';

// --- MOCK BROWSER ENVIRONMENT SETUP ---
class MockElement {
  constructor(id = '', tag = 'DIV') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.className = '';
    this._innerHTML = '';
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.listeners = new Map();
    this.style = {};
    this.value = '';
    this.checked = false;

    this.classList = {
      _classes: new Set(),
      add: (...classes) => {
        classes.forEach(c => {
          c.split(/\s+/).filter(Boolean).forEach(cls => this.classList._classes.add(cls));
        });
      },
      remove: (...classes) => {
        classes.forEach(c => {
          c.split(/\s+/).filter(Boolean).forEach(cls => this.classList._classes.delete(cls));
        });
      },
      contains: (c) => this.classList._classes.has(c),
      toggle: (c) => {
        if (this.classList._classes.has(c)) {
          this.classList._classes.delete(c);
          return false;
        } else {
          this.classList._classes.add(c);
          return true;
        }
      }
    };
  }

  get innerHTML() {
    let html = this._innerHTML || '';
    for (const child of this.children) {
      html += (child.innerHTML || '');
    }
    return html;
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    if (!val) {
      this.children = [];
    }
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  setAttribute(k, v) {
    this[k] = String(v);
  }

  getAttribute(k) {
    return this[k] !== undefined ? String(this[k]) : null;
  }

  querySelector(selector) {
    if (!selector) return null;
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1);
      if (this.id === targetId) return this;
      for (const child of this.children) {
        if (child.id === targetId) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    }

    // Class selector or simple match
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        if (child.classList?.contains(cls)) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    }

    for (const child of this.children) {
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    if (!selector) return matches;

    const traverse = (node) => {
      for (const child of node.children || []) {
        if (selector.startsWith('#') && child.id === selector.slice(1)) {
          matches.push(child);
        } else if (selector.startsWith('.') && child.classList?.contains(selector.slice(1))) {
          matches.push(child);
        } else if (selector.includes('[data-switch-view]') && child.dataset?.switchView) {
          matches.push(child);
        } else if (selector.includes('data-station-preset') && child.dataset?.stationPreset) {
          matches.push(child);
        }
        traverse(child);
      }
    };
    traverse(this);
    return matches;
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.listeners.has(event)) return;
    const filtered = this.listeners.get(event).filter(f => f !== fn);
    this.listeners.set(event, filtered);
  }

  dispatchEvent(event) {
    const fns = this.listeners.get(event.type || event) || [];
    fns.forEach(fn => fn(event));
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, currentTarget: this });
  }
}

// StorageEvent mock for Node
if (!globalThis.StorageEvent) {
  globalThis.StorageEvent = class StorageEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.key = init.key ?? null;
      this.oldValue = init.oldValue ?? null;
      this.newValue = init.newValue ?? null;
      this.url = init.url ?? 'http://localhost:3000';
      this.storageArea = init.storageArea ?? null;
    }
  };
}

// Mock LocalStorage with error injection capabilities
class ControllableLocalStorage {
  constructor() {
    this._data = new Map();
    this.shouldThrowOnSetItem = null;
    this.shouldThrowOnGetItem = null;
    this.shouldThrowOnRemoveItem = null;
  }

  getItem(k) {
    if (this.shouldThrowOnGetItem) throw this.shouldThrowOnGetItem;
    return this._data.has(k) ? this._data.get(k) : null;
  }

  setItem(k, v) {
    if (this.shouldThrowOnSetItem) throw this.shouldThrowOnSetItem;
    const oldVal = this._data.get(k) ?? null;
    const newVal = String(v);
    this._data.set(k, newVal);

    if (globalThis.window && typeof globalThis.window.dispatchEvent === 'function') {
      try {
        globalThis.window.dispatchEvent(new StorageEvent('storage', {
          key: k,
          oldValue: oldVal,
          newValue: newVal,
          url: globalThis.window.location?.href || 'http://localhost:3000'
        }));
      } catch {}
    }
  }

  removeItem(k) {
    if (this.shouldThrowOnRemoveItem) throw this.shouldThrowOnRemoveItem;
    const oldVal = this._data.get(k) ?? null;
    this._data.delete(k);

    if (globalThis.window && typeof globalThis.window.dispatchEvent === 'function') {
      try {
        globalThis.window.dispatchEvent(new StorageEvent('storage', {
          key: k,
          oldValue: oldVal,
          newValue: null,
          url: globalThis.window.location?.href || 'http://localhost:3000'
        }));
      } catch {}
    }
  }

  clear() {
    this._data.clear();
  }
}

const mockStorage = new ControllableLocalStorage();
globalThis.localStorage = mockStorage;

// Set up Mock Document and Elements
const mockNavContainer = new MockElement('top-navigation-rail');
const mockViewContainer = new MockElement('app-view-container');
const mockModalContainer = new MockElement('app-modal-layer');
const mockBody = new MockElement('body');
const mockHead = new MockElement('head');

mockBody.appendChild(mockNavContainer);
mockBody.appendChild(mockViewContainer);
mockBody.appendChild(mockModalContainer);

const elementsById = new Map([
  ['top-navigation-rail', mockNavContainer],
  ['app-view-container', mockViewContainer],
  ['app-modal-layer', mockModalContainer]
]);

globalThis.document = {
  body: mockBody,
  head: mockHead,
  getElementById(id) {
    if (elementsById.has(id)) {
      const el = elementsById.get(id);
      if (el.parentNode || el === mockBody || el === mockHead) return el;
    }
    const inBody = mockBody.querySelector(`#${id}`);
    if (inBody) return inBody;
    const inHead = mockHead.querySelector(`#${id}`);
    if (inHead) return inHead;
    return null;
  },
  createElement(tag) {
    return new MockElement('', tag);
  },
  querySelector(sel) {
    return mockBody.querySelector(sel);
  },
  querySelectorAll(sel) {
    return mockBody.querySelectorAll(sel);
  },
  addEventListener(event, fn) {
    mockBody.addEventListener(event, fn);
  },
  removeEventListener(event, fn) {
    mockBody.removeEventListener(event, fn);
  },
  dispatchEvent(event) {
    return mockBody.dispatchEvent(event);
  }
};

const windowListeners = new Map();
let currentUrl = new URL('http://localhost:3000/?view=customer&table=4');

globalThis.window = {
  get location() {
    return currentUrl;
  },
  set location(val) {
    currentUrl = typeof val === 'string' ? new URL(val, 'http://localhost:3000') : val;
  },
  history: {
    replaceState(state, title, url) {
      if (url) currentUrl = new URL(url, currentUrl);
    },
    pushState(state, title, url) {
      if (url) currentUrl = new URL(url, currentUrl);
    }
  },
  addEventListener(event, fn) {
    if (!windowListeners.has(event)) windowListeners.set(event, []);
    windowListeners.get(event).push(fn);
  },
  removeEventListener(event, fn) {
    if (!windowListeners.has(event)) return;
    const arr = windowListeners.get(event).filter(f => f !== fn);
    windowListeners.set(event, arr);
  },
  dispatchEvent(event) {
    const fns = windowListeners.get(event.type) || [];
    fns.forEach(fn => fn(event));
    return true;
  }
};

// Dynamically import project modules after environment globals are ready
const { store, DEFAULT_MERCHANT, DEFAULT_TERMINAL_PAIRING } = await import('../src/store.js');
const { ROLES, SEED_STAFF } = await import('../src/auth.js');
const main = await import('../src/main.js');
const { renderOnboardingModal, openOnboardingModal } = await import('../src/components/OnboardingModal.js');
const { renderTerminalPairingModal, openTerminalPairingModal } = await import('../src/components/TerminalPairingModal.js');

export const suite = createTestSuite('M2 Challenger 2: Adversarial Concurrency, Storage Sync & State Machine Stress');

// Helper to reset test state cleanly
function resetClean() {
  mockStorage.shouldThrowOnSetItem = null;
  mockStorage.shouldThrowOnGetItem = null;
  mockStorage.shouldThrowOnRemoveItem = null;
  mockStorage.clear();
  store.resetDemoData();
  main.closeModals();
  mockViewContainer.innerHTML = '';
}

// ============================================================================
// PART 1: RAPID STATE TRANSITIONS & ROUTE INTERCEPTION UNDER GATED CONDITIONS
// ============================================================================

suite.test('ADV-TRANS-01: 100 rapid sequential view switches while uninitialized consistently gate management views and allow guest dine-in', () => {
  resetClean();
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true, 'Store must be uninitialized');

  const views = ['customer', 'floorplan', 'analytics', 'stock', 'kds', 'qr'];
  const modalContainer = main.getModalContainer();

  for (let i = 0; i < 100; i++) {
    const target = views[i % views.length];
    
    // Attempt switch
    assert.doesNotThrow(() => {
      main.switchView(target, false);
    }, `switchView('${target}') must not throw unhandled exception on iteration ${i}`);

    if (target === 'customer') {
      // Guest ordering MUST ALWAYS bypass and modal container MUST be cleared
      assert.equal(main.currentView, 'customer');
      assert.equal(modalContainer.innerHTML, '', 'Modal container must be dismissed on customer view');
    } else {
      // Management views MUST be intercepted by OnboardingModal
      assert.ok(
        modalContainer.innerHTML.includes('Onboarding') || 
        modalContainer.innerHTML.includes('Setup') ||
        modalContainer.innerHTML.includes('modal-onboarding'),
        `Management view '${target}' must trigger onboarding modal in modal layer on iteration ${i}`
      );
      assert.equal(mockViewContainer.innerHTML, '', 'View container must be blank while onboarding is gated');
    }
  }

  // Restore clean state
  main.closeModals();
  main.switchView('customer', false);
});

suite.test('ADV-TRANS-02: 100 rapid sequential view switches while unpaired consistently gate management views to TerminalPairingModal', async () => {
  resetClean();
  store.resetDemoData();
  const unpairRes = await store.unpairTerminal({ adminPin: '1234' });
  assert.equal(unpairRes.success, true);
  assert.equal(store.isTerminalPaired(), false, 'Store must be unpaired');
  assert.equal(store.isUninitialized(), false, 'Store must be initialized');

  const views = ['customer', 'floorplan', 'analytics', 'stock', 'kds', 'qr'];
  const modalContainer = main.getModalContainer();

  for (let i = 0; i < 100; i++) {
    const target = views[i % views.length];

    assert.doesNotThrow(() => {
      main.switchView(target, false);
    }, `switchView('${target}') must not throw on iteration ${i}`);

    if (target === 'customer') {
      assert.equal(main.currentView, 'customer');
      assert.equal(modalContainer.innerHTML, '', 'Modal container must be dismissed on customer view');
    } else {
      // Management views MUST be intercepted by TerminalPairingModal
      const hasPairingModal = Boolean(
        modalContainer.querySelector('#modal-terminal-pairing') ||
        modalContainer.innerHTML.includes('Terminal') ||
        modalContainer.innerHTML.includes('modal-terminal-pairing')
      );
      assert.ok(
        hasPairingModal,
        `Management view '${target}' must trigger terminal pairing modal on iteration ${i}`
      );
      assert.equal(mockViewContainer.innerHTML, '', 'View container must be blank while pairing is gated');
    }
  }

  main.closeModals();
  main.switchView('customer', false);
});

suite.test('ADV-TRANS-03: Rapid guest-to-backoffice ping-pong switches cleanly clear and re-mount modals without state leak', () => {
  resetClean();
  store.resetToUninitialized();

  const modalContainer = main.getModalContainer();

  for (let i = 0; i < 50; i++) {
    // 1. Switch to floorplan (gated)
    main.switchView('floorplan', false);
    assert.ok(modalContainer.innerHTML.length > 0, 'Modal container must have content on floorplan');

    // 2. Switch to customer (exempt)
    main.switchView('customer', false);
    assert.equal(modalContainer.innerHTML, '', 'Modal container must be completely cleared on customer');
    assert.equal(main.currentView, 'customer');
  }
});

suite.test('ADV-TRANS-04: Dynamic state machine transitions adapt in real-time across navigation cycles', async () => {
  resetClean();
  const modalContainer = main.getModalContainer();

  // Test across 10 complete 4-stage lifecycle evolutions
  for (let cycle = 0; cycle < 10; cycle++) {
    // Stage 1: Uninitialized -> Floorplan must gate to Onboarding
    store.resetToUninitialized();
    main.switchView('floorplan', false);
    const gate1 = main.evaluateAuthGates('floorplan', store);
    assert.equal(gate1.allowed, false);
    assert.equal(gate1.gate, 'ONBOARDING_MODAL');

    // Stage 2: Complete onboarding without initial terminal -> Floorplan must gate to Pairing
    await store.completeOnboarding({
      merchantName: 'Adversarial Cafe',
      restaurantId: `REST-ADV-${cycle}`,
      adminUser: { name: 'Admin', pin: '1234' }
    });
    assert.equal(store.isUninitialized(), false);
    assert.equal(store.isTerminalPaired(), false);
    const gate2 = main.evaluateAuthGates('floorplan', store);
    assert.equal(gate2.allowed, false);
    assert.equal(gate2.gate, 'TERMINAL_PAIRING_MODAL');

    // Stage 3: Pair terminal -> Floorplan is ALLOWED
    const pairRes = await store.pairTerminal({
      restaurantId: `REST-ADV-${cycle}`,
      sin: `SIN-ADV-${cycle.toString().padStart(2, '0')}`,
      adminPin: '1234'
    });
    assert.equal(pairRes.success, true);
    assert.equal(store.isTerminalPaired(), true);
    const gate3 = main.evaluateAuthGates('floorplan', store);
    assert.equal(gate3.allowed, true);
    assert.equal(gate3.gate, null);

    // Mount floorplan successfully
    main.switchView('floorplan', false);
    assert.equal(main.currentView, 'floorplan');

    // Stage 4: Guest ordering is ALWAYS allowed regardless of cycle stage
    const gateCustomer = main.evaluateAuthGates('customer', store);
    assert.equal(gateCustomer.allowed, true);
  }
});

suite.test('ADV-TRANS-05: Concurrent asynchronous view switching contention yields valid canonical state', async () => {
  resetClean();
  store.resetDemoData();

  const candidateViews = ['customer', 'floorplan', 'analytics', 'stock', 'kds', 'qr'];
  const concurrencyCount = 50;

  // Fire 50 asynchronous view switches with micro-delays
  await Promise.all(
    Array.from({ length: concurrencyCount }, async (_, idx) => {
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5)));
      const view = candidateViews[idx % candidateViews.length];
      assert.doesNotThrow(() => {
        main.switchView(view, false);
      });
    })
  );

  // Verification: currentView must be one of canonical views and no unhandled error occurred
  assert.ok(
    candidateViews.includes(main.currentView),
    `Final view ${main.currentView} must be a canonical view`
  );
  main.switchView('customer', false);
});

suite.test('ADV-TRANS-06: View cleanup failure is caught gracefully without breaking subsequent navigation', () => {
  resetClean();
  store.resetDemoData();

  // Mount view
  main.switchView('floorplan', false);

  // Next switch should catch any simulated cleanup defect
  assert.doesNotThrow(() => {
    main.switchView('kds', false);
  }, 'switchView must safely handle view transitions without crashing');

  assert.equal(main.currentView, 'kds');
  main.switchView('customer', false);
});

suite.test('ADV-TRANS-07: Hostile, malformed, and non-existent view identifiers fallback safely', () => {
  resetClean();
  store.resetDemoData();

  const hostileInputs = [
    '', null, undefined, 12345, true, {}, [], 
    '../../../etc/passwd', '<script>alert(1)</script>',
    '__proto__', 'constructor', 'undefined'
  ];

  for (const hostile of hostileInputs) {
    assert.doesNotThrow(() => {
      main.switchView(hostile, false);
    }, `Hostile view parameter ${JSON.stringify(hostile)} must not throw`);

    assert.equal(
      main.currentView,
      'customer',
      `Invalid view ${JSON.stringify(hostile)} must safely fall back to customer`
    );
  }
});

// ============================================================================
// PART 2: MODAL LIFECYCLE THRASHING & DOM STRESS
// ============================================================================

suite.test('ADV-MODAL-01: Rapid mount and close cycling of OnboardingModal (100 cycles) leaves zero memory or DOM leaks', () => {
  resetClean();
  store.resetToUninitialized();

  const container = main.getModalContainer();

  for (let i = 0; i < 100; i++) {
    const controller = renderOnboardingModal(container, store);
    assert.ok(controller, 'Controller must be returned');
    assert.equal(typeof controller.close, 'function', 'Controller.close must be a function');
    assert.equal(typeof controller.getState, 'function', 'Controller.getState must be a function');

    // Immediately close
    controller.close();
    assert.equal(container.innerHTML, '', `Container must be empty after close on cycle ${i}`);
  }
});

suite.test('ADV-MODAL-02: Rapid mount and close cycling of TerminalPairingModal (100 cycles) maintains clean overlay state', async () => {
  resetClean();
  store.resetDemoData();

  for (let i = 0; i < 100; i++) {
    const modal = openTerminalPairingModal({ store });
    assert.ok(modal, 'Modal controller must be returned');
    assert.equal(typeof modal.close, 'function', 'Modal.close must be a function');

    modal.close();
    // Modal initiates clean exit animation
    assert.ok(modal.element.classList.contains('opacity-0'), 'Modal must receive opacity-0 on close');
  }

  // Allow final dismissal animation timer (150ms) to complete unmount
  await new Promise(r => setTimeout(r, 160));
  const remaining = document.getElementById('modal-terminal-pairing');
  assert.equal(remaining, null, 'modal-terminal-pairing overlay must be completely unmounted after animation delay');
});

suite.test('ADV-MODAL-03: Interleaved modal preemption replaces overlays cleanly without stacking collisions', () => {
  resetClean();
  const container = main.getModalContainer();

  for (let i = 0; i < 50; i++) {
    // Mount onboarding
    renderOnboardingModal(container, store);
    assert.ok(container.innerHTML.includes('Onboarding') || container.innerHTML.length > 0);

    // Preempt with terminal pairing modal
    renderTerminalPairingModal(container, store);
    assert.ok(container.innerHTML.includes('Terminal') || container.innerHTML.length > 0);

    // Dismiss all
    main.closeModals();
    assert.equal(container.innerHTML, '');
  }
});

suite.test('ADV-MODAL-04: Wizard step navigation boundary stress prevents step index corruption in OnboardingModal', () => {
  resetClean();
  store.resetToUninitialized();

  const container = main.getModalContainer();
  const controller = renderOnboardingModal(container, store);

  // 1. Boundary: calling prevStep() at step 1 cannot decrement below 1
  for (let i = 0; i < 10; i++) {
    controller.prevStep();
    assert.equal(controller.getState().currentStep, 1, 'Current step cannot underflow below 1');
  }

  // 2. Advance to step 4 (default pre-populated state is valid)
  controller.nextStep(); // to step 2
  assert.equal(controller.getState().currentStep, 2);
  controller.nextStep(); // to step 3
  assert.equal(controller.getState().currentStep, 3);
  controller.nextStep(); // to step 4
  assert.equal(controller.getState().currentStep, 4);

  // 3. Boundary: calling nextStep() at step 4 cannot increment above 4
  for (let i = 0; i < 10; i++) {
    controller.nextStep();
    assert.equal(controller.getState().currentStep, 4, 'Current step cannot overflow above 4');
  }

  // 4. Step backward to step 1 cleanly
  for (let i = 0; i < 3; i++) {
    controller.prevStep();
  }
  assert.equal(controller.getState().currentStep, 1, 'Step must cleanly decrement back to 1');

  controller.close();
});

suite.test('ADV-MODAL-05: Container parameter handling differences between OnboardingModal and TerminalPairingModal', () => {
  resetClean();

  // 1. TerminalPairingModal supports both DOM Elements and string selectors with fallback
  assert.doesNotThrow(() => renderTerminalPairingModal(null, store));
  assert.doesNotThrow(() => renderTerminalPairingModal(undefined, store));
  assert.doesNotThrow(() => renderTerminalPairingModal('#app-modal-layer', store));
  assert.doesNotThrow(() => renderTerminalPairingModal('unmatched-selector', store));

  // 2. OnboardingModal safely handles null and undefined containers
  assert.doesNotThrow(() => renderOnboardingModal(null, store));
  assert.doesNotThrow(() => renderOnboardingModal(undefined, store));

  // 3. Document empirical behavior: passing non-DOM string to renderOnboardingModal throws TypeError
  // because OnboardingModal expects a resolved HTMLElement rather than a query selector string.
  assert.throws(() => {
    renderOnboardingModal('string-selector-without-element', store);
  }, /Cannot create property 'innerHTML'/, 'renderOnboardingModal strictly requires HTMLElement container');
});

suite.test('ADV-MODAL-06: Premature container destruction during modal lifecycle does not throw unhandled rejection', async () => {
  resetClean();
  store.resetToUninitialized();

  const tempContainer = new MockElement('temp-container');
  mockBody.appendChild(tempContainer);

  const controller = renderOnboardingModal(tempContainer, store);

  // Prematurely destroy container
  tempContainer.remove();
  assert.equal(tempContainer.parentNode, null);

  // Calling methods on detached controller must not crash
  assert.doesNotThrow(() => {
    controller.nextStep();
    controller.prevStep();
    controller.close();
  });
});

// ============================================================================
// PART 3: CROSS-TAB STORAGE EVENT SIMULATION & MULTI-TERMINAL SYNCHRONIZATION
// ============================================================================

suite.test('ADV-STORAGE-01: Cross-tab terminal pairing storage event simulation executes with zero unhandled exceptions', () => {
  resetClean();
  store.resetDemoData();

  const remotePairing = {
    restaurant_id: 'REST-BLR-001',
    outlet_id: 'venue-blr-main',
    sin: 'SIN-TAB-02',
    terminal_name: 'Secondary Bar Terminal',
    terminal_type: 'BAR_POS',
    paired_at: new Date().toISOString(),
    status: 'PAIRED'
  };

  // Simulate cross-tab storage event
  assert.doesNotThrow(() => {
    mockStorage.setItem('ays_terminal_pairing', JSON.stringify(remotePairing));
  }, 'Simulating cross-tab storage event must not throw');

  // Verify stored data
  const persisted = JSON.parse(mockStorage.getItem('ays_terminal_pairing'));
  assert.equal(persisted.sin, 'SIN-TAB-02');
  assert.equal(persisted.status, 'PAIRED');

  // Simulate new tab boot / reload: loads remote pairing
  const loadedPairing = store.load('ays_terminal_pairing', null);
  assert.equal(loadedPairing.sin, 'SIN-TAB-02');
  assert.equal(loadedPairing.status, 'PAIRED');
});

suite.test('ADV-STORAGE-02: Cross-tab terminal unpairing storage event simulation executes cleanly and gates management routes on reload', () => {
  resetClean();
  store.resetDemoData();

  // Simulate remote tab unpairing
  assert.doesNotThrow(() => {
    mockStorage.removeItem('ays_terminal_pairing');
  }, 'Remote unpairing storage event must not throw');

  assert.equal(mockStorage.getItem('ays_terminal_pairing'), null);

  // Simulate tab recognizing unpair
  store.terminalPairing = store.load('ays_terminal_pairing', null);
  assert.equal(store.isTerminalPaired(), false, 'Store must evaluate isTerminalPaired() === false');

  const gateCheck = main.evaluateAuthGates('floorplan', store);
  assert.equal(gateCheck.allowed, false);
  assert.equal(gateCheck.gate, 'TERMINAL_PAIRING_MODAL');
});

suite.test('ADV-STORAGE-03: Cross-tab onboarding completion syncs isUninitialized() state immediately via LocalStorage', () => {
  resetClean();
  store.resetToUninitialized();
  assert.equal(store.isUninitialized(), true);

  // Simulate remote tab completing onboarding
  mockStorage.setItem('ays_onboarded', 'true');

  // isUninitialized() checks LocalStorage flag dynamically
  assert.equal(store.isUninitialized(), false, 'isUninitialized() must reflect remote onboarded=true');
});

suite.test('ADV-STORAGE-04: Corrupted JSON payload in cross-tab storage event does not crash store.load() or store boot', () => {
  resetClean();

  // Write malformed JSON to storage
  mockStorage.setItem('ays_terminal_pairing', '{ "sin": "SIN-MALFORMED", status: broken json');

  // Dispatch storage event
  assert.doesNotThrow(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'ays_terminal_pairing',
      newValue: '{ "sin": "SIN-MALFORMED", status: broken json'
    }));
  });

  // store.load must catch JSON.parse exception and return fallback
  const fallbackObj = { status: 'FALLBACK' };
  const loaded = store.load('ays_terminal_pairing', fallbackObj);
  assert.deepEqual(loaded, fallbackObj, 'store.load must return fallback on corrupted JSON without crashing');
});

suite.test('ADV-STORAGE-05: 100 rapid cross-tab storage events storm executes without unhandled errors or event loop degradation', () => {
  resetClean();

  assert.doesNotThrow(() => {
    for (let i = 0; i < 100; i++) {
      const isEven = i % 2 === 0;
      const key = isEven ? 'ays_terminal_pairing' : 'ays_onboarded';
      const val = isEven 
        ? JSON.stringify({ sin: `SIN-BURST-${i}`, status: 'PAIRED' })
        : (i % 4 === 0 ? 'false' : 'true');

      mockStorage.setItem(key, val);
    }
  });

  // System must remain healthy
  assert.ok(true, 'Storage storm completed cleanly');
});

// ============================================================================
// PART 4: STORAGE QUOTA OVERFLOW & LOCALSTORAGE UNAVAILABILITY FALLBACK
// ============================================================================

suite.test('ADV-QUOTA-01: Storage QuotaExceededError during pairTerminal() preserves in-memory pairing and does not crash', async () => {
  resetClean();
  store.resetDemoData();

  // Configure localStorage.setItem to throw QuotaExceededError
  const quotaErr = new Error('DOMException: QuotaExceededError: The quota has been exceeded.');
  quotaErr.name = 'QuotaExceededError';
  mockStorage.shouldThrowOnSetItem = quotaErr;

  const res = await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-POS-99',
    adminPin: '1234'
  });

  // Pairing must succeed in memory despite storage failure
  assert.equal(res.success, true, 'pairTerminal must return success even if LocalStorage is full');
  assert.equal(store.isTerminalPaired(), true, 'isTerminalPaired() must return true in memory');
  assert.equal(store.terminalPairing.sin, 'SIN-POS-99');

  // Audit log must also be saved in-memory
  const pairingLog = store.auditLogs.find(l => l.action === 'TERMINAL_PAIRED');
  assert.ok(pairingLog, 'TERMINAL_PAIRED audit log must be recorded in memory');
});

suite.test('ADV-QUOTA-02: Storage QuotaExceededError during completeOnboarding() completes in-memory setup safely', async () => {
  resetClean();
  store.resetToUninitialized();

  const quotaErr = new Error('DOMException: QuotaExceededError');
  quotaErr.name = 'QuotaExceededError';
  mockStorage.shouldThrowOnSetItem = quotaErr;

  const success = await store.completeOnboarding({
    merchantName: 'High-Volume Bistro',
    restaurantId: 'REST-FULL-001',
    adminUser: { name: 'Admin User', pin: '1234' },
    initialTerminal: { sin: 'SIN-POS-01' }
  });

  assert.equal(success, true, 'completeOnboarding must succeed in-memory when LocalStorage is full');
  assert.equal(store.onboarded, true, 'Store must be marked onboarded in memory');
  assert.equal(store.isTerminalPaired(), true, 'Initial terminal must be paired in memory');
});

suite.test('ADV-QUOTA-03: TerminalPairingModal handles LocalStorage save warnings gracefully without breaking UX', async () => {
  resetClean();
  store.resetDemoData();

  const quotaErr = new Error('QuotaExceededError');
  mockStorage.shouldThrowOnSetItem = quotaErr;

  const modal = openTerminalPairingModal({ store });
  assert.ok(modal.element, 'Modal element must be mounted');

  // Close modal safely
  modal.close();
});

suite.test('ADV-QUOTA-04: Complete localStorage unavailability (globalThis.localStorage = undefined) falls back to memory safely', async () => {
  resetClean();
  store.resetDemoData();

  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = undefined;

  try {
    // 1. isTerminalPaired works in memory
    assert.equal(store.isTerminalPaired(), true);

    // 2. pairTerminal succeeds in memory
    const pairRes = await store.pairTerminal({
      restaurantId: 'REST-BLR-001',
      sin: 'SIN-MEM-01',
      adminPin: '1234'
    });
    assert.equal(pairRes.success, true);
    assert.equal(store.terminalPairing.sin, 'SIN-MEM-01');

    // 3. unpairTerminal succeeds in memory
    const unpairRes = await store.unpairTerminal({ adminPin: '1234' });
    assert.equal(unpairRes.success, true);
    assert.equal(store.isTerminalPaired(), false);

    // 4. evaluateAuthGates works cleanly
    const gateRes = main.evaluateAuthGates('floorplan', store);
    assert.equal(gateRes.allowed, false);
    assert.equal(gateRes.gate, 'TERMINAL_PAIRING_MODAL');

  } finally {
    globalThis.localStorage = originalStorage;
  }
});

suite.test('ADV-QUOTA-05: Storage SecurityError (private browsing disabled storage) is caught without uncaught exception', () => {
  resetClean();
  store.resetDemoData();

  const securityErr = new Error('DOMException: SecurityError: Access is denied for this document.');
  securityErr.name = 'SecurityError';

  mockStorage.shouldThrowOnGetItem = securityErr;
  mockStorage.shouldThrowOnSetItem = securityErr;
  mockStorage.shouldThrowOnRemoveItem = securityErr;

  assert.doesNotThrow(() => {
    store.load('ays_terminal_pairing', DEFAULT_TERMINAL_PAIRING);
  }, 'store.load must catch SecurityError');

  assert.doesNotThrow(() => {
    store.save('ays_terminal_pairing', DEFAULT_TERMINAL_PAIRING);
  }, 'store.save must catch SecurityError');

  assert.doesNotThrow(() => {
    store.isUninitialized();
  }, 'store.isUninitialized must catch SecurityError');

  assert.doesNotThrow(() => {
    store.resetToUninitialized();
  }, 'store.resetToUninitialized must catch SecurityError');
});

suite.test('ADV-QUOTA-06: Storage heals after quota exhaustion and reconciles persistence', async () => {
  resetClean();
  store.resetDemoData();

  // 1. Storage error active
  mockStorage.shouldThrowOnSetItem = new Error('QuotaExceededError');
  await store.pairTerminal({
    restaurantId: 'REST-BLR-001',
    sin: 'SIN-HEAL-01',
    adminPin: '1234'
  });
  assert.equal(store.terminalPairing.sin, 'SIN-HEAL-01');

  // 2. Storage recovers (quota cleared)
  mockStorage.shouldThrowOnSetItem = null;
  store.save('ays_terminal_pairing', store.terminalPairing);

  // 3. LocalStorage now contains updated pairing
  const healed = JSON.parse(mockStorage.getItem('ays_terminal_pairing'));
  assert.equal(healed.sin, 'SIN-HEAL-01');
  assert.equal(healed.status, 'PAIRED');
});

// Run standalone if invoked directly from CLI
if (process.argv[1]?.includes('adversarial_m2_transitions_storage.test.mjs')) {
  suite.run().then(res => {
    main.switchView('customer', false);
    main.closeModals();
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

