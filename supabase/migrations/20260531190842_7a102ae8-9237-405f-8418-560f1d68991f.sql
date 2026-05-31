
CREATE TABLE public.question_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  review_type text NOT NULL,
  reviewer_name text NOT NULL,
  score numeric,
  max_score numeric,
  notes text,
  risks text,
  recommendations text,
  review_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.question_reviews (engagement_id, question_id);

GRANT SELECT, INSERT ON public.question_reviews TO authenticated;
GRANT ALL ON public.question_reviews TO service_role;

ALTER TABLE public.question_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY qr_select_member ON public.question_reviews
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY qr_insert_leadership ON public.question_reviews
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
