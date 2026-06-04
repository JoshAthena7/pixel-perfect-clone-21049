
-- =========================================================
-- C4: collective_memory — review gate + sanitized view
-- =========================================================
ALTER TABLE public.collective_memory
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

-- Drop the open SELECT policy (whatever it was named)
DROP POLICY IF EXISTS "Authenticated users can view collective memory" ON public.collective_memory;
DROP POLICY IF EXISTS collective_memory_read_all ON public.collective_memory;
DROP POLICY IF EXISTS collective_memory_select ON public.collective_memory;

-- Admins only on raw table
CREATE POLICY collective_memory_admin_read
ON public.collective_memory
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Sanitized view for non-admins: no mission identifiers, only reviewed rows
CREATE OR REPLACE VIEW public.collective_memory_sanitized
WITH (security_invoker = false) AS
SELECT
  id,
  kind,
  summary,
  detail,
  program_name,
  state_code,
  outcome,
  score_delta,
  tags,
  promoted_at,
  reviewed_at,
  'anonymized cross-mission learning'::text AS source
FROM public.collective_memory
WHERE is_active = true AND reviewed_at IS NOT NULL;

GRANT SELECT ON public.collective_memory_sanitized TO authenticated;

-- =========================================================
-- C5: iris_memories — pending_global review stage
-- =========================================================
-- Drop existing open policy
DROP POLICY IF EXISTS "Users can view accessible memories" ON public.iris_memories;
DROP POLICY IF EXISTS iris_memories_select ON public.iris_memories;
DROP POLICY IF EXISTS iris_memories_read ON public.iris_memories;

CREATE POLICY iris_memories_scoped_read
ON public.iris_memories
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR scope = 'global'
  OR (scope = 'mission' AND mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()))
);

-- Allow pending_global as a valid scope (no enum — text column, just document)
COMMENT ON COLUMN public.iris_memories.scope IS
  'mission | pending_global (admin review queue) | global (approved, visible to all)';

-- =========================================================
-- H4: embeddings — scope column + tightened policy
-- =========================================================
ALTER TABLE public.embeddings
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'unclassified'
    CHECK (scope IN ('mission','global','unclassified'));

-- Backfill: rows with a mission_id are mission-scoped; the rest stay unclassified
UPDATE public.embeddings SET scope = 'mission' WHERE mission_id IS NOT NULL AND scope = 'unclassified';

-- Replace policy
DROP POLICY IF EXISTS embeddings_select ON public.embeddings;
DROP POLICY IF EXISTS "Users can read embeddings for their missions" ON public.embeddings;

CREATE POLICY embeddings_scoped_read
ON public.embeddings
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (scope = 'global')
  OR (scope = 'mission' AND mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()))
);

-- =========================================================
-- H2: Open beta lockdown for writer activity tables only
-- =========================================================
DROP POLICY IF EXISTS beta_admin_only_insert ON public.score_me_history;
DROP POLICY IF EXISTS beta_admin_only_update ON public.score_me_history;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.score_me_history;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.question_pulses;
DROP POLICY IF EXISTS beta_admin_only_update ON public.question_pulses;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.question_pulses;

-- =========================================================
-- H5: Score Me interactions audit table + disclosure flag
-- =========================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS score_me_disclosure_acknowledged_at timestamptz;

CREATE TABLE IF NOT EXISTS public.score_me_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.question_records(id) ON DELETE SET NULL,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  dimension text,
  action text NOT NULL CHECK (action IN ('viewed','copied','expanded','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.score_me_interactions TO authenticated;
GRANT ALL ON public.score_me_interactions TO service_role;

ALTER TABLE public.score_me_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY smi_insert_self
ON public.score_me_interactions
FOR INSERT TO authenticated
WITH CHECK (writer_id = auth.uid());

CREATE POLICY smi_read_self_or_admin
ON public.score_me_interactions
FOR SELECT TO authenticated
USING (writer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS smi_writer_idx ON public.score_me_interactions(writer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS smi_mission_idx ON public.score_me_interactions(mission_id, created_at DESC);
