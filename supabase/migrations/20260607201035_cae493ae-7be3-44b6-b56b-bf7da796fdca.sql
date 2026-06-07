
-- S-5/S-6: PHI rejection log review workflow
ALTER TABLE public.phi_rejection_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS resolution_type text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS document_name text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phi_rejection_log_status_check') THEN
    ALTER TABLE public.phi_rejection_log
      ADD CONSTRAINT phi_rejection_log_status_check
      CHECK (status = ANY (ARRAY['unreviewed','reviewed','escalated','resolved']));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='phi_rejection_log' AND policyname='phi_rejection_log_admin_update') THEN
    CREATE POLICY phi_rejection_log_admin_update
      ON public.phi_rejection_log FOR UPDATE TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- S-3: Incident response plan content (single-row, editable by admins)
CREATE TABLE IF NOT EXISTS public.incident_response_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classification text NOT NULL DEFAULT '',
  immediate_response text NOT NULL DEFAULT '',
  notification_obligations text NOT NULL DEFAULT '',
  evidence_preservation text NOT NULL DEFAULT '',
  recovery_checklist text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_response_plan TO authenticated;
GRANT ALL ON public.incident_response_plan TO service_role;
ALTER TABLE public.incident_response_plan ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='incident_response_plan' AND policyname='irp_read_authenticated') THEN
    CREATE POLICY irp_read_authenticated ON public.incident_response_plan
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='incident_response_plan' AND policyname='irp_write_admin') THEN
    CREATE POLICY irp_write_admin ON public.incident_response_plan
      FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

-- Seed default IRP content if empty
INSERT INTO public.incident_response_plan (
  classification, immediate_response, notification_obligations, evidence_preservation, recovery_checklist
)
SELECT
  'A security incident is any unauthorized access, disclosure, alteration, or destruction of platform data — including: confirmed or suspected PHI exposure, credential compromise, unauthorized admin role grant, data exfiltration, ransomware, or vendor breach affecting Atlas data.',
  E'Within 1 hour:\n1. Notify the on-call security lead and CTO.\n2. Isolate affected systems (revoke sessions, rotate keys, disable accounts).\n3. Open an incident ticket and assign an Incident Commander.\n4. Begin a timestamped incident log — every action, every decision.',
  E'• Affected users: notify within 72 hours of confirmed breach.\n• HHS / OCR (if PHI involved): within 60 days for breaches affecting 500+ individuals.\n• State attorneys general: per state-specific breach notification statutes.\n• Cyber insurance carrier: within the contractual window (typically 24-72h).\n• Law enforcement: when criminal activity is suspected.',
  E'Do NOT delete logs, terminate instances, or wipe disks until forensics is complete.\n• Snapshot affected VMs and databases.\n• Preserve audit logs, web server logs, IRIS query logs, and Supabase logs for at least 12 months.\n• Chain-of-custody documentation for any exported evidence.',
  E'1. Confirm threat eradicated and access closed.\n2. Restore services from known-good backups.\n3. Rotate all credentials touched by the incident.\n4. Post-incident review within 14 days.\n5. Update this plan with lessons learned.\n6. Notify affected parties of remediation status.'
WHERE NOT EXISTS (SELECT 1 FROM public.incident_response_plan);
