
-- brief_update_signals
DROP POLICY IF EXISTS "Authenticated can read brief_update_signals" ON public.brief_update_signals;
DROP POLICY IF EXISTS "Authenticated can update brief_update_signals" ON public.brief_update_signals;
CREATE POLICY "Mission members read brief_update_signals" ON public.brief_update_signals
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Mission members update brief_update_signals" ON public.brief_update_signals
  FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- insights (mission_id is nullable)
DROP POLICY IF EXISTS "Authenticated users can read insights" ON public.insights;
DROP POLICY IF EXISTS "Authenticated users can write insights" ON public.insights;
CREATE POLICY "Read insights scoped to mission" ON public.insights
  FOR SELECT TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Write insights scoped to mission" ON public.insights
  FOR ALL TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- mission_launch_briefs
DROP POLICY IF EXISTS "Authenticated can view launch briefs" ON public.mission_launch_briefs;
CREATE POLICY "Mission members view launch briefs" ON public.mission_launch_briefs
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- mission_pulse_log
DROP POLICY IF EXISTS "Authenticated can read mission pulse log" ON public.mission_pulse_log;
CREATE POLICY "Mission members read mission pulse log" ON public.mission_pulse_log
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- oracle_escalation_log
DROP POLICY IF EXISTS "Authenticated can view escalation log" ON public.oracle_escalation_log;
CREATE POLICY "Mission members view escalation log" ON public.oracle_escalation_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR (mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid())));

-- oracle_knowledge_base (mission_id nullable)
DROP POLICY IF EXISTS "Authenticated can read oracle knowledge base" ON public.oracle_knowledge_base;
CREATE POLICY "Read oracle knowledge base scoped" ON public.oracle_knowledge_base
  FOR SELECT TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- oracle_mission_outcomes
DROP POLICY IF EXISTS "Authenticated can read mission outcomes" ON public.oracle_mission_outcomes;
CREATE POLICY "Mission members read mission outcomes" ON public.oracle_mission_outcomes
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- oracle_sme_sessions
DROP POLICY IF EXISTS "Authenticated can view sme sessions" ON public.oracle_sme_sessions;
CREATE POLICY "Mission members view sme sessions" ON public.oracle_sme_sessions
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- experts: restrict writes to admins; keep reads
DROP POLICY IF EXISTS "Authenticated users can write experts" ON public.experts;
CREATE POLICY "Admins write experts" ON public.experts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- intel_entities: restrict insert/update to admins
DROP POLICY IF EXISTS "authenticated update entities" ON public.intel_entities;
DROP POLICY IF EXISTS "authenticated write entities" ON public.intel_entities;
CREATE POLICY "admin update entities" ON public.intel_entities
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin insert entities" ON public.intel_entities
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- program_dna / state_dna: restrict writes to admins
DROP POLICY IF EXISTS "Authenticated users can write program_dna" ON public.program_dna;
CREATE POLICY "Admins write program_dna" ON public.program_dna
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can write state_dna" ON public.state_dna;
CREATE POLICY "Admins write state_dna" ON public.state_dna
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
