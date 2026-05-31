
ALTER TABLE public.huddles ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.sos_alerts ALTER COLUMN submitted_by DROP NOT NULL;

ALTER TABLE public.win_themes
  ADD COLUMN IF NOT EXISTS evidence text,
  ADD COLUMN IF NOT EXISTS owner text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.content_library
  ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES public.engagements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS added_by text;
