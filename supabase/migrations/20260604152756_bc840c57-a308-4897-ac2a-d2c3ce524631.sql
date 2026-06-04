-- Open the six writer-facing tables previously locked to admins only.
-- Existing per-role policies (mission members, requester, leads) remain in force.

DROP POLICY IF EXISTS beta_admin_only_insert ON public.question_scores;
DROP POLICY IF EXISTS beta_admin_only_update ON public.question_scores;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.question_scores;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.iris_corrections;
DROP POLICY IF EXISTS beta_admin_only_update ON public.iris_corrections;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.iris_corrections;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.support_requests;
DROP POLICY IF EXISTS beta_admin_only_update ON public.support_requests;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.support_requests;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.support_responses;
DROP POLICY IF EXISTS beta_admin_only_update ON public.support_responses;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.support_responses;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.contributions;
DROP POLICY IF EXISTS beta_admin_only_update ON public.contributions;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.contributions;

DROP POLICY IF EXISTS beta_admin_only_insert ON public.pilot_copilot_messages;
DROP POLICY IF EXISTS beta_admin_only_update ON public.pilot_copilot_messages;
DROP POLICY IF EXISTS beta_admin_only_delete ON public.pilot_copilot_messages;