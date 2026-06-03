// Helper to format the layered intelligence context into a system-prompt block.
// Use this in any server function that wants IRIS to reason with Athena's 5-layer architecture.

type LayeredContext = {
  scope: { missionId: string | null; missionName: string | null; state: string | null; program: string | null };
  layer1_canon: Array<{ topic: string; category: string; citation: string | null; content: string }>;
  layer2_state: Array<{ section: string; title: string; content: string; citations: string[] | null }>;
  layer3_program: Array<{ program_name: string; population: string | null; eligibility: string | null; service_array: string | null; operational_requirements: string | null; quality_requirements: string | null; reporting_requirements: string | null; proposal_implications: string | null }>;
  layer5_collective: Array<{ kind: string; summary: string; detail: string | null; program_name: string | null; state_code: string | null; outcome: string | null }>;
};

export function formatLayeredContext(ctx: LayeredContext, opts?: { maxPerLayer?: number }): string {
  const cap = opts?.maxPerLayer ?? 10;
  const lines: string[] = [];

  lines.push("=== ATHENA LAYERED INTELLIGENCE ===");
  lines.push(`Scope: state=${ctx.scope.state ?? "—"} · program=${ctx.scope.program ?? "—"} · mission=${ctx.scope.missionName ?? "—"}`);
  lines.push("");

  lines.push("— LAYER 1 · ATHENA CANON (federal/regulatory/playbooks) —");
  for (const c of ctx.layer1_canon.slice(0, cap)) {
    lines.push(`• [${c.category}] ${c.topic}${c.citation ? ` (${c.citation})` : ""}: ${c.content}`);
  }

  if (ctx.layer2_state.length > 0) {
    lines.push("");
    lines.push(`— LAYER 2 · ${ctx.scope.state ?? ""} STATE INTELLIGENCE —`);
    for (const s of ctx.layer2_state.slice(0, cap)) {
      lines.push(`• [${s.section}] ${s.title}: ${s.content}`);
    }
  }

  if (ctx.layer3_program.length > 0) {
    lines.push("");
    lines.push(`— LAYER 3 · PROGRAM INTELLIGENCE (${ctx.scope.program ?? ""}) —`);
    for (const p of ctx.layer3_program.slice(0, cap)) {
      lines.push(`• ${p.program_name}`);
      if (p.population) lines.push(`  Population: ${p.population}`);
      if (p.eligibility) lines.push(`  Eligibility: ${p.eligibility}`);
      if (p.service_array) lines.push(`  Services: ${p.service_array}`);
      if (p.operational_requirements) lines.push(`  Operational: ${p.operational_requirements}`);
      if (p.quality_requirements) lines.push(`  Quality: ${p.quality_requirements}`);
      if (p.reporting_requirements) lines.push(`  Reporting: ${p.reporting_requirements}`);
      if (p.proposal_implications) lines.push(`  Proposal implications: ${p.proposal_implications}`);
    }
  }

  if (ctx.layer5_collective.length > 0) {
    lines.push("");
    lines.push("— LAYER 5 · ATHENA COLLECTIVE MEMORY (cross-engagement learning) —");
    for (const m of ctx.layer5_collective.slice(0, cap)) {
      const tag = [m.program_name, m.state_code, m.outcome].filter(Boolean).join(" · ");
      lines.push(`• [${m.kind}${tag ? ` · ${tag}` : ""}] ${m.summary}${m.detail ? ` — ${m.detail}` : ""}`);
    }
  }

  lines.push("");
  lines.push("Prioritize Layer 1 for compliance, Layer 2 for political/procurement specifics, Layer 3 for program-design fit, Layer 5 for what has won before. Cite layer when relevant.");
  lines.push("=== END LAYERED INTELLIGENCE ===");
  return lines.join("\n");
}
