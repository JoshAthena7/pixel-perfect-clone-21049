CREATE TABLE IF NOT EXISTS public.mission_iris_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_file_name text,
  source_file_id uuid,
  extracted_field text NOT NULL,
  extracted_value text,
  confidence_score numeric(3,2),
  wizard_step integer,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  overridden_by_user boolean NOT NULL DEFAULT false,
  user_override_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_iris_extractions_mission ON public.mission_iris_extractions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_iris_extractions_field ON public.mission_iris_extractions(mission_id, extracted_field);
CREATE INDEX IF NOT EXISTS idx_mission_iris_extractions_step ON public.mission_iris_extractions(mission_id, wizard_step);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_iris_extractions_unique_field ON public.mission_iris_extractions(mission_id, extracted_field) WHERE source_file_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_iris_extractions TO authenticated;
GRANT ALL ON public.mission_iris_extractions TO service_role;

ALTER TABLE public.mission_iris_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view extractions"
ON public.mission_iris_extractions FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
);

CREATE POLICY "Mission members can insert extractions"
ON public.mission_iris_extractions FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
);

CREATE POLICY "Mission members can update extractions"
ON public.mission_iris_extractions FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
);

CREATE POLICY "Mission members can delete extractions"
ON public.mission_iris_extractions FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_mission_creator(mission_id, auth.uid())
);

CREATE TRIGGER mission_iris_extractions_set_updated_at
BEFORE UPDATE ON public.mission_iris_extractions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();