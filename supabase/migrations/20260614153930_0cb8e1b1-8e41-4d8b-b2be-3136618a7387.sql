ALTER TABLE public.intel_people ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.intel_people ADD COLUMN IF NOT EXISTS organization text;
ALTER TABLE public.intel_people ALTER COLUMN entity_id DROP NOT NULL;

ALTER TABLE public.intel_people DROP CONSTRAINT IF EXISTS intel_people_role_type_check;
ALTER TABLE public.intel_people ADD CONSTRAINT intel_people_role_type_check
  CHECK (role_type = ANY (ARRAY[
    'stakeholder','evaluator','influencer','champion','expert','adversary','contact',
    'decision_maker','advocate','legislator','media'
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_people_mission_email
  ON public.intel_people (mission_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_people_mission_name_org
  ON public.intel_people (mission_id, lower(name), lower(coalesce(organization,'')))
  WHERE name IS NOT NULL AND name <> '';