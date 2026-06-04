
CREATE TABLE public.iris_onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_module int NOT NULL DEFAULT 0 CHECK (last_module BETWEEN 0 AND 7),
  is_complete boolean NOT NULL DEFAULT false,
  completion_hash varchar(64)
);
CREATE INDEX iris_onboarding_sessions_user_idx ON public.iris_onboarding_sessions(user_id);

CREATE TABLE public.iris_onboarding_module_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.iris_onboarding_sessions(id) ON DELETE CASCADE,
  module_number int NOT NULL CHECK (module_number BETWEEN 1 AND 7),
  cleared_at timestamptz NOT NULL DEFAULT now(),
  questions_asked jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX iris_onboarding_module_log_session_idx ON public.iris_onboarding_module_log(session_id);

CREATE TABLE public.iris_onboarding_admin_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reset_by uuid NOT NULL REFERENCES auth.users(id),
  reset_at timestamptz NOT NULL DEFAULT now(),
  modules_reset jsonb,
  reason text
);

GRANT SELECT, INSERT, UPDATE ON public.iris_onboarding_sessions TO authenticated;
GRANT SELECT, INSERT ON public.iris_onboarding_module_log TO authenticated;
GRANT SELECT, INSERT ON public.iris_onboarding_admin_resets TO authenticated;
GRANT ALL ON public.iris_onboarding_sessions TO service_role;
GRANT ALL ON public.iris_onboarding_module_log TO service_role;
GRANT ALL ON public.iris_onboarding_admin_resets TO service_role;

ALTER TABLE public.iris_onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iris_onboarding_module_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iris_onboarding_admin_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own onboarding session"
  ON public.iris_onboarding_sessions FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users manage own onboarding module log"
  ON public.iris_onboarding_module_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.iris_onboarding_sessions s
      WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.iris_onboarding_sessions s
      WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "admins manage onboarding resets"
  ON public.iris_onboarding_admin_resets FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
