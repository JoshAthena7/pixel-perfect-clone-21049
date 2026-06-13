ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS brief_status text NOT NULL DEFAULT 'draft' CHECK (brief_status IN ('draft','in_review','approved')),
  ADD COLUMN IF NOT EXISTS brief_approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS brief_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS brief_version integer NOT NULL DEFAULT 1;