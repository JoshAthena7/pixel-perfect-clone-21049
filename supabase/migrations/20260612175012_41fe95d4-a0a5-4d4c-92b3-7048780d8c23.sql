-- =====================================================================
-- Line of Sight: question_connections + conflict_flags
-- =====================================================================

-- ---------- question_connections ----------
CREATE TABLE public.question_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id_a UUID NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  question_id_b UUID NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('related_theme','win_theme_alignment','shared_oracle_intel','decision_conflict')),
  iris_rationale TEXT CHECK (iris_rationale IS NULL OR char_length(iris_rationale) <= 300),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_connections_distinct CHECK (question_id_a <> question_id_b),
  CONSTRAINT question_connections_unique UNIQUE (question_id_a, question_id_b, connection_type)
);

CREATE INDEX question_connections_mission_idx ON public.question_connections (mission_id);
CREATE INDEX question_connections_qa_idx ON public.question_connections (question_id_a);
CREATE INDEX question_connections_qb_idx ON public.question_connections (question_id_b);

GRANT SELECT ON public.question_connections TO authenticated;
GRANT ALL ON public.question_connections TO service_role;

ALTER TABLE public.question_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY question_connections_select
  ON public.question_connections FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
  );

-- INSERT/UPDATE/DELETE intentionally restricted to service_role (no policy = denied).

-- ---------- conflict_flags ----------
CREATE TABLE public.conflict_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id_a UUID NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  question_id_b UUID NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  conflict_description TEXT NOT NULL CHECK (char_length(conflict_description) <= 2000),
  detected_from TEXT CHECK (detected_from IS NULL OR char_length(detected_from) <= 1000),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high','medium')),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conflict_flags_distinct CHECK (question_id_a <> question_id_b)
);

CREATE INDEX conflict_flags_mission_idx ON public.conflict_flags (mission_id);
CREATE INDEX conflict_flags_unresolved_idx ON public.conflict_flags (mission_id) WHERE resolved = false;
CREATE INDEX conflict_flags_qa_idx ON public.conflict_flags (question_id_a);
CREATE INDEX conflict_flags_qb_idx ON public.conflict_flags (question_id_b);

GRANT SELECT, UPDATE ON public.conflict_flags TO authenticated;
GRANT ALL ON public.conflict_flags TO service_role;

ALTER TABLE public.conflict_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY conflict_flags_select
  ON public.conflict_flags FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
  );

-- Only admins can flip resolved/resolved_at. Engagement-lead gating is enforced
-- at the server-fn layer (engagement_lead is not a current app_role enum value).
CREATE POLICY conflict_flags_resolve
  ON public.conflict_flags FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- INSERT/DELETE intentionally restricted to service_role (no policy = denied).

-- ---------- mission_questions: per-question intel relevance ----------
ALTER TABLE public.mission_questions
  ADD COLUMN IF NOT EXISTS relevant_feed_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS iris_intel_note TEXT;