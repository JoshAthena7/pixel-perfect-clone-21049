// IRIS Context Health — real-time status of every intelligence source
// feeding buildMissionContext() for a mission.
//
// Server-only. Read-side aggregates only; no writes besides "force refresh"
// which simply re-runs buildMissionContext to warm caches.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeSetupCompleteness } from "./iris-mission-context";

export type RowStatus = "green" | "amber" | "red" | "info";

export type HealthRow = {
  id: string;
  label: string;
  status: RowStatus;
  detail: string;
  hint?: string | null;
  lastEventAt?: string | null;
};

export type HealthGroup = {
  id: string;
  title: string;
  rows: HealthRow[];
};

export type ContextHealth = {
  missionId: string;
  missionName: string;
  clientName: string;
  builtAt: string;
  overallScore: number; // 0-100 — % of non-info rows that are green
  overallStatus: RowStatus;
  totals: { green: number; amber: number; red: number };
  groups: HealthGroup[];
};

// ---------- Thresholds ----------
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function ageMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

function staleRow(opts: {
  lastAt: string | null;
  amberAfterMs: number;
  redAfterMs: number;
  populated: boolean;
}): { status: RowStatus; ageLabel: string } {
  const a = ageMs(opts.lastAt);
  if (!opts.populated || a === null) {
    return { status: "red", ageLabel: "never" };
  }
  const label = describeAge(a);
  if (a > opts.redAfterMs) return { status: "red", ageLabel: label };
  if (a > opts.amberAfterMs) return { status: "amber", ageLabel: label };
  return { status: "green", ageLabel: label };
}

function describeAge(ms: number): string {
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function maxIso(rows: Array<{ [k: string]: any }>, key: string): string | null {
  let best: number | null = null;
  for (const r of rows ?? []) {
    const v = r?.[key];
    if (typeof v !== "string") continue;
    const t = new Date(v).getTime();
    if (!Number.isFinite(t)) continue;
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

// Number of IRIS server fns that call buildMissionContext().
// Keep in sync with src/lib/iris-context.server.ts call sites.
const WIRED_FUNCTION_COUNT = 9;

// ---------- Server FN: get health ----------

export const getMissionContextHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { missionId: string }) => {
    if (!data?.missionId || typeof data.missionId !== "string") {
      throw new Error("missionId required");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<ContextHealth> => {
    const { supabase } = context;
    const missionId = data.missionId;

    const [
      missionR,
      evalR,
      winThemesR,
      oracleR,
      risksR,
      signalsR,
      sosR,
      clientIntelR,
      docsR,
      canonR,
      complianceR,
      questionsR,
      pulsesR,
      realityR,
      clarificationsR,
      conflictR,
      expertiseR,
    ] = await Promise.allSettled([
      supabase
        .from("missions")
        .select(
          "id,name,client,state_agency,key_requirements,win_themes,mission_highlights,client_strengths,client_win_strategy,program_goals,incumbent_name,contract_value,submission_date,program_type,iris_setup_suggested_fields,iris_setup_autofill_status,iris_setup_autofill_at,iris_kickoff_status,iris_kickoff_at",
        )
        .eq("id", missionId)
        .maybeSingle(),
      supabase
        .from("mission_evaluation_criteria")
        .select("id")
        .eq("mission_id", missionId),
      supabase
        .from("win_themes")
        .select("id,status,created_at")
        .eq("mission_id", missionId)
        .eq("status", "active"),
      supabase
        .from("briefing_book_sections")
        .select("section_key,status,generated_at")
        .eq("mission_id", missionId)
        .eq("status", "ready"),
      supabase
        .from("mission_risks")
        .select("id,status,created_at,updated_at")
        .eq("mission_id", missionId),
      supabase
        .from("signals")
        .select("id,status,source_module,created_at")
        .eq("mission_id", missionId)
        .neq("source_module", "sos"),
      supabase
        .from("signals")
        .select("id,status,created_at")
        .eq("mission_id", missionId)
        .eq("source_module", "sos")
        .eq("status", "open"),
      supabase
        .from("mission_client_intel")
        .select("mission_id,updated_at,notes,political_considerations")
        .eq("mission_id", missionId)
        .maybeSingle(),
      supabase
        .from("mission_vault_documents")
        .select("id,extraction_status,extracted_at,created_at")
        .eq("mission_id", missionId),
      supabase
        .from("intelligence_canon")
        .select("id,is_active,updated_at")
        .eq("is_active", true),
      supabase
        .from("compliance_requirements")
        .select("id,mission_id")
        .eq("mission_id", missionId),
      supabase
        .from("question_records")
        .select("id,assigned_writer_id,health")
        .eq("mission_id", missionId),
      supabase
        .from("question_pulses")
        .select("id,submitted_at")
        .eq("mission_id", missionId)
        .order("submitted_at", { ascending: false })
        .limit(50),
      supabase
        .from("reality_updates")
        .select("id,created_at,resolved")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("client_clarifications")
        .select("id,status,created_at")
        .eq("mission_id", missionId),
      supabase
        .from("alignment_conflicts")
        .select("id,detected_at,resolved_at")
        .eq("mission_id", missionId)
        .order("detected_at", { ascending: false })
        .limit(1),
      supabase
        .from("expertise_library")
        .select("id")
        .eq("active", true),
    ]);

    const settled = <T>(r: PromiseSettledResult<{ data: T | null }>): T | null =>
      r.status === "fulfilled" ? ((r.value as any)?.data ?? null) : null;

    const mission = settled<any>(missionR);
    const evals = (settled<any[]>(evalR) ?? []) as any[];
    const winThemes = (settled<any[]>(winThemesR) ?? []) as any[];
    const oracle = (settled<any[]>(oracleR) ?? []) as any[];
    const risks = (settled<any[]>(risksR) ?? []) as any[];
    const signals = (settled<any[]>(signalsR) ?? []) as any[];
    const sos = (settled<any[]>(sosR) ?? []) as any[];
    const clientIntel = settled<any>(clientIntelR);
    const docs = (settled<any[]>(docsR) ?? []) as any[];
    const canon = (settled<any[]>(canonR) ?? []) as any[];
    const compliance = (settled<any[]>(complianceR) ?? []) as any[];
    const questions = (settled<any[]>(questionsR) ?? []) as any[];
    const pulses = (settled<any[]>(pulsesR) ?? []) as any[];
    const reality = (settled<any[]>(realityR) ?? []) as any[];
    const clarifications = (settled<any[]>(clarificationsR) ?? []) as any[];
    const conflict = (settled<any[]>(conflictR) ?? []) as any[];
    const expertise = (settled<any[]>(expertiseR) ?? []) as any[];

    // ---------- STRATEGIC FOUNDATION ----------
    const completeness = computeSetupCompleteness({
      mission,
      evaluationCount: evals.length,
    });
    const setupConfirmed = mission?.iris_setup_autofill_status === "confirmed";
    const setupRow: HealthRow = {
      id: "setup-record",
      label: "Setup Record",
      status:
        completeness.pct >= 100 && setupConfirmed
          ? "green"
          : completeness.pct >= 60
            ? "amber"
            : "red",
      detail: `${completeness.pct}%${setupConfirmed ? " · confirmed" : " · unconfirmed"}`,
      hint:
        completeness.missing.length > 0
          ? `Missing: ${completeness.missing
              .slice(0, 4)
              .map((m) => m.label)
              .join(", ")}${completeness.missing.length > 4 ? "…" : ""}`
          : null,
      lastEventAt: mission?.iris_setup_autofill_at ?? null,
    };

    const winThemesRow: HealthRow = {
      id: "win-themes",
      label: "Win Themes",
      status: winThemes.length >= 3 ? "green" : winThemes.length > 0 ? "amber" : "red",
      detail:
        winThemes.length === 0
          ? "None defined"
          : `${winThemes.length} defined`,
    };

    const keyReqs = Array.isArray(mission?.key_requirements) ? mission!.key_requirements : [];
    const keyReqsRow: HealthRow = {
      id: "key-requirements",
      label: "Key Requirements",
      status: keyReqs.length >= 5 ? "green" : keyReqs.length > 0 ? "amber" : "red",
      detail: keyReqs.length === 0 ? "None seeded" : `${keyReqs.length} items seeded`,
    };

    // ---------- IRIS INTELLIGENCE ----------
    const oracleLast = maxIso(oracle, "generated_at");
    const oracleHas = oracle.length > 0;
    const oracleStale = staleRow({
      lastAt: oracleLast,
      amberAfterMs: 48 * HOUR,
      redAfterMs: 7 * DAY,
      populated: oracleHas,
    });
    const oracleRow: HealthRow = {
      id: "oracle",
      label: "Oracle / Briefing",
      status: oracleStale.status,
      detail: oracleHas
        ? `${oracle.length} sections · updated ${oracleStale.ageLabel}`
        : "No sections generated",
      lastEventAt: oracleLast,
    };

    const openRisks = risks.filter((r) =>
      ["Open", "Monitoring"].includes(String(r.status ?? "")),
    );
    const riskLast = maxIso(risks, "updated_at") ?? maxIso(risks, "created_at");
    const riskStale = staleRow({
      lastAt: riskLast,
      amberAfterMs: 24 * HOUR,
      redAfterMs: 72 * HOUR,
      populated: risks.length > 0,
    });
    const risksRow: HealthRow = {
      id: "risks",
      label: "Risk Extraction",
      status: riskStale.status,
      detail:
        risks.length === 0
          ? "No extraction yet"
          : `${openRisks.length} active risk${openRisks.length === 1 ? "" : "s"} · last run ${riskStale.ageLabel}`,
      lastEventAt: riskLast,
    };

    const openSignals = signals.filter((s) => s.status === "open");
    const signalLast = maxIso(signals, "created_at");
    const signalStale = staleRow({
      lastAt: signalLast,
      amberAfterMs: 24 * HOUR,
      redAfterMs: 72 * HOUR,
      populated: signals.length > 0,
    });
    const signalsRow: HealthRow = {
      id: "signals",
      label: "Signal Extraction",
      status: signalStale.status,
      detail:
        signals.length === 0
          ? "No extraction yet"
          : `${openSignals.length} signal${openSignals.length === 1 ? "" : "s"} · last run ${signalStale.ageLabel}`,
      lastEventAt: signalLast,
    };

    const intelLast = clientIntel?.updated_at ?? null;
    const intelHas = !!clientIntel && (clientIntel.notes || clientIntel.political_considerations);
    const intelStale = staleRow({
      lastAt: intelLast,
      amberAfterMs: 7 * DAY,
      redAfterMs: 30 * DAY,
      populated: !!intelHas,
    });
    const clientIntelRow: HealthRow = {
      id: "client-intel",
      label: "Client Intel",
      status: intelStale.status,
      detail: intelHas ? `Updated ${intelStale.ageLabel}` : "Not populated",
      lastEventAt: intelLast,
    };

    const conflictLast =
      conflict[0]?.updated_at ?? conflict[0]?.created_at ?? null;
    const conflictStale = staleRow({
      lastAt: conflictLast,
      amberAfterMs: 7 * DAY,
      redAfterMs: 30 * DAY,
      populated: conflict.length > 0,
    });
    const conflictRow: HealthRow = {
      id: "conflicts",
      label: "Conflict Detection",
      status: conflict.length === 0 ? "amber" : conflictStale.status,
      detail:
        conflict.length === 0
          ? "Never run"
          : `Last run ${conflictStale.ageLabel}`,
      lastEventAt: conflictLast,
    };

    // ---------- DOCUMENTS & VAULT ----------
    const ingested = docs.filter((d) => d.extraction_status === "completed").length;
    const notEmbedded = docs.filter(
      (d) => d.extraction_status !== "completed" && d.extraction_status !== "failed",
    ).length;
    const failedDocs = docs.filter((d) => d.extraction_status === "failed").length;
    const docsRow: HealthRow = {
      id: "documents",
      label: "Uploaded Documents",
      status:
        docs.length === 0
          ? "amber"
          : notEmbedded === 0 && failedDocs === 0
            ? "green"
            : failedDocs > 0
              ? "red"
              : "amber",
      detail:
        docs.length === 0
          ? "No documents uploaded"
          : `${docs.length} docs · ${ingested} ingested${failedDocs > 0 ? ` · ${failedDocs} failed` : ""}`,
      hint:
        notEmbedded > 0
          ? `${notEmbedded} doc${notEmbedded === 1 ? "" : "s"} not yet embedded`
          : null,
    };

    const canonRow: HealthRow = {
      id: "canon",
      label: "Canon",
      status: canon.length > 0 ? "green" : "amber",
      detail: `${canon.length} approved item${canon.length === 1 ? "" : "s"}`,
    };

    const vaultIndexRow: HealthRow = {
      id: "vault-index",
      label: "Vault Index",
      status: notEmbedded === 0 ? "green" : "amber",
      detail:
        notEmbedded === 0
          ? "All documents embedded"
          : `${notEmbedded} doc${notEmbedded === 1 ? "" : "s"} not yet embedded`,
    };

    // ---------- LIVE MISSION STATE ----------
    const healthBuckets = { green: 0, yellow: 0, red: 0 };
    for (const q of questions) {
      if (q.health === "green") healthBuckets.green++;
      else if (q.health === "yellow") healthBuckets.yellow++;
      else if (q.health === "red") healthBuckets.red++;
    }
    const healthRow: HealthRow = {
      id: "health-rollup",
      label: "Health Rollup",
      status: (() => {
        const updatedAt = mission?.health_updated_at ?? null;
        const a = ageMs(updatedAt);
        if (mission?.health_score == null && questions.length === 0) return "amber";
        if (a !== null && a > 6 * HOUR) return "red";
        if (a !== null && a > HOUR) return "amber";
        return "green";
      })(),
      detail:
        mission?.health_score != null
          ? `${mission.health_score}%${
              mission?.health_updated_at
                ? ` · recalculated ${describeAge(ageMs(mission.health_updated_at)!)}`
                : ""
            }`
          : `${questions.length} questions tracked`,
      lastEventAt: mission?.health_updated_at ?? null,
    };

    const realityLast = maxIso(reality, "created_at");
    const last48h = Date.now() - 2 * DAY;
    const recentWriter = reality.filter(
      (r) => new Date(r.created_at).getTime() > last48h,
    ).length;
    const writerRow: HealthRow = {
      id: "writer-updates",
      label: "Writer Updates",
      status: "info",
      detail:
        recentWriter === 0
          ? "No updates in last 48h"
          : `${recentWriter} update${recentWriter === 1 ? "" : "s"} in last 48h`,
      lastEventAt: realityLast,
    };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const pulsesToday = pulses.filter(
      (p) => new Date(p.submitted_at).getTime() >= startOfDay.getTime(),
    ).length;
    const pulseRow: HealthRow = {
      id: "pulses",
      label: "Daily Pulses",
      status: "info",
      detail: `${pulsesToday} pulse${pulsesToday === 1 ? "" : "s"} today`,
      lastEventAt: pulses[0]?.submitted_at ?? null,
    };

    const sosRow: HealthRow = {
      id: "sos",
      label: "SOS / Signals",
      status: sos.length > 0 ? "amber" : "green",
      detail:
        sos.length === 0
          ? "No open SOS"
          : `${sos.length} open · showing on Command`,
    };

    const openClarif = clarifications.filter((c) =>
      ["draft", "submitted"].includes(String(c.status ?? "")),
    ).length;
    const clarifRow: HealthRow = {
      id: "clarifications",
      label: "Client Clarifications",
      status: "info",
      detail:
        openClarif === 0
          ? "None open"
          : `${openClarif} open`,
    };

    // ---------- EXTERNAL SOURCES ----------
    const perplexityKey =
      !!process.env.PERPLEXITY_API_KEY || !!process.env.PPLX_API_KEY;
    const perplexityRow: HealthRow = {
      id: "perplexity",
      label: "Perplexity",
      status: perplexityKey ? "green" : "amber",
      detail: perplexityKey ? "API key present" : "API key not configured",
    };

    const complianceRow: HealthRow = {
      id: "compliance",
      label: "Compliance Library",
      status: compliance.length > 0 ? "green" : "amber",
      detail: `${compliance.length} item${compliance.length === 1 ? "" : "s"} · seeded`,
    };

    const expertiseRow: HealthRow = {
      id: "expertise",
      label: "Expertise Library",
      status: expertise.length > 0 ? "green" : "amber",
      detail: `${expertise.length} SME profile${expertise.length === 1 ? "" : "s"}`,
    };

    // ---------- CONTEXT PIPELINE ----------
    const pipelineRow: HealthRow = {
      id: "pipeline-wiring",
      label: "buildMissionContext()",
      status: "green",
      detail: `Wired to ${WIRED_FUNCTION_COUNT} IRIS functions`,
    };

    const groups: HealthGroup[] = [
      {
        id: "foundation",
        title: "Strategic Foundation",
        rows: [setupRow, winThemesRow, keyReqsRow],
      },
      {
        id: "intelligence",
        title: "IRIS Intelligence",
        rows: [oracleRow, risksRow, signalsRow, clientIntelRow, conflictRow],
      },
      {
        id: "documents",
        title: "Documents & Vault",
        rows: [docsRow, canonRow, vaultIndexRow],
      },
      {
        id: "live",
        title: "Live Mission State",
        rows: [healthRow, writerRow, pulseRow, sosRow, clarifRow],
      },
      {
        id: "external",
        title: "External Sources",
        rows: [perplexityRow, complianceRow, expertiseRow],
      },
      {
        id: "pipeline",
        title: "Context Pipeline",
        rows: [pipelineRow],
      },
    ];

    // Overall score: % of scored (non-info) rows that are green.
    let green = 0;
    let amber = 0;
    let red = 0;
    for (const g of groups) {
      for (const row of g.rows) {
        if (row.status === "green") green++;
        else if (row.status === "amber") amber++;
        else if (row.status === "red") red++;
      }
    }
    const scored = green + amber + red;
    const overallScore = scored === 0 ? 0 : Math.round((green / scored) * 100);
    const overallStatus: RowStatus =
      red > 0 ? "red" : amber > 0 ? "amber" : "green";

    return {
      missionId,
      missionName: mission?.name ?? "Unknown mission",
      clientName: mission?.client ?? "",
      builtAt: new Date().toISOString(),
      overallScore,
      overallStatus,
      totals: { green, amber, red },
      groups,
    };
  });

// ---------- Server FN: force refresh ----------
// Re-runs buildMissionContext to warm any caches and confirm every source is
// reachable. Returns a fresh health snapshot.

export const forceRefreshMissionContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { missionId: string }) => {
    if (!data?.missionId || typeof data.missionId !== "string") {
      throw new Error("missionId required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { buildMissionContext } = await import("./iris-context.server");
    try {
      await buildMissionContext(supabase, data.missionId);
      return { ok: true, builtAt: new Date().toISOString() };
    } catch (e: any) {
      return {
        ok: false,
        builtAt: new Date().toISOString(),
        error: e?.message ?? "buildMissionContext failed",
      };
    }
  });
