CREATE TABLE public.phi_rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  writer_id UUID REFERENCES public.writer_identities(id) ON DELETE SET NULL,
  engagement_id UUID,
  surface TEXT NOT NULL CHECK (surface IN ('score_me','vault_upload','iris_ingest','rfp_parser','document_extraction')),
  patterns_matched TEXT[] NOT NULL DEFAULT '{}',
  confidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.phi_rejection_log TO authenticated;
GRANT ALL ON public.phi_rejection_log TO service_role;

ALTER TABLE public.phi_rejection_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phi_rejection_log_admin_read_all"
  ON public.phi_rejection_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "phi_rejection_log_self_read"
  ON public.phi_rejection_log
  FOR SELECT
  TO authenticated
  USING (actor_user_id = auth.uid());

CREATE INDEX idx_phi_rejection_actor ON public.phi_rejection_log(actor_user_id, created_at DESC);
CREATE INDEX idx_phi_rejection_engagement ON public.phi_rejection_log(engagement_id, created_at DESC);
CREATE INDEX idx_phi_rejection_surface ON public.phi_rejection_log(surface, created_at DESC);