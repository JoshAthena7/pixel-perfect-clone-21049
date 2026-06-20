CREATE TABLE IF NOT EXISTS public.mission_iris_config (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  elevenlabs_voice_id text NOT NULL DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  elevenlabs_model_id text NOT NULL DEFAULT 'eleven_multilingual_v2'
    CHECK (elevenlabs_model_id IN (
      'eleven_multilingual_v2','eleven_turbo_v2_5','eleven_flash_v2_5','eleven_monolingual_v1'
    )),
  elevenlabs_stability float NOT NULL DEFAULT 0.55,
  elevenlabs_similarity_boost float NOT NULL DEFAULT 0.75,
  elevenlabs_style float NOT NULL DEFAULT 0.20,
  elevenlabs_use_speaker_boost boolean NOT NULL DEFAULT true,
  elevenlabs_speed float NOT NULL DEFAULT 1.0
    CHECK (elevenlabs_speed >= 0.25 AND elevenlabs_speed <= 4.0),
  elevenlabs_streaming boolean NOT NULL DEFAULT true,
  person_first_pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cultural_standards text[] NOT NULL DEFAULT ARRAY[
    'community_names','avoid_deficit_framing','experienced_not_suffered',
    'acknowledge_systemic_factors','community_owned_language','avoid_medical_model',
    'engagement_not_compliance','family_as_partners'
  ],
  state_terminology jsonb NOT NULL DEFAULT '[]'::jsonb,
  language_audit_enabled boolean NOT NULL DEFAULT true,
  brief_tone text NOT NULL DEFAULT 'analytical',
  brief_length_cap int NOT NULL DEFAULT 1200,
  brief_citation_density text NOT NULL DEFAULT 'balanced',
  evaluator_persona_name text NOT NULL DEFAULT 'State CSOC Reviewer',
  evaluator_lens text NOT NULL DEFAULT 'service coordination specificity',
  evaluator_priorities text[] NOT NULL DEFAULT ARRAY[
    'youth and family voice','community-based services','measurable outcomes'
  ],
  personality_tone float NOT NULL DEFAULT 0.5,
  personality_formality float NOT NULL DEFAULT 0.6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_iris_config TO authenticated;
GRANT ALL ON public.mission_iris_config TO service_role;

ALTER TABLE public.mission_iris_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission team can view iris config"
  ON public.mission_iris_config FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mission_team_members mtm
            WHERE mtm.mission_id = mission_iris_config.mission_id AND mtm.member_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY "mission team can insert iris config"
  ON public.mission_iris_config FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.mission_team_members mtm
            WHERE mtm.mission_id = mission_iris_config.mission_id AND mtm.member_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY "mission team can update iris config"
  ON public.mission_iris_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.mission_team_members mtm
            WHERE mtm.mission_id = mission_iris_config.mission_id AND mtm.member_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE POLICY "admins can delete iris config"
  ON public.mission_iris_config FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.touch_mission_iris_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_mission_iris_config_touch ON public.mission_iris_config;
CREATE TRIGGER trg_mission_iris_config_touch
  BEFORE UPDATE ON public.mission_iris_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_mission_iris_config_updated_at();