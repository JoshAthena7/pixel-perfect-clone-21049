
WITH src AS (
  SELECT mci.* FROM public.mission_client_intel mci
  JOIN public.missions m ON m.id = mci.mission_id
)
INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT s.mission_id, 'stakeholders',
       COALESCE(x->>'name', x->>'title', 'Stakeholder'),
       COALESCE(x->>'description', x->>'role', x::text),
       COALESCE(s.updated_at, now()), COALESCE(s.updated_at, now())
FROM src s, jsonb_array_elements(COALESCE(s.stakeholders, '[]'::jsonb)) x
WHERE jsonb_typeof(s.stakeholders) = 'array';

WITH src AS (
  SELECT mci.* FROM public.mission_client_intel mci JOIN public.missions m ON m.id = mci.mission_id
)
INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT s.mission_id, 'stakeholders',
       COALESCE(x->>'name', x->>'title', 'Decision Maker'),
       COALESCE(x->>'description', x->>'role', x::text),
       COALESCE(s.updated_at, now()), COALESCE(s.updated_at, now())
FROM src s, jsonb_array_elements(COALESCE(s.decision_makers, '[]'::jsonb)) x
WHERE jsonb_typeof(s.decision_makers) = 'array';

WITH src AS (
  SELECT mci.* FROM public.mission_client_intel mci JOIN public.missions m ON m.id = mci.mission_id
)
INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT s.mission_id, 'stakeholders',
       COALESCE(x->>'name', x->>'title', 'Contact'),
       COALESCE(x->>'description', x->>'role', x::text),
       COALESCE(s.updated_at, now()), COALESCE(s.updated_at, now())
FROM src s, jsonb_array_elements(COALESCE(s.contacts, '[]'::jsonb)) x
WHERE jsonb_typeof(s.contacts) = 'array';

INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT mci.mission_id, 'political_environment', 'Political Considerations', mci.political_considerations,
       COALESCE(mci.updated_at, now()), COALESCE(mci.updated_at, now())
FROM public.mission_client_intel mci
JOIN public.missions m ON m.id = mci.mission_id
WHERE mci.political_considerations IS NOT NULL AND length(trim(mci.political_considerations)) > 0;

INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT mci.mission_id, 'state_priorities', 'Mission Notes', mci.notes,
       COALESCE(mci.updated_at, now()), COALESCE(mci.updated_at, now())
FROM public.mission_client_intel mci
JOIN public.missions m ON m.id = mci.mission_id
WHERE mci.notes IS NOT NULL AND length(trim(mci.notes)) > 0;

INSERT INTO public.mission_client_intelligence (mission_id, category, title, content, created_at, updated_at)
SELECT mci.mission_id, 'state_priorities', 'Meeting Cadence', mci.meeting_cadence,
       COALESCE(mci.updated_at, now()), COALESCE(mci.updated_at, now())
FROM public.mission_client_intel mci
JOIN public.missions m ON m.id = mci.mission_id
WHERE mci.meeting_cadence IS NOT NULL AND length(trim(mci.meeting_cadence)) > 0;
