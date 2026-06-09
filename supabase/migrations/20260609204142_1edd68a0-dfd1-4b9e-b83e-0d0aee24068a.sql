
CREATE OR REPLACE FUNCTION public.calc_atlas_profile_completeness(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_job_title text,
  p_avatar_url text,
  p_skills text[],
  p_atlas_role text,
  p_atlas_invite_status text,
  p_hipaa boolean,
  p_resume_url text
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, LEAST(100,
    (CASE WHEN p_first_name IS NOT NULL AND length(btrim(p_first_name)) > 0 THEN 5 ELSE 0 END) +
    (CASE WHEN p_last_name IS NOT NULL AND length(btrim(p_last_name)) > 0 THEN 5 ELSE 0 END) +
    (CASE WHEN p_email IS NOT NULL AND length(btrim(p_email)) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN p_phone IS NOT NULL AND length(btrim(p_phone)) > 0 THEN 5 ELSE 0 END) +
    (CASE WHEN p_job_title IS NOT NULL AND length(btrim(p_job_title)) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN p_avatar_url IS NOT NULL AND length(btrim(p_avatar_url)) > 0 THEN 10 ELSE 0 END) +
    (CASE WHEN p_skills IS NOT NULL AND array_length(p_skills, 1) >= 3 THEN 15 ELSE 0 END) +
    (CASE WHEN p_atlas_role IS NOT NULL AND p_atlas_role <> 'unassigned' THEN 10 ELSE 0 END) +
    (CASE WHEN p_atlas_invite_status = 'active' THEN 10 ELSE 0 END) +
    (CASE WHEN p_hipaa IS TRUE THEN 10 ELSE 0 END) +
    (CASE WHEN p_resume_url IS NOT NULL AND length(btrim(p_resume_url)) > 0 THEN 10 ELSE 0 END)
  ));
$$;

CREATE OR REPLACE FUNCTION public.trg_atlas_profile_completeness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.atlas_profile_completeness := public.calc_atlas_profile_completeness(
    NEW.first_name, NEW.last_name, NEW.email, NEW.phone, NEW.job_title,
    NEW.avatar_url, NEW.skills, NEW.atlas_role, NEW.atlas_invite_status,
    NEW.atlas_hipaa_acknowledged, NEW.atlas_resume_url
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS atlas_team_members_profile_completeness ON public.atlas_team_members;
CREATE TRIGGER atlas_team_members_profile_completeness
  BEFORE INSERT OR UPDATE ON public.atlas_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_atlas_profile_completeness();

-- Backfill existing rows so the stored value matches the canonical formula.
UPDATE public.atlas_team_members
   SET atlas_profile_completeness = public.calc_atlas_profile_completeness(
     first_name, last_name, email, phone, job_title, avatar_url, skills,
     atlas_role, atlas_invite_status, atlas_hipaa_acknowledged, atlas_resume_url
   ),
   updated_at = updated_at;  -- no-op timestamp change; trigger sets the score
