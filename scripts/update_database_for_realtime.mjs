import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: 'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL...');

  // 1. Drop old constraint and add updated status constraint allowing 'pending'
  await client.query(`
    ALTER TABLE public.cafes DROP CONSTRAINT IF EXISTS cafes_status_check;
    ALTER TABLE public.cafes ADD CONSTRAINT cafes_status_check 
      CHECK (status IN ('pending', 'pending_approval', 'active', 'trial', 'suspended', 'rejected'));
  `);
  console.log('Updated cafes_status_check constraint to include pending.');

  // 2. Set replica identity full so realtime gets old/new data
  await client.query(`
    ALTER TABLE public.cafes REPLICA IDENTITY FULL;
  `);
  console.log('Set REPLICA IDENTITY FULL on public.cafes.');

  // 3. Ensure public.cafes is in supabase_realtime publication
  try {
    await client.query(`
      ALTER PUBLICATION supabase_realtime ADD TABLE public.cafes;
    `);
    console.log('Added public.cafes to supabase_realtime publication.');
  } catch (err) {
    if (err.message.includes('already in publication')) {
      console.log('public.cafes is already in supabase_realtime publication.');
    } else {
      console.warn('Realtime publication note:', err.message);
    }
  }

  // 4. Verify anon insert with status 'pending'
  const testId = 'test-check-' + Date.now();
  const testSlug = 'test-slug-' + Date.now();
  await client.query(`
    INSERT INTO public.cafes (id, name, slug, vpa_address, status, table_count, owner_name, owner_email)
    VALUES ($1, 'Test Verification Cafe', $2, 'test@vpa', 'pending', 12, 'Test Owner', 'test@test.com');
  `, [testId, testSlug]);
  console.log('Successfully inserted test row with status pending.');

  // Delete test row
  await client.query(`DELETE FROM public.cafes WHERE id = $1;`, [testId]);
  console.log('Cleaned up test row.');

  await client.end();
  console.log('Database configuration complete.');
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
