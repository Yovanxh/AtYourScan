/**
 * tests/invoice_ocr_real.test.mjs
 * 
 * Test suite for Real Invoice Image OCR & Intelligent Procurement Line Parser
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';
import { store } from '../src/store.js';
import { 
  parseInvoiceTextLines, 
  generateSampleInvoiceImage,
  preprocessInvoiceImage,
  formatProgressMessage
} from '../src/utils/ocr.js';

export const suite = createTestSuite('Real Invoice OCR & Multi-Format Ingestion Suite');

// OCR-01: Hybrid Array Return
suite.test('OCR-01: parseInvoiceTextLines returns dual-compatible Array with .items and .metadata', () => {
  const sample = '10x Truffle Fries @ 140';
  const res = parseInvoiceTextLines(sample);
  assert.ok(Array.isArray(res), 'Return value must be an Array');
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'Truffle Fries');
  assert.equal(res[0].quantity, 10);
  assert.equal(res[0].unit_cost, 140);
  assert.ok(Array.isArray(res.items), '.items must exist and be an array');
  assert.equal(res.items.length, 1);
  assert.ok(typeof res.metadata === 'object', '.metadata must be an object');
});

// OCR-02: Multi-line invoice with metadata and noise
suite.test('OCR-02: Parser extracts structured items and invoice metadata while filtering noise', () => {
  const ocrText = `
    MAHARASHTRA ORGANIC FARMS & SUPPLIES
    Tax Invoice / Delivery Challan
    Invoice No: INV-2026-9042
    Date: 15/10/2026
    GSTIN: 27AABCS1429B1Z8
    Billed To: The Copper Oak Bistro
    Item Description               Qty    Rate     Amount
    1. 10x Arabica Espresso Beans @ 450.00         4500.00
    2. Fresh Burrata Cheese 8 pcs @ 190.00         1520.00
    3. Wild Mushroom Fontina 12 pcs @ 240.00       2880.00
    Sub Total: 8,900.00
    CGST (9%): 801.00
    SGST (9%): 801.00
    Grand Total: Rs 10,502.00
    Thank you for your business!
  `;

  const parsed = parseInvoiceTextLines(ocrText);
  assert.equal(parsed.length, 3, 'Should extract exactly 3 line items');
  
  // Verify items
  const espresso = parsed.find(i => i.name.toLowerCase().includes('espresso'));
  assert.ok(espresso, 'Should find Espresso Beans');
  assert.equal(espresso.quantity, 10);
  assert.equal(espresso.unit_cost, 450);

  const burrata = parsed.find(i => i.name.toLowerCase().includes('burrata'));
  assert.ok(burrata, 'Should find Burrata');
  assert.equal(burrata.quantity, 8);
  assert.equal(burrata.unit_cost, 190);

  // Verify metadata
  assert.equal(parsed.metadata.invoiceNumber, 'INV-2026-9042');
  assert.equal(parsed.metadata.date, '15/10/2026');
  assert.equal(parsed.metadata.supplierName, 'MAHARASHTRA ORGANIC FARMS & SUPPLIES');
  assert.equal(parsed.metadata.totalAmount, 10502);
});

// OCR-03: Key-Value Format
suite.test('OCR-03: Key-Value format "Name: X, Qty: Y, Rate: Z" parsed reliably', () => {
  const kvText = `
    Name: Artisanal Pepperoni, Qty: 15, Rate: 260
    Item: Valrhona Dark Fondant, Qty: 20, Cost: 160
  `;
  const parsed = parseInvoiceTextLines(kvText);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Artisanal Pepperoni');
  assert.equal(parsed[0].quantity, 15);
  assert.equal(parsed[0].unit_cost, 260);
  assert.equal(parsed[1].name, 'Valrhona Dark Fondant');
  assert.equal(parsed[1].quantity, 20);
  assert.equal(parsed[1].unit_cost, 160);
});

// OCR-04: Suffix Quantity Format with Units
suite.test('OCR-04: Suffix quantity with unit (kg, g, pcs, ml) parsed correctly', () => {
  const suffixText = `
    San Marzano Whole Peeled Tomatoes 12 pcs 180 2160
    Unsalted Cultured Butter 5 kg 420 2100
  `;
  const parsed = parseInvoiceTextLines(suffixText);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'San Marzano Whole Peeled Tomatoes');
  assert.equal(parsed[0].quantity, 12);
  assert.equal(parsed[0].unit, 'pcs');
  assert.equal(parsed[0].unit_cost, 180);

  assert.equal(parsed[1].name, 'Unsalted Cultured Butter');
  assert.equal(parsed[1].quantity, 5);
  assert.equal(parsed[1].unit, 'kg');
  assert.equal(parsed[1].unit_cost, 420);
});

// OCR-05: Deduplication & Quantity Aggregation
suite.test('OCR-05: Identical item lines on multiple pages or deliveries aggregate quantities', () => {
  const multiLine = `
    10x Truffle Fries @ 140
    5x Truffle Fries @ 140
  `;
  const parsed = parseInvoiceTextLines(multiLine);
  assert.equal(parsed.length, 1, 'Should combine into 1 unique item');
  assert.equal(parsed[0].quantity, 15, 'Quantities should sum: 10 + 5 = 15');
});

// OCR-06: Batch Ingestion & 86'd Availability Auto-Restoration
suite.test('OCR-06: Ingesting OCR line items replenishes stock and clears 86\'d out-of-stock state', () => {
  store.resetDemoData();
  
  // Explicitly 86 an item
  const dish = store.menuItems[0];
  dish.stock_quantity = 0;
  dish.is_available = false;
  store.save('ays_menu', store.menuItems);

  assert.equal(dish.is_available, false, 'Dish must initially be 86\'d');

  // Ingest via batch
  const count = store.batchIngestStock([
    { name: dish.name, quantity: 25, unit_cost: 150 }
  ]);

  assert.equal(count, 1);
  const updatedDish = store.menuItems.find(m => m.id === dish.id);
  assert.equal(updatedDish.stock_quantity, 25);
  assert.equal(updatedDish.is_available, true, '86\'d status must be cleared upon replenishment');
});

// OCR-07: Format Progress Message
suite.test('OCR-07: formatProgressMessage maps stages to descriptive readable updates', () => {
  const msg1 = formatProgressMessage('loading language traineddata', 0.45);
  assert.ok(msg1.includes('Optical Character Matrix'));
  assert.ok(msg1.includes('45%'));

  const msg2 = formatProgressMessage('recognizing text', 0.82);
  assert.ok(msg2.includes('Analyzing Invoice Glyphs'));
  assert.ok(msg2.includes('82%'));
});

// OCR-08: Multi-currency tabular invoices with $ symbols
suite.test('OCR-08: Currency symbols ($, €, £) in tabular invoices parsed correctly', () => {
  const invoiceSample = `
    BEANBURST COFFEE
    Cafe Invoice Statement
    Invoice Number: INV-9901
    Date: 24/11/2026
    Description Quantity Unit Price Total
    Coffee 100 $2.50 $250.00
    Pastries 50 $3.00 $150.00
    Sandwiches 30 $5.00 $150.00
    Subtotal: $550.00
    Tax (5%): $27.50
    Total: $577.50
  `;

  const parsed = parseInvoiceTextLines(invoiceSample);
  assert.equal(parsed.length, 3, 'Should extract exactly 3 line items');

  const coffee = parsed.find(i => i.name === 'Coffee');
  assert.ok(coffee, 'Should extract Coffee');
  assert.equal(coffee.quantity, 100);
  assert.equal(coffee.unit_cost, 2.5);
  assert.equal(coffee.total_cost, 250);

  const pastries = parsed.find(i => i.name === 'Pastries');
  assert.ok(pastries, 'Should extract Pastries');
  assert.equal(pastries.quantity, 50);
  assert.equal(pastries.unit_cost, 3);
  assert.equal(pastries.total_cost, 150);

  const sandwiches = parsed.find(i => i.name === 'Sandwiches');
  assert.ok(sandwiches, 'Should extract Sandwiches');
  assert.equal(sandwiches.quantity, 30);
  assert.equal(sandwiches.unit_cost, 5);
  assert.equal(sandwiches.total_cost, 150);

  assert.equal(parsed.metadata.totalAmount, 577.5);
  assert.equal(parsed.metadata.supplierName, 'BEANBURST COFFEE');
});

// If executed directly
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('invoice_ocr_real.test.mjs')) {
  suite.run().then(res => {
    console.log(`\nResults: ${res.passed}/${res.total} passed in ${res.durationMs}ms`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
