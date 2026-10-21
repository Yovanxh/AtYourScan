/**
 * AtYourScan - Database Seeder Script
 * Inserts a sample venue, tables, and menu items for immediate frontend testing.
 * 
 * Usage:
 *   node scripts/seed.mjs
 */

import { supabase } from '../supabase.js';

async function seed() {
  console.log('Seeding initial data for AtYourScan...');

  // 1. Check or insert Venue
  const { data: existingVenues } = await supabase.from('venues').select('*').limit(1);
  let venueId;

  if (existingVenues && existingVenues.length > 0) {
    venueId = existingVenues[0].id;
    console.log(`Using existing venue: ${existingVenues[0].name} (${venueId})`);
  } else {
    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .insert({
        name: 'The Artisan Roast Cafe',
        upi_id: 'artisanroast@okaxis',
      })
      .select()
      .single();

    if (venueErr) throw venueErr;
    venueId = venue.id;
    console.log(`Created sample venue: ${venue.name} (${venueId})`);
  }

  // 2. Insert Tables (Tables 1 to 5)
  const { data: existingTables } = await supabase.from('tables').select('*').eq('venue_id', venueId);
  if (!existingTables || existingTables.length === 0) {
    const tablesToInsert = [1, 2, 3, 4, 5].map((num) => ({
      venue_id: venueId,
      table_number: num,
      qr_code_url: `http://localhost:3000/scan/${venueId}/${num}`,
    }));

    const { error: tablesErr } = await supabase.from('tables').insert(tablesToInsert);
    if (tablesErr) console.warn('Tables insert warning:', tablesErr.message);
    else console.log('Created 5 cafe tables (Tables 1 - 5).');
  }

  // 3. Insert Menu Items
  const { data: existingMenu } = await supabase.from('menu_items').select('*').eq('venue_id', venueId);
  if (!existingMenu || existingMenu.length === 0) {
    const sampleMenu = [
      { venue_id: venueId, name: 'Espresso Romano', price: 140.00, stock_quantity: 50, is_available: true },
      { venue_id: venueId, name: 'Classic Cappuccino', price: 180.00, stock_quantity: 50, is_available: true },
      { venue_id: venueId, name: 'Iced Spanish Latte', price: 220.00, stock_quantity: 30, is_available: true },
      { venue_id: venueId, name: 'Cold Brew Citrus', price: 210.00, stock_quantity: 25, is_available: true },
      { venue_id: venueId, name: 'Sourdough Avocado Toast', price: 260.00, stock_quantity: 20, is_available: true },
      { venue_id: venueId, name: 'Truffle Mushroom Melt Panini', price: 290.00, stock_quantity: 15, is_available: true },
      { venue_id: venueId, name: 'Belgian Dark Chocolate Croissant', price: 190.00, stock_quantity: 12, is_available: true },
      { venue_id: venueId, name: 'Blueberry Cheesecake Slice', price: 240.00, stock_quantity: 8, is_available: true },
    ];

    const { error: menuErr } = await supabase.from('menu_items').insert(sampleMenu);
    if (menuErr) console.warn('Menu insert warning:', menuErr.message);
    else console.log('Created 8 sample cafe menu items with pricing and stock.');
  }

  console.log('\n✅ Database seeded successfully!');
  console.log(`Scan URL to test: http://localhost:3000/scan/${venueId}/1`);
  console.log(`Admin KDS URL to test: http://localhost:3000/admin\n`);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
});
