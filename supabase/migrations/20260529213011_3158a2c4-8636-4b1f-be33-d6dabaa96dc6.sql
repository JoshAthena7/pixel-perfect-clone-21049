
-- 1) Realtime authorization: lock presence channels to engagement members
CREATE POLICY "presence_engagement_members_select"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'presence:engagement:%'
  AND private.is_engagement_member(
    NULLIF(split_part(realtime.topic(), ':', 3), '')::uuid
  )
);

CREATE POLICY "presence_engagement_members_insert"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'presence:engagement:%'
  AND private.is_engagement_member(
    NULLIF(split_part(realtime.topic(), ':', 3), '')::uuid
  )
);

-- 2) client_pulses UPDATE/DELETE leadership-only
CREATE POLICY "pulses_update_leadership" ON public.client_pulses
FOR UPDATE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "pulses_delete_leadership" ON public.client_pulses
FOR DELETE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 3) decisions UPDATE/DELETE leadership-only
CREATE POLICY "decisions_update_leadership" ON public.decisions
FOR UPDATE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "decisions_delete_leadership" ON public.decisions
FOR DELETE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 4) engagement_members: restrict contact-info columns to leadership or self
REVOKE SELECT (email, phone, slack_handle) ON public.engagement_members FROM authenticated, anon;

-- Grant column-level select for non-sensitive cols (idempotent)
GRANT SELECT (id, engagement_id, user_id, display_name, role, title, timezone, on_call, added_at)
  ON public.engagement_members TO authenticated;

-- Security definer function so users can fetch their OWN contact info, and leadership can fetch all
CREATE OR REPLACE FUNCTION public.get_engagement_member_contacts(_engagement_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  phone text,
  slack_handle text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id, m.display_name, m.email, m.phone, m.slack_handle
  FROM public.engagement_members m
  WHERE m.engagement_id = _engagement_id
    AND (
      m.user_id = auth.uid()
      OR private.has_engagement_role(_engagement_id, ARRAY['founder','pm','engagement_lead'])
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_engagement_member_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_member_contacts(uuid) TO authenticated;

-- 5) heatmap_sections INSERT/DELETE leadership-only
CREATE POLICY "heatmap_insert_leadership" ON public.heatmap_sections
FOR INSERT TO authenticated
WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "heatmap_delete_leadership" ON public.heatmap_sections
FOR DELETE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 6) intel_documents UPDATE/DELETE: uploader or leadership
CREATE POLICY "intel_update_owner_or_leadership" ON public.intel_documents
FOR UPDATE TO authenticated
USING (
  uploaded_by = auth.uid()
  OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
);

CREATE POLICY "intel_delete_owner_or_leadership" ON public.intel_documents
FOR DELETE TO authenticated
USING (
  uploaded_by = auth.uid()
  OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
);

-- 7) risks DELETE leadership-only
CREATE POLICY "risks_delete_leadership" ON public.risks
FOR DELETE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 8) intel-files storage UPDATE/DELETE policies (engagement membership; folder = engagement_id)
CREATE POLICY "intel_files_member_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "intel_files_member_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
);

-- 9) Lock down SECURITY DEFINER email queue helpers (service_role only) + fix search_path
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
