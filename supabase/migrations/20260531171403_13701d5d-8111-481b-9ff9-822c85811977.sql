ALTER TABLE public.engagement_members DISABLE TRIGGER USER;
DELETE FROM public.engagements;
ALTER TABLE public.engagement_members ENABLE TRIGGER USER;