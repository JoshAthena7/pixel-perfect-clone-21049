// Server-only: the single retrieval helper every IRIS entry point calls.
// Pulls the most relevant chunks across every embedded intelligence source
// (vault, library, atlas, market intel, research, question records) for
// this mission, plus structured pulls of decisions / assumptions / risks /
// signals that semantic search can't surface.

import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./intel-enrich.server";

const SOURCE_LABELS: Record<string, string> = {
  mission_vault_documents: "MISSION VAULT",
  mission_library: "MISSION LIBRARY",
  atlas_sources: "ATLAS SOURCE",
  market_intelligence: "MARKET INTEL",
  research_results: "PERPLEXITY RESEARCH",
  question_records: "QUESTION",
  intelligence_canon: "ATHENA CANON",
  collective_memory: "COLLECTIVE MEMORY",
};

type RetrievedChunk = {
  id: string;
  source_table: string;
  source_id: string;
  content: string;
  similarity: number;
};

export type RetrievedContext = {
  block: string;
  chunks: RetrievedChunk[];
  topic: string;
};

/** Build the IRIS retrieval context for one ask. Safe to call without a topic
 *  (returns structured pulls only — no semantic chunks). */
export async function retrieveIrisContext(
  supabase: SupabaseClient,
  opts: {
    missionId?: string | null;
    questionId?: string | null;
    topic?: string | null;
    k?: number;
  },
): Promise<RetrievedContext> {
  const k = opts.k ?? 10;
  const out: string[] = [];

  // 1. Build the topic string for semantic search
  let topic = (opts.topic ?? "").trim();
  if (!topic && opts.questionId) {
    const { data: q } = await supabase
      .from("question_records")
      .select("title, question_text, requirements")
      .eq("id", opts.questionId)
      .maybeSingle();
    if (q) {
      const reqs = Array.isArray(q.requirements) ? q.requirements.join("; ") : "";
      topic = [q.title, q.question_text, reqs].filter(Boolean).join("\n").slice(0, 3000);
    }
  }

  // 2. Semantic search across embeddings (vault, library, atlas, intel, research)
  let chunks: RetrievedChunk[] = [];
  if (topic) {
    try {
      const vec = await embed(topic);
      if (vec) {
        const { data: matches } = await supabase.rpc("match_iris_context", {
          p_mission_id: opts.missionId ?? null,
          p_query: vec as unknown as never,
          p_k: k,
        });
        chunks = ((matches ?? []) as any[]).map((m) => ({
          id: m.id,
          source_table: m.source_table,
          source_id: m.source_id,
          content: m.content_text ?? "",
          similarity: Number(m.similarity ?? 0),
        }));
      }
    } catch {
      // semantic retrieval failure should never block IRIS — degrade silently
    }
  }

  if (chunks.length) {
    out.push("\n— RETRIEVED INTELLIGENCE (semantic match, top results) —");
    for (const c of chunks) {
      const label = SOURCE_LABELS[c.source_table] ?? c.source_table.toUpperCase();
      const score = `${(c.similarity * 100).toFixed(0)}%`;
      const body = c.content.replace(/\s+/g, " ").slice(0, 700);
      out.push(`• [${label} · sim ${score}] ${body}`);
    }
  }

  // 3. Mission-scoped structured pulls (no embedding needed)
  if (opts.missionId) {
    const [decisions, assumptions, risks, signals, research, collab] = await Promise.all([
      supabase
        .from("mission_decisions")
        .select("title, owner, rationale, status, decided_at, question_id")
        .eq("mission_id", opts.missionId)
        .order("decided_at", { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from("mission_assumptions")
        .select("assumption, confidence_score, status, risk_if_wrong, supporting_evidence")
        .eq("mission_id", opts.missionId)
        .in("status", ["active", "at_risk"])
        .order("confidence_score", { ascending: true })
        .limit(10),
      supabase
        .from("mission_risks")
        .select("title, description, severity, status, question_id")
        .eq("mission_id", opts.missionId)
        .in("status", ["Open", "Monitoring"])
        .order("severity", { ascending: false })
        .limit(10),
      supabase
        .from("signals")
        .select("signal_title, signal_summary, severity")
        .eq("mission_id", opts.missionId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(8),
      // Latest 5 research_results for the mission — Perplexity answers
      supabase
        .from("research_results")
        .select("answer, confidence, generated_at, task_id, research_tasks!inner(question)")
        .eq("mission_id", opts.missionId)
        .order("generated_at", { ascending: false })
        .limit(5),
      // Recent unresolved collab items
      supabase
        .from("question_collaboration")
        .select("entry_type, body, author_name, question_id")
        .eq("mission_id", opts.missionId)
        .in("entry_type", ["sme_request", "decision_needed", "air_cover"])
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    if ((decisions.data ?? []).length) {
      out.push("\n— LOGGED DECISIONS —");
      for (const d of decisions.data!) {
        const rat = d.rationale ? ` — ${String(d.rationale).slice(0, 200)}` : "";
        out.push(`• [${d.status ?? "Pending"}] ${d.title}${d.owner ? ` (${d.owner})` : ""}${d.decided_at ? ` on ${d.decided_at}` : ""}${rat}`);
      }
      out.push("Do not contradict a Final decision without flagging the conflict.");
    }

    if ((assumptions.data ?? []).length) {
      out.push("\n— ACTIVE ASSUMPTIONS (lower confidence = more risk to your answer) —");
      for (const a of assumptions.data!) {
        const conf = a.confidence_score != null ? Math.round(Number(a.confidence_score) * 100) : 70;
        const risk = a.risk_if_wrong ? ` · Risk: ${String(a.risk_if_wrong).slice(0, 160)}` : "";
        out.push(`• [${a.status} · ${conf}%] ${String(a.assumption).slice(0, 220)}${risk}`);
      }
    }

    if ((risks.data ?? []).length) {
      out.push("\n— OPEN RISKS —");
      for (const r of risks.data!) {
        const desc = r.description ? ` — ${String(r.description).slice(0, 200)}` : "";
        out.push(`• [${r.severity ?? "Medium"} · ${r.status}] ${r.title}${desc}`);
      }
    }

    if ((signals.data ?? []).length) {
      out.push("\n— OPEN SIGNALS —");
      for (const s of signals.data!) {
        out.push(`• [${s.severity}] ${s.signal_title}${s.signal_summary ? ` — ${String(s.signal_summary).slice(0, 200)}` : ""}`);
      }
    }

    if ((research.data ?? []).length) {
      out.push("\n— RECENT PERPLEXITY RESEARCH (this mission) —");
      for (const r of research.data!) {
        const q = (r as any).research_tasks?.question ?? "research task";
        out.push(`• [${r.confidence ?? "medium"}] ${String(q).slice(0, 140)} → ${String(r.answer).slice(0, 400)}`);
      }
    }

    if ((collab.data ?? []).length) {
      out.push("\n— UNRESOLVED TEAM INPUT —");
      for (const c of collab.data!) {
        out.push(`• [${c.entry_type}${c.author_name ? ` · ${c.author_name}` : ""}] ${String(c.body ?? "").slice(0, 200)}`);
      }
    }
  }

  const block = out.length
    ? `=== IRIS RETRIEVAL ===\n${out.join("\n")}\n=== END RETRIEVAL ===`
    : "";

  return { block, chunks, topic };
}
