ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_assist_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.oracle_signals;
ALTER TABLE public.oracle_signals REPLICA IDENTITY FULL;
ALTER TABLE public.mission_assist_events REPLICA IDENTITY FULL;