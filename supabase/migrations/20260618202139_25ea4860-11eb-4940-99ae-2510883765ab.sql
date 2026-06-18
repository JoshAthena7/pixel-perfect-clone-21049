
ALTER TABLE public.mission_assist_events
  DROP CONSTRAINT IF EXISTS mission_assist_events_event_type_check;

ALTER TABLE public.mission_assist_events
  ADD CONSTRAINT mission_assist_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'brief_opened'::text,
    'brief_exported'::text,
    'assist_acknowledged'::text,
    'assist_ignored'::text,
    'feedback_submitted'::text,
    'sos_raised'::text,
    'status_updated'::text,
    'check_in'::text,
    'mock_scored'::text,
    'pulse_posted'::text,
    'sticky_note_posted'::text
  ]));
