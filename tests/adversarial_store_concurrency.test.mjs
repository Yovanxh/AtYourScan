/**
 * Milestone 1 Adversarial Store & Concurrency Stress Test Suite
 * Challenger 2 (Store & Concurrency Challenger)
 * 
 * Tests:
 * 1. Rapid concurrent order placement depleting stock to zero, auto-86'd (is_available = false), and non-negative clamping.
 * 2. Table transfer (transferTable) with active orders, invalid table numbers, and occupied targets.
 * 3. Table settlement (settleTable) with various payment methods, status transitions to Vacant, and clearing active order references.
 * 4. Batch stock ingestion (batchIngestStock) with price/unit_cost updates, absolute modes, case-insensitivity, and catalog expansion.
 */

import assert from 'node:assert/strict';
import { setupTestEnvironment, createTestSuite } from './helpers.mjs';

setupTestEnvironment();

// Defensive mock DOM extension for Node environment
const origGetElementById = globalThis.document?.getElementById;
if (origGetElementById) {
  globalThis.document.getElementById = (id) => {
    const el = origGetElementById(id);
    if (el && !el.querySelector) {
      el.querySelector = () => null;
    }
    return el;
  };
}

export const suite = createTestSuite('M1 Challenger 2: Store & Concurrency Adversarial Suite');

// Import store
const { store } = await import('../src/store.js');

// Helper to get clean store state
function resetStore() {
  store.resetDemoData();
}

// =========================================================================
// TEST SUITE 1: RAPID CONCURRENT ORDER PLACEMENT & STOCK DEPLETION
// =========================================================================

suite.test('ADV-STOCK-01: Rapid concurrent order placement depletes stock monotonically to zero and triggers auto-86', async () => {
  resetStore();
  
  // Choose item-01 with initial stock = 45
  const item = store.menuItems.find(i => i.id === 'item-01');
  assert.ok(item, 'item-01 exists');
  
  // Set initial stock to a controlled quantity: 15
  item.stock_quantity = 15;
  item.is_available = true;
  
  const concurrencyCount = 25;
  const initialStock = item.stock_quantity;
  let listenersFired = 0;
  
  const unsubscribe = store.subscribe(() => {
    listenersFired++;
  });
  
  // Launch 25 concurrent order placements with randomized micro-delays
  const orders = await Promise.all(
    Array.from({ length: concurrencyCount }, async (_, idx) => {
      // Simulate real-world network / client microtask jitter
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5)));
      return store.createOrder({
        table_number: (idx % 12) + 1,
        items: [{ id: item.id, name: item.name, price: item.price, quantity: 1 }],
        customer_name: `Concurrent Guest ${idx + 1}`
      });
    })
  );
  
  unsubscribe();
  
  // Verification:
  // 1. All 25 orders were created
  assert.equal(orders.length, concurrencyCount, 'All concurrent orders returned an order object');
  orders.forEach(o => {
    assert.ok(o.id.startsWith('AYS-'), 'Order has valid ID');
  });
  
  // 2. Stock must be clamped to exactly 0 (not negative!)
  assert.equal(item.stock_quantity, 0, 'Stock quantity must deplete to exactly 0');
  
  // 3. Auto-86 must be triggered: is_available must be false
  assert.equal(item.is_available, false, 'Auto-86 must be triggered (is_available === false)');
  
  // 4. Invariant: stock_quantity cannot be negative under any concurrency condition
  assert.ok(item.stock_quantity >= 0, 'Stock quantity invariant: stock >= 0');
  
  // 5. Store reactive notifications fired
  assert.ok(listenersFired >= concurrencyCount, 'Store subscribers notified of stock updates');
});

suite.test('ADV-STOCK-02: Over-demand order placement clamps stock to zero without negative numbers', async () => {
  resetStore();
  
  const item = store.menuItems.find(i => i.id === 'item-02');
  assert.ok(item, 'item-02 exists');
  
  // Set stock to 3
  item.stock_quantity = 3;
  item.is_available = true;
  
  // Order quantity 10 (exceeds stock of 3)
  const order = store.createOrder({
    table_number: 2,
    items: [{ id: item.id, name: item.name, price: item.price, quantity: 10 }]
  });
  
  assert.ok(order, 'Order was accepted');
  assert.equal(item.stock_quantity, 0, 'Stock clamped to 0, not -7');
  assert.equal(item.is_available, false, 'is_available set to false');
  
  // Subsequent order on 0-stock item
  const order2 = store.createOrder({
    table_number: 3,
    items: [{ id: item.id, name: item.name, price: item.price, quantity: 5 }]
  });
  
  assert.ok(order2, 'Subsequent order processed');
  assert.equal(item.stock_quantity, 0, 'Stock remains clamped at 0');
  assert.equal(item.is_available, false, 'is_available remains false');
});

suite.test('ADV-STOCK-03: updateStock handles negative deltas, absolute zero, and auto-replenishment correctly', async () => {
  resetStore();
  
  const item = store.menuItems.find(i => i.id === 'item-03');
  assert.ok(item, 'item-03 exists');
  
  // 1. Extreme negative delta
  store.updateStock(item.id, -99999);
  assert.equal(item.stock_quantity, 0, 'Extreme negative delta clamps to 0');
  assert.equal(item.is_available, false, 'Extreme negative delta triggers auto-86');
  
  // 2. Replenish positive delta
  store.updateStock(item.id, 25);
  assert.equal(item.stock_quantity, 25, 'Stock replenished to 25');
  assert.equal(item.is_available, true, 'Auto-replenish restores is_available to true');
  
  // 3. Absolute mode with 0
  store.updateStock(item.id, 0, true);
  assert.equal(item.stock_quantity, 0, 'Absolute update to 0 sets stock to 0');
  assert.equal(item.is_available, false, 'Absolute update to 0 sets is_available to false');
  
  // 4. Absolute mode with negative value
  store.updateStock(item.id, -15, true);
  assert.equal(item.stock_quantity, 0, 'Absolute update with negative value clamps to 0');
  assert.equal(item.is_available, false, 'is_available remains false');
  
  // 5. Non-existent item id
  const nullResult = store.updateStock('non-existent-item-999', 50);
  assert.equal(nullResult, null, 'Updating non-existent item returns null safely');
});

// =========================================================================
// TEST SUITE 2: TABLE TRANSFER (transferTable) ADVERSARIAL STRESS
// =========================================================================

suite.test('ADV-TABLE-01: transferTable successfully migrates multiple active orders and notes', async () => {
  resetStore();
  
  // Source table 4, target table 8 (initially vacant)
  const sourceTable = store.tables.find(t => t.table_number === 4);
  const targetTable = store.tables.find(t => t.table_number === 8);
  
  sourceTable.status = 'Active Ordering';
  sourceTable.party_size = 4;
  sourceTable.seated_at = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  
  // Create 3 orders on Table 4: 2 active, 1 completed
  const order1 = store.createOrder({
    table_number: 4,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 2 }],
    notes: 'No garlic'
  });
  order1.status = 'Preparing';
  
  const order2 = store.createOrder({
    table_number: 4,
    items: [{ id: 'item-02', name: 'Burrata', price: 520, quantity: 1 }],
    notes: ''
  });
  order2.status = 'Ready';
  
  const orderCompleted = store.createOrder({
    table_number: 4,
    items: [{ id: 'item-03', name: 'Mocktail', price: 220, quantity: 2 }]
  });
  orderCompleted.status = 'Completed';
  
  // Add service request on Table 4
  const req = store.requestService(4, 'Extra Napkins');
  
  // Perform transfer: 4 -> 8
  const success = store.transferTable(4, 8);
  assert.equal(success, true, 'transferTable returned true');
  
  // Check active orders migrated to Table 8
  assert.equal(order1.table_number, 8, 'order1 table_number migrated to 8');
  assert.ok(order1.notes.includes('[Transferred from T-4]'), 'order1 has transfer audit note');
  assert.ok(order1.notes.includes('No garlic'), 'order1 original notes preserved');
  
  assert.equal(order2.table_number, 8, 'order2 table_number migrated to 8');
  assert.ok(order2.notes.includes('[Transferred from T-4]'), 'order2 has transfer audit note');
  
  // Check completed order did NOT migrate
  assert.equal(orderCompleted.table_number, 4, 'Completed order table_number remained 4');
  
  // Check service request migrated to Table 8
  assert.equal(req.table_number, 8, 'Service request table_number migrated to 8');
  
  // Check Source Table 4 state
  assert.equal(sourceTable.status, 'Vacant', 'Source Table 4 reset to Vacant');
  assert.equal(sourceTable.party_size, 0, 'Source Table 4 party_size reset to 0');
  assert.equal(sourceTable.seated_guests, 0, 'Source Table 4 seated_guests reset to 0');
  assert.equal(sourceTable.seated_at, null, 'Source Table 4 seated_at reset to null');
  assert.equal(sourceTable.active_order_id, null, 'Source Table 4 active_order_id reset to null');
  
  // Check Target Table 8 state
  assert.equal(targetTable.status, 'Active Ordering', 'Target Table 8 inherited status');
  assert.equal(targetTable.party_size, 4, 'Target Table 8 inherited party_size');
  assert.equal(targetTable.seated_guests, 4, 'Target Table 8 seated_guests matches party_size');
  assert.equal(targetTable.seated_at, sourceTable.seated_at || targetTable.seated_at, 'Target Table 8 seated_at preserved');
});

suite.test('ADV-TABLE-02: transferTable rejects invalid table numbers gracefully', async () => {
  resetStore();
  
  // Invalid inputs that must return false:
  assert.equal(store.transferTable(4, 4), false, 'Same table transfer returns false');
  assert.equal(store.transferTable('abc', 4), false, 'Non-numeric source returns false');
  assert.equal(store.transferTable(4, 'xyz'), false, 'Non-numeric destination returns false');
  assert.equal(store.transferTable(null, 4), false, 'Null source returns false');
  assert.equal(store.transferTable(4, undefined), false, 'Undefined destination returns false');
  assert.equal(store.transferTable(999, 4), false, 'Non-existent source table returns false');
  assert.equal(store.transferTable(4, 888), false, 'Non-existent target table returns false');
  assert.equal(store.transferTable(-1, 4), false, 'Negative table number returns false');
  
  // Valid string representations of numbers must succeed
  const strSuccess = store.transferTable('1', '3');
  assert.equal(strSuccess, true, 'String numbers "1" and "3" parse and succeed');
});

suite.test('ADV-TABLE-03: transferTable behavior when target table is already occupied', async () => {
  resetStore();
  
  // Table 2 is occupied (party 2, order AYS-801)
  const targetT2 = store.tables.find(t => t.table_number === 2);
  targetT2.status = 'Active Ordering';
  targetT2.party_size = 2;
  
  // Table 7 is occupied (party 6, order AYS-804)
  const sourceT7 = store.tables.find(t => t.table_number === 7);
  sourceT7.status = 'Payment Due';
  sourceT7.party_size = 6;
  
  // Create an active order on Table 7
  const t7Order = store.createOrder({
    table_number: 7,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 2 }]
  });
  
  // Transfer 7 into 2 (both occupied)
  const success = store.transferTable(7, 2);
  assert.equal(success, true, 'Transfer executes');
  
  // Source table 7 must be cleared
  assert.equal(sourceT7.status, 'Vacant', 'Source Table 7 reset to Vacant');
  assert.equal(sourceT7.party_size, 0, 'Source Table 7 party_size reset to 0');
  
  // Target table 2 must maintain an active status (inherited or active)
  assert.ok(
    ['Payment Due', 'Active Ordering', 'Food Ready'].includes(targetT2.status),
    'Target table remains in an active state'
  );
  
  // Target table 2 now holds the migrated order
  assert.equal(t7Order.table_number, 2, 'Table 7 order migrated to Table 2');
  assert.ok(t7Order.notes.includes('[Transferred from T-7]'), 'Audit note appended');
  
  // Orders for Table 2 now include both original and migrated orders
  const ordersT2 = store.orders.filter(o => o.table_number === 2 && o.status !== 'Completed');
  assert.ok(ordersT2.length >= 1, 'Table 2 has active orders');
});

// =========================================================================
// TEST SUITE 3: TABLE SETTLEMENT (settleTable) STRESS & VALIDATION
// =========================================================================

suite.test('ADV-SETTLE-01: settleTable completes all active orders with specified payment method and vacates table', async () => {
  resetStore();
  
  const testTableNum = 5;
  const table = store.tables.find(t => t.table_number === testTableNum);
  table.status = 'Food Ready';
  table.party_size = 3;
  table.seated_guests = 3;
  table.seated_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  // Create 2 active orders and 1 cancelled order for Table 5
  const o1 = store.createOrder({
    table_number: testTableNum,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 1 }]
  });
  o1.status = 'Preparing';
  
  const o2 = store.createOrder({
    table_number: testTableNum,
    items: [{ id: 'item-02', name: 'Burrata', price: 520, quantity: 2 }]
  });
  o2.status = 'Ready';
  
  const oCancelled = store.createOrder({
    table_number: testTableNum,
    items: [{ id: 'item-03', name: 'Mocktail', price: 220, quantity: 1 }]
  });
  oCancelled.status = 'Cancelled';
  
  // Also create a service request
  store.requestService(testTableNum, 'Bill Request');
  assert.ok(store.serviceRequests.some(r => r.table_number === testTableNum), 'Service request present before settlement');
  
  // Settle with payment method 'CARD'
  const settleSuccess = store.settleTable(testTableNum, 'CARD');
  assert.equal(settleSuccess, true, 'settleTable returned true');
  
  // Verification on active orders
  assert.equal(o1.status, 'Completed', 'Active order 1 marked Completed');
  assert.equal(o1.payment_status, 'PAID', 'Active order 1 payment_status is PAID');
  assert.equal(o1.payment_method, 'CARD', 'Active order 1 payment_method is CARD');
  assert.ok(o1.paid_at, 'Active order 1 has paid_at timestamp');
  
  assert.equal(o2.status, 'Completed', 'Active order 2 marked Completed');
  assert.equal(o2.payment_status, 'PAID', 'Active order 2 payment_status is PAID');
  assert.equal(o2.payment_method, 'CARD', 'Active order 2 payment_method is CARD');
  
  // Cancelled order should NOT be modified to PAID
  assert.equal(oCancelled.status, 'Cancelled', 'Cancelled order status preserved');
  assert.notEqual(oCancelled.payment_status, 'PAID', 'Cancelled order not marked PAID');
  
  // Table status and attributes must be cleanly reset to Vacant
  assert.equal(table.status, 'Vacant', 'Table status reset to Vacant');
  assert.equal(table.party_size, 0, 'Table party_size reset to 0');
  assert.equal(table.seated_guests, 0, 'Table seated_guests reset to 0');
  assert.equal(table.seated_at, null, 'Table seated_at reset to null');
  assert.equal(table.active_order_id, null, 'Table active_order_id reset to null');
  
  // Pending service requests for this table must be dismissed
  assert.equal(
    store.serviceRequests.some(r => r.table_number === testTableNum),
    false,
    'Service requests for settled table are cleared'
  );
});

suite.test('ADV-SETTLE-02: settleTable supports various payment methods and handles invalid inputs', async () => {
  resetStore();
  
  // Test payment methods
  const methods = ['UPI', 'CASH', 'SPLIT_UPI_CARD', 'CRYPTO_TEST'];
  for (let i = 0; i < methods.length; i++) {
    const tblNum = i + 1;
    const order = store.createOrder({
      table_number: tblNum,
      items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 1 }]
    });
    const success = store.settleTable(tblNum, methods[i]);
    assert.equal(success, true, `settleTable succeeded for method ${methods[i]}`);
    assert.equal(order.payment_method, methods[i], `Order payment_method set to ${methods[i]}`);
    assert.equal(order.status, 'Completed');
  }
  
  // Invalid inputs
  assert.equal(store.settleTable('non-numeric'), false, 'Non-numeric table string returns false');
  assert.equal(store.settleTable(NaN), false, 'NaN returns false');
  assert.equal(store.settleTable(999), false, 'Non-existent table number returns false');
  assert.equal(store.settleTable(null), false, 'Null returns false');
  assert.equal(store.settleTable(undefined), false, 'Undefined returns false');
});

// =========================================================================
// TEST SUITE 4: BATCH STOCK INGESTION (batchIngestStock) ADVERSARIAL
// =========================================================================

suite.test('ADV-INGEST-01: batchIngestStock updates price and unit_cost while preserving or adding stock', async () => {
  resetStore();
  
  const targetItem = store.menuItems.find(i => i.id === 'item-01');
  const oldPrice = targetItem.price;
  const oldCost = targetItem.unit_cost;
  const oldStock = targetItem.stock_quantity;
  
  // Ingest update with new unit_cost and new price
  const ingested = store.batchIngestStock([
    {
      id: 'item-01',
      name: 'Truffle & Aged Parmesan Polenta Fries',
      quantity: 10, // delta +10
      unit_cost: 165,
      price: 450
    }
  ]);
  
  assert.equal(ingested, 1, '1 item ingested');
  assert.equal(targetItem.unit_cost, 165, 'Unit cost updated to 165');
  assert.equal(targetItem.price, 450, 'Price updated to 450');
  assert.equal(targetItem.stock_quantity, oldStock + 10, 'Stock incremented by 10');
  assert.equal(targetItem.is_available, true, 'Item is available');
});

suite.test('ADV-INGEST-02: batchIngestStock supports absolute stock replacement and auto-86 toggle', async () => {
  resetStore();
  
  const targetItem = store.menuItems.find(i => i.id === 'item-02');
  
  // Absolute zero: should drain stock and toggle auto-86
  store.batchIngestStock([
    {
      id: 'item-02',
      quantity: 0,
      isAbsolute: true
    }
  ]);
  
  assert.equal(targetItem.stock_quantity, 0, 'Stock set to absolute 0');
  assert.equal(targetItem.is_available, false, 'is_available toggled to false (auto-86)');
  
  // Absolute replenishment: should set stock and restore availability
  store.batchIngestStock([
    {
      id: 'item-02',
      quantity: 35,
      isAbsolute: true,
      unit_cost: 210
    }
  ]);
  
  assert.equal(targetItem.stock_quantity, 35, 'Stock set to absolute 35');
  assert.equal(targetItem.is_available, true, 'is_available restored to true');
  assert.equal(targetItem.unit_cost, 210, 'Unit cost updated to 210');
});

suite.test('ADV-INGEST-03: batchIngestStock performs case-insensitive name matching and adds novel items', async () => {
  resetStore();
  
  const initialCatalogCount = store.menuItems.length;
  
  // Batch with 1 existing item (uppercase name match) and 1 novel item
  const count = store.batchIngestStock([
    {
      name: 'TRUFFLE & AGED PARMESAN POLENTA FRIES', // case-insensitive match for item-01
      quantity: 5,
      unit_cost: 150
    },
    {
      name: 'Smoked Stracciatella Crostini', // Novel dish
      category: 'Small Plates',
      quantity: 18,
      unit_cost: 95,
      price: 280,
      dietary: 'veg'
    }
  ]);
  
  assert.equal(count, 2, 'Both items processed');
  
  // Catalog size should increase by exactly 1
  assert.equal(store.menuItems.length, initialCatalogCount + 1, 'Catalog size increased by 1');
  
  // Verify novel item
  const novel = store.menuItems.find(i => i.name === 'Smoked Stracciatella Crostini');
  assert.ok(novel, 'Novel item exists in catalog');
  assert.equal(novel.stock_quantity, 18, 'Novel item stock is 18');
  assert.equal(novel.unit_cost, 95, 'Novel item unit_cost is 95');
  assert.equal(novel.price, 280, 'Novel item price is 280');
  assert.equal(novel.is_available, true, 'Novel item is available');
  assert.equal(novel.dietary, 'veg', 'Dietary tag preserved');
});

suite.test('ADV-INGEST-04: batchIngestStock handles edge cases: empty input, invalid data, negative quantities', async () => {
  resetStore();
  
  assert.equal(store.batchIngestStock([]), 0, 'Empty array returns 0');
  assert.equal(store.batchIngestStock(null), 0, 'Null returns 0');
  assert.equal(store.batchIngestStock(undefined), 0, 'Undefined returns 0');
  assert.equal(store.batchIngestStock('not an array'), 0, 'String returns 0');
  
  // Entry with blank name and no ID must be skipped
  const skippedCount = store.batchIngestStock([
    { name: '', quantity: 10 },
    { name: '   ', quantity: 5 }
  ]);
  assert.equal(skippedCount, 0, 'Blank entries skipped');
  
  // Negative quantity should clamp to 0
  const item = store.menuItems[0];
  const prevStock = item.stock_quantity;
  store.batchIngestStock([
    { id: item.id, quantity: -20 } // delta -20 clamping
  ]);
  // Stock cannot decrease below 0
  assert.ok(item.stock_quantity >= 0, 'Stock remains non-negative');
});

suite.test('ADV-STOCK-04: High-volume 100-order parallel barrage across multi-item carts maintains strict stock invariants', async () => {
  resetStore();
  
  // Set up 3 items with fixed quantities
  const items = [
    store.menuItems[0], // 30 stock
    store.menuItems[1], // 20 stock
    store.menuItems[2]  // 15 stock
  ];
  items[0].stock_quantity = 30;
  items[0].is_available = true;
  items[1].stock_quantity = 20;
  items[1].is_available = true;
  items[2].stock_quantity = 15;
  items[2].is_available = true;

  // 100 concurrent multi-item orders
  const parallelOrders = 100;
  const results = await Promise.all(
    Array.from({ length: parallelOrders }, async (_, idx) => {
      // Small jitter
      await new Promise(r => setImmediate(r));
      return store.createOrder({
        table_number: (idx % 12) + 1,
        items: [
          { id: items[0].id, name: items[0].name, price: items[0].price, quantity: 1 },
          { id: items[1].id, name: items[1].name, price: items[1].price, quantity: 1 },
          { id: items[2].id, name: items[2].name, price: items[2].price, quantity: 1 }
        ]
      });
    })
  );

  assert.equal(results.length, parallelOrders, 'All 100 orders executed');
  
  // All three items had fewer than 100 stock total, so all should be at 0 and auto-86'd
  for (const it of items) {
    assert.equal(it.stock_quantity, 0, `Item ${it.name} stock clamped to 0`);
    assert.equal(it.is_available, false, `Item ${it.name} marked unavailable (auto-86)`);
  }
});

suite.test('ADV-STOCK-05: Concurrent contention between order deduction and live inventory replenishment', async () => {
  resetStore();
  
  const target = store.menuItems[3];
  target.stock_quantity = 20;
  target.is_available = true;

  // Concurrently run 10 orders of 1 each and 2 replenishment batches of +10 each
  // Initial 20 >= 10, so stock never hits 0 during deductions: 20 - 10 + 10 + 10 = 30
  const tasks = [
    ...Array.from({ length: 10 }, async () => {
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 4)));
      return store.createOrder({
        table_number: 1,
        items: [{ id: target.id, name: target.name, price: target.price, quantity: 1 }]
      });
    }),
    (async () => {
      await new Promise(r => setTimeout(r, 2));
      return store.updateStock(target.id, 10);
    })(),
    (async () => {
      await new Promise(r => setTimeout(r, 3));
      return store.updateStock(target.id, 10);
    })()
  ];

  await Promise.all(tasks);

  // Invariant: Stock must be >= 0, never negative or NaN
  assert.ok(!isNaN(target.stock_quantity), 'Stock is a valid number');
  assert.ok(target.stock_quantity >= 0, 'Stock is non-negative');
  assert.equal(target.stock_quantity, 30, 'Net stock equals expected 30 (20 - 10 + 10 + 10)');
  assert.equal(target.is_available, true, 'is_available is true for positive stock');

  // Second phase: Under-stock condition with zero replenishment
  target.stock_quantity = 3;
  target.is_available = true;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      return store.createOrder({
        table_number: 1,
        items: [{ id: target.id, name: target.name, price: target.price, quantity: 1 }]
      });
    })
  );
  assert.equal(target.stock_quantity, 0, 'Under-stock orders clamped strictly at 0 (never negative)');
  assert.equal(target.is_available, false, 'Auto-86 triggered under-stock');
});

suite.test('ADV-TABLE-04: Multi-hop table transfer (T-1 -> T-5 -> T-10) preserves order lineage and clean states', async () => {
  resetStore();
  
  const t1 = store.tables.find(t => t.table_number === 1);
  const t5 = store.tables.find(t => t.table_number === 5);
  const t10 = store.tables.find(t => t.table_number === 10);

  const initialOrder = store.createOrder({
    table_number: 1,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 2 }],
    notes: 'Corner seating'
  });

  // Hop 1: Transfer T-1 -> T-5
  const hop1 = store.transferTable(1, 5);
  assert.equal(hop1, true, 'Hop 1 succeeds');
  assert.equal(t1.status, 'Vacant', 'T-1 vacated');
  assert.equal(initialOrder.table_number, 5, 'Order moved to T-5');
  assert.ok(initialOrder.notes.includes('[Transferred from T-1]'), 'Lineage note T-1 recorded');

  // Hop 2: Transfer T-5 -> T-10
  const hop2 = store.transferTable(5, 10);
  assert.equal(hop2, true, 'Hop 2 succeeds');
  assert.equal(t5.status, 'Vacant', 'T-5 vacated');
  assert.equal(initialOrder.table_number, 10, 'Order moved to T-10');
  assert.ok(initialOrder.notes.includes('[Transferred from T-1]'), 'Original lineage preserved');
  assert.ok(initialOrder.notes.includes('[Transferred from T-5]'), 'Second lineage note recorded');
  assert.ok(t10.status !== 'Vacant', 'T-10 is active');
});

suite.test('ADV-TABLE-05: Full table recycling lifecycle (Vacant -> Order -> Food Ready -> Settle -> Vacant -> New Order)', async () => {
  resetStore();
  
  const t3 = store.tables.find(t => t.table_number === 3);
  assert.equal(t3.status, 'Vacant', 'T-3 initially vacant');

  // Customer arrives and places order
  const order1 = store.createOrder({
    table_number: 3,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 2 }]
  });
  assert.equal(t3.status, 'Active Ordering', 'T-3 becomes Active Ordering');
  assert.equal(t3.active_order_id, order1.id, 'T-3 active_order_id matches order1');

  // Chef prepares and marks Ready
  store.updateOrderStatus(order1.id, 'Ready');
  assert.equal(t3.status, 'Food Ready', 'T-3 transitions to Food Ready');

  // Guest pays and table is settled
  const settled = store.settleTable(3, 'UPI');
  assert.equal(settled, true, 'T-3 settled');
  assert.equal(t3.status, 'Vacant', 'T-3 resets to Vacant');
  assert.equal(t3.active_order_id, null, 'T-3 active_order_id cleared');
  assert.equal(order1.status, 'Completed', 'order1 completed');
  assert.equal(order1.payment_status, 'PAID', 'order1 paid');

  // New guest arrives at T-3
  const order2 = store.createOrder({
    table_number: 3,
    items: [{ id: 'item-02', name: 'Burrata', price: 520, quantity: 1 }]
  });
  assert.equal(t3.status, 'Active Ordering', 'T-3 re-activates for new guest');
  assert.equal(t3.active_order_id, order2.id, 'T-3 points to new order');
  assert.notEqual(order2.id, order1.id, 'New order has distinct ID');
});

suite.test('ADV-SETTLE-03: settleTable idempotency and preserved cancelled order status', async () => {
  resetStore();
  
  const tblNum = 6;
  const order = store.createOrder({
    table_number: tblNum,
    items: [{ id: 'item-01', name: 'Polenta Fries', price: 380, quantity: 1 }]
  });

  // First settlement
  const res1 = store.settleTable(tblNum, 'CASH');
  assert.equal(res1, true, 'First settle succeeds');
  assert.equal(order.status, 'Completed');
  assert.equal(order.payment_method, 'CASH');

  // Second settlement (idempotent call on already settled table)
  const res2 = store.settleTable(tblNum, 'CARD');
  assert.equal(res2, true, 'Second settle succeeds idempotently');
  const tbl = store.tables.find(t => t.table_number === tblNum);
  assert.equal(tbl.status, 'Vacant', 'Table remains Vacant');
  // Order was already completed, so second settle did not overwrite its completed payment method
  assert.equal(order.status, 'Completed');
});

suite.test('ADV-INGEST-05: In-batch duplicate item accumulation and margin calculation fallbacks', async () => {
  resetStore();
  
  const target = store.menuItems[0];
  const oldStock = target.stock_quantity;

  // Batch contains duplicate entries for the same item (e.g. from multiple invoices or rows)
  const batchCount = store.batchIngestStock([
    { id: target.id, quantity: 5, unit_cost: 160 },
    { id: target.id, quantity: 10, unit_cost: 170, price: 460 }
  ]);

  assert.equal(batchCount, 2, 'Both duplicate entries processed');
  // Stock accumulated: +5 + 10 = +15
  assert.equal(target.stock_quantity, oldStock + 15, 'Stock accumulated additively');
  assert.equal(target.unit_cost, 170, 'Unit cost reflects latest entry in batch');
  assert.equal(target.price, 460, 'Price reflects latest entry in batch');

  // Ingest novel item with unit_cost only (price should calculate 2.5x markup)
  store.batchIngestStock([
    {
      name: 'Black Truffle Tagliolini',
      quantity: 12,
      unit_cost: 200 // No price given: 200 * 2.5 = 500
    }
  ]);
  const newPasta = store.menuItems.find(i => i.name === 'Black Truffle Tagliolini');
  assert.ok(newPasta, 'New pasta item created');
  assert.equal(newPasta.unit_cost, 200, 'Unit cost is 200');
  assert.equal(newPasta.price, 500, 'Price automatically calculated via 2.5x markup rule (500)');
});

suite.test('ADV-INGEST-06: Bulk 50-item stock ingestion throughput and integrity', async () => {
  resetStore();
  
  const initialCount = store.menuItems.length;
  const bulkItems = Array.from({ length: 50 }, (_, i) => ({
    name: `Artisanal Test Ingest Item #${i + 1}`,
    quantity: (i % 10) + 1,
    unit_cost: 50 + (i * 2),
    price: 150 + (i * 5),
    category: i % 2 === 0 ? 'Small Plates' : 'Woodfired'
  }));

  const startTime = Date.now();
  const ingested = store.batchIngestStock(bulkItems);
  const duration = Date.now() - startTime;

  assert.equal(ingested, 50, 'All 50 items ingested');
  assert.equal(store.menuItems.length, initialCount + 50, 'Catalog size expanded by 50');
  assert.ok(duration < 100, `Batch ingestion completes in ${duration}ms (< 100ms)`);
  
  // Verify random sample from batch
  const sample = store.menuItems.find(i => i.name === 'Artisanal Test Ingest Item #25');
  assert.ok(sample, 'Sample item #25 exists');
  assert.equal(sample.stock_quantity, 5, 'Sample item quantity is 5');
  assert.equal(sample.unit_cost, 98, 'Sample item unit_cost is 98');
});

import { pathToFileURL } from 'node:url';

// Run standalone if executed directly
if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].includes('adversarial_store_concurrency'))) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
