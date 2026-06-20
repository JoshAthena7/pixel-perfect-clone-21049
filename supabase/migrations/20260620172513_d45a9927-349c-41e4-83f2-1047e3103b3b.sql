ALTER TABLE public.mission_assist_events DROP CONSTRAINT IF EXISTS mission_assist_events_event_type_check;
ALTER TABLE public.mission_assist_events ADD CONSTRAINT mission_assist_events_event_type_check CHECK (event_type = ANY (ARRAY[
  'brief_opened','brief_exported','assist_acknowledged','assist_ignored','feedback_submitted',
  'sos_raised','sos_acknowledged','sos_dismissed','status_updated','check_in','mock_scored',
  'pulse_posted','sticky_note_posted','nudge_sent','writer_reviewed','writer_flagged',
  'atc_onboarding_dismissed','confidence_updated','score_me_run'
]));

ALTER TABLE public.question_intel_links DROP CONSTRAINT IF EXISTS qil_briefing_layer_chk;
ALTER TABLE public.question_intel_links ADD CONSTRAINT qil_briefing_layer_chk CHECK (
  briefing_layer IS NULL OR length(briefing_layer) <= 64
);