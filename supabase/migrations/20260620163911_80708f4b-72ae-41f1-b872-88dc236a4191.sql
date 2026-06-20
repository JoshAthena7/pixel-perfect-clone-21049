-- Fix 1A: Remove duplicate documents, keep most recent per (mission_id, title)
DELETE FROM public.mission_documents
WHERE id NOT IN (
  SELECT DISTINCT ON (mission_id, title) id
  FROM public.mission_documents
  ORDER BY mission_id, title, created_at DESC
);

-- Fix 1B: Add tracking columns
ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS processing_error_message text DEFAULT NULL;

ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS items_extracted integer DEFAULT 0;

ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS document_checklist_category text DEFAULT NULL;

COMMENT ON COLUMN public.mission_documents.document_checklist_category IS
  'ORACLE checklist slot this document fills. Values: primary_rfp | addenda | state_plan | waiver | eqro | prior_rfp | scoring_rubric | past_proposal | style_guide | cms_guidance | budget_docs | legislative | incumbent_performance | knowledge_transfer | crosswalk | other';

-- Fix 1C: Prevent duplicate uploads (partial unique index excluding deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_documents_unique
  ON public.mission_documents(mission_id, title, document_type)
  WHERE processing_status IS DISTINCT FROM 'deleted';