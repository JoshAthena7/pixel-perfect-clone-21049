ALTER TABLE public.engagement_members DROP CONSTRAINT engagement_members_role_check;
ALTER TABLE public.engagement_members ADD CONSTRAINT engagement_members_role_check
  CHECK (role = ANY (ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text, 'writer'::text, 'reviewer'::text, 'viewer'::text]));