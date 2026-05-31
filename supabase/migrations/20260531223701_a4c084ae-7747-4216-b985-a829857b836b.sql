
-- 1. Add missing engagements columns
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 2. Add profiles.email + backfill + keep in sync
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE p.id = u.id AND p.email IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- update handle_new_user trigger to also set email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- 3. mission_workflow_steps
CREATE TABLE IF NOT EXISTS public.mission_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  step_order int NOT NULL DEFAULT 0,
  step_name text NOT NULL,
  step_type text NOT NULL DEFAULT 'draft',
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mws_eng ON public.mission_workflow_steps(engagement_id, step_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_workflow_steps TO authenticated;
GRANT ALL ON public.mission_workflow_steps TO service_role;

ALTER TABLE public.mission_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mws_member_select" ON public.mission_workflow_steps FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "mws_lead_write" ON public.mission_workflow_steps FOR ALL TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']))
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER trg_mws_updated BEFORE UPDATE ON public.mission_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. mission_closeout
CREATE TABLE IF NOT EXISTS public.mission_closeout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE REFERENCES public.engagements(id) ON DELETE CASCADE,
  win_loss text NOT NULL DEFAULT 'Pending',
  final_score numeric,
  outcome text,
  lessons_learned text,
  key_decisions text,
  strengths text,
  improvements text,
  institutional_notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_closeout TO authenticated;
GRANT ALL ON public.mission_closeout TO service_role;

ALTER TABLE public.mission_closeout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mco_member_select" ON public.mission_closeout FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "mco_lead_write" ON public.mission_closeout FOR ALL TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']))
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER trg_mco_updated BEFORE UPDATE ON public.mission_closeout
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. issues
CREATE TABLE IF NOT EXISTS public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  issue_type text NOT NULL DEFAULT 'operational',
  severity text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Open',
  title text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issues_eng_status ON public.issues(engagement_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.issues TO authenticated;
GRANT ALL ON public.issues TO service_role;

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "issues_member_select" ON public.issues FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "issues_member_insert" ON public.issues FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "issues_lead_update" ON public.issues FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY "issues_lead_delete" ON public.issues FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER trg_issues_updated BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
