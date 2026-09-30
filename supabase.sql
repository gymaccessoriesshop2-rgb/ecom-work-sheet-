-- ==============================================================================
-- SIMPLIFIED TEAM WORKSPACE: DATABASE SCHEMA & PERMISSIONS
-- Designed for a compact team (Manager, 2 Boss Observers, and Employees)
-- ==============================================================================

-- 1. Create Core Tables
-- ------------------------------------------------------------------------------

-- Employees (Profile) Table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    position TEXT NOT NULL DEFAULT 'Team Member',
    status TEXT NOT NULL DEFAULT 'Active', -- Active, Inactive
    joining_date DATE NOT NULL DEFAULT CURRENT_DATE,
    phone TEXT,
    profile_picture TEXT,
    role TEXT NOT NULL DEFAULT 'EMPLOYEE', -- ADMIN (Manager), EMPLOYEE, BOSS (Observer)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    due_date DATE,
    priority TEXT NOT NULL DEFAULT 'Medium', -- Low, Medium, High, Urgent
    status TEXT NOT NULL DEFAULT 'Pending', -- Pending, In Progress, Awaiting Approval, Approved, Rejected
    manager_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure manager_comment and e-commerce columns exist if table was created previously
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS manager_comment TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Product Hunting';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'Shopify';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS resource_url TEXT;

-- Notes Table (Discussion & Feedback on Tasks)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    report_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    related_entity_type TEXT, -- TASK, EMPLOYEE, NOTE, REPORT
    related_entity_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared Files Table (Team Drop & File Transfers)
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

-- Monthly Reports Table
CREATE TABLE IF NOT EXISTS public.monthly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
    month INT NOT NULL,
    year INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    monthly_summary TEXT,
    achievements TEXT,
    challenges TEXT,
    important_notes TEXT,
    pending_work TEXT,
    next_month_plan TEXT,
    additional_notes TEXT,
    admin_feedback TEXT,
    tasks_assigned INT DEFAULT 0,
    tasks_completed INT DEFAULT 0,
    tasks_pending INT DEFAULT 0,
    tasks_overdue INT DEFAULT 0,
    completion_rate DECIMAL DEFAULT 0,
    activity_records INT DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, month, year)
);


-- 2. Updated_at Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER update_monthly_reports_updated_at BEFORE UPDATE ON public.monthly_reports FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- 3. Role Helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin_or_boss() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.employees WHERE id = auth.uid() AND role IN ('ADMIN', 'BOSS')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_current_role() RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.employees WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'EMPLOYEE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Enable Row Level Security (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- 5. Drop Obsolete Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users read employees" ON public.employees;
DROP POLICY IF EXISTS "Employees update profile" ON public.employees;
DROP POLICY IF EXISTS "Insert employees policy" ON public.employees;
DROP POLICY IF EXISTS "Only admin can delete employees" ON public.employees;

DROP POLICY IF EXISTS "Tasks read policy" ON public.tasks;
DROP POLICY IF EXISTS "Tasks insert policy" ON public.tasks;
DROP POLICY IF EXISTS "Tasks update policy" ON public.tasks;
DROP POLICY IF EXISTS "Tasks delete policy" ON public.tasks;

DROP POLICY IF EXISTS "Notes read policy" ON public.notes;
DROP POLICY IF EXISTS "Notes insert policy" ON public.notes;
DROP POLICY IF EXISTS "Notes delete policy" ON public.notes;

DROP POLICY IF EXISTS "Reports read policy" ON public.monthly_reports;
DROP POLICY IF EXISTS "Reports insert policy" ON public.monthly_reports;
DROP POLICY IF EXISTS "Reports update policy" ON public.monthly_reports;
DROP POLICY IF EXISTS "Reports delete policy" ON public.monthly_reports;

DROP POLICY IF EXISTS "Activity logs read policy" ON public.activity_logs;
DROP POLICY IF EXISTS "Activity logs insert policy" ON public.activity_logs;
DROP POLICY IF EXISTS "Activity logs delete policy" ON public.activity_logs;

DROP POLICY IF EXISTS "Employees read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Employees update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Notifications delete policy" ON public.notifications;


-- 6. Clean, Non-Recursive RLS Policies
-- ------------------------------------------------------------------------------

-- Employees: Everyone in team can see fellow members. Only Manager updates others.
CREATE POLICY "Authenticated users read employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Employees update profile" ON public.employees FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Insert employees policy" ON public.employees FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR auth.uid() = id OR NOT EXISTS (SELECT 1 FROM public.employees)
);
CREATE POLICY "Only admin can delete employees" ON public.employees FOR DELETE TO authenticated USING (public.is_admin());

-- Tasks:
-- Manager & Boss can see all tasks. Employees see tasks assigned to or created by them.
CREATE POLICY "Tasks read policy" ON public.tasks FOR SELECT TO authenticated USING (
    public.is_admin_or_boss() OR assigned_to = auth.uid() OR created_by = auth.uid()
);
-- Boss cannot create tasks. Manager and Employees can create/assign tasks.
CREATE POLICY "Tasks insert policy" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
    public.get_current_role() != 'BOSS' AND (public.is_admin() OR created_by = auth.uid() OR assigned_to = auth.uid())
);
-- Manager can approve/reject/edit any task. Employees can update their own tasks (e.g. mark done). Boss cannot edit.
CREATE POLICY "Tasks update policy" ON public.tasks FOR UPDATE TO authenticated USING (
    public.get_current_role() != 'BOSS' AND (public.is_admin() OR assigned_to = auth.uid() OR created_by = auth.uid())
);
CREATE POLICY "Tasks delete policy" ON public.tasks FOR DELETE TO authenticated USING (
    public.get_current_role() != 'BOSS' AND (public.is_admin() OR created_by = auth.uid() OR assigned_to = auth.uid())
);

-- Notes:
CREATE POLICY "Notes read policy" ON public.notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Notes insert policy" ON public.notes FOR INSERT TO authenticated WITH CHECK (
    public.get_current_role() != 'BOSS' AND author_id = auth.uid()
);
CREATE POLICY "Notes delete policy" ON public.notes FOR DELETE TO authenticated USING (
    public.is_admin() OR author_id = auth.uid()
);

-- Monthly Reports:
CREATE POLICY "Reports read policy" ON public.monthly_reports FOR SELECT TO authenticated USING (
    public.is_admin_or_boss() OR employee_id = auth.uid()
);
CREATE POLICY "Reports insert policy" ON public.monthly_reports FOR INSERT TO authenticated WITH CHECK (
    public.is_admin() OR employee_id = auth.uid()
);
CREATE POLICY "Reports update policy" ON public.monthly_reports FOR UPDATE TO authenticated USING (
    public.is_admin() OR employee_id = auth.uid()
);
CREATE POLICY "Reports delete policy" ON public.monthly_reports FOR DELETE TO authenticated USING (
    public.is_admin() OR employee_id = auth.uid()
);

-- Activity Logs:
CREATE POLICY "Activity logs read policy" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Activity logs insert policy" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Activity logs delete policy" ON public.activity_logs FOR DELETE TO authenticated USING (public.is_admin() OR user_id = auth.uid());

-- Notifications:
CREATE POLICY "Employees read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Employees update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Notifications delete policy" ON public.notifications FOR DELETE TO authenticated USING (public.is_admin() OR user_id = auth.uid());

-- Shared Files:
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


-- 7. Auth User Sync Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_first_user BOOLEAN;
  v_role TEXT;
  v_emp_id TEXT;
  v_full_name TEXT;
  v_position TEXT;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.employees) INTO v_first_user;
  
  IF v_first_user THEN
    v_role := 'ADMIN';
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'EMPLOYEE');
  END IF;

  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));
  
  v_emp_id := COALESCE(
    NEW.raw_user_meta_data->>'employee_id',
    CASE 
      WHEN v_role = 'ADMIN' THEN 'MGR-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0')
      WHEN v_role = 'BOSS' THEN 'BOSS-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0')
      ELSE 'EMP-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0')
    END
  );

  v_position := COALESCE(
    NEW.raw_user_meta_data->>'position',
    CASE 
      WHEN v_role = 'BOSS' THEN 'Boss'
      WHEN v_role = 'ADMIN' THEN 'Manager'
      ELSE 'Team Member'
    END
  );

  INSERT INTO public.employees (
    id,
    employee_id,
    full_name,
    email,
    position,
    role,
    joining_date,
    status
  ) VALUES (
    NEW.id,
    v_emp_id,
    v_full_name,
    NEW.email,
    v_position,
    v_role,
    CURRENT_DATE,
    'Active'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
