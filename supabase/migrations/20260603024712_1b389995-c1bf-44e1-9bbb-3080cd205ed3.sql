
-- Helper: any signed-in user counts as having Olympus access if they are an admin/lead on any mission
CREATE OR REPLACE FUNCTION public.is_olympus_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_members
    WHERE user_id = _user_id AND role IN ('admin','lead')
  ) OR NOT EXISTS (
    SELECT 1 FROM public.mission_members WHERE user_id = _user_id
  );
$$;

CREATE TABLE public.iris_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  category text NOT NULL DEFAULT 'Other',
  tags text[] NOT NULL DEFAULT '{}',
  importance text NOT NULL DEFAULT 'reference' CHECK (importance IN ('critical','preferred','reference')),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','mission')),
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  source text,
  iris_reasoning text,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  archived_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX iris_memories_scope_importance_idx ON public.iris_memories (scope, importance) WHERE archived_at IS NULL;
CREATE INDEX iris_memories_mission_idx ON public.iris_memories (mission_id) WHERE mission_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX iris_memories_category_idx ON public.iris_memories (category) WHERE archived_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_memories TO authenticated;
GRANT ALL ON public.iris_memories TO service_role;

ALTER TABLE public.iris_memories ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read global memories; mission-scoped requires mission membership
CREATE POLICY im_select ON public.iris_memories
  FOR SELECT TO authenticated
  USING (
    scope = 'global'
    OR (mission_id IS NOT NULL AND is_mission_member(mission_id, auth.uid()))
  );

-- Write: only Olympus users (admin/lead on any mission, or first-time user)
CREATE POLICY im_insert ON public.iris_memories
  FOR INSERT TO authenticated
  WITH CHECK (is_olympus_user(auth.uid()) AND created_by = auth.uid());

CREATE POLICY im_update ON public.iris_memories
  FOR UPDATE TO authenticated
  USING (is_olympus_user(auth.uid()))
  WITH CHECK (is_olympus_user(auth.uid()));

CREATE POLICY im_delete ON public.iris_memories
  FOR DELETE TO authenticated
  USING (is_olympus_user(auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_iris_memories_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER iris_memories_touch
BEFORE UPDATE ON public.iris_memories
FOR EACH ROW EXECUTE FUNCTION public.tg_iris_memories_touch();

-- Usage log
CREATE TABLE public.iris_memory_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.iris_memories(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  question_id uuid REFERENCES public.question_records(id) ON DELETE SET NULL,
  context text,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX iris_memory_usage_memory_idx ON public.iris_memory_usage (memory_id, used_at DESC);

GRANT SELECT, INSERT ON public.iris_memory_usage TO authenticated;
GRANT ALL ON public.iris_memory_usage TO service_role;

ALTER TABLE public.iris_memory_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY imu_select ON public.iris_memory_usage
  FOR SELECT TO authenticated
  USING (
    mission_id IS NULL OR is_mission_member(mission_id, auth.uid())
  );

CREATE POLICY imu_insert ON public.iris_memory_usage
  FOR INSERT TO authenticated
  WITH CHECK (true);
