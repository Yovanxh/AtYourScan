-- ==========================================================
-- ATYOURSCAN MASTER PRODUCTION RBAC & MULTI-TENANCY SCHEMA
-- Native Supabase Authentication, Multi-Tenant RBAC & Security Isolation
-- ==========================================================

-- 1. Create Role Enum
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('master_admin', 'cafe_admin', 'shift_manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Cafes (Tenants Table)
CREATE TABLE IF NOT EXISTS public.cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    vpa_address TEXT NOT NULL,
    table_count INT NOT NULL DEFAULT 12,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Profiles Table (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role app_role NOT NULL DEFAULT 'cafe_admin',
    cafe_id UUID REFERENCES public.cafes(id) ON DELETE CASCADE, -- Strictly NULL for master_admin
    staff_pin TEXT, -- 4-digit PIN for shift staff POS unlock
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Helper Functions for RLS Queries (in public schema)
CREATE OR REPLACE FUNCTION public.get_role() 
RETURNS app_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_cafe_id() 
RETURNS UUID AS $$
    SELECT cafe_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 6. Strict RLS Policies
-- Profiles: Users manage their own record; Master Admin has global visibility
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
FOR SELECT USING (id = auth.uid() OR public.get_role() = 'master_admin');

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE USING (id = auth.uid() OR public.get_role() = 'master_admin');

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
FOR INSERT WITH CHECK (id = auth.uid() OR public.get_role() = 'master_admin' OR auth.role() = 'authenticated');

-- Cafes: Master Admin has full visibility; Cafe Admins only access their own tenant record
DROP POLICY IF EXISTS "Master admin full cafe access" ON public.cafes;
CREATE POLICY "Master admin full cafe access" ON public.cafes
FOR ALL USING (public.get_role() = 'master_admin');

DROP POLICY IF EXISTS "Cafe admin access own cafe" ON public.cafes;
CREATE POLICY "Cafe admin access own cafe" ON public.cafes
FOR ALL USING (id = public.get_cafe_id());

DROP POLICY IF EXISTS "Allow authenticated insert cafe" ON public.cafes;
CREATE POLICY "Allow authenticated insert cafe" ON public.cafes
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 7. Automatic Profile Provisioning Trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, cafe_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'cafe_admin'::app_role),
    (NEW.raw_user_meta_data->>'cafe_id')::UUID
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    cafe_id = EXCLUDED.cafe_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
