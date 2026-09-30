-- ==============================================================================
-- ECOM WORKSHEET: FIX & ACTIVATE ALL 9 TEAM ACCOUNTS
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard -> SQL Editor)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- First, ensure any existing records are cleaned of NULL tokens
UPDATE auth.users
SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_confirmed_at = COALESCE(email_confirmed_at, now());

-- Function to safely create or repair each team account
CREATE OR REPLACE FUNCTION public.provision_team_user(
  p_name TEXT,
  p_email TEXT,
  p_password TEXT,
  p_role TEXT,
  p_employee_id TEXT,
  p_position TEXT
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_has_provider_id BOOLEAN;
BEGIN
  -- Check if user already exists in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    -- Create new user in auth.users with all required non-null string tokens
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_name, 'role', p_role, 'position', p_position, 'employee_id', p_employee_id),
      now(),
      now()
    );
  ELSE
    -- Fix existing user record: reset password, confirm email, set non-null tokens
    UPDATE auth.users
    SET
      encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
      phone_change = '',
      phone_change_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = jsonb_build_object('full_name', p_name, 'role', p_role, 'position', p_position, 'employee_id', p_employee_id),
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- Check if provider_id column exists on auth.identities
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  -- Ensure identity exists in auth.identities with id as UUID
  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
    IF v_has_provider_id THEN
      EXECUTE 'INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now(), now())'
      USING v_user_id, v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email), 'email';
    ELSE
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now(), now())'
      USING v_user_id, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email), 'email';
    END IF;
  END IF;

  -- Insert/update employee profile in public.employees
  INSERT INTO public.employees (
    id,
    employee_id,
    full_name,
    email,
    position,
    role,
    status,
    joining_date
  ) VALUES (
    v_user_id,
    p_employee_id,
    p_name,
    p_email,
    p_position,
    p_role,
    'Active',
    CURRENT_DATE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    employee_id = EXCLUDED.employee_id,
    status = 'Active';

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- Execute Provisioning for all 9 Team Members
-- ------------------------------------------------------------------------------

-- 1. Manager
SELECT public.provision_team_user(
  'AbdulHadi Fakhar',
  'abdulhadi@ecomworksheet.com',
  'Hadi#2026!Work',
  'ADMIN',
  'MGR-1001',
  'Manager'
);

-- 2. Boss 1
SELECT public.provision_team_user(
  'Ali Hassan',
  'alihassan@ecomworksheet.com',
  'Ali#2026!Boss',
  'BOSS',
  'BOSS-1001',
  'Boss / Executive'
);

-- 3. Boss 2
SELECT public.provision_team_user(
  'Rana Hasnain',
  'ranahasnain@ecomworksheet.com',
  'Hasnain#2026!Boss',
  'BOSS',
  'BOSS-1002',
  'Boss / Executive'
);

-- 4. Employee 1
SELECT public.provision_team_user(
  'Rayan Shahid',
  'rayan@ecomworksheet.com',
  'Rayan#2026!Ecom',
  'EMPLOYEE',
  'EMP-1001',
  'Team Member'
);

-- 5. Employee 2
SELECT public.provision_team_user(
  'Arsalan',
  'arsalan@ecomworksheet.com',
  'Arsalan#2026!Ecom',
  'EMPLOYEE',
  'EMP-1002',
  'Team Member'
);

-- 6. Employee 3
SELECT public.provision_team_user(
  'Rana Ahad',
  'ranaahad@ecomworksheet.com',
  'Ahad#2026!Ecom',
  'EMPLOYEE',
  'EMP-1003',
  'Team Member'
);

-- 7. Employee 4
SELECT public.provision_team_user(
  'Sir Maqbool',
  'maqbool@ecomworksheet.com',
  'Maqbool#2026!Ecom',
  'EMPLOYEE',
  'EMP-1004',
  'Team Member'
);

-- 8. Employee 5
SELECT public.provision_team_user(
  'Mubashir',
  'mubashir@ecomworksheet.com',
  'Mubashir#2026!Ecom',
  'EMPLOYEE',
  'EMP-1005',
  'Team Member'
);

-- 9. Employee 6
SELECT public.provision_team_user(
  'Sufyan',
  'sufyan@ecomworksheet.com',
  'Sufyan#2026!Ecom',
  'EMPLOYEE',
  'EMP-1006',
  'Team Member'
);

-- Ensure manager_comment and e-commerce columns exist on tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS manager_comment TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Product Hunting';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'Shopify';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS resource_url TEXT;

-- Update RLS policies to allow task and note deletion
DROP POLICY IF EXISTS "Tasks delete policy" ON public.tasks;
CREATE POLICY "Tasks delete policy" ON public.tasks FOR DELETE TO authenticated USING (
    public.get_current_role() != 'BOSS' AND (public.is_admin() OR created_by = auth.uid() OR assigned_to = auth.uid())
);

DROP POLICY IF EXISTS "Notes delete policy" ON public.notes;
CREATE POLICY "Notes delete policy" ON public.notes FOR DELETE TO authenticated USING (
    public.is_admin() OR author_id = auth.uid()
);

DROP POLICY IF EXISTS "Activity logs delete policy" ON public.activity_logs;
CREATE POLICY "Activity logs delete policy" ON public.activity_logs FOR DELETE TO authenticated USING (
    public.is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Notifications delete policy" ON public.notifications;
CREATE POLICY "Notifications delete policy" ON public.notifications FOR DELETE TO authenticated USING (
    public.is_admin() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Reports delete policy" ON public.monthly_reports;
CREATE POLICY "Reports delete policy" ON public.monthly_reports FOR DELETE TO authenticated USING (
    public.is_admin() OR employee_id = auth.uid()
);

-- Shared Files Table (Team Drop)
CREATE TABLE IF NOT EXISTS public.shared_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    recipient_ids UUID[] DEFAULT '{}',
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT,
    file_url TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shared_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shared files read policy" ON public.shared_files;
CREATE POLICY "Shared files read policy" ON public.shared_files FOR SELECT TO authenticated USING (
    sender_id = auth.uid() 
    OR auth.uid() = ANY(recipient_ids) 
    OR recipient_ids = '{}'
    OR public.is_admin_or_boss()
);

DROP POLICY IF EXISTS "Shared files insert policy" ON public.shared_files;
CREATE POLICY "Shared files insert policy" ON public.shared_files FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
);

DROP POLICY IF EXISTS "Shared files delete policy" ON public.shared_files;
CREATE POLICY "Shared files delete policy" ON public.shared_files FOR DELETE TO authenticated USING (
    sender_id = auth.uid() OR public.is_admin()
);

-- Supabase Storage bucket for team files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('team-files', 'team-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Team Files Upload" ON storage.objects;
CREATE POLICY "Team Files Upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'team-files');

DROP POLICY IF EXISTS "Team Files Read" ON storage.objects;
CREATE POLICY "Team Files Read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'team-files');

DROP POLICY IF EXISTS "Team Files Delete" ON storage.objects;
CREATE POLICY "Team Files Delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'team-files' AND (auth.uid() = owner OR public.is_admin()));

-- Final Check: Display all created employees
SELECT employee_id, full_name, email, role, position, status FROM public.employees ORDER BY created_at ASC;
