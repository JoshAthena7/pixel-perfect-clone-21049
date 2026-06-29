
-- mission_documents
DROP POLICY IF EXISTS "Mission users can create mission documents" ON public.mission_documents;
DROP POLICY IF EXISTS "Mission users can update mission documents" ON public.mission_documents;
DROP POLICY IF EXISTS "Mission users can delete mission documents" ON public.mission_documents;
DROP POLICY IF EXISTS "Admin only insert mission documents" ON public.mission_documents;
DROP POLICY IF EXISTS "Admin only update mission documents" ON public.mission_documents;
DROP POLICY IF EXISTS "Admin only delete mission documents" ON public.mission_documents;
CREATE POLICY "Admin only insert mission documents" ON public.mission_documents
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin only update mission documents" ON public.mission_documents
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin only delete mission documents" ON public.mission_documents
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- mission_assignments
DROP POLICY IF EXISTS "ma all" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_insert" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_update" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_delete" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_select" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_admin_insert" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_admin_update" ON public.mission_assignments;
DROP POLICY IF EXISTS "ma_admin_delete" ON public.mission_assignments;
CREATE POLICY "ma_select" ON public.mission_assignments
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_mission_team_member(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );
CREATE POLICY "ma_admin_insert" ON public.mission_assignments
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "ma_admin_update" ON public.mission_assignments
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "ma_admin_delete" ON public.mission_assignments
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- question_assignments
DROP POLICY IF EXISTS "Mission members write question_assignments" ON public.question_assignments;
DROP POLICY IF EXISTS "qa_select" ON public.question_assignments;
DROP POLICY IF EXISTS "qa_admin_insert" ON public.question_assignments;
DROP POLICY IF EXISTS "qa_admin_update" ON public.question_assignments;
DROP POLICY IF EXISTS "qa_admin_delete" ON public.question_assignments;
CREATE POLICY "qa_select" ON public.question_assignments
  FOR SELECT TO authenticated USING (
    is_mission_member(mission_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "qa_admin_insert" ON public.question_assignments
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "qa_admin_update" ON public.question_assignments
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "qa_admin_delete" ON public.question_assignments
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- oracle_signals: remove founder/pm write path, keep admin + service role
DROP POLICY IF EXISTS "oracle_signals_write" ON public.oracle_signals;

-- mission_iris_config
DROP POLICY IF EXISTS "mission team can insert iris config" ON public.mission_iris_config;
DROP POLICY IF EXISTS "mission team can update iris config" ON public.mission_iris_config;
DROP POLICY IF EXISTS "admins can insert iris config" ON public.mission_iris_config;
DROP POLICY IF EXISTS "admins can update iris config" ON public.mission_iris_config;
CREATE POLICY "admins can insert iris config" ON public.mission_iris_config
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins can update iris config" ON public.mission_iris_config
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
