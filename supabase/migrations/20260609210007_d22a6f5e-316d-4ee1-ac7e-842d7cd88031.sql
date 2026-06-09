
ALTER TABLE public.atlas_team_members
  ADD COLUMN IF NOT EXISTS onboarding_step_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Allow an authenticated user to read their own atlas_team_members row by matching email,
-- so the onboarding gate can resolve state client/server-side without admin privileges.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atlas_team_members'
      AND policyname = 'Users can view their own atlas_team_member row'
  ) THEN
    CREATE POLICY "Users can view their own atlas_team_member row"
      ON public.atlas_team_members
      FOR SELECT
      TO authenticated
      USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));
  END IF;
END $$;
