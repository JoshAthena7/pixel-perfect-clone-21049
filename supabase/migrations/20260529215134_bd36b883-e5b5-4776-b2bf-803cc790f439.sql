CREATE TABLE public.engagement_pulses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  member_id uuid NOT NULL,
  star_count integer NOT NULL DEFAULT 0,
  tlc_count integer NOT NULL DEFAULT 0,
  last_flag_note text,
  last_flag_type text,
  last_recognition_note text,
  last_recognition_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id)
);

CREATE INDEX engagement_pulses_engagement_idx ON public.engagement_pulses(engagement_id);

GRANT SELECT, INSERT, UPDATE ON public.engagement_pulses TO authenticated;
GRANT ALL ON public.engagement_pulses TO service_role;

ALTER TABLE public.engagement_pulses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulses_select_member"
  ON public.engagement_pulses
  FOR SELECT
  TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "pulses_insert_leadership"
  ON public.engagement_pulses
  FOR INSERT
  TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "pulses_update_leadership"
  ON public.engagement_pulses
  FOR UPDATE
  TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE OR REPLACE FUNCTION public.touch_engagement_pulses_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_engagement_pulses_updated_at
BEFORE UPDATE ON public.engagement_pulses
FOR EACH ROW
EXECUTE FUNCTION public.touch_engagement_pulses_updated_at();