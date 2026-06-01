
-- =====================================================================
-- ARCH-2: Oracle (briefing book) version history + source attribution
-- =====================================================================
ALTER TABLE public.briefing_book_sections
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.briefing_book_section_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES public.briefing_book_sections(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL,
  section_key TEXT NOT NULL,
  content TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_number INT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL DEFAULT 'IRIS'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_book_section_history TO authenticated;
GRANT ALL ON public.briefing_book_section_history TO service_role;

ALTER TABLE public.briefing_book_section_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bbsh_select_members" ON public.briefing_book_section_history
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "bbsh_write_members" ON public.briefing_book_section_history
  FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bbsh_section ON public.briefing_book_section_history(section_id, version_number DESC);

-- Trigger: on UPDATE of content, snapshot old version into history & bump version_number;
-- also prune to last 5 versions per section.
CREATE OR REPLACE FUNCTION public.snapshot_briefing_section_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.content IS DISTINCT FROM OLD.content) THEN
    INSERT INTO public.briefing_book_section_history
      (section_id, mission_id, section_key, content, sources, version_number, generated_at)
    VALUES
      (OLD.id, OLD.mission_id, OLD.section_key, OLD.content, COALESCE(OLD.sources,'[]'::jsonb), COALESCE(OLD.version_number,1), COALESCE(OLD.generated_at, OLD.updated_at, now()));

    NEW.version_number := COALESCE(OLD.version_number,1) + 1;

    -- Keep only last 5 historical versions per section
    DELETE FROM public.briefing_book_section_history
    WHERE section_id = OLD.id
      AND id NOT IN (
        SELECT id FROM public.briefing_book_section_history
        WHERE section_id = OLD.id
        ORDER BY version_number DESC
        LIMIT 5
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_briefing_section_version ON public.briefing_book_sections;
CREATE TRIGGER trg_snapshot_briefing_section_version
BEFORE UPDATE ON public.briefing_book_sections
FOR EACH ROW EXECUTE FUNCTION public.snapshot_briefing_section_version();

-- =====================================================================
-- ARCH-3: Olympus audit log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.olympus_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID,
  user_id UUID,
  user_name TEXT,
  action_type TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.olympus_audit_log TO authenticated;
GRANT ALL ON public.olympus_audit_log TO service_role;

ALTER TABLE public.olympus_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oal_select_members" ON public.olympus_audit_log
  FOR SELECT TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "oal_insert_members" ON public.olympus_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_oal_mission_created ON public.olympus_audit_log(mission_id, created_at DESC);

-- =====================================================================
-- ARCH-4: Centralized question health calculation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.calculate_question_health(p_question_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q RECORD;
  days_to_pens_down INT;
  has_conflict BOOLEAN;
  has_missing_sme BOOLEAN;
  score_low BOOLEAN;
  no_writer BOOLEAN;
BEGIN
  SELECT * INTO q FROM public.question_records WHERE id = p_question_id;
  IF NOT FOUND THEN RETURN 'yellow'; END IF;

  days_to_pens_down := CASE
    WHEN q.pens_down_date IS NULL THEN 9999
    ELSE EXTRACT(DAY FROM (q.pens_down_date::timestamp - NOW()))::int
  END;

  has_conflict := EXISTS(
    SELECT 1 FROM public.alignment_conflicts
    WHERE (question_a_id = p_question_id OR question_b_id = p_question_id)
      AND resolved_at IS NULL
  );
  has_missing_sme := q.assigned_sme_id IS NULL;
  score_low := q.current_score IS NOT NULL AND q.current_score < 3.0;
  no_writer := q.assigned_writer_id IS NULL;

  -- RED
  IF no_writer AND days_to_pens_down <= 7 THEN RETURN 'red'; END IF;
  IF score_low THEN RETURN 'red'; END IF;
  IF days_to_pens_down <= 3 AND q.status <> 'complete' THEN RETURN 'red'; END IF;

  -- YELLOW
  IF has_conflict THEN RETURN 'yellow'; END IF;
  IF has_missing_sme THEN RETURN 'yellow'; END IF;
  IF no_writer THEN RETURN 'yellow'; END IF;
  IF days_to_pens_down <= 14 AND q.status = 'not_started' THEN RETURN 'yellow'; END IF;

  RETURN 'green';
END;
$$;

-- Trigger to keep question_records.health in sync on row-level changes
CREATE OR REPLACE FUNCTION public.trg_refresh_question_health()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.health := public.calculate_question_health(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_question_records_health ON public.question_records;
CREATE TRIGGER trg_question_records_health
BEFORE INSERT OR UPDATE OF assigned_writer_id, assigned_sme_id, current_score, status, pens_down_date
ON public.question_records
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_question_health();

-- Recompute health when alignment conflicts change
CREATE OR REPLACE FUNCTION public.trg_refresh_health_on_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qid UUID;
BEGIN
  FOREACH qid IN ARRAY ARRAY[COALESCE(NEW.question_a_id, OLD.question_a_id), COALESCE(NEW.question_b_id, OLD.question_b_id)]
  LOOP
    IF qid IS NOT NULL THEN
      UPDATE public.question_records SET health = public.calculate_question_health(qid) WHERE id = qid;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_alignment_conflicts_health ON public.alignment_conflicts;
CREATE TRIGGER trg_alignment_conflicts_health
AFTER INSERT OR UPDATE OR DELETE ON public.alignment_conflicts
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_health_on_conflict();

-- =====================================================================
-- ARCH-5: Signal archival
-- =====================================================================
CREATE OR REPLACE FUNCTION public.archive_old_signals()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.signals
     SET status = 'archived'
   WHERE created_at < NOW() - INTERVAL '90 days'
     AND status <> 'archived';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Schedule daily at 02:00 UTC (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('archive-signals') FROM cron.job WHERE jobname = 'archive-signals';
    PERFORM cron.schedule('archive-signals', '0 2 * * *', $cron$SELECT public.archive_old_signals();$cron$);
  END IF;
END$$;

-- =====================================================================
-- ARCH-6: Mission lifecycle - allow 'Archived' status
-- (missions.status is TEXT with no CHECK constraint; nothing to ALTER.
--  Application layer will use 'Active' | 'Closed' | 'Archived'.)
-- =====================================================================

-- =====================================================================
-- ARCH-8: Vault deduplication guard
-- =====================================================================
ALTER TABLE public.mission_library
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT;

CREATE INDEX IF NOT EXISTS idx_mission_library_hash ON public.mission_library(mission_id, file_hash);

-- =====================================================================
-- ARCH-9: Broadcast delivery confirmation
-- =====================================================================
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS slack_delivery_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS slack_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slack_error TEXT;

-- Broadcasts has no UPDATE policy; add one so leads/admins can mark delivery status.
DROP POLICY IF EXISTS bc_update_leads ON public.broadcasts;
CREATE POLICY bc_update_leads ON public.broadcasts
  FOR UPDATE TO authenticated
  USING (
    mission_id IS NULL
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
  )
  WITH CHECK (
    mission_id IS NULL
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
  );

-- =====================================================================
-- ARCH-11: Cascade delete embeddings when mission_library row removed
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_cascade_delete_library_embeddings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.embeddings
   WHERE source_table = 'mission_library' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_library_embeddings_cleanup ON public.mission_library;
CREATE TRIGGER trg_mission_library_embeddings_cleanup
AFTER DELETE ON public.mission_library
FOR EACH ROW EXECUTE FUNCTION public.trg_cascade_delete_library_embeddings();

-- =====================================================================
-- ARCH-14: Avatar URL column on profiles
-- =====================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
