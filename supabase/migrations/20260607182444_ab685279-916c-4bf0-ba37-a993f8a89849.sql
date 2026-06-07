
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_user_state(_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT invite_sent_at, accepted_user_id
    FROM public.atlas_invites
    WHERE lower(email) = lower(_email)
    LIMIT 1
  ),
  prof AS (
    SELECT has_onboarded
    FROM public.profiles
    WHERE lower(email) = lower(_email)
    LIMIT 1
  )
  SELECT CASE
    WHEN (SELECT has_onboarded FROM prof) = true THEN 'active'
    WHEN (SELECT invite_sent_at FROM inv) IS NOT NULL THEN 'invited'
    WHEN (SELECT 1 FROM prof) IS NOT NULL THEN 'active'
    WHEN (SELECT 1 FROM inv) IS NOT NULL THEN 'loaded'
    ELSE 'unknown'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_state(text) TO authenticated, service_role;
