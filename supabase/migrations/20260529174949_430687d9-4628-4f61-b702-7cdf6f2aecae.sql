DROP TRIGGER IF EXISTS seed_engagement_trigger ON public.engagements;

CREATE TRIGGER seed_engagement_trigger
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_engagement();