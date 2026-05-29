DROP TRIGGER IF EXISTS seed_engagement_trigger ON public.engagements;
CREATE TRIGGER seed_engagement_trigger
AFTER INSERT ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.seed_engagement();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();