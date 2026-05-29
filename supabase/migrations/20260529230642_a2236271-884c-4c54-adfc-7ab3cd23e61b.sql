REVOKE EXECUTE ON FUNCTION public.cleanup_quick_chats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_quick_chats() TO service_role;