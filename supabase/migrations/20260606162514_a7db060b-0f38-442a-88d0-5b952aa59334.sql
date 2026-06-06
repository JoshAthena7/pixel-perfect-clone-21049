
CREATE TABLE IF NOT EXISTS public.client_clarifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','answered','withdrawn')),
  submitted_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  client_response TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, number)
);

CREATE INDEX IF NOT EXISTS client_clarifications_mission_idx
  ON public.client_clarifications (mission_id, number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_clarifications TO authenticated;
GRANT ALL ON public.client_clarifications TO service_role;

ALTER TABLE public.client_clarifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read clarifications"
  ON public.client_clarifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = client_clarifications.mission_id
        AND mm.user_id = auth.uid()
    )
  );

CREATE POLICY "Mission members can add clarifications"
  ON public.client_clarifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = client_clarifications.mission_id
        AND mm.user_id = auth.uid()
    )
  );

CREATE POLICY "Mission PMs/Leads can update any clarification"
  ON public.client_clarifications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = client_clarifications.mission_id
        AND mm.user_id = auth.uid()
        AND lower(mm.role) = ANY (ARRAY['pm','project manager','project_manager','lead','admin'])
    )
    OR (created_by = auth.uid() AND status = 'draft')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = client_clarifications.mission_id
        AND mm.user_id = auth.uid()
        AND lower(mm.role) = ANY (ARRAY['pm','project manager','project_manager','lead','admin'])
    )
    OR (created_by = auth.uid() AND status = 'draft')
  );

CREATE POLICY "Mission PMs/Leads can delete clarifications"
  ON public.client_clarifications
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = client_clarifications.mission_id
        AND mm.user_id = auth.uid()
        AND lower(mm.role) = ANY (ARRAY['pm','project manager','project_manager','lead','admin'])
    )
  );

-- Auto-assign sequential number per mission
CREATE OR REPLACE FUNCTION public.assign_clarification_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = 0 THEN
    SELECT COALESCE(MAX(number), 0) + 1
      INTO NEW.number
      FROM public.client_clarifications
     WHERE mission_id = NEW.mission_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_clarification_number ON public.client_clarifications;
CREATE TRIGGER trg_assign_clarification_number
  BEFORE INSERT ON public.client_clarifications
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_clarification_number();

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_clarification_updated_at ON public.client_clarifications;
CREATE TRIGGER trg_touch_clarification_updated_at
  BEFORE UPDATE ON public.client_clarifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
