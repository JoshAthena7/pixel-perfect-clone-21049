
-- PHI rejection log: strip the actor self-read leak; admins are the only readers.
DROP POLICY IF EXISTS phi_rejection_log_self_read ON public.phi_rejection_log;

-- Explicit deny-by-default writes: only admins may insert/delete (service_role always bypasses RLS).
DROP POLICY IF EXISTS phi_rejection_log_admin_insert ON public.phi_rejection_log;
CREATE POLICY phi_rejection_log_admin_insert
  ON public.phi_rejection_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS phi_rejection_log_admin_delete ON public.phi_rejection_log;
CREATE POLICY phi_rejection_log_admin_delete
  ON public.phi_rejection_log FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Incident Response Plan: split the FOR ALL admin policy into explicit per-command
-- policies. Read remains open to authenticated users (the team needs to be able to
-- consult the playbook), but every create/update/delete is admin-gated.
DROP POLICY IF EXISTS irp_write_admin ON public.incident_response_plan;

CREATE POLICY irp_admin_insert
  ON public.incident_response_plan FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY irp_admin_update
  ON public.incident_response_plan FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY irp_admin_delete
  ON public.incident_response_plan FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
