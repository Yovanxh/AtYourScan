import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONNECTION_STRING = process.env.DATABASE_URL || 
  'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres';

async function runMigration() {
  console.log('--- AtYourScan Database Migration: Ordering System Upgrade (M1) ---');
  const sqlPath = path.resolve(__dirname, '../supabase_ordering_upgrade.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Migration file not found at: ${sqlPath}`);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Loaded migration SQL from ${sqlPath} (${sqlContent.length} bytes)`);

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    await client.connect();
    console.log('Connected to PostgreSQL successfully.');

    console.log('Executing migration script...');
    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = Date.now() - startTime;
    console.log(`Migration executed successfully in ${duration}ms!`);

    // Verification check
    console.log('\n--- Verifying Migration Results ---');

    // 1. Check constraints on orders
    const checkRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'orders' AND c.conname = 'orders_status_check';
    `);
    console.log('orders_status_check:', checkRes.rows[0]?.def || 'MISSING');

    // 2. Check foreign keys on order_items
    const fkRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'order_items' AND c.conname = 'order_items_order_id_fkey';
    `);
    console.log('order_items_order_id_fkey:', fkRes.rows[0]?.def || 'MISSING');

    // 3. Check publication tables
    const pubRes = await client.query(`
      SELECT tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime'
      ORDER BY tablename;
    `);
    console.log('supabase_realtime tables:', pubRes.rows.map(r => r.tablename).join(', '));

    // 4. Check replica identity
    const replRes = await client.query(`
      SELECT relname, relreplident 
      FROM pg_class 
      WHERE relname IN ('orders', 'order_items', 'tables', 'venues', 'menu_items')
      ORDER BY relname;
    `);
    console.log('Replica identity (f=FULL):', replRes.rows.map(r => `${r.relname}: ${r.relreplident}`).join(', '));

    // 5. Check RPC function create_order_atomic
    const rpcRes = await client.query(`
      SELECT proname, prosecdef, prorettype::regtype::text 
      FROM pg_proc 
      WHERE proname = 'create_order_atomic';
    `);
    console.log('create_order_atomic function:', rpcRes.rows[0] ? 'EXISTS (SECURITY DEFINER)' : 'MISSING');

    // 6. Check columns on orders
    const colRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'orders' 
        AND column_name IN ('payment_status', 'payment_method', 'utr_number', 'updated_at');
    `);
    console.log('orders new columns:', colRes.rows.map(r => r.column_name).join(', '));

    // 7. Check columns on order_items
    const oiColRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'order_items' 
        AND column_name IN ('item_name', 'unit_price', 'notes');
    `);
    console.log('order_items new columns:', oiColRes.rows.map(r => r.column_name).join(', '));

    console.log('\nMigration completed and verified successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
