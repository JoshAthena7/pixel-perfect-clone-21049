ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'Green'
  CHECK (health IN ('Green', 'Yellow', 'Red'));

-- Trigger: whenever a huddle is inserted, propagate its health to the parent engagement.
CREATE OR REPLACE FUNCTION public.sync_engagement_health_from_huddle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.engagements
    SET health = NEW.health
  WHERE id = NEW.engagement_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_engagement_health_from_huddle ON public.huddles;
CREATE TRIGGER trg_sync_engagement_health_from_huddle
AFTER INSERT ON public.huddles
FOR EACH ROW
EXECUTE FUNCTION public.sync_engagement_health_from_huddle();

-- Backfill: set each engagement's health from its most recent huddle.
UPDATE public.engagements e
SET health = sub.health
FROM (
  SELECT DISTINCT ON (engagement_id) engagement_id, health
  FROM public.huddles
  ORDER BY engagement_id, created_at DESC
) sub
WHERE sub.engagement_id = e.id;