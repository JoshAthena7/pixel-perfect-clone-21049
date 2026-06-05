ALTER TABLE public.missions DROP CONSTRAINT missions_status_check;
ALTER TABLE public.missions ADD CONSTRAINT missions_status_check
  CHECK (status = ANY (ARRAY['Draft','Active','Pens Down','Submitted','Closed','Archived']));