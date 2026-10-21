import { Client } from 'pg';

async function run() {
  const c = new Client({
    connectionString: 'postgres://postgres:AyS%232026_9xPzK8lYtueWTt!Db@db.mdijiutvafaszcnolwee.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('Connected to PostgreSQL...');

  // 1. Drop all dependent policies & constraints
  await c.query(`
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

    DROP POLICY IF EXISTS "Cafe admin access own cafe" ON public.cafes;
    DROP POLICY IF EXISTS "Master admin full cafe access" ON public.cafes;
    DROP POLICY IF EXISTS "Allow authenticated insert cafe" ON public.cafes;
    DROP POLICY IF EXISTS "cafes_all_policy" ON public.cafes;

    DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
    DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_all_policy" ON public.profiles;

    DROP POLICY IF EXISTS "Allow public read on venues" ON public.venues;
    DROP POLICY IF EXISTS "venues_all_policy" ON public.venues;

    DROP POLICY IF EXISTS "Allow public read on tables" ON public.tables;
    DROP POLICY IF EXISTS "tables_all_policy" ON public.tables;

    DROP POLICY IF EXISTS "Allow public read on menu_items" ON public.menu_items;
    DROP POLICY IF EXISTS "menu_items_all_policy" ON public.menu_items;

    DROP POLICY IF EXISTS "Allow public read on orders" ON public.orders;
    DROP POLICY IF EXISTS "orders_all_policy" ON public.orders;

    DROP POLICY IF EXISTS "Allow public read on order_items" ON public.order_items;
    DROP POLICY IF EXISTS "order_items_all_policy" ON public.order_items;

    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey CASCADE;
    ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey CASCADE;
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_venue_id_fkey CASCADE;
    ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_venue_id_fkey CASCADE;
    ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS unique_venue_table CASCADE;
    ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_venue_id_fkey CASCADE;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cafe_id_fkey CASCADE;
  `);
  console.log('Dropped all old policies & foreign key constraints...');

  // 2. Alter column types
  await c.query(`
    -- Adjust cafes table
    ALTER TABLE public.cafes DROP CONSTRAINT IF EXISTS cafes_pkey CASCADE;
    ALTER TABLE public.cafes ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.cafes ADD PRIMARY KEY (id);
    ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS owner_email TEXT;
    ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS owner_name TEXT;

    -- Adjust profiles table
    ALTER TABLE public.profiles ALTER COLUMN cafe_id TYPE TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS staff_pin TEXT DEFAULT '7116';

    -- Adjust venues table
    ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_pkey CASCADE;
    ALTER TABLE public.venues ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.venues ADD PRIMARY KEY (id);

    -- Adjust tables table
    ALTER TABLE public.tables ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.tables ALTER COLUMN venue_id TYPE TEXT;
    ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS cafe_id TEXT;
    ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Vacant';
    ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 4;
    ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'Indoor Courtyard';

    -- Adjust menu_items table
    ALTER TABLE public.menu_items ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.menu_items ALTER COLUMN venue_id TYPE TEXT;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS outlet_id TEXT;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS dietary_tag TEXT DEFAULT 'Veg';

    -- Adjust orders table
    ALTER TABLE public.orders ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.orders ALTER COLUMN venue_id TYPE TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cafe_id TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

    -- Adjust order_items table
    ALTER TABLE public.order_items ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.order_items ALTER COLUMN order_id TYPE TEXT;
    ALTER TABLE public.order_items ALTER COLUMN menu_item_id TYPE TEXT;
  `);
  console.log('Altered column types...');

  // 3. Create permissive policies for cloud access
  await c.query(`
    CREATE POLICY "cafes_all_policy" ON public.cafes FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "profiles_all_policy" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "venues_all_policy" ON public.venues FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "tables_all_policy" ON public.tables FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "menu_items_all_policy" ON public.menu_items FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "orders_all_policy" ON public.orders FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "order_items_all_policy" ON public.order_items FOR ALL USING (true) WITH CHECK (true);
  `);
  console.log('Permissive policies applied!');

  // 4. Seed Cloud Data
  await c.query(`
    -- Seed Master Admin Profile
    INSERT INTO public.profiles (id, email, full_name, role, cafe_id, staff_pin)
    VALUES (
      '13625ef9-c3cc-467f-a5b9-7beb80c60af5',
      'atyourscan.admin@gmail.com',
      'Vansh Waghre',
      'master_admin',
      NULL,
      '7116'
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      staff_pin = EXCLUDED.staff_pin;

    -- Seed Rahul Khati Cafe Admin Profile
    INSERT INTO public.profiles (id, email, full_name, role, cafe_id, staff_pin)
    VALUES (
      'e0348521-d487-43c8-b110-a470e0c9c398',
      'waghrevansh@gmail.com',
      'Rahul Khati',
      'cafe_admin',
      'cafe-first-way-cafe-pw2q-hdxu',
      '7116'
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      cafe_id = EXCLUDED.cafe_id,
      staff_pin = EXCLUDED.staff_pin;

    -- Seed Cafe into public.cafes
    INSERT INTO public.cafes (id, slug, name, vpa_address, table_count, status, owner_email, owner_name)
    VALUES (
      'cafe-first-way-cafe-pw2q-hdxu',
      'first-way-cafe-pw2q',
      'First Way Cafe',
      '9970561554@ptaxis',
      12,
      'active',
      'waghrevansh@gmail.com',
      'Rahul Khati'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      vpa_address = EXCLUDED.vpa_address,
      owner_email = EXCLUDED.owner_email,
      owner_name = EXCLUDED.owner_name;

    -- Seed Venue into public.venues
    INSERT INTO public.venues (id, name, upi_id)
    VALUES (
      'cafe-first-way-cafe-pw2q-hdxu',
      'First Way Cafe',
      '9970561554@ptaxis'
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      upi_id = EXCLUDED.upi_id;

    -- Compatibility fallback
    INSERT INTO public.venues (id, name, upi_id)
    VALUES ('550e8400-e29b-41d4-a716-446655440000', 'First Way Cafe', '9970561554@ptaxis')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.cafes (id, slug, name, vpa_address, table_count, status, owner_email, owner_name)
    VALUES ('550e8400-e29b-41d4-a716-446655440000', 'first-way-cafe', 'First Way Cafe', '9970561554@ptaxis', 12, 'active', 'waghrevansh@gmail.com', 'Rahul Khati')
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('Seeded profiles, venues, cafes into Supabase Cloud!');

  // Seed 12 tables
  for (let i = 1; i <= 12; i++) {
    const tableId = `tbl-first-way-${i}`;
    await c.query(`
      INSERT INTO public.tables (id, venue_id, cafe_id, table_number, qr_code_url, status, capacity, zone)
      VALUES ($1, $2, $3, $4, $5, 'Vacant', 4, $6)
      ON CONFLICT (id) DO NOTHING;
    `, [
      tableId,
      'cafe-first-way-cafe-pw2q-hdxu',
      'cafe-first-way-cafe-pw2q-hdxu',
      i,
      `https://atyourscan-nexus.vercel.app/?table=${i}`,
      i <= 4 ? 'Indoor Courtyard' : i <= 8 ? 'Verandah & Garden' : 'Mezzanine Lounge'
    ]);
  }
  console.log('Seeded 12 tables!');

  // Seed sample menu items
  const sampleDishes = [
    { name: 'Tea', price: 20, cat: 'Hot Beverages' },
    { name: 'Hot Coffee', price: 30, cat: 'Hot Beverages' },
    { name: 'Cold Coffee', price: 60, cat: 'Cold Beverages' },
    { name: 'Espresso Romano', price: 140, cat: 'Specialty Coffee' },
    { name: 'Classic Cappuccino', price: 180, cat: 'Specialty Coffee' },
    { name: 'Iced Spanish Latte', price: 220, cat: 'Specialty Coffee' },
    { name: 'Cold Brew Citrus', price: 210, cat: 'Specialty Coffee' },
    { name: 'Sourdough Avocado Toast', price: 260, cat: 'Continental' },
    { name: 'Truffle Mushroom Melt Panini', price: 290, cat: 'Continental' },
    { name: 'Belgian Dark Chocolate Croissant', price: 190, cat: 'Bakery & Dessert' },
    { name: 'Blueberry Cheesecake Slice', price: 240, cat: 'Bakery & Dessert' }
  ];

  for (let i = 0; i < sampleDishes.length; i++) {
    const d = sampleDishes[i];
    const dishId = `dish-sample-${i + 1}`;
    await c.query(`
      INSERT INTO public.menu_items (id, venue_id, outlet_id, name, price, stock_quantity, is_available, category)
      VALUES ($1, $2, $3, $4, $5, 50, true, $6)
      ON CONFLICT (id) DO NOTHING;
    `, [dishId, 'cafe-first-way-cafe-pw2q-hdxu', 'cafe-first-way-cafe-pw2q-hdxu', d.name, d.price, d.cat]);
  }
  console.log('Seeded menu items into Supabase Cloud!');

  await c.end();
  console.log('ALL DONE! SUPABASE CLOUD IS FULLY LIVE & POPULATED!');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
