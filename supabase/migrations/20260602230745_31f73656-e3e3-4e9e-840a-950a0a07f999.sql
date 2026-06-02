
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS state_agency text,
  ADD COLUMN IF NOT EXISTS procurement_name text,
  ADD COLUMN IF NOT EXISTS rfp_number text,
  ADD COLUMN IF NOT EXISTS focus_areas text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS qa_deadline date,
  ADD COLUMN IF NOT EXISTS pens_down_date date,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_value text,
  ADD COLUMN IF NOT EXISTS contract_term text,
  ADD COLUMN IF NOT EXISTS incumbent_name text,
  ADD COLUMN IF NOT EXISTS evaluation_criteria jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_limit integer,
  ADD COLUMN IF NOT EXISTS key_requirements text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS iris_search_terms text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS rfp_extraction jsonb,
  ADD COLUMN IF NOT EXISTS rfp_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rfp_extraction_status text;
