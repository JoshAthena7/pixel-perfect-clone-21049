-- Seed ATLAS v2 integration test environment (idempotent)
DO $$
DECLARE
  v_password text := 'AthenaTest';
  v_mission_id uuid := '739ddd6b-d536-4c61-a914-5e782bc0a928';
  v_admin_id uuid;
  v_writer_id uuid;
  v_exec_id uuid;
  v_admin_atm uuid;
  v_writer_atm uuid;
  v_exec_atm uuid;
  rec record;
  emails text[] := ARRAY['admin@atlas.test','writer@atlas.test','exec@atlas.test'];
  names text[][] := ARRAY[['Test','Admin'],['Test','Writer'],['Test','Executive']];
  roles public.app_role[] := ARRAY['admin'::public.app_role,'writer'::public.app_role,'executive'::public.app_role];
  e text;
  ids uuid[] := ARRAY[]::uuid[];
  new_id uuid;
  encrypted text;
  i int;
BEGIN
  -- 1) auth.users + identities
  FOR i IN 1..array_length(emails,1) LOOP
    e := emails[i];
    SELECT id INTO new_id FROM auth.users WHERE lower(email) = e;
    IF new_id IS NULL THEN
      new_id := gen_random_uuid();
      encrypted := crypt(v_password, gen_salt('bf'));
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token, is_super_admin
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
        e, encrypted, now(),
        jsonb_build_object('provider','email','providers',ARRAY['email']),
        jsonb_build_object('first_name', names[i][1], 'last_name', names[i][2]),
        now(), now(), '', '', '', '', false
      );
      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), new_id, new_id,
        jsonb_build_object('sub', new_id::text, 'email', e, 'email_verified', true),
        'email', now(), now(), now()
      );
    ELSE
      -- ensure email confirmed + password set
      UPDATE auth.users
        SET encrypted_password = crypt(v_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = new_id;
    END IF;
    ids := ids || new_id;
  END LOOP;
  v_admin_id := ids[1]; v_writer_id := ids[2]; v_exec_id := ids[3];

  -- 2) profiles
  FOR i IN 1..array_length(emails,1) LOOP
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (ids[i], emails[i], names[i][1] || ' ' || names[i][2])
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name;
  END LOOP;

  -- 3) user_roles
  FOR i IN 1..array_length(emails,1) LOOP
    INSERT INTO public.user_roles (user_id, role) VALUES (ids[i], roles[i])
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  -- 4) atlas_team_members
  FOR i IN 1..array_length(emails,1) LOOP
    INSERT INTO public.atlas_team_members (email, first_name, last_name, atlas_role, atlas_invite_status)
    VALUES (
      emails[i], names[i][1], names[i][2],
      CASE WHEN roles[i] = 'executive'::public.app_role THEN 'unassigned' ELSE roles[i]::text END,
      'active'
    )
    ON CONFLICT (email) DO UPDATE SET atlas_invite_status = 'active';
  END LOOP;
  SELECT id INTO v_admin_atm FROM public.atlas_team_members WHERE lower(email)='admin@atlas.test';
  SELECT id INTO v_writer_atm FROM public.atlas_team_members WHERE lower(email)='writer@atlas.test';
  SELECT id INTO v_exec_atm FROM public.atlas_team_members WHERE lower(email)='exec@atlas.test';

  -- 5) mission_team_members (admin + writer only; exec role not in check constraint)
  INSERT INTO public.mission_team_members (mission_id, member_id, mission_role)
  SELECT v_mission_id, v_admin_atm, 'engagement_lead'
  WHERE NOT EXISTS (SELECT 1 FROM public.mission_team_members WHERE mission_id=v_mission_id AND member_id=v_admin_atm);
  INSERT INTO public.mission_team_members (mission_id, member_id, mission_role)
  SELECT v_mission_id, v_writer_atm, 'writer'
  WHERE NOT EXISTS (SELECT 1 FROM public.mission_team_members WHERE mission_id=v_mission_id AND member_id=v_writer_atm);

  -- 6) mission_questions (only if none yet for this mission)
  IF NOT EXISTS (SELECT 1 FROM public.mission_questions WHERE mission_id = v_mission_id) THEN
    INSERT INTO public.mission_questions (mission_id, question_number, question_text, health_status, status, word_limit, iris_confidence)
    VALUES
      (v_mission_id, 'Q1', 'Describe the proposed 24x7 SOC operations model.', 'healthy', 'in_progress', 500, 'high'),
      (v_mission_id, 'Q2', 'Detail your SIEM/SOAR platform and integration approach.', 'healthy', 'not_started', 750, 'medium'),
      (v_mission_id, 'Q3', 'Provide your incident response procedure and SLAs.', 'watch', 'in_progress', 600, 'medium'),
      (v_mission_id, 'Q4', 'Outline your threat intelligence sources and analyst tradecraft.', 'at_risk', 'not_started', 1000, 'low'),
      (v_mission_id, 'Q5', 'Describe your transition-in plan and milestones.', 'healthy', 'complete', 400, 'high');
  END IF;

  -- 7) athena_insights (daily)
  IF NOT EXISTS (SELECT 1 FROM public.athena_insights WHERE mission_id = v_mission_id) THEN
    INSERT INTO public.athena_insights (mission_id, is_daily_insight, quote, writers_note)
    VALUES (
      v_mission_id, true,
      'NJ CSOC values demonstrated, repeatable analyst tradecraft over tool-list breadth — evaluators flagged ''tool soup'' responses in prior cycles.',
      'Lead with two named playbooks and the analyst certification cadence before naming any platform.'
    );
  END IF;

  -- 8) competitor_profiles
  IF NOT EXISTS (SELECT 1 FROM public.competitor_profiles WHERE mission_id = v_mission_id) THEN
    INSERT INTO public.competitor_profiles (
      mission_id, organization_name, competitor_type, likely_narrative,
      known_strengths, known_weaknesses, iris_confidence
    ) VALUES (
      v_mission_id, 'Sentinel Cyber Partners', 'incumbent',
      'Continuity, in-state staffing, deep NJOHSP relationships.',
      'Existing badge access at Trenton; 14 analysts already cleared.',
      'Two reported SLA misses in FY25; high analyst turnover.',
      'medium'
    );
  END IF;
END $$;