
-- ───────── expert_directory (curated external network) ─────────
CREATE TABLE IF NOT EXISTS public.expert_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  title text,
  org text,
  email text,
  phone text,
  domain_tags text[] NOT NULL DEFAULT '{}',
  states text[] NOT NULL DEFAULT '{}',
  programs text[] NOT NULL DEFAULT '{}',
  avg_response_hours integer,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expert_directory TO authenticated;
GRANT ALL ON public.expert_directory TO service_role;
ALTER TABLE public.expert_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read active directory"
  ON public.expert_directory FOR SELECT TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage expert directory"
  ON public.expert_directory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER expert_directory_set_updated
  BEFORE UPDATE ON public.expert_directory
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ───────── expert_consults ─────────
CREATE TABLE IF NOT EXISTS public.expert_consults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.question_records(id) ON DELETE SET NULL,
  section_id uuid REFERENCES public.mission_sections(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expert_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_expert_id uuid REFERENCES public.expert_directory(id) ON DELETE SET NULL,
  urgency text NOT NULL DEFAULT 'standard' CHECK (urgency IN ('urgent','standard','fyi')),
  ask_subject text NOT NULL,
  ask_body text NOT NULL,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','acknowledged','needs_info','reassigned','responded','closed')),
  response_body text,
  response_at timestamptz,
  closed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expert_consults_mission ON public.expert_consults(mission_id);
CREATE INDEX IF NOT EXISTS idx_expert_consults_question ON public.expert_consults(question_id);
CREATE INDEX IF NOT EXISTS idx_expert_consults_expert ON public.expert_consults(expert_user_id);
CREATE INDEX IF NOT EXISTS idx_expert_consults_status ON public.expert_consults(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expert_consults TO authenticated;
GRANT ALL ON public.expert_consults TO service_role;
ALTER TABLE public.expert_consults ENABLE ROW LEVEL SECURITY;

-- Mission members can read consults on their missions; assigned experts can also read theirs even if not on the mission.
CREATE POLICY "View consults on my missions or assigned to me"
  ON public.expert_consults FOR SELECT TO authenticated
  USING (
    public.is_mission_member(mission_id, auth.uid())
    OR expert_user_id = auth.uid()
    OR requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Mission members can request a consult.
CREATE POLICY "Mission members can create consults"
  ON public.expert_consults FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      public.is_mission_member(mission_id, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- Requester, assigned expert, mission lead/owner/admin, or platform admin can update.
CREATE POLICY "Update consults (requester, expert, lead, admin)"
  ON public.expert_consults FOR UPDATE TO authenticated
  USING (
    requested_by = auth.uid()
    OR expert_user_id = auth.uid()
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner'])
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR expert_user_id = auth.uid()
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner'])
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Requester or admin can delete consults"
  ON public.expert_consults FOR DELETE TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner'])
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER expert_consults_set_updated
  BEFORE UPDATE ON public.expert_consults
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Realtime
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'expert_consults';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.expert_consults';
  END IF;
END $$;
