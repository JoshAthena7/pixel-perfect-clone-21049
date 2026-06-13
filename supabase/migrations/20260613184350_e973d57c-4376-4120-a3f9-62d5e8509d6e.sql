-- Deduplicate any existing rows, keeping the most recently updated one per (mission_id, extracted_field)
DELETE FROM public.mission_iris_extractions a
USING public.mission_iris_extractions b
WHERE a.mission_id = b.mission_id
  AND a.extracted_field = b.extracted_field
  AND a.id <> b.id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

ALTER TABLE public.mission_iris_extractions
  ADD CONSTRAINT mission_iris_extractions_mission_extracted_field_unique
  UNIQUE (mission_id, extracted_field);