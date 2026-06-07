import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MissionBrief = {
  mission: {
    id: string;
    name: string;
    client: string | null;
    state: string | null;
    state_agency: string | null;
    program_type: string | null;
    procurement_name: string | null;
    rfp_number: string | null;
    submission_date: string | null;
    pens_down_date: string | null;
    health: "Green" | "Yellow" | "Red" | null;
    status: string | null;
    description: string | null;
    contract_value: string | null;
    contract_term: string | null;
    incumbent_name: string | null;
    win_themes: string[];
    key_requirements: string[];
    focus_areas: string[];
    mission_highlights: string | null;
    client_strengths: string | null;
    client_win_strategy: string | null;
    program_goals: string | null;
  };
  questions: {
    total: number;
    by_status: { not_started: number; in_progress: number; complete: number };
    by_health: { green: number; yellow: number; red: number };
    assigned: number;
    unassigned: number;
  };
  sections: Array<{
    id: string;
    number: string;
    title: string;
    studio_status: string | null;
    studio_progress_pct: number | null;
    assigned_user_id: string | null;
    question_total: number;
    question_done: number;
  }>;
  team: Array<{
    user_id: string;
    role: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
    email: string | null;
  }>;
  vaultCount: number;
  winThemes: Array<{
    id: string;
    title: string;
    description: string | null;
    key_message: string | null;
  }>;
  risks: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: string | null;
    status: string | null;
  }>;
  clarifications: Array<{
    id: string;
    number: number;
    question: string;
    status: string;
    submitted_at: string | null;
    answered_at: string | null;
    created_at: string;
  }>;
  signals: Array<{
    id: string;
    signal_type: string | null;
    signal_title: string | null;
    signal_summary: string | null;
    severity: string | null;
    created_at: string;
  }>;
  daysToSubmission: number | null;
};

async function fetchMissionBrief(missionId: string): Promise<MissionBrief> {
  const [
    missionRes,
    questionsRes,
    sectionsRes,
    membersRes,
    vaultRes,
    themesRes,
    risksRes,
    clarRes,
    signalsRes,
  ] = await Promise.all([
    supabase
      .from("missions")
      .select(
        "id,name,client,state,state_agency,program_type,procurement_name,rfp_number,submission_date,pens_down_date,health,status,description,contract_value,contract_term,incumbent_name,win_themes,key_requirements,focus_areas,mission_highlights,client_strengths,client_win_strategy,program_goals",
      )
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("question_records")
      .select("id,section_number,status,health,assigned_writer_id")
      .eq("mission_id", missionId),
    supabase
      .from("mission_sections")
      .select("id,number,title,studio_status,studio_progress_pct,assigned_user_id")
      .eq("mission_id", missionId)
      .order("number", { ascending: true }),
    supabase
      .from("mission_members")
      .select("user_id,role,display_name")
      .eq("mission_id", missionId),
    supabase
      .from("mission_library")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId),
    supabase
      .from("win_themes")
      .select("id,title,description,key_message")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("mission_risks")
      .select("id,title,description,severity,status")
      .eq("mission_id", missionId)
      .order("severity", { ascending: false }),
    supabase
      .from("client_clarifications")
      .select("id,number,question,status,submitted_at,answered_at,created_at")
      .eq("mission_id", missionId)
      .order("number", { ascending: false })
      .limit(6),
    supabase
      .from("signals")
      .select("id,signal_type,signal_title,signal_summary,severity,created_at")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const m = missionRes.data;
  if (!m) throw new Error("Mission not found");

  // Resolve profiles for team members.
  const memberIds = (membersRes.data ?? []).map((mm) => mm.user_id);
  const profilesRes = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,avatar_color")
        .in("id", memberIds)
    : { data: [] as any[] };
  const profileById = new Map(
    (profilesRes.data ?? []).map((p: any) => [p.id, p]),
  );

  const questions = questionsRes.data ?? [];
  const total = questions.length;
  const by_status = { not_started: 0, in_progress: 0, complete: 0 };
  const by_health = { green: 0, yellow: 0, red: 0 };
  let assigned = 0;
  for (const q of questions) {
    const s = (q.status ?? "not_started").toLowerCase();
    if (s === "complete" || s === "completed") by_status.complete += 1;
    else if (s === "in_progress" || s === "in-progress" || s === "drafting") by_status.in_progress += 1;
    else by_status.not_started += 1;
    const h = (q.health ?? "").toLowerCase();
    if (h === "green") by_health.green += 1;
    else if (h === "red") by_health.red += 1;
    else by_health.yellow += 1;
    if (q.assigned_writer_id) assigned += 1;
  }

  // Section question totals
  const sectionQ = new Map<string, { total: number; done: number }>();
  for (const q of questions) {
    const num = (q.section_number ?? "").split(".")[0] || "0";
    const key = `${num}.0`;
    const bucket = sectionQ.get(key) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if ((q.status ?? "").toLowerCase().startsWith("complet")) bucket.done += 1;
    sectionQ.set(key, bucket);
  }

  const sections = (sectionsRes.data ?? []).map((s) => {
    const bucket = sectionQ.get(s.number) ?? { total: 0, done: 0 };
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      studio_status: s.studio_status,
      studio_progress_pct: s.studio_progress_pct,
      assigned_user_id: s.assigned_user_id,
      question_total: bucket.total,
      question_done: bucket.done,
    };
  });

  const team = (membersRes.data ?? []).map((mm) => {
    const p = profileById.get(mm.user_id) as any;
    return {
      user_id: mm.user_id,
      role: mm.role,
      display_name: mm.display_name ?? p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      avatar_color: p?.avatar_color ?? null,
    };
  });

  let daysToSubmission: number | null = null;
  if (m.submission_date) {
    const sub = new Date(m.submission_date as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    sub.setHours(0, 0, 0, 0);
    daysToSubmission = Math.round((sub.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    mission: {
      ...(m as any),
      win_themes: (m as any).win_themes ?? [],
      key_requirements: (m as any).key_requirements ?? [],
      focus_areas: (m as any).focus_areas ?? [],
    },
    questions: {
      total,
      by_status,
      by_health,
      assigned,
      unassigned: total - assigned,
    },
    sections,
    team,
    vaultCount: vaultRes.count ?? 0,
    winThemes: themesRes.data ?? [],
    risks: risksRes.data ?? [],
    clarifications: clarRes.data ?? [],
    signals: signalsRes.data ?? [],
    daysToSubmission,
  };
}

export function useMissionBrief(missionId: string) {
  return useQuery({
    queryKey: ["mission-brief", missionId],
    queryFn: () => fetchMissionBrief(missionId),
    staleTime: 30_000,
  });
}

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["current-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url,avatar_color")
        .eq("id", auth.user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
