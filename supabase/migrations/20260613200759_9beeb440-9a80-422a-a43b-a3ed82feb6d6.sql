
-- Indexes for the entity-first feed
CREATE INDEX IF NOT EXISTS intel_events_mission_created_idx
  ON public.intel_events (mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intel_events_mission_type_idx
  ON public.intel_events (mission_id, event_type);
CREATE INDEX IF NOT EXISTS intel_relationships_mission_idx
  ON public.intel_relationships (mission_id);
CREATE INDEX IF NOT EXISTS intel_people_mission_idx
  ON public.intel_people (mission_id);
CREATE INDEX IF NOT EXISTS intel_organizations_mission_idx
  ON public.intel_organizations (mission_id);
CREATE INDEX IF NOT EXISTS intel_sources_mission_idx
  ON public.intel_sources (mission_id);

-- ============================================================
-- Seed: stakeholder_profiles -> intel_entities + intel_people
-- ============================================================
WITH source AS (
  SELECT sp.id AS sp_id,
         sp.mission_id,
         sp.name,
         sp.title,
         sp.organization,
         sp.stakeholder_type,
         sp.sub_type,
         sp.public_priorities,
         sp.known_concerns,
         sp.relationship_to_athena
  FROM public.stakeholder_profiles sp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.intel_people ip
    JOIN public.intel_entities ie ON ie.id = ip.entity_id
    WHERE ip.mission_id = sp.mission_id
      AND lower(trim(ie.name)) = lower(trim(sp.name))
  )
),
inserted_entities AS (
  INSERT INTO public.intel_entities (entity_type, name, description, metadata, mission_ids)
  SELECT 'person',
         s.name,
         COALESCE(s.title, s.organization),
         jsonb_build_object(
           'seed_source', 'stakeholder_profiles',
           'stakeholder_type', s.stakeholder_type,
           'sub_type', s.sub_type,
           'organization', s.organization
         ),
         ARRAY[s.mission_id]::uuid[]
  FROM source s
  RETURNING id, name
)
INSERT INTO public.intel_people (
  entity_id, mission_id, role_type, organization_entity_id,
  influence_level, relationship_stance, known_priorities,
  title, notes
)
SELECT ie.id,
       s.mission_id,
       CASE
         WHEN s.stakeholder_type IN ('decision_maker','executive','evaluator','sponsor') THEN s.stakeholder_type
         WHEN s.stakeholder_type = 'advocate' THEN 'influencer'
         ELSE 'stakeholder'
       END,
       NULL,
       NULL,
       CASE
         WHEN s.relationship_to_athena ILIKE '%champion%' OR s.relationship_to_athena ILIKE '%support%' THEN 'supportive'
         WHEN s.relationship_to_athena ILIKE '%opponent%' OR s.relationship_to_athena ILIKE '%against%' THEN 'opposed'
         WHEN s.relationship_to_athena ILIKE '%neutral%' THEN 'neutral'
         ELSE NULL
       END,
       CASE
         WHEN s.public_priorities IS NULL OR length(trim(s.public_priorities)) = 0 THEN NULL
         ELSE ARRAY[substring(s.public_priorities for 500)]
       END,
       s.title,
       NULLIF(concat_ws(E'\n',
         NULLIF(s.public_priorities, ''),
         CASE WHEN s.known_concerns IS NOT NULL AND length(trim(s.known_concerns)) > 0
              THEN 'Concerns: ' || s.known_concerns ELSE NULL END,
         CASE WHEN s.relationship_to_athena IS NOT NULL AND length(trim(s.relationship_to_athena)) > 0
              THEN 'Relationship: ' || s.relationship_to_athena ELSE NULL END
       ), '')
FROM source s
JOIN inserted_entities ie ON ie.name = s.name;

-- ============================================================
-- Seed: competitor_profiles -> intel_entities + intel_organizations
-- ============================================================
WITH source AS (
  SELECT cp.id AS cp_id,
         cp.mission_id,
         cp.organization_name,
         cp.competitor_type,
         cp.likely_narrative,
         cp.known_strengths,
         cp.known_weaknesses,
         cp.differentiation_strategy
  FROM public.competitor_profiles cp
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.intel_organizations io
    JOIN public.intel_entities ie ON ie.id = io.entity_id
    WHERE io.mission_id = cp.mission_id
      AND lower(trim(ie.name)) = lower(trim(cp.organization_name))
  )
),
inserted_entities AS (
  INSERT INTO public.intel_entities (entity_type, name, description, metadata, mission_ids)
  SELECT 'organization',
         s.organization_name,
         s.likely_narrative,
         jsonb_build_object(
           'seed_source', 'competitor_profiles',
           'competitor_type', s.competitor_type
         ),
         ARRAY[s.mission_id]::uuid[]
  FROM source s
  RETURNING id, name
)
INSERT INTO public.intel_organizations (
  entity_id, mission_id, org_type, parent_entity_id,
  incumbency_status, contract_vehicles, known_strengths, known_weaknesses, notes
)
SELECT ie.id,
       s.mission_id,
       CASE
         WHEN s.competitor_type ILIKE '%incumbent%' THEN 'competitor'
         WHEN s.competitor_type ILIKE '%partner%' THEN 'partner'
         WHEN s.competitor_type ILIKE '%agency%' THEN 'agency'
         ELSE 'competitor'
       END,
       NULL,
       CASE WHEN s.competitor_type ILIKE '%incumbent%' THEN 'incumbent' ELSE NULL END,
       NULL,
       CASE WHEN s.known_strengths IS NOT NULL AND length(trim(s.known_strengths)) > 0
            THEN ARRAY[substring(s.known_strengths for 500)] ELSE NULL END,
       CASE WHEN s.known_weaknesses IS NOT NULL AND length(trim(s.known_weaknesses)) > 0
            THEN ARRAY[substring(s.known_weaknesses for 500)] ELSE NULL END,
       NULLIF(concat_ws(E'\n',
         NULLIF(s.likely_narrative, ''),
         CASE WHEN s.differentiation_strategy IS NOT NULL AND length(trim(s.differentiation_strategy)) > 0
              THEN 'Differentiation: ' || s.differentiation_strategy ELSE NULL END
       ), '')
FROM source s
JOIN inserted_entities ie ON ie.name = s.organization_name;
