-- 1) Collapse any pre-existing email duplicates (keep the most recently updated row)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(email)
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
    FROM public.collective_members
   WHERE email IS NOT NULL AND length(trim(email)) > 0
)
DELETE FROM public.collective_members cm
 USING ranked r
 WHERE cm.id = r.id AND r.rn > 1;

-- 2) Case-insensitive unique index — satisfies ON CONFLICT (email) for the upsert
CREATE UNIQUE INDEX IF NOT EXISTS collective_members_email_unique
  ON public.collective_members (lower(email))
  WHERE email IS NOT NULL;

-- 3) Also create a plain unique constraint on email so onConflict:"email" resolves
ALTER TABLE public.collective_members
  ADD CONSTRAINT collective_members_email_key UNIQUE (email);
