ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'not_processed',
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS items_extracted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS toc_data jsonb;