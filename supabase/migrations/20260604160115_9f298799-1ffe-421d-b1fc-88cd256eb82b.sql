-- ============================================================
-- Cleanup pass: M6 (role exclusivity), L2 (duplicate cron), L3 (canonicalize hook crons)
-- ============================================================

-- ---------- M6: writer/lead role exclusivity ----------
-- A user cannot simultaneously hold 'writer' and any of ('lead','owner','admin')
-- on the same mission. Enforced by trigger so it handles both INSERT and UPDATE.

CREATE OR REPLACE FUNCTION public.enforce_mission_role_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'writer' THEN
    SELECT role INTO v_conflict
    FROM public.mission_members
    WHERE mission_id = NEW.mission_id
      AND user_id    = NEW.user_id
      AND role IN ('lead','owner','admin')
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
    LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION
        'Role conflict: user already holds % on this mission; writer and lead/owner/admin are mutually exclusive',
        v_conflict
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.role IN ('lead','owner','admin') THEN
    SELECT role INTO v_conflict
    FROM public.mission_members
    WHERE mission_id = NEW.mission_id
      AND user_id    = NEW.user_id
      AND role = 'writer'
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
    LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION
        'Role conflict: user is already a writer on this mission; cannot also hold %',
        NEW.role
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_role_exclusivity ON public.mission_members;
CREATE TRIGGER trg_mission_role_exclusivity
  BEFORE INSERT OR UPDATE OF role, user_id ON public.mission_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mission_role_exclusivity();

-- ---------- L2: drop duplicate prune-pulse-free-text job ----------
-- prune-pulse-free-text-nightly already covers the same job; remove the dup.
DO $$
BEGIN
  PERFORM cron.unschedule('prune-pulse-free-text')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-pulse-free-text');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------- L3: re-register athena-* hook jobs through call_hook() ----------
-- call_hook() now reads from public.app_config (no hard-coded URL). We
-- unschedule + reschedule to guarantee any pre-existing inline-URL rows
-- are replaced with the canonical call_hook() form.
DO $$
DECLARE j record;
BEGIN
  FOR j IN
    SELECT jobname FROM cron.job
    WHERE jobname IN (
      'athena-process-embeddings',
      'athena-intelligence-engine',
      'athena-ingest-market-intel',
      'athena-weekly-brief'
    )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'athena-process-embeddings', '*/5 * * * *',
  $cron$ SELECT public.call_hook('/api/public/hooks/process-embeddings'); $cron$
);
SELECT cron.schedule(
  'athena-intelligence-engine', '0 * * * *',
  $cron$ SELECT public.call_hook('/api/public/hooks/intelligence-engine'); $cron$
);
SELECT cron.schedule(
  'athena-ingest-market-intel', '15 * * * *',
  $cron$ SELECT public.call_hook('/api/public/hooks/ingest-market-intel'); $cron$
);
SELECT cron.schedule(
  'athena-weekly-brief', '0 7 * * 1',
  $cron$ SELECT public.call_hook('/api/public/hooks/weekly-brief'); $cron$
);
