
ALTER TABLE public.mission_documents DROP CONSTRAINT IF EXISTS mission_documents_document_type_check;
ALTER TABLE public.mission_documents ADD CONSTRAINT mission_documents_document_type_check
  CHECK (document_type = ANY (ARRAY[
    'primary_rfp','rfp','amendment','attachment','scoring_criteria','prior_qa',
    'research','media_url','manual_note','reference','model_contract','scope_of_work','other'
  ]));
