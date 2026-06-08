
ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS doc_type TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS iris_processed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.mission_documents ALTER COLUMN document_type DROP NOT NULL;
ALTER TABLE public.mission_documents ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE public.mission_documents ALTER COLUMN file_path DROP NOT NULL;
