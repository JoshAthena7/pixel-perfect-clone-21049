
-- =========================================================
-- C1: Stop persisting Score Me draft text
-- =========================================================
ALTER TABLE public.score_me_history ALTER COLUMN response_text DROP NOT NULL;
UPDATE public.score_me_history SET response_text = NULL WHERE response_text IS NOT NULL;
ALTER TABLE public.score_me_history DROP COLUMN IF EXISTS response_text;

-- =========================================================
-- C6: Lock down profiles & writer_identities cross-firm reads
-- =========================================================

CREATE OR REPLACE FUNCTION public.shares_mission_with(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_members mm_self
    JOIN public.mission_members mm_other
      ON mm_self.mission_id = mm_other.mission_id
    WHERE mm_self.user_id = auth.uid()
      AND mm_other.user_id = _other_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.shares_mission_with(uuid) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS profiles_read_all_auth ON public.profiles;

CREATE POLICY profiles_read_self_or_shared
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.shares_mission_with(id)
);

DROP POLICY IF EXISTS "writer_identities readable to authenticated" ON public.writer_identities;

CREATE POLICY writer_identities_read_self_or_shared
ON public.writer_identities
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.writer_identity_aliases a
    WHERE a.writer_id = writer_identities.id
      AND a.alias_kind = 'auth_user'
      AND a.alias_value = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1
    FROM public.writer_identity_aliases a
    JOIN public.mission_members mm_other ON mm_other.user_id::text = a.alias_value
    JOIN public.mission_members mm_self  ON mm_self.mission_id = mm_other.mission_id
    WHERE a.writer_id = writer_identities.id
      AND a.alias_kind = 'auth_user'
      AND mm_self.user_id = auth.uid()
  )
);

-- Thin public directory view: id, display_name, avatar_url only.
CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = false) AS
SELECT id, display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;
