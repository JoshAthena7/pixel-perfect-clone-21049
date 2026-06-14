
ALTER TABLE public.intel_sources
  ADD COLUMN IF NOT EXISTS monitor_daily boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_monitored_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_category text,
  ADD COLUMN IF NOT EXISTS seeded_at_setup boolean DEFAULT false;

ALTER TABLE public.intel_sources DROP CONSTRAINT IF EXISTS intel_sources_source_category_check;
ALTER TABLE public.intel_sources ADD CONSTRAINT intel_sources_source_category_check
  CHECK (source_category IS NULL OR source_category IN (
    'stakeholder','advocate','academic','trade_assoc','government','media','other'
  ));

ALTER TABLE public.intel_sources DROP CONSTRAINT IF EXISTS intel_sources_source_type_check;
ALTER TABLE public.intel_sources ADD CONSTRAINT intel_sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'rfp','amendment','report','news','interview','meeting_notes','upload',
    'website','procurement_record','press_release','web_monitor'
  ]));

ALTER TABLE public.intel_sources DROP CONSTRAINT IF EXISTS intel_sources_credibility_score_check;
ALTER TABLE public.intel_sources ADD CONSTRAINT intel_sources_credibility_score_check
  CHECK (credibility_score IS NULL OR (credibility_score >= 0 AND credibility_score <= 100));
