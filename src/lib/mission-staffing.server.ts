// Server-only: compute the IRIS post-import staffing summary for a mission.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WriterLoad = {
  user_id: string | null;
  display_name: string;
  question_count: number;
  total_pages: number;
  overloaded_reason: string;
};

export type UnassignedQuestion = {
  id: string;
  question_number: string;
  title: string;
  section_number: string | null;
  missing: ("writer" | "lead_sme" | "strategic_owner")[];
};

export type SectionWithoutOwner = {
  section_number: string;
  question_count: number;
};

export type HighRiskArea = {
  section_number: string | null;
  red_count: number;
  yellow_count: number;
};

export type StaffingSummary = {
  unassigned_questions: UnassignedQuestion[];
  overloaded_writers: WriterLoad[];
  sections_without_owner: SectionWithoutOwner[];
  high_risk_areas: HighRiskArea[];
  totals: {
    total_questions: number;
    unassigned_writer: number;
    unassigned_lead_sme: number;
    unassigned_strategic_owner: number;
    red_health: number;
    yellow_health: number;
    green_health: number;
  };
  generated_at: string;
};

const OVERLOAD_QUESTION_THRESHOLD = 12;
const OVERLOAD_PAGE_THRESHOLD = 40;

export async function computeStaffingSummary(
  supabase: SupabaseClient,
  missionId: string,
): Promise<StaffingSummary> {
  const { data: rows, error } = await supabase
    .from("question_records")
    .select(
      "id, question_number, title, section_number, page_limit, health, assigned_writer_id, assigned_sme_id, strategic_owner_id",
    )
    .eq("mission_id", missionId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`load question_records failed: ${error.message}`);
  const questions = (rows as any[]) ?? [];

  // Resolve writer display names.
  const writerIds = Array.from(
    new Set(questions.map((q) => q.assigned_writer_id).filter(Boolean)),
  ) as string[];
  const nameMap = new Map<string, string>();
  if (writerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", writerIds);
    for (const p of (profiles as any[]) ?? []) {
      nameMap.set(p.id, p.display_name || p.email || "Unknown");
    }
  }

  // Per-writer aggregation.
  const loadByWriter = new Map<string, { name: string; count: number; pages: number }>();
  for (const q of questions) {
    if (!q.assigned_writer_id) continue;
    const cur = loadByWriter.get(q.assigned_writer_id) ?? {
      name: nameMap.get(q.assigned_writer_id) ?? "Unknown",
      count: 0,
      pages: 0,
    };
    cur.count += 1;
    cur.pages += Number(q.page_limit ?? 0);
    loadByWriter.set(q.assigned_writer_id, cur);
  }
  const overloaded_writers: WriterLoad[] = [];
  for (const [uid, load] of loadByWriter.entries()) {
    const reasons: string[] = [];
    if (load.count > OVERLOAD_QUESTION_THRESHOLD)
      reasons.push(`${load.count} questions (>${OVERLOAD_QUESTION_THRESHOLD})`);
    if (load.pages > OVERLOAD_PAGE_THRESHOLD)
      reasons.push(`${load.pages} pages (>${OVERLOAD_PAGE_THRESHOLD})`);
    if (reasons.length > 0) {
      overloaded_writers.push({
        user_id: uid,
        display_name: load.name,
        question_count: load.count,
        total_pages: load.pages,
        overloaded_reason: reasons.join(" · "),
      });
    }
  }
  overloaded_writers.sort((a, b) => b.question_count - a.question_count);

  // Unassigned.
  const unassigned_questions: UnassignedQuestion[] = [];
  for (const q of questions) {
    const missing: ("writer" | "lead_sme" | "strategic_owner")[] = [];
    if (!q.assigned_writer_id) missing.push("writer");
    if (!q.assigned_sme_id) missing.push("lead_sme");
    if (!q.strategic_owner_id) missing.push("strategic_owner");
    if (missing.length > 0) {
      unassigned_questions.push({
        id: q.id,
        question_number: q.question_number,
        title: q.title,
        section_number: q.section_number,
        missing,
      });
    }
  }

  // Sections without strategic owner.
  const sectionMap = new Map<string, { count: number; hasOwner: boolean }>();
  for (const q of questions) {
    const sec = q.section_number ?? "—";
    const cur = sectionMap.get(sec) ?? { count: 0, hasOwner: false };
    cur.count += 1;
    if (q.strategic_owner_id) cur.hasOwner = true;
    sectionMap.set(sec, cur);
  }
  const sections_without_owner: SectionWithoutOwner[] = [];
  for (const [sec, info] of sectionMap.entries()) {
    if (!info.hasOwner)
      sections_without_owner.push({ section_number: sec, question_count: info.count });
  }
  sections_without_owner.sort((a, b) => b.question_count - a.question_count);

  // High-risk areas (by section).
  const riskMap = new Map<string, { red: number; yellow: number }>();
  for (const q of questions) {
    const sec = q.section_number ?? "—";
    const cur = riskMap.get(sec) ?? { red: 0, yellow: 0 };
    if (q.health === "red") cur.red += 1;
    else if (q.health === "yellow") cur.yellow += 1;
    riskMap.set(sec, cur);
  }
  const high_risk_areas: HighRiskArea[] = [];
  for (const [sec, info] of riskMap.entries()) {
    if (info.red > 0 || info.yellow >= 3) {
      high_risk_areas.push({
        section_number: sec === "—" ? null : sec,
        red_count: info.red,
        yellow_count: info.yellow,
      });
    }
  }
  high_risk_areas.sort((a, b) => b.red_count - a.red_count || b.yellow_count - a.yellow_count);

  const totals = {
    total_questions: questions.length,
    unassigned_writer: questions.filter((q) => !q.assigned_writer_id).length,
    unassigned_lead_sme: questions.filter((q) => !q.assigned_sme_id).length,
    unassigned_strategic_owner: questions.filter((q) => !q.strategic_owner_id).length,
    red_health: questions.filter((q) => q.health === "red").length,
    yellow_health: questions.filter((q) => q.health === "yellow").length,
    green_health: questions.filter((q) => q.health === "green").length,
  };

  return {
    unassigned_questions,
    overloaded_writers,
    sections_without_owner,
    high_risk_areas,
    totals,
    generated_at: new Date().toISOString(),
  };
}

export async function computeAndStoreStaffingSummary(
  supabase: SupabaseClient,
  missionId: string,
  generatedByUserId: string,
): Promise<StaffingSummary> {
  const summary = await computeStaffingSummary(supabase, missionId);
  const { error } = await supabase
    .from("mission_staffing_summary")
    .upsert(
      {
        mission_id: missionId,
        unassigned_questions: summary.unassigned_questions,
        overloaded_writers: summary.overloaded_writers,
        sections_without_owner: summary.sections_without_owner,
        high_risk_areas: summary.high_risk_areas,
        totals: summary.totals,
        generated_by: generatedByUserId,
        generated_at: summary.generated_at,
      },
      { onConflict: "mission_id" },
    );
  if (error) throw new Error(`store staffing summary failed: ${error.message}`);
  return summary;
}
