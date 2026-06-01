-- ============================================================
-- ATHENA COMMAND V2 — Full schema replacement
-- ============================================================

-- Drop old app tables (preserve email infra + profiles will be recreated)
DROP TABLE IF EXISTS public.activity_log CASCADE;
DROP TABLE IF EXISTS public.alignment_signals CASCADE;
DROP TABLE IF EXISTS public.assumptions CASCADE;
DROP TABLE IF EXISTS public.attention_acks CASCADE;
DROP TABLE IF EXISTS public.broadcast_reads CASCADE;
DROP TABLE IF EXISTS public.broadcasts CASCADE;
DROP TABLE IF EXISTS public.change_tracker CASCADE;
DROP TABLE IF EXISTS public.client_pulses CASCADE;
DROP TABLE IF EXISTS public.compliance_documents CASCADE;
DROP TABLE IF EXISTS public.compliance_requirements CASCADE;
DROP TABLE IF EXISTS public.content_library CASCADE;
DROP TABLE IF EXISTS public.daily_checkins CASCADE;
DROP TABLE IF EXISTS public.decisions CASCADE;
DROP TABLE IF EXISTS public.differentiators CASCADE;
DROP TABLE IF EXISTS public.embedding_queue CASCADE;
DROP TABLE IF EXISTS public.embeddings CASCADE;
DROP TABLE IF EXISTS public.engagement_config CASCADE;
DROP TABLE IF EXISTS public.engagement_invites CASCADE;
DROP TABLE IF EXISTS public.engagement_members CASCADE;
DROP TABLE IF EXISTS public.engagement_milestones CASCADE;
DROP TABLE IF EXISTS public.engagement_outcomes CASCADE;
DROP TABLE IF EXISTS public.engagement_postmortems CASCADE;
DROP TABLE IF EXISTS public.engagement_pulses CASCADE;
DROP TABLE IF EXISTS public.engagement_research CASCADE;
DROP TABLE IF EXISTS public.engagement_rfp_data CASCADE;
DROP TABLE IF EXISTS public.engagements CASCADE;
DROP TABLE IF EXISTS public.faqs CASCADE;
DROP TABLE IF EXISTS public.heatmap_sections CASCADE;
DROP TABLE IF EXISTS public.holy_grail_runs CASCADE;
DROP TABLE IF EXISTS public.huddles CASCADE;
DROP TABLE IF EXISTS public.insight_type_weights CASCADE;
DROP TABLE IF EXISTS public.intel_documents CASCADE;
DROP TABLE IF EXISTS public.intelligence_insights CASCADE;
DROP TABLE IF EXISTS public.issues CASCADE;
DROP TABLE IF EXISTS public.login_events CASCADE;
DROP TABLE IF EXISTS public.market_intelligence CASCADE;
DROP TABLE IF EXISTS public.mission_closeout CASCADE;
DROP TABLE IF EXISTS public.mission_strategic_signals CASCADE;
DROP TABLE IF EXISTS public.mission_workflow_steps CASCADE;
DROP TABLE IF EXISTS public.monitoring_targets CASCADE;
DROP TABLE IF EXISTS public.nudges CASCADE;
DROP TABLE IF EXISTS public.partnerships CASCADE;
DROP TABLE IF EXISTS public.pipeline_horizon CASCADE;
DROP TABLE IF EXISTS public.pipeline_horizon_missions CASCADE;
DROP TABLE IF EXISTS public.policy_intelligence CASCADE;
DROP TABLE IF EXISTS public.policy_section_mappings CASCADE;
DROP TABLE IF EXISTS public.presence CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.quality_signals CASCADE;
DROP TABLE IF EXISTS public.question_confidence_checks CASCADE;
DROP TABLE IF EXISTS public.question_reviews CASCADE;
DROP TABLE IF EXISTS public.question_timeline CASCADE;
DROP TABLE IF EXISTS public.quick_chats CASCADE;
DROP TABLE IF EXISTS public.resource_health CASCADE;
DROP TABLE IF EXISTS public.rfp_evaluation_criteria CASCADE;
DROP TABLE IF EXISTS public.rfp_questions CASCADE;
DROP TABLE IF EXISTS public.risks CASCADE;
DROP TABLE IF EXISTS public.saved_insights CASCADE;
DROP TABLE IF EXISTS public.section_assignments CASCADE;
DROP TABLE IF EXISTS public.section_drafts CASCADE;
DROP TABLE IF EXISTS public.section_threads CASCADE;
DROP TABLE IF EXISTS public.snapshots CASCADE;
DROP TABLE IF EXISTS public.sos_alerts CASCADE;
DROP TABLE IF EXISTS public.stakeholders CASCADE;
DROP TABLE IF EXISTS public.state_market_data CASCADE;
DROP TABLE IF EXISTS public.state_resources CASCADE;
DROP TABLE IF EXISTS public.state_trivia_bank CASCADE;
DROP TABLE IF EXISTS public.stuck_flags CASCADE;
DROP TABLE IF EXISTS public.support_requests CASCADE;
DROP TABLE IF EXISTS public.terminology CASCADE;
DROP TABLE IF EXISTS public.trivia_answers CASCADE;
DROP TABLE IF EXISTS public.trivia_winners CASCADE;
DROP TABLE IF EXISTS public.win_of_the_day CASCADE;
DROP TABLE IF EXISTS public.win_theme_mappings CASCADE;
DROP TABLE IF EXISTS public.win_themes CASCADE;
DROP TABLE IF EXISTS public.work_log CASCADE;
DROP TABLE IF EXISTS public.writer_confidence CASCADE;
DROP TABLE IF EXISTS public.writer_last_seen CASCADE;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  email         TEXT,
  avatar_color  TEXT DEFAULT '#3b7fff',
  created_at    TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MISSIONS
-- ============================================================
CREATE TABLE public.missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  client          TEXT NOT NULL,
  state           TEXT,
  submission_date DATE,
  health          TEXT DEFAULT 'Yellow' CHECK (health IN ('Green','Yellow','Red')),
  status          TEXT DEFAULT 'Active' CHECK (status IN ('Active','Closed','Archived')),
  description     TEXT,
  rfp_parsed      BOOLEAN DEFAULT false,
  question_count  INT DEFAULT 0,
  slack_webhook   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mission_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'writer' CHECK (role IN ('admin','lead','writer','sme','viewer')),
  display_name  TEXT,
  joined_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, user_id)
);
CREATE INDEX idx_mission_members_user ON public.mission_members(user_id);
CREATE INDEX idx_mission_members_mission ON public.mission_members(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_members TO authenticated;
GRANT ALL ON public.mission_members TO service_role;
ALTER TABLE public.mission_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_mission_member(_mission_id UUID, _user_id UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.mission_members WHERE mission_id = _mission_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_mission_role(_mission_id UUID, _user_id UUID, _roles TEXT[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.mission_members
    WHERE mission_id = _mission_id AND user_id = _user_id AND role = ANY(_roles));
$$;

-- Mission policies
CREATE POLICY "missions_select_members" ON public.missions FOR SELECT TO authenticated
  USING (public.is_mission_member(id, auth.uid()));
CREATE POLICY "missions_insert_any_auth" ON public.missions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "missions_update_leads" ON public.missions FOR UPDATE TO authenticated
  USING (public.has_mission_role(id, auth.uid(), ARRAY['admin','lead']));
CREATE POLICY "missions_delete_admin" ON public.missions FOR DELETE TO authenticated
  USING (public.has_mission_role(id, auth.uid(), ARRAY['admin']));

-- Mission member policies
CREATE POLICY "mm_select_members" ON public.mission_members FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "mm_insert_admin_or_self_creator" ON public.mission_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_mission_role(mission_id, auth.uid(), ARRAY['admin'])
    OR (user_id = auth.uid() AND EXISTS(SELECT 1 FROM public.missions WHERE id = mission_id AND created_by = auth.uid()))
  );
CREATE POLICY "mm_update_admin" ON public.mission_members FOR UPDATE TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin']));
CREATE POLICY "mm_delete_admin" ON public.mission_members FOR DELETE TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin']));

-- Auto-add creator as admin
CREATE OR REPLACE FUNCTION public.seed_mission_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.created_by;
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.mission_members (mission_id, user_id, role, display_name)
    VALUES (NEW.id, NEW.created_by, 'admin', COALESCE(v_name, 'Admin'))
    ON CONFLICT (mission_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_seed_mission_creator AFTER INSERT ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.seed_mission_creator();

-- ============================================================
-- REVIEW GATES
-- ============================================================
CREATE TABLE public.mission_review_gates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  gate_name   TEXT NOT NULL,
  gate_order  INT NOT NULL,
  target_date DATE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_review_gates TO authenticated;
GRANT ALL ON public.mission_review_gates TO service_role;
ALTER TABLE public.mission_review_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rg_select" ON public.mission_review_gates FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "rg_write_leads" ON public.mission_review_gates FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- ============================================================
-- QUESTION RECORDS (primary object)
-- ============================================================
CREATE TABLE public.question_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  section_number      TEXT,
  question_number     TEXT NOT NULL,
  title               TEXT NOT NULL,
  question_text       TEXT NOT NULL,
  requirements        TEXT[],
  scoring_criteria    TEXT,
  evaluation_weight   DECIMAL(5,2),
  page_limit          INT,
  word_limit          INT,
  formatting_rules    TEXT,
  mandatory_language  TEXT[],
  pens_down_date      DATE,
  assigned_writer_id  UUID REFERENCES public.profiles(id),
  assigned_sme_id     UUID REFERENCES public.profiles(id),
  status              TEXT DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','in_review','complete')),
  health              TEXT DEFAULT 'yellow' CHECK (health IN ('green','yellow','red')),
  health_drivers      JSONB DEFAULT '{}',
  current_score       DECIMAL(3,1),
  target_score        DECIMAL(3,1) DEFAULT 4.5,
  sort_order          INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_qr_mission ON public.question_records(mission_id);
CREATE INDEX idx_qr_writer ON public.question_records(assigned_writer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_records TO authenticated;
GRANT ALL ON public.question_records TO service_role;
ALTER TABLE public.question_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_select" ON public.question_records FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "qr_insert_leads" ON public.question_records FOR INSERT TO authenticated
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));
CREATE POLICY "qr_update_leads_or_assigned" ON public.question_records FOR UPDATE TO authenticated
  USING (
    public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
    OR assigned_writer_id = auth.uid()
    OR assigned_sme_id = auth.uid()
  );
CREATE POLICY "qr_delete_leads" ON public.question_records FOR DELETE TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;
CREATE TRIGGER trg_qr_updated BEFORE UPDATE ON public.question_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- QUESTION GATE STATUS / SCORES / COLLAB / INTEL / RELATIONSHIPS
-- ============================================================
CREATE TABLE public.question_gate_status (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  gate_id        UUID NOT NULL REFERENCES public.mission_review_gates(id) ON DELETE CASCADE,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_review','passed','failed','skipped')),
  entered_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  reviewer_notes TEXT,
  UNIQUE(question_id, gate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_gate_status TO authenticated;
GRANT ALL ON public.question_gate_status TO service_role;
ALTER TABLE public.question_gate_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qgs_select" ON public.question_gate_status FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.is_mission_member(q.mission_id, auth.uid())));
CREATE POLICY "qgs_write_leads" ON public.question_gate_status FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.has_mission_role(q.mission_id, auth.uid(), ARRAY['admin','lead'])))
  WITH CHECK (EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.has_mission_role(q.mission_id, auth.uid(), ARRAY['admin','lead'])));

CREATE TABLE public.question_scores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  score_type   TEXT NOT NULL CHECK (score_type IN ('self_assessment','mock_review','leadership','athena_ai')),
  score        DECIMAL(3,1) NOT NULL CHECK (score BETWEEN 0 AND 5),
  reviewer_id  UUID REFERENCES public.profiles(id),
  review_gate  TEXT,
  review_notes TEXT,
  scored_at    TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_scores TO authenticated;
GRANT ALL ON public.question_scores TO service_role;
ALTER TABLE public.question_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_select" ON public.question_scores FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.is_mission_member(q.mission_id, auth.uid())));
CREATE POLICY "qs_insert_members" ON public.question_scores FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.is_mission_member(q.mission_id, auth.uid())));
CREATE POLICY "qs_update_self_or_lead" ON public.question_scores FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() OR EXISTS(SELECT 1 FROM public.question_records q WHERE q.id = question_id AND public.has_mission_role(q.mission_id, auth.uid(), ARRAY['admin','lead'])));

CREATE TABLE public.question_collaboration (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  mission_id   UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES public.profiles(id),
  author_name  TEXT NOT NULL,
  entry_type   TEXT NOT NULL CHECK (entry_type IN ('note','open_question','sme_request','decision_needed','leadership_guidance','iris_alert')),
  body         TEXT NOT NULL,
  resolved     BOOLEAN DEFAULT false,
  resolved_by  UUID REFERENCES public.profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_qc_question ON public.question_collaboration(question_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_collaboration TO authenticated;
GRANT ALL ON public.question_collaboration TO service_role;
ALTER TABLE public.question_collaboration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qc_select" ON public.question_collaboration FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "qc_insert_members" ON public.question_collaboration FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "qc_update_author_or_lead" ON public.question_collaboration FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));
CREATE POLICY "qc_delete_author_or_lead" ON public.question_collaboration FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

CREATE TABLE public.question_intelligence (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id            UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  mission_id             UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  iris_brief             TEXT,
  state_priorities       TEXT,
  procurement_priorities TEXT,
  competitor_signals     TEXT,
  relevant_research      TEXT[],
  key_messages           TEXT[],
  compliance_flags       TEXT[],
  generated_at           TIMESTAMPTZ DEFAULT now(),
  expires_at             TIMESTAMPTZ DEFAULT (now() + interval '2 hours'),
  UNIQUE(question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_intelligence TO authenticated;
GRANT ALL ON public.question_intelligence TO service_role;
ALTER TABLE public.question_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qi_select" ON public.question_intelligence FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "qi_write_members" ON public.question_intelligence FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.question_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id            UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id           UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  related_question_id   UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  relationship_type     TEXT NOT NULL CHECK (relationship_type IN ('shares_narrative','shares_data','compliance_dependency','potential_conflict')),
  iris_note             TEXT,
  conflict_detected     BOOLEAN DEFAULT false,
  conflict_description  TEXT,
  detected_at           TIMESTAMPTZ DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES public.profiles(id),
  UNIQUE(question_id, related_question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_relationships TO authenticated;
GRANT ALL ON public.question_relationships TO service_role;
ALTER TABLE public.question_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qrel_select" ON public.question_relationships FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "qrel_write_members" ON public.question_relationships FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

-- ============================================================
-- ALIGNMENT CONFLICTS / WIN THEMES
-- ============================================================
CREATE TABLE public.alignment_conflicts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_a_id       UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  question_b_id       UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  conflict_type       TEXT NOT NULL CHECK (conflict_type IN ('narrative','data','strategy','compliance')),
  description         TEXT NOT NULL,
  severity            TEXT DEFAULT 'warning' CHECK (severity IN ('warning','critical')),
  iris_recommendation TEXT,
  detected_at         TIMESTAMPTZ DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES public.profiles(id),
  resolution_notes    TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alignment_conflicts TO authenticated;
GRANT ALL ON public.alignment_conflicts TO service_role;
ALTER TABLE public.alignment_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac_select" ON public.alignment_conflicts FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "ac_write_members" ON public.alignment_conflicts FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.win_themes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id   UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  key_message  TEXT,
  question_ids UUID[],
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_by   UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.win_themes TO authenticated;
GRANT ALL ON public.win_themes TO service_role;
ALTER TABLE public.win_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wt_select" ON public.win_themes FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "wt_write_leads" ON public.win_themes FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- ============================================================
-- LIBRARY / RISKS / DECISIONS / ESCALATIONS / BROADCASTS
-- ============================================================
CREATE TABLE public.mission_library (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id   UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('RFP','Amendment','Q&A Document','State Intelligence','Competitive Intel','Meeting Notes','Client Direction','Research','Compliance','Leadership Guidance','Other')),
  notes        TEXT,
  url          TEXT,
  file_path    TEXT,
  is_rfp       BOOLEAN DEFAULT false,
  added_by     TEXT,
  added_by_id  UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_library TO authenticated;
GRANT ALL ON public.mission_library TO service_role;
ALTER TABLE public.mission_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ml_select" ON public.mission_library FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "ml_write_members" ON public.mission_library FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.mission_risks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id),
  title       TEXT NOT NULL,
  description TEXT,
  owner       TEXT,
  severity    TEXT DEFAULT 'Medium' CHECK (severity IN ('Low','Medium','High')),
  status      TEXT DEFAULT 'Open' CHECK (status IN ('Open','Monitoring','Mitigated','Closed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_risks TO authenticated;
GRANT ALL ON public.mission_risks TO service_role;
ALTER TABLE public.mission_risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr_select" ON public.mission_risks FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "mr_write_members" ON public.mission_risks FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.mission_decisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id),
  title       TEXT NOT NULL,
  owner       TEXT,
  rationale   TEXT,
  status      TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Final','Revisited')),
  decided_at  DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_decisions TO authenticated;
GRANT ALL ON public.mission_decisions TO service_role;
ALTER TABLE public.mission_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "md_select" ON public.mission_decisions FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "md_write_members" ON public.mission_decisions FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id      UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id     UUID REFERENCES public.question_records(id),
  submitted_by    TEXT NOT NULL,
  submitted_by_id UUID REFERENCES public.profiles(id),
  category        TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('Yellow','Red')),
  description     TEXT NOT NULL,
  status          TEXT DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  created_at      TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalations TO authenticated;
GRANT ALL ON public.escalations TO service_role;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esc_select" ON public.escalations FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "esc_write_members" ON public.escalations FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.broadcasts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_name  TEXT NOT NULL,
  user_id    UUID REFERENCES public.profiles(id),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
-- Broadcasts visible to all authenticated (portfolio-wide); mission-scoped only visible to members
CREATE POLICY "bc_select" ON public.broadcasts FOR SELECT TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "bc_insert_leads_or_global" ON public.broadcasts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND (
      mission_id IS NULL
      OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
    )
  );

-- ============================================================
-- IRIS BRIEF CACHE
-- ============================================================
CREATE TABLE public.iris_brief_cache (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        TEXT NOT NULL,
  ref_id       UUID,
  user_id      UUID REFERENCES public.profiles(id),
  brief_text   TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX idx_ibc_lookup ON public.iris_brief_cache(scope, ref_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_brief_cache TO authenticated;
GRANT ALL ON public.iris_brief_cache TO service_role;
ALTER TABLE public.iris_brief_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ibc_select_self" ON public.iris_brief_cache FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "ibc_write_self" ON public.iris_brief_cache FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- EMBEDDINGS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public.embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  TEXT NOT NULL,
  source_id     UUID NOT NULL,
  mission_id    UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  content_text  TEXT NOT NULL,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON public.embeddings USING ivfflat (embedding vector_cosine_ops);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embeddings TO authenticated;
GRANT ALL ON public.embeddings TO service_role;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emb_select_members" ON public.embeddings FOR SELECT TO authenticated
  USING (mission_id IS NULL OR public.is_mission_member(mission_id, auth.uid()));

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.question_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.question_collaboration;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alignment_conflicts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.escalations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;