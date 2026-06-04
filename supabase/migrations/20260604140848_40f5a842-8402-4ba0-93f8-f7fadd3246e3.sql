
-- 1. Atlas knowledge objects & sources: mission-scoped SELECT
DROP POLICY IF EXISTS atlas_ko_read ON public.atlas_knowledge_objects;
CREATE POLICY atlas_ko_read ON public.atlas_knowledge_objects
  FOR SELECT TO authenticated
  USING (
    mission_id IS NULL
    OR knowledge_layer <> 'mission'
    OR public.is_mission_member(mission_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS atlas_sources_read ON public.atlas_sources;
CREATE POLICY atlas_sources_read ON public.atlas_sources
  FOR SELECT TO authenticated
  USING (
    mission_id IS NULL
    OR knowledge_layer <> 'mission'
    OR public.is_mission_member(mission_id, auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

-- 2. iris_memory_usage: restrict INSERT to mission members
DROP POLICY IF EXISTS imu_insert ON public.iris_memory_usage;
CREATE POLICY imu_insert ON public.iris_memory_usage
  FOR INSERT TO authenticated
  WITH CHECK (
    mission_id IS NULL
    OR public.is_mission_member(mission_id, auth.uid())
  );

-- 3. is_olympus_user: use profiles.is_platform_admin instead of any mission lead
CREATE OR REPLACE FUNCTION public.is_olympus_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  );
$$;

-- 4. Storage UPDATE policies for compliance-docs and mission-library
DROP POLICY IF EXISTS compliance_storage_update ON storage.objects;
CREATE POLICY compliance_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'compliance-docs' AND public.user_has_any_leadership_role(auth.uid()))
  WITH CHECK (bucket_id = 'compliance-docs' AND public.user_has_any_leadership_role(auth.uid()));

DROP POLICY IF EXISTS mission_library_storage_update ON storage.objects;
CREATE POLICY mission_library_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'mission-library')
  WITH CHECK (bucket_id = 'mission-library');

-- 5. slack_webhook: column-level lockdown + admin-only setter
REVOKE SELECT (slack_webhook), INSERT (slack_webhook), UPDATE (slack_webhook)
  ON public.missions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.set_mission_slack_webhook(_mission_id uuid, _webhook text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_mission_role(_mission_id, auth.uid(), ARRAY['admin','lead']) THEN
    RAISE EXCEPTION 'Not authorized to set slack webhook for this mission';
  END IF;
  IF _webhook IS NOT NULL AND _webhook NOT LIKE 'https://hooks.slack.com/%' THEN
    RAISE EXCEPTION 'Invalid slack webhook URL';
  END IF;
  UPDATE public.missions SET slack_webhook = _webhook WHERE id = _mission_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_mission_slack_webhook(uuid, text) TO authenticated;

-- 6. profiles.is_platform_admin: lock down at the column level
REVOKE SELECT (is_platform_admin), INSERT (is_platform_admin), UPDATE (is_platform_admin)
  ON public.profiles FROM authenticated, anon;

-- 7. writer_identity_aliases: restrict SELECT to platform admins
DROP POLICY IF EXISTS "writer_aliases readable to authenticated" ON public.writer_identity_aliases;
CREATE POLICY "writer_aliases admin read" ON public.writer_identity_aliases
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 8. hook_failures: admin-only SELECT (RLS was on with no policy = total deny)
CREATE POLICY hook_failures_admin_read ON public.hook_failures
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 9. Search path on our application functions
ALTER FUNCTION public.tg_iris_memories_touch() SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
