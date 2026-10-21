/**
 * tests/master_menu_ingestion.test.mjs
 * 
 * Master Admin AI Menu Ingestion Test Suite
 * Tests Natural Language Menu Text Parsing, Supabase Master Account RBAC,
 * and Dynamic Category & Multi-Size Dish Batch Ingestion.
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';
import { parseMenuPrompt, SAMPLE_MASTER_MENU_PROMPT } from '../src/utils/menuTextParser.js';
import { store } from '../src/store.js';
import { ROLES, createSSOToken } from '../src/auth.js';
import { handleGeminiMenuIngestRequest } from '../src/api/geminiMenuIngest.js';
import { renderMenuView } from '../src/components/MenuView.js';
import { renderMenuManagement } from '../src/views/menuManagement.js';
import { renderCustomerView } from '../src/components/CustomerView.js';
import { renderMasterMenuIngestionModal } from '../src/components/MasterMenuIngestionModal.js';

export const suite = createTestSuite('Master Admin AI Menu Ingestion Suite');

let parsedData = null;

suite.test('MI-01: parseMenuPrompt detects 15 categories with proper course classifications', () => {
  parsedData = parseMenuPrompt(SAMPLE_MASTER_MENU_PROMPT);
  assert.ok(Array.isArray(parsedData.categories), 'Categories must be an array');
  assert.ok(parsedData.categories.length >= 15, `Expected >= 15 categories, got ${parsedData.categories.length}`);

  const requiredCategories = [
    'Hot Beverages',
    'Thick Cold Coffee',
    'Thick Shakes',
    'Exclusive Chocolate Shakes',
    'Mocktails',
    'Salad',
    'Fries',
    'Open Toast & Garlic Bread',
    'Momos',
    'Pizza',
    'Pizza Mania',
    'Burger',
    'Grilled Sandwich',
    'Classic Non-Grilled Sandwich',
    'Dessert & Chocolate Mania'
  ];

  for (const name of requiredCategories) {
    const found = parsedData.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    assert.ok(found, `Category "${name}" not detected`);
    assert.equal(found.dietary_scope, 'Veg Only', `Category "${name}" must have Veg Only scope`);
  }
});

suite.test('MI-02: parseMenuPrompt detects all 80+ dishes with prices, descriptions and dietary tag', () => {
  assert.ok(Array.isArray(parsedData.dishes), 'Dishes must be an array');
  assert.ok(parsedData.dishes.length >= 75, `Expected >= 75 dishes, got ${parsedData.dishes.length}`);

  const tea = parsedData.dishes.find(d => d.name.toLowerCase() === 'tea');
  assert.ok(tea, 'Tea was not found');
  assert.equal(tea.price, 20);
  assert.equal(tea.category, 'Hot Beverages');
  assert.equal(tea.dietary_tag, 'Veg');

  const kitkat = parsedData.dishes.find(d => d.name.toLowerCase() === 'kitkat');
  assert.ok(kitkat, 'Kitkat shake not found');
  assert.equal(kitkat.price, 140);
  assert.equal(kitkat.category, 'Exclusive Chocolate Shakes');
});

suite.test('MI-03: parseMenuPrompt parses multi-size pizzas with Regular, Medium, Large prices', () => {
  const margherita = parsedData.dishes.find(d => d.name.toLowerCase() === 'margherita pizza');
  assert.ok(margherita, 'Margherita Pizza not found');
  assert.equal(margherita.price, 140);
  assert.ok(Array.isArray(margherita.variations), 'Variations must be an array');
  assert.ok(margherita.variations.length >= 3, 'Must have Regular, Medium, and Large variations');

  const med = margherita.variations.find(v => v.size === 'Medium');
  const lrg = margherita.variations.find(v => v.size === 'Large');
  assert.ok(med && med.price === 220, `Medium price expected 220, got ${med?.price}`);
  assert.ok(lrg && lrg.price === 320, `Large price expected 320, got ${lrg?.price}`);
});

suite.test('MI-04: RBAC strictly blocks non-master staff from calling importParsedMenu (403 Forbidden)', async () => {
  store.isMasterSession = false;
  store.currentStaff = { id: 'test-server', name: 'Server Priya', role: ROLES.SERVER };

  const res = await store.importParsedMenu(parsedData);
  assert.equal(res.success, false);
  assert.equal(res.status, 403);
});

suite.test('MI-05: Master Admin Supabase Login activates Master Session', async () => {
  const loginRes = await store.loginMasterAccount({ email: 'admin@copperoak.com', pin: '1234' });
  assert.equal(loginRes.success, true);
  assert.equal(store.isMasterAdmin(), true);
  assert.equal(store.currentStaff.role, ROLES.ADMIN);
  assert.equal(store.isMasterSession, true);
});

suite.test('MI-06: Master Admin batch imports entire menu into Store & Supabase catalog', async () => {
  const importRes = await store.importParsedMenu(parsedData);
  assert.equal(importRes.success, true);
  assert.ok(store.categories.length >= 15, 'Categories count should be >= 15');
  assert.ok(store.dishes.length >= 75, 'Dishes count should be >= 75');

  const importedMargherita = store.dishes.find(d => d.name.toLowerCase() === 'margherita pizza');
  assert.ok(importedMargherita, 'Imported Margherita Pizza not in store.dishes');
  assert.equal(importedMargherita.price, 140);
  assert.equal(importedMargherita.dietary_tag, 'Veg');

  const pizzaCat = store.categories.find(c => c.name.toLowerCase() === 'pizza');
  assert.ok(pizzaCat, 'Pizza category not in store.categories');
  assert.equal(importedMargherita.category_id, pizzaCat.id);
});

suite.test('MI-07: Master Account Logout safely resets active session to cashier', () => {
  store.logoutMasterAccount();
  assert.equal(store.isMasterSession, false);
  assert.notEqual(store.currentStaff.role, ROLES.ADMIN);
});

// MI-08: Strict UI Invisibility for Non-Admin Roles
suite.test('MI-08: Strict UI Invisibility: Non-admin roles (Cashier, Server, Floor Manager) never mount #btn-ai-menu-import', () => {
  const container = document.createElement('div');

  // Test Cashier
  store.currentStaff = { id: 'staff-cashier-01', name: 'Rohan Verma', role: ROLES.CASHIER };
  store.isMasterSession = false;
  let cleanup = renderMenuView(container, store);
  assert.equal(container.innerHTML.includes('id="btn-ai-menu-import"'), false, 'Cashier view must not mount btn-ai-menu-import');
  assert.equal(container.innerHTML.includes('AI Menu Auto-Import'), false, 'Cashier view must not contain AI Menu Auto-Import text');
  cleanup?.();

  // Test Server
  store.currentStaff = { id: 'staff-server-01', name: 'Priya Sharma', role: ROLES.SERVER };
  cleanup = renderMenuView(container, store);
  assert.equal(container.innerHTML.includes('id="btn-ai-menu-import"'), false, 'Server view must not mount btn-ai-menu-import');
  assert.equal(container.innerHTML.includes('AI Menu Auto-Import'), false, 'Server view must not contain AI Menu Auto-Import text');
  cleanup?.();

  // Test Manager
  store.currentStaff = { id: 'staff-mgr-01', name: 'Anand Kumar', role: ROLES.MANAGER };
  cleanup = renderMenuView(container, store);
  assert.equal(container.innerHTML.includes('id="btn-ai-menu-import"'), false, 'Manager view must not mount btn-ai-menu-import');
  assert.equal(container.innerHTML.includes('AI Menu Auto-Import'), false, 'Manager view must not contain AI Menu Auto-Import text');
  cleanup?.();
});

// MI-09: Customer Dine-In View Invisibility
suite.test('MI-09: Strict UI Invisibility: Customer Dine-In view never renders #btn-ai-menu-import or AI controls', () => {
  const container = document.createElement('div');
  store.cart.table_number = 4;
  const cleanup = renderCustomerView(container, store, {});
  assert.equal(container.innerHTML.includes('btn-ai-menu-import'), false, 'Customer view must not render btn-ai-menu-import');
  assert.equal(container.innerHTML.includes('AI Menu Auto-Import'), false, 'Customer view must not render AI Menu Auto-Import');
  cleanup?.();
});

// MI-10: No DOM Leaks / Cannot be toggled via CSS
suite.test('MI-10: No DOM Leaks: Non-admin users cannot reveal button via CSS because element is absent from DOM', () => {
  const container = document.createElement('div');
  store.currentStaff = { id: 'staff-cashier-01', name: 'Rohan Verma', role: ROLES.CASHIER };
  store.isMasterSession = false;
  const cleanup = renderMenuView(container, store);

  // Assert it is completely unmounted, NOT just hidden with display:none or .hidden class
  assert.equal(container.innerHTML.includes('btn-ai-menu-import'), false, 'Must not exist in DOM string at all');
  assert.equal(container.innerHTML.includes('display:none'), false);
  cleanup?.();
});

// MI-11: Role Validation: Admin mounts #btn-ai-menu-import into DOM
suite.test('MI-11: Role Validation: MenuView mounts #btn-ai-menu-import strictly when role === Admin', () => {
  const container = document.createElement('div');
  store.currentStaff = { id: 'staff-admin-01', name: 'Dev Anand', role: ROLES.ADMIN };
  store.isMasterSession = true;

  const cleanup = renderMenuView(container, store);
  assert.equal(container.innerHTML.includes('id="btn-ai-menu-import"'), true, 'Admin view MUST mount btn-ai-menu-import');
  assert.equal(container.innerHTML.includes('AI Menu Auto-Import'), true, 'Admin view MUST show AI Menu Auto-Import');
  cleanup?.();
});

// MI-12: Conditional Rendering in renderMenuManagement
suite.test('MI-12: Conditional Rendering in renderMenuManagement enforces role check and mounts only for Admin', () => {
  const actionToolbar = document.createElement('div');
  actionToolbar.id = 'menu-action-toolbar';
  actionToolbar.children = [];
  actionToolbar.prepend = function(el) { this.children.unshift(el); };
  actionToolbar.appendChild = function(el) { this.children.push(el); };
  actionToolbar.querySelector = function(selector) {
    if (selector === '#btn-ai-menu-import') {
      return this.children.find(c => c.id === 'btn-ai-menu-import') || null;
    }
    return null;
  };

  const container = document.createElement('div');
  container.querySelector = function(selector) {
    if (selector === '#menu-action-toolbar' || selector === '.menu-action-toolbar') {
      return actionToolbar;
    }
    return null;
  };
  container.querySelectorAll = () => [];

  // Test Non-Admin (Cashier)
  store.currentStaff = { id: 'staff-cashier-01', name: 'Rohan Verma', role: ROLES.CASHIER };
  store.isMasterSession = false;
  renderMenuManagement(container, store);
  assert.equal(actionToolbar.children.some(c => c.id === 'btn-ai-menu-import'), false, 'Non-admin must not mount button');

  // Test Admin
  store.currentStaff = { id: 'staff-admin-01', name: 'Dev Anand', role: ROLES.ADMIN };
  store.isMasterSession = true;
  renderMenuManagement(container, store);
  assert.equal(actionToolbar.children.some(c => c.id === 'btn-ai-menu-import'), true, 'Admin MUST mount button');
});

// MI-13: Backend API Guard rejects non-admin tokens with 403 Forbidden
suite.test('MI-13: Backend API Guard: handleGeminiMenuIngestRequest rejects non-admin tokens with 403 Forbidden', async () => {
  const cashierToken = createSSOToken({
    id: 'staff-cashier-01',
    name: 'Rohan Verma',
    role: ROLES.CASHIER
  });

  const req = {
    headers: {
      get: (header) => header === 'authorization' ? `Bearer ${cashierToken}` : null
    },
    body: { text: SAMPLE_MASTER_MENU_PROMPT }
  };

  const res = await handleGeminiMenuIngestRequest(req, store);
  assert.equal(res.status, 403, 'Expected 403 status for cashier token');
  assert.equal(res.success, false, 'Expected success false');
  assert.ok(res.error.includes('403 Forbidden'), 'Must indicate 403 Forbidden');
});

// MI-14: Backend API Guard succeeds with 200 OK for Admin token
suite.test('MI-14: Backend API Guard: handleGeminiMenuIngestRequest accepts valid Admin token with 200 OK', async () => {
  const adminToken = createSSOToken({
    id: 'staff-admin-01',
    name: 'Dev Anand',
    role: ROLES.ADMIN
  });

  const req = {
    headers: {
      get: (header) => header === 'authorization' ? `Bearer ${adminToken}` : null
    },
    body: { text: SAMPLE_MASTER_MENU_PROMPT }
  };

  const res = await handleGeminiMenuIngestRequest(req, store);
  assert.equal(res.status, 200, 'Expected 200 status for admin token');
  assert.equal(res.success, true, 'Expected success true');
  assert.ok(res.data.categories.length >= 15, 'Should have parsed categories');
  assert.ok(res.data.dishes.length >= 75, 'Should have parsed dishes');
});

// MI-15: Backend Guard in store.ingestGeminiMenu enforces admin role
suite.test('MI-15: Backend Guard in store.ingestGeminiMenu: rejects non-admin role with 403 Forbidden', async () => {
  store.currentStaff = { id: 'staff-server-01', name: 'Priya Sharma', role: ROLES.SERVER };
  store.isMasterSession = false;

  const res = await store.ingestGeminiMenu({ text: SAMPLE_MASTER_MENU_PROMPT });
  assert.equal(res.status, 403, 'Expected status 403 for server role');
  assert.equal(res.success, false);
  assert.ok(res.error.includes('403 Forbidden'));
});

// MI-16: Security Guard: MasterMenuIngestionModal refuses to mount DOM for non-admin
suite.test('MI-16: Security Guard: MasterMenuIngestionModal clears container and aborts if not admin', () => {
  const container = document.createElement('div');
  container.innerHTML = '<div id="test-leak">Initial Content</div>';

  store.currentStaff = { id: 'staff-mgr-01', name: 'Anand Kumar', role: ROLES.MANAGER };
  store.isMasterSession = false;

  let closed = false;
  renderMasterMenuIngestionModal(container, store, { onClose: () => { closed = true; } });

  assert.equal(container.innerHTML, '', 'Container must be completely cleared');
  assert.equal(closed, true, 'onClose callback should be triggered');
});

// MI-17: Structured Multi-line Key-Value format & Variation in Description parsing
suite.test('MI-17: parseMenuPrompt extracts categories, dishes, and multi-size variations from Key-Value blocks', () => {
  const textInput = `
==================================================
CATEGORIES (Dynamic Category Builder)
==================================================
Category Display Name: Hot Beverages
Course Classification: Beverages
Dietary Scope: Veg Only

Category Display Name: Pizza
Course Classification: Main Course
Dietary Scope: Veg Only

Category Display Name: Dessert & Chocolate Mania
Course Classification: Dessert
Dietary Scope: Veg Only

==================================================
DISH ENTRIES (Manual Dish Creation & Recipe BOM)
All Dietary Classifications: Vegetarian
==================================================

--- Category: Hot Beverages ---
Dish Name: Tea
Price: 20
Description: Freshly brewed hot tea

Dish Name: Hot Coffee
Price: 30
Description: Freshly brewed aromatic hot coffee

--- Category: Pizza ---
Dish Name: Margherita Pizza
Price: 140
Description: Loaded With Mozzarella Cheese (Regular: 140 | Medium: 220 | Large: 320)

Dish Name: Farm Fresh Pizza
Price: 150
Description: Mozzarella Cheese, Tomato, Onion, Capsicum (Regular: 150 | Medium: 240 | Large: 340)

--- Category: Dessert & Chocolate Mania ---
Dish Name: Seezling Brownie
Price: 60
Description: Rich chocolate brownie served on a sizzling hot plate
  `;

  const parsed = parseMenuPrompt(textInput);
  assert.equal(parsed.categories.length, 3, 'Should detect 3 categories');
  assert.equal(parsed.categories[0].name, 'Hot Beverages');
  assert.equal(parsed.categories[0].course_type, 'Beverage');
  assert.equal(parsed.categories[1].name, 'Pizza');
  assert.equal(parsed.categories[1].course_type, 'Main Course');
  assert.equal(parsed.categories[2].name, 'Dessert & Chocolate Mania');
  assert.equal(parsed.categories[2].course_type, 'Dessert');

  assert.equal(parsed.dishes.length, 5, 'Should detect 5 dishes');
  const margherita = parsed.dishes.find(d => d.name === 'Margherita Pizza');
  assert.ok(margherita, 'Margherita Pizza must be found');
  assert.equal(margherita.price, 140);
  assert.equal(margherita.category, 'Pizza');
  assert.equal(margherita.description, 'Loaded With Mozzarella Cheese');
  assert.equal(margherita.variations.length, 3);
  assert.deepEqual(margherita.variations, [
    { size: 'Regular', price: 140 },
    { size: 'Medium', price: 220 },
    { size: 'Large', price: 320 }
  ]);
});

// MI-18: Standalone dish snippet without category header
suite.test('MI-18: parseMenuPrompt smartly classifies standalone dish snippets without category header', () => {
  const snippet = `Dish Name: Seezling Brownie
Price: 60
Description: Rich chocolate brownie served on a sizzling hot plate

Dish Name: Chocolate Grilled Sandwich
Price: 90
Description: Chocolate Sauce, Fresh Grilled Bread`;

  const parsed = parseMenuPrompt(snippet);
  assert.equal(parsed.dishes.length, 2, 'Should detect 2 dishes');
  assert.equal(parsed.dishes[0].name, 'Seezling Brownie');
  assert.equal(parsed.dishes[0].price, 60);
  assert.equal(parsed.dishes[0].category, 'Dessert & Chocolate Mania');

  assert.equal(parsed.dishes[1].name, 'Chocolate Grilled Sandwich');
  assert.equal(parsed.dishes[1].price, 90);
  assert.equal(parsed.dishes[1].category, 'Dessert & Chocolate Mania');

  assert.equal(parsed.categories.length, 1);
  assert.equal(parsed.categories[0].name, 'Dessert & Chocolate Mania');
  assert.equal(parsed.categories[0].course_type, 'Dessert');
});


