DROP TRIGGER IF EXISTS seed_engagement_trigger ON public.engagements;

CREATE OR REPLACE FUNCTION public.seed_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_display TEXT;
BEGIN
  SELECT display_name INTO v_display FROM public.profiles WHERE id = NEW.created_by;

  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.engagement_members (engagement_id, user_id, role, display_name)
    VALUES (NEW.id, NEW.created_by, 'founder', COALESCE(v_display, 'Founder'))
    ON CONFLICT (engagement_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.heatmap_sections (engagement_id, section_name, status, sort_order) VALUES
    (NEW.id, 'LTSS', 'Green', 1),
    (NEW.id, 'Care Management', 'Green', 2),
    (NEW.id, 'Quality', 'Green', 3),
    (NEW.id, 'Behavioral Health', 'Green', 4),
    (NEW.id, 'Operations', 'Green', 5),
    (NEW.id, 'Implementation', 'Green', 6),
    (NEW.id, 'Transition', 'Green', 7),
    (NEW.id, 'IT/Systems', 'Green', 8),
    (NEW.id, 'Staffing/HR', 'Green', 9)
  ON CONFLICT (engagement_id, section_name) DO NOTHING;

  RETURN NEW;
END;
$function$;