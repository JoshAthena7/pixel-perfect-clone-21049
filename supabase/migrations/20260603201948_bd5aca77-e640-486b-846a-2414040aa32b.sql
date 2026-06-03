ALTER TABLE public.mission_library DROP CONSTRAINT IF EXISTS mission_library_category_check;
ALTER TABLE public.mission_library ADD CONSTRAINT mission_library_category_check CHECK (category = ANY (ARRAY[
  'RFP & Amendments','Model Contract','State Regulations','State Q&A','Past Responses','Templates','Reference Materials','Research','Supporting Materials','Client Materials',
  'RFP','Amendment','Q&A Document','State Intelligence','Competitive Intel','Meeting Notes','Client Direction','Compliance','Leadership Guidance','Other'
]));