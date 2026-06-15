ALTER TABLE public.mission_assist_events DROP CONSTRAINT IF EXISTS mission_assist_events_event_type_check;
ALTER TABLE public.mission_assist_events ADD CONSTRAINT mission_assist_events_event_type_check CHECK (event_type IN (
  'brief_opened','brief_exported','assist_acknowledged','assist_ignored',
  'feedback_submitted','sos_raised','status_updated',
  'check_in','mock_scored','pulse_posted'
));