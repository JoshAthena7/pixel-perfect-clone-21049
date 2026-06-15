ALTER TABLE public.mission_team_members DROP CONSTRAINT mission_team_members_mission_role_check;
ALTER TABLE public.mission_team_members ADD CONSTRAINT mission_team_members_mission_role_check
  CHECK (mission_role IS NULL OR mission_role = ANY (ARRAY[
    'Lead Writer','Section Writer','Reviewer','SME','Proposal Manager','Compliance Officer','Analyst','Coordinator',
    'engagement_lead','writer','sme','reviewer','project_manager','lead_graphics','graphics'
  ]));