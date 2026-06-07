
CREATE TABLE public.athena_smes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  title text,
  organization text DEFAULT 'Athena Strategy Group',
  email text NOT NULL,
  phone text,
  expertise_areas text[] DEFAULT '{}'::text[],
  bio text,
  availability text DEFAULT 'available' CHECK (availability IN ('available','limited','unavailable')),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athena_smes TO authenticated;
GRANT ALL ON public.athena_smes TO service_role;

ALTER TABLE public.athena_smes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active SMEs
CREATE POLICY "Authenticated can read active Athena SMEs"
  ON public.athena_smes FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Only admins can write
CREATE POLICY "Admins can insert Athena SMEs"
  ON public.athena_smes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update Athena SMEs"
  ON public.athena_smes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete Athena SMEs"
  ON public.athena_smes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER athena_smes_updated_at
  BEFORE UPDATE ON public.athena_smes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX athena_smes_active_idx ON public.athena_smes(is_active);
CREATE INDEX athena_smes_expertise_gin ON public.athena_smes USING GIN (expertise_areas);
