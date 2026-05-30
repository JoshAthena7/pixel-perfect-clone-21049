
-- 1) Add NDA tracking columns
ALTER TABLE public.engagement_members
  ADD COLUMN IF NOT EXISTS nda_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nda_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nda_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS nda_confirmed_by uuid;

-- 2) Auto-confirm existing leadership (they own the engagement-level agreements)
UPDATE public.engagement_members
SET nda_confirmed = true,
    nda_confirmed_at = COALESCE(nda_confirmed_at, now())
WHERE role IN ('founder','pm','engagement_lead')
  AND nda_confirmed = false;

-- 3) Helper: NDA gate satisfied?
CREATE OR REPLACE FUNCTION private.nda_gate_ok(_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagement_members m
    WHERE m.engagement_id = _engagement_id
      AND m.user_id = auth.uid()
      AND (
        m.role IN ('founder','pm','engagement_lead')
        OR m.nda_required = false
        OR m.nda_confirmed = true
      )
  );
$$;

GRANT EXECUTE ON FUNCTION private.nda_gate_ok(uuid) TO authenticated;

-- 4) Tighten intel_documents — gate SELECT and INSERT on NDA confirmation
DROP POLICY IF EXISTS intel_select_member ON public.intel_documents;
CREATE POLICY intel_select_member
ON public.intel_documents
FOR SELECT
TO authenticated
USING (private.is_engagement_member(engagement_id) AND private.nda_gate_ok(engagement_id));

DROP POLICY IF EXISTS intel_insert_member ON public.intel_documents;
CREATE POLICY intel_insert_member
ON public.intel_documents
FOR INSERT
TO authenticated
WITH CHECK (private.is_engagement_member(engagement_id) AND private.nda_gate_ok(engagement_id));
