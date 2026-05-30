-- Extend embedding trigger to cover Holy Grail findings (engagement_research)
-- and add an explicit rfp_text source for parsed RFP file contents.

CREATE OR REPLACE FUNCTION public.enqueue_for_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  content_val text;
  eng_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'heatmap_sections' THEN
    content_val := COALESCE(NEW.section_name,'') || ' ' ||
                   COALESCE(NEW.notes,'') || ' ' ||
                   COALESCE(NEW.instructions,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'decisions' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.rationale,'') || ' ' ||
                   COALESCE(NEW.impacted_areas,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'huddles' THEN
    content_val := COALESCE(NEW.priority,'') || ' ' ||
                   COALESCE(NEW.risk,'') || ' ' ||
                   COALESCE(NEW.notes,'') || ' ' ||
                   COALESCE(NEW.writer_concern,'') || ' ' ||
                   COALESCE(NEW.client_concern,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'sos_alerts' THEN
    content_val := COALESCE(NEW.category,'') || ' ' ||
                   COALESCE(NEW.description,'') || ' ' ||
                   COALESCE(NEW.recommended_action,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'intel_documents' THEN
    content_val := COALESCE(NEW.name,'') || ' ' ||
                   COALESCE(NEW.category,'') || ' ' ||
                   COALESCE(NEW.notes,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'win_themes' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.description,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'risks' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.description,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'client_pulses' THEN
    content_val := COALESCE(NEW.sentiment,'') || ' ' ||
                   COALESCE(NEW.summary,'') || ' ' ||
                   COALESCE(NEW.action_items,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'engagement_research' THEN
    -- Holy Grail findings live here as jsonb. Flatten to text for embedding.
    content_val := COALESCE(NEW.category,'') || ' ' ||
                   COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.content::text, '');
    eng_id := NEW.engagement_id;
  END IF;

  IF content_val IS NOT NULL AND trim(content_val) <> '' THEN
    INSERT INTO public.embedding_queue
      (source_table, source_id, engagement_id, content_text, priority)
    VALUES
      (TG_TABLE_NAME, NEW.id, eng_id, trim(content_val), 5)
    ON CONFLICT (source_table, source_id)
    DO UPDATE SET
      content_text = EXCLUDED.content_text,
      processed_at = NULL,
      attempts = 0,
      queued_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

-- Attach trigger to engagement_research so every Holy Grail save flows to RAG
DROP TRIGGER IF EXISTS embed_engagement_research ON public.engagement_research;
CREATE TRIGGER embed_engagement_research
  AFTER INSERT OR UPDATE ON public.engagement_research
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();

-- Backfill existing Holy Grail rows into the embedding queue
INSERT INTO public.embedding_queue (source_table, source_id, engagement_id, content_text, priority)
SELECT 'engagement_research', id, engagement_id,
       trim(COALESCE(category,'') || ' ' || COALESCE(title,'') || ' ' || COALESCE(content::text,'')),
       5
FROM public.engagement_research
WHERE content IS NOT NULL
ON CONFLICT (source_table, source_id) DO UPDATE SET
  content_text = EXCLUDED.content_text,
  processed_at = NULL,
  attempts = 0,
  queued_at = now();