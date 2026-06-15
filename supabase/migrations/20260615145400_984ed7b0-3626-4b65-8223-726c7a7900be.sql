-- Phase 1b: Add document purpose and style guide flag to mission_documents
-- Additive only. No existing columns, constraints, or policies are modified.
--
-- document_purpose values:
-- 'procurement'       RFP, amendments, model contract, evaluation criteria, Q&A
-- 'competitive_intel' Former responses, incumbent materials, competitor documents
-- 'writing_standards' Style guide, voice guide, terminology, tone requirements
-- 'client_strategy'   Strategy deck, mission overview, positioning brief, talking points
-- 'reference'         Background context, state reports, research, everything else
--
-- is_style_guide:
-- Only one document per mission should be true at a time.
-- Enforced at the application layer, not database layer.
-- When true, this document conditions all writer-facing AI generation prompts.

ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS document_purpose text
    NOT NULL DEFAULT 'reference'
    CONSTRAINT mission_documents_purpose_check
    CHECK (document_purpose IN (
      'procurement',
      'competitive_intel',
      'writing_standards',
      'client_strategy',
      'reference'
    ));

ALTER TABLE public.mission_documents
  ADD COLUMN IF NOT EXISTS is_style_guide boolean
    NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mission_documents_purpose
  ON public.mission_documents(mission_id, document_purpose);

CREATE INDEX IF NOT EXISTS idx_mission_documents_style_guide
  ON public.mission_documents(mission_id, is_style_guide)
  WHERE is_style_guide = true;