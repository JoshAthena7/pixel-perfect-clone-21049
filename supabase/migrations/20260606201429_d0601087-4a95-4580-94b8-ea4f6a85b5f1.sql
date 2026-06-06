UPDATE public.question_records
   SET status = 'ready_for_review'
 WHERE status = 'in_review';

UPDATE public.question_records
   SET status = 'approved'
 WHERE status = 'complete';