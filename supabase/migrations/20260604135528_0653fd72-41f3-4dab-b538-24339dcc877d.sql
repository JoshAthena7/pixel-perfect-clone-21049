ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS is_fedramp_scope BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE public.vault_doc_type ADD VALUE IF NOT EXISTS 'dpa';