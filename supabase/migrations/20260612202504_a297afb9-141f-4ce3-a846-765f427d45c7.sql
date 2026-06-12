-- 1) Add clearance_status to atlas_team_members and seed a realistic mix
ALTER TABLE public.atlas_team_members
  ADD COLUMN IF NOT EXISTS clearance_status text NOT NULL DEFAULT 'Not cleared';

ALTER TABLE public.atlas_team_members
  DROP CONSTRAINT IF EXISTS atlas_team_members_clearance_status_check;
ALTER TABLE public.atlas_team_members
  ADD CONSTRAINT atlas_team_members_clearance_status_check
  CHECK (clearance_status IN ('Cleared', 'Pending', 'Not cleared'));

-- Seed ~60% Cleared / 20% Pending / 20% Not cleared across all active staff
WITH ranked AS (
  SELECT id, ntile(10) OVER (ORDER BY created_at, id) AS bucket
  FROM public.atlas_team_members
  WHERE is_removed = false
)
UPDATE public.atlas_team_members t
SET clearance_status = CASE
  WHEN r.bucket <= 6 THEN 'Cleared'
  WHEN r.bucket <= 8 THEN 'Pending'
  ELSE 'Not cleared'
END
FROM ranked r
WHERE t.id = r.id;

-- 2) Allow the new mission_role vocabulary while keeping legacy values valid
ALTER TABLE public.mission_team_members
  DROP CONSTRAINT IF EXISTS mission_team_members_mission_role_check;
ALTER TABLE public.mission_team_members
  ADD CONSTRAINT mission_team_members_mission_role_check
  CHECK (mission_role IS NULL OR mission_role IN (
    'Lead Writer','Section Writer','Reviewer','SME',
    'Proposal Manager','Compliance Officer','Analyst','Coordinator',
    -- legacy values, preserved for backwards compatibility
    'engagement_lead','writer','sme','reviewer'
  ));

-- 3) Reassign NJ CSOC team to a varied, realistic role mix across 26 members
WITH nj AS (
  SELECT id, row_number() OVER (ORDER BY added_at, id) AS rn
  FROM public.mission_team_members
  WHERE mission_id = '739ddd6b-d536-4c61-a914-5e782bc0a928'
)
UPDATE public.mission_team_members m
SET mission_role = CASE nj.rn
  WHEN 1 THEN 'Proposal Manager'
  WHEN 2 THEN 'Lead Writer'
  WHEN 3 THEN 'Compliance Officer'
  WHEN 4 THEN 'Section Writer'
  WHEN 5 THEN 'Section Writer'
  WHEN 6 THEN 'Reviewer'
  WHEN 7 THEN 'SME'
  WHEN 8 THEN 'Section Writer'
  WHEN 9 THEN 'Analyst'
  WHEN 10 THEN 'Section Writer'
  WHEN 11 THEN 'Reviewer'
  WHEN 12 THEN 'SME'
  WHEN 13 THEN 'Coordinator'
  WHEN 14 THEN 'Section Writer'
  WHEN 15 THEN 'Section Writer'
  WHEN 16 THEN 'Reviewer'
  WHEN 17 THEN 'SME'
  WHEN 18 THEN 'Section Writer'
  WHEN 19 THEN 'Analyst'
  WHEN 20 THEN 'Section Writer'
  WHEN 21 THEN 'Compliance Officer'
  WHEN 22 THEN 'Reviewer'
  WHEN 23 THEN 'SME'
  WHEN 24 THEN 'Coordinator'
  WHEN 25 THEN 'Section Writer'
  WHEN 26 THEN 'Section Writer'
  ELSE 'Section Writer'
END
FROM nj
WHERE m.id = nj.id;