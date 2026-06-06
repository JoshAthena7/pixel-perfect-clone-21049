
-- 1. Tighten profiles RLS: drop broad shared-mission read; restrict to self/admin only.
DROP POLICY IF EXISTS "profiles_read_self_or_shared" ON public.profiles;

CREATE POLICY "profiles_read_self_or_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Provide a safe non-email view for cross-user lookups (display_name, avatar, expertise, etc.)
CREATE OR REPLACE VIEW public.profile_basics
WITH (security_invoker = false) AS
  SELECT
    id,
    display_name,
    avatar_color,
    avatar_url,
    created_at,
    expertise_areas,
    states_experience,
    programs_experience,
    question_types,
    availability_status,
    availability_until,
    availability_note,
    expert_bio,
    default_mission_role,
    timezone
  FROM public.profiles;

GRANT SELECT ON public.profile_basics TO authenticated;
GRANT ALL ON public.profile_basics TO service_role;

-- 3. Tighten app_support_settings reads to admins / platform admins only (was: any authed user)
DROP POLICY IF EXISTS "anyone authed reads support settings" ON public.app_support_settings;

CREATE POLICY "admins read support settings"
  ON public.app_support_settings
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Document that graph_nodes / graph_edges writes are intentionally service-role-only
--    by adding explicit admin write policies (defense in depth; service_role already bypasses RLS).
CREATE POLICY "admins write graph_nodes"
  ON public.graph_nodes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins write graph_edges"
  ON public.graph_edges
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
