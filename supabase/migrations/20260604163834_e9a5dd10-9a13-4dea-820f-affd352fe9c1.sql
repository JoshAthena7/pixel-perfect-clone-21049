CREATE TABLE public.collective_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  location TEXT,
  skill_tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'talentdesk',
  external_id TEXT,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX collective_members_email_uniq
  ON public.collective_members (LOWER(email))
  WHERE email IS NOT NULL;
CREATE INDEX collective_members_skill_tags_idx
  ON public.collective_members USING GIN (skill_tags);
CREATE INDEX collective_members_profile_id_idx
  ON public.collective_members (profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collective_members TO authenticated;
GRANT ALL ON public.collective_members TO service_role;

ALTER TABLE public.collective_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collective_select_authenticated"
  ON public.collective_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "collective_insert_admin"
  ON public.collective_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "collective_update_admin"
  ON public.collective_members FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "collective_delete_admin"
  ON public.collective_members FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_collective_members_updated_at
  BEFORE UPDATE ON public.collective_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();