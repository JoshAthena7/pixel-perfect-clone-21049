
-- Mission close trigger: fires the mission-closed webhook so the lesson
-- extractor runs even when status is updated outside the closeMission
-- server fn. Uses pg_net to call the public webhook, authenticating with
-- the project's anon/publishable key (read from vault).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_mission_closed_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_closed_now boolean;
  v_debrief_now boolean;
BEGIN
  v_closed_now := (NEW.status IN ('closed','submitted','archived'))
                  AND (OLD.status IS DISTINCT FROM NEW.status);
  v_debrief_now := COALESCE(NEW.debrief_completed, false)
                   AND COALESCE(OLD.debrief_completed, false) = false;

  IF NOT (v_closed_now OR v_debrief_now) THEN
    RETURN NEW;
  END IF;

  -- Config table stores the runtime webhook URL + anon key (set via app_config).
  SELECT value INTO v_url FROM public.app_config WHERE key = 'mission_closed_webhook_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'supabase_anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    -- Config not set yet; skip silently. closeMission server fn still
    -- runs extraction inline, so this is only a safety net.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key
    ),
    body    := jsonb_build_object('missionId', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_fire_close_webhook ON public.missions;
CREATE TRIGGER missions_fire_close_webhook
  AFTER UPDATE OF status, debrief_completed ON public.missions
  FOR EACH ROW
  EXECUTE FUNCTION public.fire_mission_closed_webhook();
