ALTER TABLE public.iris_memories ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE public.iris_memories ADD COLUMN IF NOT EXISTS superseded_reason TEXT;
CREATE INDEX IF NOT EXISTS iris_memories_superseded_idx ON public.iris_memories (mission_id, superseded_at) WHERE superseded_at IS NOT NULL;