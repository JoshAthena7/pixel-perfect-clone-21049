// Helper to assemble + format the full IRIS context for every prompt.
// Combines:
//   • Layered curated intel  (Canon, State, Program, Collective Memory)
//   • Unified semantic retrieval across every embedded source
//     (Vault, Library, Atlas, Market Intel, Perplexity Research, etc.)
//   • Structured mission state (decisions, assumptions, risks, signals,
//     unresolved team input).
// Every IRIS entry point calls this — no per-function SELECT sprawl.

import { retrieveIrisContext } from "./iris-retriever.server";

export async function loadLayeredContext(
  supabase: any,
  opts: { missionId?: string | null; questionId?: string | null; topic?: string | null },
) {
  let state: string | null = null;
  let program: string | null = null;
  let missionName: string | null = null;
  if (opts.missionId) {
    const { data: m } = await supabase
      .from("missions")
      .select("name,state,program_type")
      .eq("id", opts.missionId)
      .maybeSingle();
    state = m?.state ?? null;
    program = m?.program_type ?? null;
    missionName = m?.name ?? null;
  }

  const [canon, stateIntel, programIntel, collective, retrieved] = await Promise.all([
    supabase.from("intelligence_canon")
      .select("topic,category,citation,content,priority")
      .eq("is_active", true)
      .order("priority", { ascending: true }),
    state
      ? supabase.from("state_intelligence")
          .select("section,title,content,citations")
          .eq("state_code", state)
          .order("updated_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
    program
      ? supabase.from("program_intelligence")
          .select("program_name,population,eligibility,service_array,operational_requirements,quality_requirements,reporting_requirements,proposal_implications")
          .eq("is_active", true)
          .ilike("program_name", `%${program}%`)
          .limit(4)
      : Promise.resolve({ data: [] }),
    // C4: Read from sanitized view — strips source_mission_id, source_mission_name, evidence.
    supabase.from("collective_memory_sanitized")
      .select("kind,summary,detail,program_name,state_code,outcome")
      .or([
        state ? `state_code.eq.${state}` : null,
        program ? `program_name.ilike.%${program}%` : null,
        "state_code.is.null",
      ].filter(Boolean).join(","))
      .order("promoted_at", { ascending: false })
      .limit(15),
    retrieveIrisContext(supabase, {
      missionId: opts.missionId ?? null,
      questionId: opts.questionId ?? null,
      topic: opts.topic ?? null,
      k: 10,
    }),
  ]);

  return formatLayeredBlock({
    scope: { state, program, missionName },
    canon: canon.data ?? [],
    stateIntel: stateIntel.data ?? [],
    programIntel: programIntel.data ?? [],
    collective: collective.data ?? [],
    retrieved: retrieved.block ?? "",
  });
}

function formatLayeredBlock(d: any): string {
  const out: string[] = [];
  out.push("=== ATHENA LAYERED INTELLIGENCE ===");
  out.push(`Scope: state=${d.scope.state ?? "—"} · program=${d.scope.program ?? "—"} · mission=${d.scope.missionName ?? "—"}`);

  if (d.canon.length) {
    out.push("\n— LAYER 1 · ATHENA CANON —");
    for (const c of d.canon) out.push(`• [${c.category}] ${c.topic}${c.citation ? ` (${c.citation})` : ""}: ${c.content}`);
  }
  if (d.stateIntel.length) {
    out.push(`\n— LAYER 2 · ${d.scope.state ?? ""} STATE INTELLIGENCE —`);
    for (const s of d.stateIntel) out.push(`• [${s.section}] ${s.title}: ${s.content}`);
  }
  if (d.programIntel.length) {
    out.push(`\n— LAYER 3 · PROGRAM INTELLIGENCE (${d.scope.program ?? ""}) —`);
    for (const p of d.programIntel) {
      out.push(`• ${p.program_name}`);
      if (p.population) out.push(`  Population: ${p.population}`);
      if (p.eligibility) out.push(`  Eligibility: ${p.eligibility}`);
      if (p.service_array) out.push(`  Services: ${p.service_array}`);
      if (p.operational_requirements) out.push(`  Operational: ${p.operational_requirements}`);
      if (p.quality_requirements) out.push(`  Quality: ${p.quality_requirements}`);
      if (p.reporting_requirements) out.push(`  Reporting: ${p.reporting_requirements}`);
      if (p.proposal_implications) out.push(`  Proposal implications: ${p.proposal_implications}`);
    }
  }
  if (d.collective.length) {
    out.push("\n— LAYER 5 · ATHENA COLLECTIVE MEMORY —");
    for (const m of d.collective) {
      const tag = [m.program_name, m.state_code, m.outcome].filter(Boolean).join(" · ");
      out.push(`• [${m.kind}${tag ? ` · ${tag}` : ""}] ${m.summary}${m.detail ? ` — ${m.detail}` : ""}`);
    }
  }
  if (d.retrieved) {
    out.push("\n" + d.retrieved);
  }
  out.push("\nPriority order: Canon → Vault/Library (mission RFP source-of-truth) → State/Program → Perplexity Research → Collective Memory. Cite the source when relevant. Never contradict a logged Final decision without flagging the conflict.");
  out.push("=== END LAYERED INTELLIGENCE ===");
  return out.join("\n");
}
