WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY mission_id, question_id
      ORDER BY updated_at DESC NULLS LAST, assigned_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.mission_assignments
)
DELETE FROM public.mission_assignments ma
USING ranked r
WHERE ma.id = r.id
  AND r.rn > 1;

ALTER TABLE public.mission_assignments
ADD CONSTRAINT mission_assignments_mission_question_unique UNIQUE (mission_id, question_id);