CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  mission_id uuid,
  category text NOT NULL CHECK (category IN ('it','billing','platform','leanne','talent_desk')),
  body text NOT NULL,
  urgency text NOT NULL DEFAULT 'today' CHECK (urgency IN ('right_now','today','no_rush')),
  context text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own support requests"
  ON public.support_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.user_has_any_leadership_role(auth.uid())
  );

CREATE POLICY "users create own support requests"
  ON public.support_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "leads update support requests"
  ON public.support_requests FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR public.user_has_any_leadership_role(auth.uid())
  );

CREATE INDEX idx_support_requests_status ON public.support_requests (status, created_at DESC);
CREATE INDEX idx_support_requests_requester ON public.support_requests (requester_id, created_at DESC);

CREATE TABLE public.support_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_responses TO authenticated;
GRANT ALL ON public.support_responses TO service_role;

ALTER TABLE public.support_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "see responses for visible requests"
  ON public.support_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_requests r
      WHERE r.id = request_id
        AND (
          r.requester_id = auth.uid()
          OR public.is_platform_admin(auth.uid())
          OR public.user_has_any_leadership_role(auth.uid())
        )
    )
  );

CREATE POLICY "respond to visible requests"
  ON public.support_responses FOR INSERT TO authenticated
  WITH CHECK (
    responder_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_requests r
      WHERE r.id = request_id
        AND (
          r.requester_id = auth.uid()
          OR public.is_platform_admin(auth.uid())
          OR public.user_has_any_leadership_role(auth.uid())
        )
    )
  );

CREATE INDEX idx_support_responses_request ON public.support_responses (request_id, created_at);

CREATE TABLE public.app_support_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  it_contact_email text,
  billing_contact_email text,
  pm_user_id uuid,
  pm_contact_email text,
  talent_desk_url text,
  talent_desk_quick_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_support_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_support_settings TO authenticated;
GRANT ALL ON public.app_support_settings TO service_role;

ALTER TABLE public.app_support_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone authed reads support settings"
  ON public.app_support_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins write support settings"
  ON public.app_support_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "admins update support settings"
  ON public.app_support_settings FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()));

INSERT INTO public.app_support_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
