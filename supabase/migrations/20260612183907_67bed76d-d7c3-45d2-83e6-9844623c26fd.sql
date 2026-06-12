
CREATE OR REPLACE FUNCTION public.cascade_competitor_to_feed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headline text;
  v_summary  text;
  v_assess   text;
  v_score    int;
  v_source   text := 'competitor:' || NEW.id::text;
BEGIN
  v_headline := 'Competitive Intelligence: ' || NEW.organization_name
    || CASE
         WHEN NEW.competitor_type = 'incumbent' THEN ' (Incumbent)'
         WHEN NEW.competitor_type = 'likely_bidder' THEN ' (Likely Bidder)'
         WHEN NEW.competitor_type = 'possible_bidder' THEN ' (Possible Bidder)'
         WHEN NEW.competitor_type = 'dark_horse' THEN ' (Dark Horse)'
         ELSE ''
       END;

  v_summary := COALESCE(NEW.likely_narrative, NEW.known_relationships,
    'IRIS is building the competitive profile for ' || NEW.organization_name || '.');

  v_assess := NULLIF(concat_ws(E'\n\n',
      CASE WHEN NEW.known_strengths IS NOT NULL THEN 'Strengths: ' || NEW.known_strengths END,
      CASE WHEN NEW.known_weaknesses IS NOT NULL THEN 'Weaknesses: ' || NEW.known_weaknesses END,
      CASE WHEN NEW.differentiation_strategy IS NOT NULL THEN 'Our counter: ' || NEW.differentiation_strategy END
    ), '');

  v_score := CASE NEW.competitor_type
    WHEN 'incumbent' THEN 90
    WHEN 'likely_bidder' THEN 75
    WHEN 'possible_bidder' THEN 60
    WHEN 'dark_horse' THEN 50
    ELSE 60
  END;

  DELETE FROM public.intelligence_feed_items
   WHERE mission_id = NEW.mission_id AND source_url = v_source;

  INSERT INTO public.intelligence_feed_items (
    mission_id, category, headline, summary, source_url, source_name,
    iris_assessment, iris_relevance_score, affected_section_ids,
    is_reviewed, is_dismissed, is_shared_with_team, published_at
  ) VALUES (
    NEW.mission_id, 'competitive', v_headline, v_summary, v_source,
    'IRIS · Competitive Intelligence',
    v_assess, v_score, ARRAY[]::uuid[],
    false, false, false, now()
  );

  RETURN NEW;
END;
$$;
