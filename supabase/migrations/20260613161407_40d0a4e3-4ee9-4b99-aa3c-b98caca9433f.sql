CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  surface text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  admin_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX change_requests_status_idx ON public.change_requests (status, created_at DESC);
CREATE INDEX change_requests_mission_idx ON public.change_requests (mission_id);
CREATE INDEX change_requests_user_idx ON public.change_requests (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO authenticated;
GRANT ALL ON public.change_requests TO service_role;

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own change requests"
  ON public.change_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read their own change requests"
  ON public.change_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all change requests"
  ON public.change_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins update change requests"
  ON public.change_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete change requests"
  ON public.change_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER change_requests_set_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();