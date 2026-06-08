
-- mission_change_log
DROP POLICY IF EXISTS "Authenticated full access mission_change_log" ON public.mission_change_log;
CREATE POLICY "Mission members read mission_change_log" ON public.mission_change_log
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission members insert mission_change_log" ON public.mission_change_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission members update mission_change_log" ON public.mission_change_log
  FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission admins delete mission_change_log" ON public.mission_change_log
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- mission_documents (other mission-scoped policies already exist)
DROP POLICY IF EXISTS "Authenticated full access mission_documents" ON public.mission_documents;

-- mission_readiness
DROP POLICY IF EXISTS "Authenticated full access mission_readiness" ON public.mission_readiness;
CREATE POLICY "Mission members read mission_readiness" ON public.mission_readiness
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission leads write mission_readiness" ON public.mission_readiness
  FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner']) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner']) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- mission_team_members
DROP POLICY IF EXISTS "Authenticated full access mission_team_members" ON public.mission_team_members;
CREATE POLICY "Mission members read mission_team_members" ON public.mission_team_members
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission leads write mission_team_members" ON public.mission_team_members
  FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner']) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner']) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- question_assignments (public anon access removed)
DROP POLICY IF EXISTS "Full access question_assignments" ON public.question_assignments;
CREATE POLICY "Mission members read question_assignments" ON public.question_assignments
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission members write question_assignments" ON public.question_assignments
  FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- question_intelligence (public anon access removed; mission-scoped policies already exist)
DROP POLICY IF EXISTS "Full access question_intelligence" ON public.question_intelligence;

-- questions
DROP POLICY IF EXISTS "Full access questions" ON public.questions;
CREATE POLICY "Mission members read questions" ON public.questions
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Mission members write questions" ON public.questions
  FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));
