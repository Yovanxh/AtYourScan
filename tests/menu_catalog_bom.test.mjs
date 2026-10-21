/**
 * tests/menu_catalog_bom.test.mjs
 * 
 * Comprehensive E2E & Unit Test Suite for:
 * 1. Purge of hardcoded/mock dishes and categories.
 * 2. Database & Application RLS / RBAC Guard (Cashier / Unauthenticated 403 Forbidden).
 * 3. Supabase RPC / Admin PIN Elevation Challenge.
 * 4. Dynamic Category Creation (display name, course type, dietary scope).
 * 5. Manual Dish Authoring (display name, description, photo asset, category, dietary tag, price).
 * 6. Granular Bill of Materials (BOM) & Multi-Ingredient Recipe Mapping.
 * 7. Realtime Inventory Auto-Depletion upon Order Confirmation.
 * 8. Automatic 86'd (Sold Out) Dish Synchronization when raw ingredient reaches 0.
 * 9. Automatic Availability Restoration when depleted ingredient is restocked.
 * 10. Hospitality Invariant: Customer QR view is never obstructed by admin gates.
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';
import { store } from '../src/store.js';
import { evaluateAuthGates } from '../src/main.js';

export const suite = createTestSuite('Menu Management & BOM Inventory Suite');

// TEST 1: Purge hardcoded mock dishes and categories
suite.test('CAT-01: Complete purge of mock dishes and categories from store & local cache', () => {
  store.purgeMockCatalog();

  assert.equal(store.dishes.length, 0, 'Dishes array must be completely empty after purge');
  assert.equal(store.categories.length, 0, 'Categories array must be completely empty after purge');
  assert.equal(store.inventoryItems.length, 0, 'Inventory items array must be completely empty after purge');
  assert.equal(store.dishIngredients.length, 0, 'Dish ingredients (BOM) must be completely empty after purge');
  assert.equal(store.menuItems.length, 0, 'menuItems compatibility accessor must be empty after purge');
  assert.equal(store.load('ays_catalog_purged'), true, 'ays_catalog_purged must be persisted as true');
});

// TEST 2: RBAC Guard - Non-admin staff mutation returns 403 Forbidden
suite.test('CAT-02: Non-admin staff (Cashier/Server) mutation without elevation returns 403 Forbidden', () => {
  store.currentStaff = { id: 'staff-cashier-01', name: 'Rohan Cashier', role: 'Cashier' };
  store.elevationExpiry = 0; // Ensure not elevated

  assert.equal(store.canMutateCatalog(), false, 'Cashier must not have catalog mutation authorization');

  const catRes = store.createCategory({ name: 'Unauthorized Course' });
  assert.equal(catRes.success, false, 'Category creation by cashier must fail');
  assert.equal(catRes.status, 403, 'Must return 403 status code');
  assert.ok(catRes.error.includes('403 Forbidden'), 'Must return 403 Forbidden error message');

  const dishRes = store.createDish({ name: 'Unauthorized Dish', price: 250 });
  assert.equal(dishRes.success, false, 'Dish creation by cashier must fail');
  assert.equal(dishRes.status, 403, 'Must return 403 status code');

  const delDishRes = store.deleteDish('some-id');
  assert.equal(delDishRes.status, 403, 'Dish deletion by cashier must return 403');

  const delCatRes = store.deleteCategory('some-id');
  assert.equal(delCatRes.status, 403, 'Category deletion by cashier must return 403');

  const rawRes = store.createInventoryItem({ name: 'Raw Material', current_stock: 10, unit: 'g' });
  assert.equal(rawRes.status, 403, 'Raw item creation by cashier must return 403');

  const restockRes = store.restockInventoryItem('some-id', 50);
  assert.equal(restockRes.status, 403, 'Restock by cashier must return 403');
});

// TEST 3: Admin PIN Elevation Challenge verifies PIN and grants temporary elevation
suite.test('CAT-03: Admin PIN elevation challenge validates PIN, audits elevation and grants access', async () => {
  store.currentStaff = { id: 'staff-cashier-01', name: 'Rohan Cashier', role: 'Cashier' };
  store.elevationExpiry = 0;

  // Attempt invalid PIN
  const badRes = await store.verifyAdminPinElevation('0000');
  assert.equal(badRes.success, false, 'Invalid PIN must be rejected');
  assert.equal(badRes.status, 403, 'Invalid PIN must return 403');

  // Attempt valid Admin PIN (seeded admin has PIN 1234)
  const validRes = await store.verifyAdminPinElevation('1234', 'SIN-POS-01', 'CATALOG_MUTATION_TEST');
  assert.equal(validRes.success, true, 'Valid Admin PIN must be accepted');
  assert.ok(validRes.authorizer, 'Authorizer details must be returned');
  assert.equal(store.canMutateCatalog(), true, 'Session must now be elevated for catalog mutation');

  // Verify elevation is recorded in audit logs
  const elevationLog = store.auditLogs.find(l => l.action === 'ADMIN_ELEVATION' && (l.targetItem === 'CATALOG_MUTATION_TEST' || l.target_item === 'CATALOG_MUTATION_TEST'));
  assert.ok(elevationLog, 'Elevation must be logged to audit_logs');
  assert.equal(elevationLog.initiatorRole || elevationLog.initiator_role, 'Cashier', 'Audit log must record cashier as initiator');
  assert.equal(elevationLog.authorizerRole || elevationLog.authorizer_role, 'Admin', 'Audit log must record Admin as authorizer');
});

// TEST 4: Dynamic Category Creation
suite.test('CAT-04: Dynamic Category Creation with custom name, course type, and dietary scope', () => {
  // Elevate session
  store.elevateSession();

  const cat1 = store.createCategory({
    name: 'Artisanal Brews & Tonics',
    course_type: 'Beverage',
    dietary_scope: 'All'
  });
  assert.equal(cat1.success, true, 'Category 1 creation must succeed');
  assert.ok(cat1.category.id, 'Category must have UUID');
  assert.equal(cat1.category.course_type, 'Beverage');
  assert.equal(cat1.category.dietary_scope, 'All');

  const cat2 = store.createCategory({
    name: 'Woodfired Pizzas',
    course_type: 'Main Course',
    dietary_scope: 'Veg-Only'
  });
  assert.equal(cat2.success, true, 'Category 2 creation must succeed');
  assert.equal(cat2.category.dietary_scope, 'Veg-Only');

  assert.equal(store.categories.length, 2, 'Store must contain exactly 2 dynamic categories');
  assert.equal(store.getCategories().length, 2);
});

// TEST 5: Raw Inventory Creation
suite.test('CAT-05: Raw Material Inventory creation with units (ml, g, pcs, kg)', () => {
  store.elevateSession();

  const milk = store.createInventoryItem({
    name: 'Organic Farm Milk',
    current_stock: 500,
    unit: 'ml'
  });
  assert.equal(milk.success, true);
  assert.equal(milk.item.current_stock, 500);
  assert.equal(milk.item.unit, 'ml');

  const coffee = store.createInventoryItem({
    name: 'Single Estate Espresso Beans',
    current_stock: 200,
    unit: 'g'
  });
  assert.equal(coffee.success, true);
  assert.equal(coffee.item.unit, 'g');

  const syrup = store.createInventoryItem({
    name: 'Bourbon Vanilla Syrup',
    current_stock: 150,
    unit: 'ml'
  });
  assert.equal(syrup.success, true);

  assert.equal(store.inventoryItems.length, 3, 'Store must contain exactly 3 raw materials');
});

// TEST 6: Manual Dish Creation with Recipe-Level Bill of Materials (BOM)
suite.test('CAT-06: Manual dish authoring maps multi-ingredient Bill of Materials (BOM)', () => {
  store.elevateSession();

  const cat = store.categories.find(c => c.name.includes('Brews'));
  const milk = store.inventoryItems.find(i => i.name.includes('Milk'));
  const coffee = store.inventoryItems.find(i => i.name.includes('Espresso'));
  const syrup = store.inventoryItems.find(i => i.name.includes('Vanilla'));

  const dishRes = store.createDish({
    name: 'Bourbon Vanilla Iced Latte',
    description: 'Double espresso pulled over chilled organic milk and artisanal bourbon vanilla bean reduction.',
    price: 320.00,
    category_id: cat.id,
    dietary_tag: 'Veg',
    image_url: 'https://images.unsplash.com/photo-cold-brew.jpg',
    ingredients: [
      { inventory_item_id: milk.id, quantity_required: 200 }, // 200 ml milk per serving
      { inventory_item_id: coffee.id, quantity_required: 30 }, // 30 g coffee per serving
      { inventory_item_id: syrup.id, quantity_required: 20 }   // 20 ml syrup per serving
    ]
  });

  assert.equal(dishRes.success, true, 'Dish creation must succeed');
  assert.ok(dishRes.dish.id, 'Dish must have ID');
  assert.equal(dishRes.dish.price, 320.00);
  assert.equal(dishRes.dish.dietary_tag, 'Veg');
  assert.equal(dishRes.dish.is_available, true, 'Dish must be available since raw stock is sufficient');

  // Verify BOM dish_ingredients persistence
  const dishBOM = store.dishIngredients.filter(di => di.dish_id === dishRes.dish.id);
  assert.equal(dishBOM.length, 3, 'Dish must map exactly 3 raw ingredients');
  assert.equal(store.dishes.length, 1);
  assert.equal(store.menuItems.length, 1);
});

// TEST 7: BOM Inventory Auto-Depletion on Order Placement
suite.test('CAT-07: Confirming order decrements mapped raw inventory quantities proportionally', () => {
  const dish = store.dishes[0];
  const milk = store.inventoryItems.find(i => i.name.includes('Milk'));
  const coffee = store.inventoryItems.find(i => i.name.includes('Espresso'));
  const syrup = store.inventoryItems.find(i => i.name.includes('Vanilla'));

  // Place order for 2 servings of Bourbon Vanilla Iced Latte
  store.createOrder({
    table_number: 4,
    source: 'QR_DINE_IN',
    items: [
      { id: dish.id, name: dish.name, price: dish.price, quantity: 2 }
    ]
  });

  // Expected deduction:
  // Milk: 500 - (200 * 2) = 100 ml
  // Coffee: 200 - (30 * 2) = 140 g
  // Syrup: 150 - (20 * 2) = 110 ml
  assert.equal(milk.current_stock, 100, 'Milk must be decremented by 400 ml (leaving 100 ml)');
  assert.equal(coffee.current_stock, 140, 'Coffee must be decremented by 60 g (leaving 140 g)');
  assert.equal(syrup.current_stock, 110, 'Syrup must be decremented by 40 ml (leaving 110 ml)');
  assert.equal(dish.is_available, true, 'Dish remains available as all stocks are still > 0');
});

// TEST 8: Automatic 86'd (Sold Out) Status Synchronization
suite.test('CAT-08: When linked raw ingredient reaches 0, dish is automatically 86’d (is_available=false)', () => {
  const dish = store.dishes[0];
  const milk = store.inventoryItems.find(i => i.name.includes('Milk'));

  let reactiveUpdateFired = false;
  const unsub = store.subscribe(() => {
    reactiveUpdateFired = true;
  });

  // Place another order for 1 serving (requires 200 ml milk, but only 100 ml left)
  store.createOrder({
    table_number: 2,
    source: 'QR_DINE_IN',
    items: [
      { id: dish.id, name: dish.name, price: dish.price, quantity: 1 }
    ]
  });

  unsub();

  assert.equal(milk.current_stock, 0, 'Milk stock must be clamped at 0');
  assert.equal(dish.is_available, false, 'Dish must be automatically marked 86’d (is_available=false)');
  assert.equal(reactiveUpdateFired, true, 'Store must broadcast reactive update to active guest sessions');
});

// TEST 9: Restocking Depleted Ingredient Restores Dish Availability
suite.test('CAT-09: Restocking depleted ingredient restores dish availability (is_available=true)', () => {
  store.elevateSession();
  const dish = store.dishes[0];
  const milk = store.inventoryItems.find(i => i.name.includes('Milk'));

  assert.equal(dish.is_available, false, 'Pre-condition: Dish must currently be 86’d');

  // Restock 1000 ml milk
  const restockRes = store.restockInventoryItem(milk.id, 1000);
  assert.equal(restockRes.success, true);
  assert.equal(milk.current_stock, 1000, 'Milk stock must now be 1000 ml');

  // Since Milk: 1000ml, Coffee: 40g, Syrup: 110ml (all > recipe requirements), dish availability is restored!
  assert.equal(dish.is_available, true, 'Dish availability must automatically recover to true upon restock');
});

// TEST 10: Hospitality Invariant - Guest Dine-In View is Never Blocked
suite.test('CAT-10: Hospitality Invariant - Customer dine-in view (?view=customer) is never blocked', () => {
  store.isLocked = true; // Lock staff terminal screen

  const guestAuth = evaluateAuthGates('customer', store);
  assert.equal(guestAuth.allowed, true, 'Customer view must ALWAYS be allowed');
  assert.equal(guestAuth.gate, null, 'Customer view must never trigger lock screen or PIN gate');

  const staffAuth = evaluateAuthGates('floorplan', store);
  assert.equal(staffAuth.allowed, false, 'Staff view must be intercepted by lock screen');
  assert.equal(staffAuth.gate, 'LOCK_SCREEN');

  store.isLocked = false;
});
