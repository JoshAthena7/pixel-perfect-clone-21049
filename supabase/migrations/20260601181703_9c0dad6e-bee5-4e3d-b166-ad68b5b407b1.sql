ALTER TABLE public.mission_intelligence_scores
  ADD CONSTRAINT mission_intelligence_scores_unique UNIQUE (mission_id, intelligence_id);