/**
 * tests/offer_banner_customization.test.mjs
 * 
 * Comprehensive Unit and Integration Test Suite for:
 * - Customizable Promotional Offer Banners
 * - Manager Dashboard Banner Authoring, Editing, Deletion & Toggling
 * - Real-Time Synchronization under Cafe Name in Guest Dine-In View
 */

import assert from 'node:assert/strict';
import { createTestSuite } from './helpers.mjs';
import { store, INITIAL_OFFER_BANNERS } from '../src/store.js';
import { renderCustomerView } from '../src/components/CustomerView.js';
import { renderMenuView } from '../src/components/MenuView.js';

export const suite = createTestSuite('Customizable Offer Banners Suite');

// OB-01: Initial State
suite.test('OB-01: Store loads curated default offer banners from INITIAL_OFFER_BANNERS', () => {
  store.resetDemoData();
  const banners = store.getOfferBanners();
  assert.ok(Array.isArray(banners), 'Offer banners must be an array');
  assert.ok(banners.length >= 2, 'Should contain at least 2 default offer banners');
  assert.equal(banners[0].id, 'offer-1');
  assert.ok(banners[0].badge_text, 'Default banner must have badge text');
  assert.ok(banners[0].coupon_code, 'Default banner must have coupon code');
});

// OB-02: Active Banners Filter
suite.test('OB-02: getActiveOfferBanners returns strictly active banners', () => {
  store.resetDemoData();
  const all = store.getOfferBanners();
  const active = store.getActiveOfferBanners();
  assert.ok(active.every(b => b.is_active === true), 'All returned banners must have is_active true');
  assert.equal(active.length, all.filter(b => b.is_active).length);
});

// OB-03: Add Offer Banner
suite.test('OB-03: Manager can add a new custom offer banner with custom gradient and coupon', () => {
  const newOfferData = {
    title: 'Woodfired Weekend Sourdough Fest',
    subtitle: '25% off on all Neapolitan pizzas after 7 PM',
    badge_text: '25% OFF',
    coupon_code: 'PIZZA25',
    discount_type: 'percentage',
    discount_value: 25,
    min_order_amount: 450,
    bg_gradient: 'from-[#FF7622] to-[#FFA14A]',
    icon: '🍕'
  };

  const res = store.addOfferBanner(newOfferData);
  assert.ok(res.success, 'addOfferBanner should return success true');
  assert.ok(res.banner.id, 'New banner must have unique ID');
  assert.equal(res.banner.title, 'Woodfired Weekend Sourdough Fest');
  assert.equal(res.banner.badge_text, '25% OFF');
  assert.equal(res.banner.coupon_code, 'PIZZA25');
  assert.equal(res.banner.icon, '🍕');

  const retrieved = store.getOfferBanners().find(b => b.id === res.banner.id);
  assert.ok(retrieved, 'New banner must be retrievable from store');
});

// OB-04: Title Validation
suite.test('OB-04: addOfferBanner validates required title', () => {
  const res = store.addOfferBanner({ title: '   ', badge_text: '10% OFF' });
  assert.equal(res.success, false, 'Empty title must fail');
  assert.ok(res.error.includes('title is required'), 'Error must specify title requirement');
});

// OB-05: Update Banner
suite.test('OB-05: Manager can update an existing offer banner headline and discount', () => {
  const banners = store.getOfferBanners();
  const target = banners[0];

  const updateRes = store.updateOfferBanner(target.id, {
    title: 'Updated Happy Hour Deluxe',
    discount_value: 40,
    badge_text: '40% OFF'
  });

  assert.ok(updateRes.success, 'Update should succeed');
  assert.equal(updateRes.banner.title, 'Updated Happy Hour Deluxe');
  assert.equal(updateRes.banner.discount_value, 40);
  assert.equal(updateRes.banner.badge_text, '40% OFF');
});

// OB-06: Toggle Active Status
suite.test('OB-06: Manager can pause and resume offer banners', () => {
  const banners = store.getOfferBanners();
  const target = banners[0];
  const initialStatus = target.is_active;

  const toggle1 = store.toggleOfferBanner(target.id);
  assert.ok(toggle1.success);
  assert.equal(toggle1.is_active, !initialStatus, 'Status must invert');

  const toggle2 = store.toggleOfferBanner(target.id);
  assert.ok(toggle2.success);
  assert.equal(toggle2.is_active, initialStatus, 'Status must revert');
});

// OB-07: Delete Banner
suite.test('OB-07: Manager can delete an obsolete offer banner', () => {
  const created = store.addOfferBanner({
    title: 'Flash Flash Sale 1 Hour',
    badge_text: 'FLASH',
    coupon_code: 'FLASH50'
  });
  const id = created.banner.id;
  assert.ok(store.getOfferBanners().some(b => b.id === id));

  const delRes = store.deleteOfferBanner(id);
  assert.ok(delRes.success);
  assert.ok(!store.getOfferBanners().some(b => b.id === id), 'Banner should no longer exist');
});

// OB-08: Customer View Rendering under Cafe Name
suite.test('OB-08: Customer Dine-In View renders the active offer banner directly under cafe name', () => {
  store.resetDemoData();
  const container = document.createElement('div');
  store.cart.table_number = 1;

  const cleanup = renderCustomerView(container, store, {});
  assert.ok(container.innerHTML.includes('cafe-offer-banner-container'), 'Offer banner container must be rendered under cafe name');
  assert.ok(container.innerHTML.includes(store.venue.name), 'Venue name must be present');

  cleanup?.();
});

// OB-09: Coupon Pill & Copy
suite.test('OB-09: Offer banner renders coupon pill with tap-to-copy trigger', () => {
  store.resetDemoData();
  const container = document.createElement('div');
  store.cart.table_number = 2;

  const cleanup = renderCustomerView(container, store, {});
  assert.ok(container.innerHTML.includes('btn-copy-offer-coupon'), 'Copy coupon button must be rendered');
  assert.ok(container.innerHTML.includes('BREW20'), 'Coupon code must be rendered');

  cleanup?.();
});

// OB-10: Carousel Cycling
suite.test('OB-10: Customer View supports multi-offer cycling with prev/next buttons and indicator dots', () => {
  store.resetDemoData();
  const container = document.createElement('div');
  store.cart.table_number = 3;

  const cleanup = renderCustomerView(container, store, {});
  assert.ok(container.innerHTML.includes('data-offer-dot="0"'), 'Should render first indicator dot');
  assert.ok(container.innerHTML.includes('data-offer-dot="1"'), 'Should render second indicator dot');
  assert.ok(container.innerHTML.includes('btn-offer-next'), 'Next button must exist');
  assert.ok(container.innerHTML.includes('btn-offer-prev'), 'Prev button must exist');

  cleanup?.();
});

// OB-11: Clean Disappearance when No Active Offers
suite.test('OB-11: Deactivating all offer banners cleanly hides the banner container from Customer View', () => {
  store.resetDemoData();
  store.offerBanners.forEach(b => { b.is_active = false; });
  store.save('ays_offer_banners', store.offerBanners);

  const container = document.createElement('div');
  store.cart.table_number = 4;

  const cleanup = renderCustomerView(container, store, {});
  assert.equal(container.innerHTML.includes('cafe-offer-banner-container'), false, 'Banner container should not render when 0 active offers exist');

  cleanup?.();
});

// OB-12: MenuView Offer Management Tab
suite.test('OB-12: MenuView provides Offer Banners tab and authoring controls', () => {
  store.resetDemoData();
  const container = document.createElement('div');

  const cleanup = renderMenuView(container, store);
  assert.ok(container.innerHTML.includes('data-tab="offers"'), 'MenuView must have Offer Banners tab');
  assert.ok(container.innerHTML.includes('btn-add-offer'), 'Header ribbon must include + Offer Banner button');

  cleanup?.();
});

// OB-13: No edit options in Guest Dine-In View
suite.test('OB-13: Guest Dine-In Ordering contains no manager edit options or shortcuts', () => {
  store.resetDemoData();
  const container = document.createElement('div');
  store.cart.table_number = 1;

  const cleanup = renderCustomerView(container, store, {});
  assert.equal(container.innerHTML.includes('btn-quick-manage-offers'), false, 'btn-quick-manage-offers must not exist');
  assert.equal(container.innerHTML.includes('Edit Offers'), false, 'Edit Offers label must not exist');

  cleanup?.();
});

// OB-14: Time period expiration auto-hides offers from guest dine-in view
suite.test('OB-14: Offers whose time period is ended are automatically excluded from guest view', () => {
  store.resetDemoData();
  
  // Add an expired offer
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  store.addOfferBanner({
    title: 'Yesterday Only Midnight Deal',
    badge_text: 'EXPIRED',
    valid_until: pastDate,
    is_active: true
  });

  const allBanners = store.getOfferBanners();
  const expiredBanner = allBanners.find(b => b.title === 'Yesterday Only Midnight Deal');
  assert.ok(expiredBanner, 'Expired banner must exist in store');
  assert.equal(store.isOfferExpired(expiredBanner), true, 'isOfferExpired should return true');

  const activeBanners = store.getActiveOfferBanners();
  assert.ok(!activeBanners.some(b => b.title === 'Yesterday Only Midnight Deal'), 'Expired banner must NOT be returned by getActiveOfferBanners');

  // Verify CustomerView does NOT show the expired offer
  const container = document.createElement('div');
  store.cart.table_number = 1;
  const cleanup = renderCustomerView(container, store, {});
  assert.equal(container.innerHTML.includes('Yesterday Only Midnight Deal'), false, 'CustomerView must never render expired offer');
  cleanup?.();
});

// OB-15: Manager can purge ended offers with deleteExpiredOffers()
suite.test('OB-15: deleteExpiredOffers() purges only ended offers and retains active/non-expired ones', () => {
  store.resetDemoData();
  const initialCount = store.getOfferBanners().length;

  // Add 2 expired offers and 1 future offer
  store.addOfferBanner({ title: 'Old Flash 1', valid_until: new Date(Date.now() - 100000).toISOString() });
  store.addOfferBanner({ title: 'Old Flash 2', valid_until: new Date(Date.now() - 50000).toISOString() });
  store.addOfferBanner({ title: 'Future Festival', valid_until: new Date(Date.now() + 86400000).toISOString() });

  assert.equal(store.getOfferBanners().length, initialCount + 3);

  const purgeRes = store.deleteExpiredOffers();
  assert.ok(purgeRes.success);
  assert.equal(purgeRes.count, 2, 'Should purge exactly 2 expired offers');

  const remaining = store.getOfferBanners();
  assert.ok(remaining.some(b => b.title === 'Future Festival'), 'Future non-expired offer must remain');
  assert.ok(!remaining.some(b => b.title === 'Old Flash 1'), 'Old offer 1 must be deleted');
  assert.ok(!remaining.some(b => b.title === 'Old Flash 2'), 'Old offer 2 must be deleted');
});

// OB-16: Manager can toggle "Don't Display" to hide offer without deleting it
suite.test('OB-16: Manager can toggle Don\'t Display to hide an offer without deleting it', () => {
  store.resetDemoData();
  const banner = store.getOfferBanners()[0];
  assert.equal(banner.is_active, true);

  // Toggle to don't display
  const toggleRes = store.toggleOfferBanner(banner.id);
  assert.ok(toggleRes.success);
  assert.equal(toggleRes.is_active, false);

  // Still in catalog
  assert.ok(store.getOfferBanners().some(b => b.id === banner.id), 'Banner still exists in catalog');
  // But not in active guest banners
  assert.ok(!store.getActiveOfferBanners().some(b => b.id === banner.id), 'Hidden banner must not be active');

  // Reactivate
  store.toggleOfferBanner(banner.id);
  assert.ok(store.getActiveOfferBanners().some(b => b.id === banner.id), 'Banner can be re-displayed');
});

// OB-17: MenuView offers tab renders delete triggers and expiry information
suite.test('OB-17: MenuView offers tab renders delete triggers and period status', () => {
  store.resetDemoData();
  // Add one expired offer
  store.addOfferBanner({
    title: 'Sunset Espresso Ended',
    valid_until: new Date(Date.now() - 60000).toISOString(),
    is_active: true
  });

  const container = document.createElement('div');
  const cleanup = renderMenuView(container, store, { initialTab: 'offers' });

  assert.ok(container.innerHTML.includes('data-delete-offer'), 'Must include delete offer buttons');
  assert.ok(container.innerHTML.includes('Period Ended (Hidden)'), 'Must show Period Ended status pill');
  assert.ok(container.innerHTML.includes('btn-delete-expired-offers'), 'Must include bulk delete expired button');

  cleanup?.();
});

// If executed directly
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('offer_banner_customization.test.mjs')) {
  suite.run().then(res => {
    console.log(`\nResults: ${res.passed}/${res.total} passed in ${res.durationMs}ms`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

