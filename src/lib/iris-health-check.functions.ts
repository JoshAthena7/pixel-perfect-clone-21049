// IRIS Intel Health Check — lightweight diagnostic that pings every
// intelligence layer with throwaway data and returns a status dashboard.
// Admin-only. Runs in <10s by using parallel probes with hard timeouts.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const PROBE_TIMEOUT_MS = 8000;

export type CheckStatus = "green" | "amber" | "red";

export type CheckResult = {
  id: string;
  label: string;
  group: "internal" | "external";
  status: CheckStatus;
  note: string;
  fix?: { file: string; detail: string };
  ms: number;
};

export type HealthCheckReport = {
  ranAt: string;
  verdict: "green" | "amber" | "red";
  checks: CheckResult[];
  totalMs: number;
};

async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  ms = PROBE_TIMEOUT_MS,
): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
  const start = Date.now();
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);
    return { ok: true, value, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200), ms: Date.now() - start };
  }
}

function aiKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY missing");
  return k;
}

async function pingGateway(prompt: string): Promise<void> {
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Reply with the single word OK." },
      ],
      max_tokens: 8,
    }),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}`);
  const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = j.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("empty AI response");
}

export const runIrisHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const startedAt = Date.now();

    // admin gate
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (!roles || roles.length === 0) throw new Error("Admin role required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ── Create a throwaway mission so write-path tests have a parent row.
    // FK CASCADE will clean up signals/risks/win_themes when we delete it.
    const stamp = new Date().toISOString();
    const { data: testMission, error: missionErr } = await supabaseAdmin
      .from("missions")
      .insert({
        name: `__iris_health_check__ ${stamp}`,
        client: "__health_check__",
        status: "Draft",
        health: "Yellow",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (missionErr || !testMission) {
      throw new Error(`Could not create test mission: ${missionErr?.message ?? "unknown"}`);
    }
    const missionId = (testMission as { id: string }).id;

    try {
      // ── Define all probes ────────────────────────────────────────────────
      const probes: Array<{
        id: string;
        label: string;
        group: "internal" | "external";
        run: () => Promise<{ status: CheckStatus; note: string; fix?: CheckResult["fix"] }>;
      }> = [
        {
          id: "doc_ingest",
          label: "Document Ingestion",
          group: "internal",
          run: async () => {
            const { data, error } = await supabaseAdmin
              .from("market_intelligence")
              .insert({
                title: "__health_check__",
                source: "__health_check__",
                feed_type: "industry",
                type: "news",
              } as never)
              .select("id")
              .single();
            if (error || !data) throw new Error(error?.message ?? "insert failed");
            await supabaseAdmin.from("market_intelligence").delete().eq("id", (data as { id: string }).id);
            return { status: "green", note: "Insert + delete OK" };
          },
        },
        {
          id: "intel_enrich",
          label: "Intel Enrichment",
          group: "internal",
          run: async () => {
            await pingGateway("You summarize Medicaid intel in one sentence.");
            return { status: "green", note: "Gemini summarizer responding" };
          },
        },
        {
          id: "win_themes",
          label: "Win Theme Scoring",
          group: "internal",
          run: async () => {
            const { data, error } = await supabaseAdmin
              .from("win_themes")
              .insert({
                mission_id: missionId,
                title: "__health_check__",
                description: "probe",
                created_by_system: true,
              } as never)
              .select("id")
              .single();
            if (error || !data) throw new Error(error?.message ?? "insert failed");
            await supabaseAdmin.from("win_themes").delete().eq("id", (data as { id: string }).id);
            return { status: "green", note: "Extractor write path OK" };
          },
        },
        {
          id: "risks",
          label: "Risk Extraction",
          group: "internal",
          run: async () => {
            const { data, error } = await supabaseAdmin
              .from("mission_risks")
              .insert({
                mission_id: missionId,
                title: "__health_check__",
                severity: "Low",
                status: "Open",
                created_by_system: true,
              } as never)
              .select("id")
              .single();
            if (error || !data) throw new Error(error?.message ?? "insert failed");
            await supabaseAdmin.from("mission_risks").delete().eq("id", (data as { id: string }).id);
            return { status: "green", note: "mission_risks write OK" };
          },
        },
        {
          id: "signals",
          label: "Signal Extraction",
          group: "internal",
          run: async () => {
            const { data, error } = await supabaseAdmin
              .from("signals")
              .insert({
                mission_id: missionId,
                source_module: "__health_check__",
                signal_type: "probe",
                signal_title: "__health_check__",
                severity: "info",
                status: "open",
                created_by_system: true,
              } as never)
              .select("id")
              .single();
            if (error || !data) throw new Error(error?.message ?? "insert failed");
            await supabaseAdmin.from("signals").delete().eq("id", (data as { id: string }).id);
            return { status: "green", note: "signals write OK" };
          },
        },
        {
          id: "mission_brief",
          label: "Mission Brief",
          group: "internal",
          run: async () => {
            await pingGateway("You are IRIS generating a mission brief.");
            return { status: "green", note: "Brief generator reachable" };
          },
        },
        {
          id: "question_brief",
          label: "Question Brief",
          group: "internal",
          run: async () => {
            await pingGateway("You are IRIS generating a question brief.");
            return { status: "green", note: "Question brief generator reachable" };
          },
        },
        {
          id: "iris_ask",
          label: "IRIS Ask",
          group: "internal",
          run: async () => {
            await pingGateway("You are IRIS answering an analyst question.");
            return { status: "green", note: "Ask gateway reachable" };
          },
        },
        {
          id: "score_me",
          label: "Score Me",
          group: "internal",
          run: async () => {
            await pingGateway("You are IRIS scoring a draft on 5 dimensions.");
            return { status: "green", note: "Scorer gateway reachable" };
          },
        },
        {
          id: "health_rollup",
          label: "Health Rollup",
          group: "internal",
          run: async () => {
            // Just confirm the rollup tables are queryable.
            const { error } = await supabaseAdmin
              .from("missions")
              .select("id", { count: "exact", head: true });
            if (error) throw new Error(error.message);
            return { status: "green", note: "Rollup queries OK" };
          },
        },
        {
          id: "perplexity",
          label: "Perplexity",
          group: "external",
          run: async () => {
            const key = process.env.PERPLEXITY_API_KEY;
            if (!key) {
              return {
                status: "red",
                note: "PERPLEXITY_API_KEY not configured",
                fix: { file: "Secrets", detail: "Add PERPLEXITY_API_KEY in admin → secrets." },
              };
            }
            const r = await fetch("https://api.perplexity.ai/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "sonar",
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 4,
              }),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return { status: "green", note: "API responding" };
          },
        },
        {
          id: "canon",
          label: "Canon",
          group: "external",
          run: async () => {
            const { count, error } = await supabaseAdmin
              .from("intelligence_canon")
              .select("id", { count: "exact", head: true })
              .eq("is_active", true);
            if (error) throw new Error(error.message);
            const n = count ?? 0;
            if (n === 0) {
              return {
                status: "red",
                note: "Canon empty — no approved language available",
                fix: { file: "src/lib/canon.functions.ts", detail: "Seed intelligence_canon via admin → Canon Library." },
              };
            }
            if (n < 10) {
              return { status: "amber", note: `Populated but only ${n} entries (<10)` };
            }
            return { status: "green", note: `${n} active entries` };
          },
        },
        {
          id: "semantic_retrieval",
          label: "Semantic Retrieval",
          group: "external",
          run: async () => {
            // Probe the embedding endpoint shape — same model the retriever uses.
            const r = await fetch(`${GATEWAY}/embeddings`, {
              method: "POST",
              headers: { Authorization: `Bearer ${aiKey()}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-embedding-001",
                input: "health check probe",
                dimensions: 1536,
              }),
            });
            if (!r.ok) throw new Error(`embedding HTTP ${r.status}`);
            const j = (await r.json()) as { data?: Array<{ embedding?: number[] }> };
            const dim = j.data?.[0]?.embedding?.length ?? 0;
            if (dim !== 1536) throw new Error(`unexpected dim ${dim}`);
            // Check there's anything to retrieve against.
            const { count } = await supabaseAdmin
              .from("embeddings")
              .select("id", { count: "exact", head: true });
            const n = count ?? 0;
            if (n === 0) {
              return { status: "amber", note: "Retriever live but embeddings table empty" };
            }
            return { status: "green", note: `Retriever live, ${n} vectors indexed` };
          },
        },
        {
          id: "compliance",
          label: "Compliance Library",
          group: "external",
          run: async () => {
            const { count, error } = await supabaseAdmin
              .from("federal_compliance_library")
              .select("id", { count: "exact", head: true });
            if (error) throw new Error(error.message);
            const n = count ?? 0;
            if (n === 0) {
              return {
                status: "red",
                note: "federal_compliance_library empty",
                fix: {
                  file: "src/lib/compliance.functions.ts",
                  detail: "Seed federal_compliance_library or compliance panel returns nothing.",
                },
              };
            }
            return { status: "green", note: `${n} entries` };
          },
        },
        {
          id: "expertise",
          label: "Expertise Matching",
          group: "external",
          run: async () => {
            const { count, error } = await supabaseAdmin
              .from("expertise_library")
              .select("id", { count: "exact", head: true });
            if (error) throw new Error(error.message);
            const n = count ?? 0;
            if (n === 0) {
              return {
                status: "red",
                note: "expertise_library empty — no SME profiles to match",
                fix: { file: "src/lib/expertise.functions.ts", detail: "Seed expertise_library." },
              };
            }
            return { status: "green", note: `${n} SME profiles indexed` };
          },
        },
      ];

      // ── Run all in parallel ──────────────────────────────────────────────
      const settled = await Promise.all(
        probes.map((p) => withTimeout(p.label, p.run)),
      );

      const checks: CheckResult[] = probes.map((p, i) => {
        const r = settled[i];
        if (r.ok) {
          return {
            id: p.id,
            label: p.label,
            group: p.group,
            status: r.value.status,
            note: r.value.note,
            fix: r.value.fix,
            ms: r.ms,
          };
        }
        return {
          id: p.id,
          label: p.label,
          group: p.group,
          status: "red",
          note: r.error,
          fix: { file: `src/lib/${p.id}`, detail: `Probe threw: ${r.error}` },
          ms: r.ms,
        };
      });

      const anyRed = checks.some((c) => c.status === "red");
      const anyAmber = checks.some((c) => c.status === "amber");
      const verdict: HealthCheckReport["verdict"] = anyRed ? "red" : anyAmber ? "amber" : "green";

      return {
        ranAt: new Date().toISOString(),
        verdict,
        checks,
        totalMs: Date.now() - startedAt,
      } satisfies HealthCheckReport;
    } finally {
      // ── Cleanup. CASCADE handles signals/risks/win_themes. ───────────────
      await supabaseAdmin.from("missions").delete().eq("id", missionId);
    }
  });
