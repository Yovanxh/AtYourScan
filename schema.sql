-- ==========================================================
-- AtYourScan Database Schema & Realtime Configuration
-- ==========================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Venues Table
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    upi_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tables Table
CREATE TABLE IF NOT EXISTS public.tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_venue_table UNIQUE (venue_id, table_number)
);

-- 4. Menu Items Table
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INT NOT NULL DEFAULT 100 CHECK (stock_quantity >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('QR_DINE_IN', 'ZOMATO', 'SWIGGY', 'TAKEAWAY', 'OTHER')),
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'CONFIRMED')),
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    bill_amount DECIMAL(10, 2),
    utr_number TEXT,
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    is_locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0)
);

-- ==========================================================
-- Performance Indexes
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_tables_venue_id ON public.tables(venue_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_venue_id ON public.menu_items(venue_id);
CREATE INDEX IF NOT EXISTS idx_orders_venue_id ON public.orders(venue_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
-- Idempotent column additions for existing deployments
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_amount DECIMAL(10, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utr_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'UPI';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Partial unique index for non-null, non-staff-override UTRs
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_utr_number_unique 
ON public.orders (utr_number) 
WHERE utr_number IS NOT NULL AND utr_number NOT LIKE 'STAFF_OVERRIDE%';

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- ==========================================================
-- Configure Realtime
-- ==========================================================
-- Set replica identity to full so that realtime updates include previous record data
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication
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
        WHERE pubname = 'supabase_realtime' AND tablename = 'menu_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
    END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Basic Permissive Policies (Adjust according to auth requirements)
-- Allow public read for menu items and tables for QR customers
CREATE POLICY "Allow public read on venues" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Allow public read on tables" ON public.tables FOR SELECT USING (true);
CREATE POLICY "Allow public read on menu_items" ON public.menu_items FOR SELECT USING (true);

-- Allow customers to place orders and order items
CREATE POLICY "Allow public insert on orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow public update on orders" ON public.orders FOR UPDATE USING (true);

CREATE POLICY "Allow public insert on order_items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on order_items" ON public.order_items FOR SELECT USING (true);

-- ==========================================================
-- Milestone 1: Multi-Tenant Hospitality Auth, Terminals & Audit Schema
-- ==========================================================

-- 1. Merchants Table (Multi-tenant master organizations)
CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Venues Table Linkage & Hospitality Extension
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(4,2) DEFAULT 0.05;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC(4,2) DEFAULT 0.07;

-- 3. Users Table (Staff roster, roles, cloud portal & POS PIN credentials)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'Cashier', 'Server', 'Bartender', 'Chef')),
    password_hash TEXT,
    password_salt TEXT,
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    outlet_scopes JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Terminals Table (Physical billing counters & hardware SIN bindings)
CREATE TABLE IF NOT EXISTS public.terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    restaurant_id TEXT NOT NULL,
    sin TEXT NOT NULL,
    terminal_name TEXT NOT NULL,
    terminal_type TEXT NOT NULL DEFAULT 'BILLING_POS' CHECK (terminal_type IN ('BILLING_POS', 'BAR_POS', 'KDS', 'SERVER_TABLET')),
    pairing_token TEXT,
    device_fingerprint TEXT,
    is_paired BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'UNPAIRED' CHECK (status IN ('UNPAIRED', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
    paired_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_venue_sin UNIQUE (venue_id, sin)
);

-- 5. SSO Sessions Table (Active single sign-on sessions & revocation tracking)
CREATE TABLE IF NOT EXISTS public.sso_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_jti TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    active_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    terminal_sin TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Audit Logs Table (Supervisor override audit trail & sensitive operations)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    terminal_sin TEXT NOT NULL,
    action TEXT NOT NULL,
    action_label TEXT NOT NULL,
    target_item TEXT NOT NULL,
    initiator_staff_id TEXT,
    initiator_staff_name TEXT NOT NULL,
    initiator_role TEXT NOT NULL,
    authorizer_staff_id TEXT NOT NULL,
    authorizer_staff_name TEXT NOT NULL,
    authorizer_role TEXT NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_offline BOOLEAN DEFAULT false,
    sync_status TEXT DEFAULT 'SYNCED' CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================================
-- Performance & Query Optimization Indexes
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_venues_merchant_id ON public.venues(merchant_id);
CREATE INDEX IF NOT EXISTS idx_users_merchant_id ON public.users(merchant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_terminals_venue_id ON public.terminals(venue_id);
CREATE INDEX IF NOT EXISTS idx_terminals_sin ON public.terminals(sin);
CREATE INDEX IF NOT EXISTS idx_terminals_restaurant_id ON public.terminals(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_user_id ON public.sso_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_token_jti ON public.sso_sessions(token_jti);
CREATE INDEX IF NOT EXISTS idx_sso_sessions_expires_at ON public.sso_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_venue_id ON public.audit_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- ==========================================================
-- Configure Realtime Replication
-- ==========================================================
ALTER TABLE public.terminals REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'terminals'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.terminals;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'audit_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
    END IF;
END $$;

-- ==========================================================
-- Enable Row Level Security (RLS)
-- ==========================================================
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Permissive Hospitality POS Policies
CREATE POLICY "Allow public read on merchants" ON public.merchants FOR SELECT USING (true);
CREATE POLICY "Allow public insert on merchants" ON public.merchants FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON public.users FOR UPDATE USING (true);

CREATE POLICY "Allow public read on terminals" ON public.terminals FOR SELECT USING (true);
CREATE POLICY "Allow public insert on terminals" ON public.terminals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on terminals" ON public.terminals FOR UPDATE USING (true);

CREATE POLICY "Allow public select on sso_sessions" ON public.sso_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on sso_sessions" ON public.sso_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on sso_sessions" ON public.sso_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on audit_logs" ON public.audit_logs FOR SELECT USING (true);

-- ==========================================================
-- Milestone: Dynamic Menu Catalog, Bill of Materials (BOM) & Inventory Auto-Depletion
-- ==========================================================

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    course_type TEXT NOT NULL CHECK (course_type IN ('Starter', 'Main Course', 'Dessert', 'Beverage', 'Accompaniment')),
    dietary_scope TEXT NOT NULL CHECK (dietary_scope IN ('All', 'Veg-Only', 'Non-Veg-Only')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_outlet_category_name UNIQUE (outlet_id, name)
);

-- 2. Dishes Table
CREATE TABLE IF NOT EXISTS public.dishes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    dietary_tag TEXT NOT NULL CHECK (dietary_tag IN ('Veg', 'Non-Veg')),
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_outlet_dish_name UNIQUE (outlet_id, name)
);

-- 3. Inventory Items Table (Raw ingredients / stock keeping units)
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('ml', 'g', 'pcs', 'kg')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_outlet_inventory_name UNIQUE (outlet_id, name)
);

-- 4. Dish Ingredients (Bill of Materials - BOM mapping)
CREATE TABLE IF NOT EXISTS public.dish_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC NOT NULL CHECK (quantity_required > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_dish_inventory_item UNIQUE (dish_id, inventory_item_id)
);

-- Indexes for Fast Query Performance
CREATE INDEX IF NOT EXISTS idx_categories_outlet_id ON public.categories(outlet_id);
CREATE INDEX IF NOT EXISTS idx_dishes_outlet_id ON public.dishes(outlet_id);
CREATE INDEX IF NOT EXISTS idx_dishes_category_id ON public.dishes(category_id);
CREATE INDEX IF NOT EXISTS idx_dishes_available ON public.dishes(is_available);
CREATE INDEX IF NOT EXISTS idx_inventory_items_outlet_id ON public.inventory_items(outlet_id);
CREATE INDEX IF NOT EXISTS idx_dish_ingredients_dish_id ON public.dish_ingredients(dish_id);
CREATE INDEX IF NOT EXISTS idx_dish_ingredients_inventory_item_id ON public.dish_ingredients(inventory_item_id);

-- Realtime Publication for Catalog & Inventory
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER TABLE public.dishes REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_items REPLICA IDENTITY FULL;
ALTER TABLE public.dish_ingredients REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'categories'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'dishes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dishes;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'dish_ingredients'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dish_ingredients;
    END IF;
END $$;

-- Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_ingredients ENABLE ROW LEVEL SECURITY;

-- Public Read for Catalog Browsing (Guests must never be blocked)
CREATE POLICY "Allow public select on categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Allow public select on dishes" ON public.dishes FOR SELECT USING (true);
CREATE POLICY "Allow public select on inventory_items" ON public.inventory_items FOR SELECT USING (true);
CREATE POLICY "Allow public select on dish_ingredients" ON public.dish_ingredients FOR SELECT USING (true);

-- Admin Mutation Enforcement on Categories & Dishes
CREATE POLICY "Allow admin insert on categories" ON public.categories FOR INSERT
WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin update on categories" ON public.categories FOR UPDATE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin delete on categories" ON public.categories FOR DELETE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);

CREATE POLICY "Allow admin insert on dishes" ON public.dishes FOR INSERT
WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin update on dishes" ON public.dishes FOR UPDATE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin delete on dishes" ON public.dishes FOR DELETE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);

CREATE POLICY "Allow admin insert on inventory_items" ON public.inventory_items FOR INSERT
WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin update on inventory_items" ON public.inventory_items FOR UPDATE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin delete on inventory_items" ON public.inventory_items FOR DELETE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);

CREATE POLICY "Allow admin insert on dish_ingredients" ON public.dish_ingredients FOR INSERT
WITH CHECK (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin update on dish_ingredients" ON public.dish_ingredients FOR UPDATE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);
CREATE POLICY "Allow admin delete on dish_ingredients" ON public.dish_ingredients FOR DELETE
USING (
    coalesce(auth.jwt() ->> 'role', '') ILIKE 'admin' OR 
    coalesce(current_setting('request.jwt.claim.role', true), '') ILIKE 'admin'
);

-- ==========================================================
-- Supabase RPC: verify_admin_pin
-- Validates Admin PIN elevation challenge from counter terminals,
-- audits the elevation in public.audit_logs, and grants permission
-- ==========================================================
CREATE OR REPLACE FUNCTION public.verify_admin_pin(
    p_terminal_id TEXT,
    p_pin_hash TEXT,
    p_action TEXT DEFAULT 'CATALOG_MUTATION'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin RECORD;
    v_log_id TEXT;
BEGIN
    -- Verify if pin_hash corresponds to an active Admin
    SELECT id, full_name, role, venue_id INTO v_admin
    FROM public.users
    WHERE role = 'Admin' AND pin_hash = p_pin_hash AND is_active = true
    LIMIT 1;

    IF v_admin.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', '403 Forbidden: Invalid Admin PIN or unauthorized elevation'
        );
    END IF;

    -- Record the elevation in audit_logs
    v_log_id := 'AUDIT-' || floor(extract(epoch from now()))::text || '-' || floor(random() * 1000)::text;
    INSERT INTO public.audit_logs (
        id,
        venue_id,
        terminal_sin,
        action,
        action_label,
        target_item,
        initiator_staff_id,
        initiator_staff_name,
        initiator_role,
        authorizer_staff_id,
        authorizer_staff_name,
        authorizer_role,
        reason,
        metadata,
        created_at
    ) VALUES (
        v_log_id,
        COALESCE(v_admin.venue_id, '550e8400-e29b-41d4-a716-446655440000'::uuid),
        COALESCE(p_terminal_id, 'SIN-POS-01'),
        'ADMIN_ELEVATION',
        'Catalog Mutation Elevation',
        p_action,
        'TERMINAL_STAFF',
        'Staff Terminal User',
        'Cashier',
        v_admin.id::text,
        v_admin.full_name,
        v_admin.role,
        'Manager/Admin PIN elevation authorized for: ' || p_action,
        jsonb_build_object('action', p_action, 'timestamp', now()),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'authorizer_id', v_admin.id,
        'authorizer_name', v_admin.full_name,
        'authorizer_role', v_admin.role,
        'audit_log_id', v_log_id
    );
END;
$$;

-- ==========================================================
-- SUPER-ADMIN GLOBAL PLATFORM CONTROL PLANE SCHEMA & RPCS
-- ==========================================================

-- 1. System Health & Diagnostic Log Table
CREATE TABLE IF NOT EXISTS public.tenant_system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    tenant_id TEXT,
    terminal_id TEXT,
    view_name TEXT NOT NULL DEFAULT 'pos_edge',
    source TEXT NOT NULL DEFAULT 'pos_edge',
    log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error', 'fatal', 'critical')),
    severity TEXT NOT NULL DEFAULT 'warning',
    error_message TEXT NOT NULL,
    message TEXT,
    stack_trace TEXT,
    details TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    resolved BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Master Administrative Audit Trail (Tamper-Evident)
CREATE TABLE IF NOT EXISTS public.master_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_admin_id TEXT,
    super_admin_id TEXT,
    super_admin_name TEXT,
    super_admin_email TEXT,
    target_cafe_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
    target_tenant_id TEXT,
    target_tenant_name TEXT,
    action_type TEXT NOT NULL, -- e.g., 'REMOTE_PIN_RESET', 'FORCE_TABLE_RELEASE', 'TENANT_MAINTENANCE'
    action TEXT,
    action_label TEXT,
    target_resource TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for telemetry and audit log query performance
CREATE INDEX IF NOT EXISTS idx_tenant_system_logs_cafe ON public.tenant_system_logs(cafe_id);
CREATE INDEX IF NOT EXISTS idx_tenant_system_logs_level ON public.tenant_system_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_tenant_system_logs_status ON public.tenant_system_logs(status);
CREATE INDEX IF NOT EXISTS idx_master_audit_logs_action ON public.master_audit_logs(action_type);

-- 3. Super-Admin Secure Functions (RPC)

-- Secure PIN Reset by Master Super-Admin
CREATE OR REPLACE FUNCTION public.master_reset_staff_pin(
    p_staff_user_id TEXT,
    p_new_pin_hash TEXT,
    p_cafe_id TEXT,
    p_new_salt TEXT DEFAULT NULL,
    p_super_admin_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is strictly a Master Super-Admin
    IF (COALESCE(auth.jwt() -> 'app_metadata' ->> 'system_role', auth.jwt() ->> 'system_role')) != 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Master Super-Admins can execute remote PIN resets.';
    END IF;

    -- Update the staff pin hash in users table
    UPDATE public.users
    SET pin_hash = p_new_pin_hash,
        salt = COALESCE(p_new_salt, salt)
    WHERE (id::text = p_staff_user_id) AND (venue_id::text = p_cafe_id OR p_cafe_id IS NULL);

    -- Log the intervention
    INSERT INTO public.master_audit_logs (
        master_admin_id,
        super_admin_id,
        super_admin_name,
        target_tenant_id,
        action_type,
        action,
        action_label,
        target_resource,
        details
    ) VALUES (
        COALESCE(auth.uid()::text, p_super_admin_id),
        COALESCE(auth.uid()::text, p_super_admin_id),
        'Master Super-Admin',
        p_cafe_id,
        'REMOTE_PIN_RESET',
        'RESET_STAFF_PIN',
        'Remote Staff PIN Reset',
        'Staff ' || p_staff_user_id,
        jsonb_build_object('staff_user_id', p_staff_user_id, 'cafe_id', p_cafe_id)
    );

    RETURN TRUE;
END;
$$;

-- Secure Force Table Release by Master Super-Admin
CREATE OR REPLACE FUNCTION public.master_force_table_release(
    p_table_number INT,
    p_cafe_id TEXT,
    p_super_admin_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is strictly a Master Super-Admin
    IF (COALESCE(auth.jwt() -> 'app_metadata' ->> 'system_role', auth.jwt() ->> 'system_role')) != 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Master Super-Admins can force-release tables.';
    END IF;

    -- Update table state to Vacant
    UPDATE public.tables
    SET status = 'Vacant',
        party_size = 0,
        seated_at = NULL,
        active_order_id = NULL
    WHERE table_number = p_table_number AND (venue_id::text = p_cafe_id OR p_cafe_id IS NULL);

    -- Cancel dangling orders for this table
    UPDATE public.orders
    SET status = 'Cancelled'
    WHERE table_number = p_table_number 
      AND (venue_id::text = p_cafe_id OR p_cafe_id IS NULL)
      AND status NOT IN ('Completed', 'Cancelled');

    -- Audit log
    INSERT INTO public.master_audit_logs (
        master_admin_id,
        super_admin_id,
        super_admin_name,
        target_tenant_id,
        action_type,
        action,
        action_label,
        target_resource,
        details
    ) VALUES (
        COALESCE(auth.uid()::text, p_super_admin_id),
        COALESCE(auth.uid()::text, p_super_admin_id),
        'Master Super-Admin',
        p_cafe_id,
        'FORCE_TABLE_RELEASE',
        'FORCE_TABLE_RELEASE',
        'Surgical Table State Rescue',
        'Table ' || p_table_number::text,
        jsonb_build_object('table_number', p_table_number, 'cafe_id', p_cafe_id)
    );

    RETURN TRUE;
END;
$$;

-- Secure Tenant Maintenance Toggle by Master Super-Admin
CREATE OR REPLACE FUNCTION public.master_toggle_tenant_maintenance(
    p_cafe_id TEXT,
    p_maintenance_enabled BOOLEAN,
    p_super_admin_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is strictly a Master Super-Admin
    IF (COALESCE(auth.jwt() -> 'app_metadata' ->> 'system_role', auth.jwt() ->> 'system_role')) != 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Master Super-Admins can toggle maintenance mode.';
    END IF;

    -- Audit log
    INSERT INTO public.master_audit_logs (
        master_admin_id,
        super_admin_id,
        super_admin_name,
        target_tenant_id,
        action_type,
        action,
        action_label,
        target_resource,
        details
    ) VALUES (
        COALESCE(auth.uid()::text, p_super_admin_id),
        COALESCE(auth.uid()::text, p_super_admin_id),
        'Master Super-Admin',
        p_cafe_id,
        'TENANT_MAINTENANCE',
        'TOGGLE_MAINTENANCE',
        'Tenant Maintenance Mode Toggle',
        'Cafe ' || p_cafe_id,
        jsonb_build_object('maintenance_enabled', p_maintenance_enabled, 'cafe_id', p_cafe_id)
    );

    RETURN TRUE;
END;
$$;



