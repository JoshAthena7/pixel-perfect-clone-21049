-- Add platform admin flag and helper
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin_or_founder()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.engagement_members
      WHERE user_id = auth.uid() AND role = 'founder'
    );
$$;