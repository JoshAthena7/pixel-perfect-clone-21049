import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SearchHit = {
  id: string;
  group:
    | "Sections"
    | "Sources"
    | "Decisions"
    | "Signals"
    | "IRIS Memory"
    | "Lessons Learned"
    | "Co-Pilot Messages";
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  // Navigation hints
  missionId?: string | null;
  questionId?: string | null;
  href?: string;
};

export type SearchResponse = {
  query: string;
  groups: { group: SearchHit["group"]; total: number; items: SearchHit[] }[];
};

const PER_GROUP = 4;
const HARD_LIMIT = 25;

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: String(input?.q ?? "").trim().slice(0, 120) }))
  .handler(async ({ data, context }): Promise<SearchResponse> => {
    const { supabase } = context;
    const term = data.q;
    if (!term) return { query: "", groups: [] };
    const like = `%${term.replace(/[%_]/g, (m) => "\\" + m)}%`;

    const [
      questionsRes,
      sourcesRes,
      decisionsRes,
      signalsRes,
      memoriesRes,
      lessonsRes,
      copilotRes,
    ] = await Promise.all([
      supabase
        .from("question_records")
        .select("id, question_number, title, mission_id, health, pens_down_date")
        .or(`title.ilike.${like},question_text.ilike.${like},question_number.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("atlas_sources")
        .select("id, source_title, knowledge_layer, state_code, program_code, authority_score, summary, source_type, status")
        .or(`source_title.ilike.${like},summary.ilike.${like},issuing_authority.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("mission_decisions")
        .select("id, mission_id, question_id, title, rationale, status, owner, decided_at, created_at")
        .or(`title.ilike.${like},rationale.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("signals")
        .select("id, mission_id, related_question_id, signal_title, signal_summary, source_module, severity, created_at")
        .or(`signal_title.ilike.${like},signal_summary.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("iris_memories")
        .select("id, title, content, importance, scope, mission_id, category")
        .is("archived_at", null)
        .or(`title.ilike.${like},content.ilike.${like},summary.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("atlas_lessons_learned")
        .select("id, title, lesson_body, lesson_type, win_or_loss, applies_to_states")
        .or(`title.ilike.${like},lesson_body.ilike.${like}`)
        .limit(HARD_LIMIT),
      supabase
        .from("pilot_copilot_messages")
        .select("id, mission_id, question_id, body, from_name, message_type, created_at")
        .ilike("body", like)
        .limit(HARD_LIMIT),
    ]);

    const groups: SearchResponse["groups"] = [];

    const qHits: SearchHit[] = (questionsRes.data ?? []).map((q: any) => ({
      id: `q-${q.id}`,
      group: "Sections",
      title: `Q${q.question_number ?? ""} · ${q.title ?? "Untitled"}`,
      subtitle: q.health ? `${q.health}` : undefined,
      meta: q.pens_down_date ? `pens-down ${q.pens_down_date}` : undefined,
      badge: q.question_number ? `Q${q.question_number}` : undefined,
      missionId: q.mission_id,
      questionId: q.id,
    }));
    if (qHits.length) groups.push({ group: "Sections", total: qHits.length, items: qHits.slice(0, PER_GROUP) });

    const sHits: SearchHit[] = (sourcesRes.data ?? []).map((s: any) => ({
      id: `s-${s.id}`,
      group: "Sources",
      title: s.source_title,
      subtitle: [s.knowledge_layer, s.state_code, s.program_code].filter(Boolean).join(" · "),
      meta: s.summary ? String(s.summary).slice(0, 140) : undefined,
      badge: s.authority_score ? `${s.authority_score}/10` : undefined,
      href: "/admin/source-library",
    }));
    if (sHits.length) groups.push({ group: "Sources", total: sHits.length, items: sHits.slice(0, PER_GROUP) });

    const dHits: SearchHit[] = (decisionsRes.data ?? []).map((d: any) => ({
      id: `d-${d.id}`,
      group: "Decisions",
      title: d.title,
      subtitle: [d.owner, d.status].filter(Boolean).join(" · "),
      meta: d.rationale ? String(d.rationale).slice(0, 140) : undefined,
      missionId: d.mission_id,
      questionId: d.question_id,
    }));
    if (dHits.length) groups.push({ group: "Decisions", total: dHits.length, items: dHits.slice(0, PER_GROUP) });

    const sigHits: SearchHit[] = (signalsRes.data ?? []).map((s: any) => ({
      id: `sig-${s.id}`,
      group: "Signals",
      title: s.signal_title,
      subtitle: [s.source_module, s.severity].filter(Boolean).join(" · "),
      meta: s.signal_summary ? String(s.signal_summary).slice(0, 140) : undefined,
      missionId: s.mission_id,
      questionId: s.related_question_id,
    }));
    if (sigHits.length) groups.push({ group: "Signals", total: sigHits.length, items: sigHits.slice(0, PER_GROUP) });

    const mHits: SearchHit[] = (memoriesRes.data ?? []).map((m: any) => ({
      id: `mem-${m.id}`,
      group: "IRIS Memory",
      title: m.title,
      subtitle: [m.scope, m.importance, m.category].filter(Boolean).join(" · "),
      meta: m.content ? String(m.content).slice(0, 140) : undefined,
      missionId: m.mission_id,
      href: "/admin/iris-memory",
    }));
    if (mHits.length) groups.push({ group: "IRIS Memory", total: mHits.length, items: mHits.slice(0, PER_GROUP) });

    const lHits: SearchHit[] = (lessonsRes.data ?? []).map((l: any) => ({
      id: `les-${l.id}`,
      group: "Lessons Learned",
      title: l.title,
      subtitle: [l.lesson_type, l.win_or_loss].filter(Boolean).join(" · "),
      meta: l.lesson_body ? String(l.lesson_body).slice(0, 140) : undefined,
      href: "/intelligence",
    }));
    if (lHits.length) groups.push({ group: "Lessons Learned", total: lHits.length, items: lHits.slice(0, PER_GROUP) });

    const cpHits: SearchHit[] = (copilotRes.data ?? []).map((c: any) => ({
      id: `cp-${c.id}`,
      group: "Co-Pilot Messages",
      title: c.body.slice(0, 80),
      subtitle: [c.from_name, c.message_type].filter(Boolean).join(" · "),
      missionId: c.mission_id,
      questionId: c.question_id,
    }));
    if (cpHits.length) groups.push({ group: "Co-Pilot Messages", total: cpHits.length, items: cpHits.slice(0, PER_GROUP) });

    return { query: term, groups };
  });
