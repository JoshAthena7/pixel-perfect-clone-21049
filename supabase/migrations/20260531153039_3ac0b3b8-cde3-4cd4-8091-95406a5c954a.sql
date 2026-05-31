
ALTER TABLE public.engagement_members DROP CONSTRAINT IF EXISTS engagement_members_role_check;
ALTER TABLE public.engagement_members
  ADD CONSTRAINT engagement_members_role_check
  CHECK (role = ANY (ARRAY[
    'founder'::text,
    'pm'::text,
    'engagement_lead'::text,
    'writer'::text,
    'viewer'::text,
    'exec'::text,
    'sme'::text,
    'partner'::text
  ]));

COMMENT ON COLUMN public.engagement_members.role IS
  'Role on this engagement. Spec roles map as: lead=engagement_lead (founder treated as lead). New roles: exec (executive read-only), sme (subject matter expert), partner (external partner).';
