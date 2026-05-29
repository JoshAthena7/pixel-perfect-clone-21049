REVOKE EXECUTE ON FUNCTION public.is_engagement_member(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_engagement_role(UUID, TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_engagement() FROM PUBLIC, anon, authenticated;