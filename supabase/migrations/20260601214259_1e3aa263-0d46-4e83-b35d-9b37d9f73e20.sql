
-- Attach trigger: auto-create profiles row on new auth user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Attach trigger: auto-add mission creator as admin member
DROP TRIGGER IF EXISTS seed_mission_creator_trigger ON public.missions;
CREATE TRIGGER seed_mission_creator_trigger
  AFTER INSERT ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.seed_mission_creator();

-- Backfill profiles for existing auth users
INSERT INTO public.profiles (id, display_name, email)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)), u.email
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
