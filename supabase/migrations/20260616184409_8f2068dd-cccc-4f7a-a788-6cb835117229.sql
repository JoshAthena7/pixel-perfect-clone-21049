-- Restore CSOC mission for re-extraction: clear questions so the admin
-- Re-run IRIS card resurfaces. Cascade FK removes related assignments
-- and progress rows.
DELETE FROM public.mission_questions
WHERE mission_id = '128da20f-9479-4108-b6b9-0017595509b1';

-- Safety net: collapse any future duplicates by (mission_id, question_number)
-- keeping the oldest row, so the unique constraint below can be added safely.
DELETE FROM public.mission_questions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY mission_id, question_number
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.mission_questions
    WHERE question_number IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Prevent BLAST OFF (or any other code path) from ever creating duplicate
-- question_number values for the same mission. Partial unique index allows
-- NULL question_number rows (rare) to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_question_number
  ON public.mission_questions (mission_id, question_number)
  WHERE question_number IS NOT NULL;