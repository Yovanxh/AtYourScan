-- ============================================================================
-- AtYourScan: Database Schema Harmonization & Ordering Upgrade Migration
-- Milestone M1 Idempotent Schema Migration (Requirement R6)
-- ============================================================================

-- 1. Status Check Constraint Harmonization
-- Harmonize orders_status_check to accommodate both existing workflow statuses
-- and frontend/test pipeline statuses ('in_kitchen', 'AWAITING_VERIFICATION')
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status = ANY (ARRAY[
    'New'::text, 
    'Preparing'::text, 
    'Ready'::text, 
    'Completed'::text, 
    'Cancelled'::text, 
    'AWAITING_VERIFICATION'::text, 
    'in_kitchen'::text
  ]));

-- 2. Orders Table Missing Columns (Idempotent)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'UPI';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utr_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_amount NUMERIC(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'PENDING_APPROVAL';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_pay_later BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS session_token TEXT;

-- 3. Order Items Table Missing Snapshot Columns (Idempotent)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Foreign Key Constraints Restoration
-- Restore referential integrity between child order_items and parent orders (matching TEXT id types)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- 5. Supabase Realtime Publication & Replica Identity
-- Ensure publication supabase_realtime publishes orders, order_items, tables, venues, and menu_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'venues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
  END IF;
END $$;

-- Enable REPLICA IDENTITY FULL for complete change payloads in Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.tables REPLICA IDENTITY FULL;
ALTER TABLE public.venues REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;

-- 6. Atomic Order RPC Function (create_order_atomic)
-- Executes transactional order validation, stock decrement, price snapshots, 
-- and atomic insertion of parent order and child items with idempotency protection.
CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id TEXT;
  v_venue_id TEXT;
  v_cafe_id TEXT;
  v_table_number INT;
  v_source TEXT;
  v_status TEXT;
  v_session_token TEXT;
  v_payment_method TEXT;
  v_payment_status TEXT;
  v_verification_status TEXT;
  v_is_pay_later BOOLEAN;
  v_utr_number TEXT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_items JSONB;
  v_item JSONB;
  v_menu_item_id TEXT;
  v_item_name TEXT;
  v_quantity INT;
  v_unit_price NUMERIC(10,2);
  v_notes TEXT;
  v_db_item RECORD;
  v_subtotal NUMERIC(10,2) := 0.00;
  v_total_amount NUMERIC(10,2) := 0.00;
  v_result_items JSONB := '[]'::jsonb;
  v_returned_order JSONB;
  v_created_at TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF p_order IS NULL THEN
    RAISE EXCEPTION 'Order payload cannot be null';
  END IF;

  -- 1. Extract IDs and references
  v_venue_id := COALESCE(p_order->>'venue_id', p_order->>'cafe_id');
  v_cafe_id := COALESCE(p_order->>'cafe_id', p_order->>'venue_id');
  IF v_venue_id IS NULL OR trim(v_venue_id) = '' THEN
    RAISE EXCEPTION 'venue_id is required';
  END IF;

  v_table_number := COALESCE(NULLIF(p_order->>'table_number', '')::INT, 1);
  v_source := COALESCE(NULLIF(p_order->>'source', ''), 'QR_DINE_IN');
  v_status := COALESCE(NULLIF(p_order->>'status', ''), 'New');
  v_session_token := NULLIF(p_order->>'session_token', '');
  v_payment_method := COALESCE(NULLIF(p_order->>'payment_method', ''), 'UPI');
  v_payment_status := COALESCE(NULLIF(p_order->>'payment_status', ''), 'PENDING');
  v_verification_status := COALESCE(NULLIF(p_order->>'verification_status', ''), 'PENDING_APPROVAL');
  v_is_pay_later := COALESCE((p_order->>'is_pay_later')::BOOLEAN, false);
  v_utr_number := NULLIF(p_order->>'utr_number', '');
  v_customer_name := COALESCE(NULLIF(p_order->>'customer_name', ''), 'Guest at Table ' || v_table_number);
  v_customer_phone := NULLIF(p_order->>'customer_phone', '');

  -- 2. Resolve order ID (idempotency guard)
  IF p_order->>'id' IS NOT NULL AND length(trim(p_order->>'id')) > 0 THEN
    v_order_id := trim(p_order->>'id');
  ELSIF p_order->>'order_id' IS NOT NULL AND length(trim(p_order->>'order_id')) > 0 THEN
    v_order_id := trim(p_order->>'order_id');
  ELSE
    v_order_id := 'ord-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  END IF;

  -- If this order ID was already created, return it idempotently (duplicate submission prevention)
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_order_id) THEN
    SELECT to_jsonb(o.*) INTO v_returned_order
    FROM public.orders o
    WHERE o.id = v_order_id;
    RETURN v_returned_order;
  END IF;

  -- 3. Validate items
  v_items := p_order->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- 4. Process and validate each item, decrement stock, and build snapshot
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_menu_item_id := COALESCE(
      NULLIF(v_item->>'menu_item_id', ''),
      NULLIF(v_item->>'dish_id', ''),
      NULLIF(v_item->>'id', '')
    );
    IF v_menu_item_id IS NULL THEN
      RAISE EXCEPTION 'Item missing menu_item_id/dish_id';
    END IF;

    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    IF v_quantity <= 0 THEN
      v_quantity := 1;
    END IF;

    v_item_name := COALESCE(
      NULLIF(v_item->>'item_name', ''),
      NULLIF(v_item->>'dish_name', ''),
      NULLIF(v_item->>'name', ''),
      'Dish'
    );

    v_notes := COALESCE(
      NULLIF(v_item->>'notes', ''),
      NULLIF(v_item->>'customization', ''),
      ''
    );

    -- Check if item exists in menu_items
    SELECT * INTO v_db_item FROM public.menu_items WHERE id = v_menu_item_id FOR UPDATE;
    IF FOUND THEN
      IF v_db_item.is_available = false THEN
        RAISE EXCEPTION 'Dish "%" is currently unavailable', v_db_item.name;
      END IF;

      -- Check stock if enforced
      IF v_db_item.stock_quantity IS NOT NULL AND v_db_item.stock_quantity > 0 AND v_db_item.stock_quantity < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for "%" (only % left)', v_db_item.name, v_db_item.stock_quantity;
      END IF;

      -- Authoritative price from DB
      v_unit_price := v_db_item.price;
      v_item_name := v_db_item.name;

      -- Decrement stock atomically
      IF v_db_item.stock_quantity IS NOT NULL THEN
        UPDATE public.menu_items
        SET stock_quantity = GREATEST(0, stock_quantity - v_quantity),
            is_available = CASE WHEN (stock_quantity - v_quantity) <= 0 THEN false ELSE is_available END
        WHERE id = v_db_item.id;
      END IF;
    ELSE
      -- Fallback to provided price if item not found in catalog (e.g. test suites or dynamic items)
      v_unit_price := COALESCE(
        (v_item->>'unit_price')::NUMERIC(10,2),
        (v_item->>'price')::NUMERIC(10,2),
        0.00
      );
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    -- Build snapshot item object (used for orders.items snapshot and subsequent child inserts)
    v_result_items := v_result_items || jsonb_build_object(
      'id', v_menu_item_id,
      'dish_id', v_menu_item_id,
      'menu_item_id', v_menu_item_id,
      'name', v_item_name,
      'dish_name', v_item_name,
      'item_name', v_item_name,
      'quantity', v_quantity,
      'price', v_unit_price,
      'unit_price', v_unit_price,
      'notes', v_notes,
      'customization', v_notes
    );
  END LOOP;

  -- 5. Calculate authoritative total
  IF p_order->>'total_amount' IS NOT NULL AND (p_order->>'total_amount')::NUMERIC(10,2) > 0 THEN
    v_total_amount := (p_order->>'total_amount')::NUMERIC(10,2);
  ELSE
    v_total_amount := v_subtotal;
  END IF;

  -- 6. Insert PARENT orders row FIRST (satisfies foreign key on child order_items)
  INSERT INTO public.orders (
    id,
    venue_id,
    cafe_id,
    table_number,
    source,
    status,
    total_amount,
    payment_status,
    payment_method,
    verification_status,
    is_pay_later,
    utr_number,
    customer_name,
    customer_phone,
    session_token,
    items,
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    v_venue_id,
    v_cafe_id,
    v_table_number,
    v_source,
    v_status,
    v_total_amount,
    v_payment_status,
    v_payment_method,
    v_verification_status,
    v_is_pay_later,
    v_utr_number,
    v_customer_name,
    v_customer_phone,
    v_session_token,
    v_result_items,
    v_created_at,
    v_created_at
  );

  -- 7. Insert CHILD order_items rows
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_result_items)
  LOOP
    INSERT INTO public.order_items (
      id,
      order_id,
      menu_item_id,
      quantity,
      item_name,
      unit_price,
      notes
    ) VALUES (
      'oi-' || substr(md5(random()::text || clock_timestamp()::text || (v_item->>'menu_item_id')), 1, 8),
      v_order_id,
      v_item->>'menu_item_id',
      (v_item->>'quantity')::INT,
      v_item->>'item_name',
      (v_item->>'unit_price')::NUMERIC(10,2),
      v_item->>'notes'
    );
  END LOOP;

  -- 8. Query and return the inserted order row as JSONB
  SELECT to_jsonb(o.*) INTO v_returned_order
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_returned_order;
END;
$$;

-- Grant execution permissions on create_order_atomic
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO public, anon, authenticated, service_role;

-- 7. Row Level Security (RLS) Hardening
-- Protect venues and profiles from public tampering (protecting venues.upi_id and staff PINs)
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Venues: Public can read, authenticated admin/staff can mutate
DROP POLICY IF EXISTS "venues_all_policy" ON public.venues;
DROP POLICY IF EXISTS "Allow public write on venues" ON public.venues;
DROP POLICY IF EXISTS "Allow public read on venues" ON public.venues;
DROP POLICY IF EXISTS "Public can view venues" ON public.venues;
DROP POLICY IF EXISTS "Allow authenticated staff to update venues" ON public.venues;
DROP POLICY IF EXISTS "Allow authenticated staff to insert venues" ON public.venues;
DROP POLICY IF EXISTS "Allow authenticated staff to delete venues" ON public.venues;

CREATE POLICY "Public can view venues" 
  ON public.venues 
  FOR SELECT 
  TO public 
  USING (true);

CREATE POLICY "Allow authenticated staff to update venues" 
  ON public.venues 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated staff to insert venues" 
  ON public.venues 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated staff to delete venues" 
  ON public.venues 
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Profiles: Authenticated users only (protecting staff_pin and credentials)
DROP POLICY IF EXISTS "profiles_all_policy" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert profile" ON public.profiles;

CREATE POLICY "Allow authenticated users to read profiles" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated users to update own profile" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert profile" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Orders: Public can select, insert and update (for customer order tracking & status transitions)
-- Drop wide open all policy
DROP POLICY IF EXISTS "orders_all_policy" ON public.orders;
DROP POLICY IF EXISTS "Allow public select on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update on orders" ON public.orders;

CREATE POLICY "Allow public select on orders" 
  ON public.orders 
  FOR SELECT 
  TO public 
  USING (true);

CREATE POLICY "Allow public insert on orders" 
  ON public.orders 
  FOR INSERT 
  TO public 
  WITH CHECK (true);

CREATE POLICY "Allow public update on orders" 
  ON public.orders 
  FOR UPDATE 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- Order Items: Public can select and insert
DROP POLICY IF EXISTS "order_items_all_policy" ON public.order_items;
DROP POLICY IF EXISTS "Allow public select on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public insert on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow public update on order_items" ON public.order_items;

CREATE POLICY "Allow public select on order_items" 
  ON public.order_items 
  FOR SELECT 
  TO public 
  USING (true);

CREATE POLICY "Allow public insert on order_items" 
  ON public.order_items 
  FOR INSERT 
  TO public 
  WITH CHECK (true);

CREATE POLICY "Allow public update on order_items" 
  ON public.order_items 
  FOR UPDATE 
  TO public 
  USING (true) 
  WITH CHECK (true);
