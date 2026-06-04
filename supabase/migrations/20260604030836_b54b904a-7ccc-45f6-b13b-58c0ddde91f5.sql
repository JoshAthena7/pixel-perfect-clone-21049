
-- =========================================================================
-- Writer Identity Layer
-- =========================================================================

-- 1) writer_identities ----------------------------------------------------
CREATE TABLE public.writer_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  primary_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  merged_into_id uuid REFERENCES public.writer_identities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX writer_identities_primary_email_idx
  ON public.writer_identities (lower(primary_email))
  WHERE primary_email IS NOT NULL;

GRANT SELECT ON public.writer_identities TO authenticated;
GRANT ALL    ON public.writer_identities TO service_role;

ALTER TABLE public.writer_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "writer_identities readable to authenticated"
  ON public.writer_identities FOR SELECT TO authenticated USING (true);

CREATE POLICY "writer_identities admin manage"
  ON public.writer_identities FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_writer_identities_updated_at
  BEFORE UPDATE ON public.writer_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) writer_identity_aliases ----------------------------------------------
CREATE TABLE public.writer_identity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id uuid NOT NULL REFERENCES public.writer_identities(id) ON DELETE CASCADE,
  alias_kind text NOT NULL
    CHECK (alias_kind IN ('auth_user','email','profile','legacy_mission_member','manual')),
  alias_value text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_kind, alias_value)
);

CREATE INDEX writer_aliases_writer_idx ON public.writer_identity_aliases (writer_id);

GRANT SELECT ON public.writer_identity_aliases TO authenticated;
GRANT ALL    ON public.writer_identity_aliases TO service_role;

ALTER TABLE public.writer_identity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "writer_aliases readable to authenticated"
  ON public.writer_identity_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "writer_aliases admin manage"
  ON public.writer_identity_aliases FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));


-- 3) contributions (immutable event log) ----------------------------------
CREATE TABLE public.contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_id uuid NOT NULL REFERENCES public.writer_identities(id) ON DELETE RESTRICT,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  firm_id uuid,
  event_type text NOT NULL
    CHECK (event_type IN (
      'question_answered','question_reviewed','source_uploaded',
      'section_contributed','score_submitted'
    )),
  target_table text,
  target_id uuid,
  weight numeric(6,2) NOT NULL DEFAULT 1.0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'live',
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contributions_writer_event_idx ON public.contributions (writer_id, event_type);
CREATE INDEX contributions_writer_mission_idx ON public.contributions (writer_id, mission_id);
CREATE INDEX contributions_mission_event_idx ON public.contributions (mission_id, event_type);
CREATE INDEX contributions_occurred_at_idx ON public.contributions (occurred_at DESC);

GRANT SELECT ON public.contributions TO authenticated;
GRANT ALL    ON public.contributions TO service_role;

ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contributions: writer reads own"
  ON public.contributions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.writer_identity_aliases a
    WHERE a.writer_id = contributions.writer_id
      AND a.alias_kind = 'auth_user'
      AND a.alias_value = auth.uid()::text
  ));

CREATE POLICY "contributions: mission members read"
  ON public.contributions FOR SELECT TO authenticated
  USING (mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "contributions: admin read all"
  ON public.contributions FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));


-- 4) mission_outcomes -----------------------------------------------------
CREATE TABLE public.mission_outcomes (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  outcome text NOT NULL
    CHECK (outcome IN ('won','lost','withdrawn','no_decision')),
  awarded_value_usd bigint,
  population_impacted bigint,
  decided_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mission_outcomes TO authenticated;
GRANT ALL    ON public.mission_outcomes TO service_role;

ALTER TABLE public.mission_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_outcomes: members read"
  ON public.mission_outcomes FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "mission_outcomes: admin read all"
  ON public.mission_outcomes FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "mission_outcomes: admin/lead manage"
  ON public.mission_outcomes FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
  );

CREATE TRIGGER trg_mission_outcomes_updated_at
  BEFORE UPDATE ON public.mission_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 5) resolve_writer_identity() -------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_writer_identity(
  _auth_user_id uuid,
  _email text DEFAULT NULL,
  _display_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_writer_id uuid;
  v_name text;
  v_email text;
BEGIN
  v_email := CASE WHEN _email IS NULL OR _email = '' THEN NULL ELSE lower(_email) END;

  IF _auth_user_id IS NOT NULL THEN
    SELECT writer_id INTO v_writer_id
    FROM public.writer_identity_aliases
    WHERE alias_kind = 'auth_user' AND alias_value = _auth_user_id::text;
    IF v_writer_id IS NOT NULL THEN RETURN v_writer_id; END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT writer_id INTO v_writer_id
    FROM public.writer_identity_aliases
    WHERE alias_kind = 'email' AND alias_value = v_email;
    IF v_writer_id IS NOT NULL THEN
      IF _auth_user_id IS NOT NULL THEN
        INSERT INTO public.writer_identity_aliases (writer_id, alias_kind, alias_value, verified)
        VALUES (v_writer_id, 'auth_user', _auth_user_id::text, true)
        ON CONFLICT (alias_kind, alias_value) DO NOTHING;
      END IF;
      RETURN v_writer_id;
    END IF;
  END IF;

  v_name := COALESCE(_display_name, split_part(COALESCE(_email,''), '@', 1), 'Writer');
  INSERT INTO public.writer_identities (display_name, primary_email)
  VALUES (v_name, v_email)
  RETURNING id INTO v_writer_id;

  IF _auth_user_id IS NOT NULL THEN
    INSERT INTO public.writer_identity_aliases (writer_id, alias_kind, alias_value, verified)
    VALUES (v_writer_id, 'auth_user', _auth_user_id::text, true)
    ON CONFLICT (alias_kind, alias_value) DO NOTHING;
  END IF;
  IF v_email IS NOT NULL THEN
    INSERT INTO public.writer_identity_aliases (writer_id, alias_kind, alias_value, verified)
    VALUES (v_writer_id, 'email', v_email, _auth_user_id IS NOT NULL)
    ON CONFLICT (alias_kind, alias_value) DO NOTHING;
  END IF;

  RETURN v_writer_id;
END;
$$;

-- 6) seed identities + legacy aliases from existing profiles + mission_members
INSERT INTO public.writer_identities (id, display_name, primary_email)
SELECT p.id, COALESCE(p.display_name, split_part(p.email,'@',1), 'Writer'), lower(p.email)
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.writer_identity_aliases a
  WHERE a.alias_kind = 'auth_user' AND a.alias_value = p.id::text
)
ON CONFLICT DO NOTHING;

INSERT INTO public.writer_identity_aliases (writer_id, alias_kind, alias_value, verified)
SELECT p.id, 'auth_user', p.id::text, true
FROM public.profiles p
ON CONFLICT (alias_kind, alias_value) DO NOTHING;

INSERT INTO public.writer_identity_aliases (writer_id, alias_kind, alias_value, verified)
SELECT p.id, 'email', lower(p.email), true
FROM public.profiles p
WHERE p.email IS NOT NULL AND p.email <> ''
ON CONFLICT (alias_kind, alias_value) DO NOTHING;
