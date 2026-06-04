
CREATE TABLE public.mission_sensitivities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  subject TEXT,
  note TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_sensitivities TO authenticated;
GRANT ALL ON public.mission_sensitivities TO service_role;

ALTER TABLE public.mission_sensitivities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view sensitivities"
ON public.mission_sensitivities FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mission_sensitivities.mission_id
      AND mm.user_id = auth.uid()
  )
);

CREATE POLICY "Mission members can insert sensitivities"
ON public.mission_sensitivities FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mission_sensitivities.mission_id
      AND mm.user_id = auth.uid()
  )
);

CREATE POLICY "Mission members can update sensitivities"
ON public.mission_sensitivities FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mission_sensitivities.mission_id
      AND mm.user_id = auth.uid()
  )
);

CREATE POLICY "Mission members can delete sensitivities"
ON public.mission_sensitivities FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mission_sensitivities.mission_id
      AND mm.user_id = auth.uid()
  )
);

CREATE TRIGGER update_mission_sensitivities_updated_at
BEFORE UPDATE ON public.mission_sensitivities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mission_sensitivities_mission ON public.mission_sensitivities(mission_id);
