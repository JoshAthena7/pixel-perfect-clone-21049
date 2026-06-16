/**
 * Admin-only "Master IRIS Refresh" — pick any mission and force-run the full
 * IRIS pipeline end to end:
 *   1. Pass 1+2 RFP extraction (sections + questions, w/ 4-tier fallback)
 *   2. Requirement node extraction (graph)
 *   3. Territory intelligence seeding
 *   4. Queue + generate question briefs (concurrency=3)
 *   5. Backfill oracle_engagement_config from confirmed extractions
 *
 * Preserves user-confirmed data (win themes, north star, assignments). Only
 * refreshes derived intelligence.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import {
  extractRequirementNodesFromRFP,
  seedTerritoryIntelligence,
} from "@/lib/iris-territory.functions";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";

const GOLD = "#C9972B";
const NAVY = "#0B4F8A";

export const Route = createFileRoute("/_authenticated/admin/iris-refresh")({
  component: IrisRefreshPage,
});

type Line = { id: string; text: string; state: "pending" | "done" | "error" };

function IrisRefreshPage() {
  const extractNodesFn = useServerFn(extractRequirementNodesFromRFP);
  const seedTerritoryFn = useServerFn(seedTerritoryIntelligence);
  const generateBriefFn = useServerFn(generateIrisBrief);

  const [missionId, setMissionId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [briefProgress, setBriefProgress] = useState<{
    done: number;
    total: number;
    failed: number;
  } | null>(null);

  const { data: missions = [] } = useQuery({
    queryKey: ["admin-iris-refresh-missions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  function push(id: string, text: string, state: Line["state"] = "pending") {
    setLines((cur) => [...cur, { id, text, state }]);
  }
  function update(id: string, text: string, state: Line["state"]) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, text, state } : l)));
  }

  async function run() {
    if (!missionId) return;
    setConfirming(false);
    setRunning(true);
    setDone(false);
    setFatal(null);
    setLines([]);
    setBriefProgress(null);

    // Audit log
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        actor_id: u.user?.id ?? null,
        action: "admin_iris_refresh_started",
        details: { source: "admin/iris-refresh" } as any,
      } as any);
    } catch {
      /* non-fatal */
    }

    // STEP 1 — RFP extraction
    push("rfp", "⏳ Processing uploaded documents (Pass 1 + Pass 2)…");
    try {
      await runIrisRfpExtraction(missionId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      update("rfp", `❌ Document processing failed: ${msg}`, "error");
      setFatal(`Document processing failed: ${msg}`);
      setRunning(false);
      return;
    }
    const { count: qCount } = await supabase
      .from("mission_questions")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId);
    update(
      "rfp",
      `✅ Documents processed — ${qCount ?? 0} question${qCount === 1 ? "" : "s"} extracted`,
      qCount && qCount > 0 ? "done" : "error",
    );

    // STEP 2 — graph nodes + territory intel (parallel)
    push("nodes", "⏳ Extracting requirement nodes from RFP…");
    push("territory", "⏳ Seeding territory intelligence…");
    const [nodesRes, terrRes] = await Promise.allSettled([
      extractNodesFn({ data: { missionId } }),
      seedTerritoryFn({ data: { missionId } }),
    ]);
    if (nodesRes.status === "fulfilled") {
      const created = (nodesRes.value as { created?: number })?.created ?? 0;
      update("nodes", `✅ ${created} intelligence node${created === 1 ? "" : "s"} written`, "done");
    } else {
      console.error("[admin-iris-refresh] extract nodes failed", nodesRes.reason);
      update("nodes", "⚠ Requirement node extraction failed (continuing)", "error");
    }
    if (terrRes.status === "fulfilled") {
      const seeded = (terrRes.value as { seeded?: number })?.seeded ?? 0;
      update("territory", `✅ Territory intel seeded (${seeded} node${seeded === 1 ? "" : "s"})`, "done");
    } else {
      console.error("[admin-iris-refresh] territory failed", terrRes.reason);
      update("territory", "⚠ Territory seeding failed (continuing)", "error");
    }

    // STEP 3 — queue ALL briefs (force regen)
    push("queue", "⏳ Queueing question briefs…");
    const { data: questions } = await supabase
      .from("mission_questions")
      .select("id")
      .eq("mission_id", missionId)
      .eq("is_withdrawn", false);
    const qIds = (questions ?? []).map((q) => q.id);
    await supabase
      .from("mission_questions")
      .update({ iris_brief_status: "queued" })
      .eq("mission_id", missionId)
      .eq("is_withdrawn", false);
    update("queue", `✅ ${qIds.length} brief${qIds.length === 1 ? "" : "s"} queued`, "done");

    // STEP 4 — generate briefs concurrency=3
    push("gen", `⏳ Generating briefs… 0 of ${qIds.length} complete`);
    setBriefProgress({ done: 0, total: qIds.length, failed: 0 });
    let completed = 0;
    let failed = 0;
    let cursor = 0;
    const CONCURRENCY = 3;
    async function worker() {
      while (cursor < qIds.length) {
        const idx = cursor++;
        const qid = qIds[idx];
        try {
          await generateBriefFn({ data: { missionId, questionId: qid } });
        } catch (e) {
          failed += 1;
          console.error("[admin-iris-refresh] brief failed for", qid, e);
        }
        completed += 1;
        setBriefProgress({ done: completed, total: qIds.length, failed });
        update(
          "gen",
          `⏳ Generating briefs… ${completed} of ${qIds.length} complete${failed > 0 ? ` (${failed} failed)` : ""}`,
          "pending",
        );
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, Math.max(qIds.length, 1)) }, () => worker()),
    );
    update(
      "gen",
      failed > 0
        ? `✅ ${completed - failed} briefs generated, ${failed} failed`
        : `✅ All ${completed} briefs generated`,
      failed > 0 ? "error" : "done",
    );

    // STEP 5 — backfill oracle_engagement_config from confirmed extractions
    push("config", "⏳ Backfilling engagement config from confirmed extractions…");
    try {
      const { data: confirmed } = await supabase
        .from("mission_iris_extractions")
        .select("extracted_field, extracted_value")
        .eq("mission_id", missionId)
        .eq("confirmed_by_user", true);
      if (confirmed && confirmed.length > 0) {
        const patch: Record<string, any> = { mission_id: missionId };
        for (const row of confirmed) {
          const field = (row as any).extracted_field as string;
          const value = (row as any).extracted_value;
          if (!field) continue;
          patch[field] = value;
        }
        const { error: upErr } = await supabase
          .from("oracle_engagement_config")
          .upsert(patch, { onConflict: "mission_id" });
        if (upErr) throw upErr;
        update("config", `✅ Engagement config backfilled (${confirmed.length} field${confirmed.length === 1 ? "" : "s"})`, "done");
      } else {
        update("config", "✅ No confirmed extractions to backfill", "done");
      }
    } catch (e) {
      console.error("[admin-iris-refresh] config backfill failed", e);
      update("config", "⚠ Config backfill failed (continuing)", "error");
    }

    // Final audit
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("mission_audit_log").insert({
        mission_id: missionId,
        actor_id: u.user?.id ?? null,
        action: "admin_iris_refresh_completed",
        details: {
          questions: qIds.length,
          briefs_ok: completed - failed,
          briefs_failed: failed,
        } as any,
      } as any);
    } catch {
      /* non-fatal */
    }

    setRunning(false);
    setDone(true);
  }

  const selectedMission = missions.find((m: any) => m.id === missionId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center"
            style={{ background: GOLD, color: NAVY }}
          >
            <Zap className="h-5 w-5" />
          </div>
          <h1 className="text-[20px] font-semibold text-white">Master IRIS Refresh</h1>
        </div>
        <p className="text-[13px] text-white/55">
          Force-runs the full IRIS pipeline for a single mission. Refreshes derived
          intelligence (extracted questions, graph nodes, territory intel, question briefs,
          engagement config). Preserves user-confirmed data (win themes, north star,
          assignments).
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5 mb-4">
        <label className="block text-[12px] text-white/60 mb-2">Mission</label>
        <select
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          disabled={running}
          className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-amber-400/60 disabled:opacity-40"
        >
          <option value="" className="bg-[#0D1B3E]">— Pick a mission —</option>
          {missions.map((m: any) => (
            <option key={m.id} value={m.id} className="bg-[#0D1B3E]">
              {m.name ?? m.id.slice(0, 8)} {m.status ? `· ${m.status}` : ""}
            </option>
          ))}
        </select>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            disabled={!missionId || running}
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold disabled:opacity-40"
            style={{ background: GOLD, color: NAVY }}
          >
            <Sparkles className="h-4 w-4" />
            Refresh IRIS for this mission
          </button>
        </div>
      </div>

      {(lines.length > 0 || done || fatal) && (
        <div className="rounded-lg border border-white/10 bg-[#0B1224] p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
            <h2 className="text-[14px] font-semibold text-white">Pipeline progress</h2>
          </div>
          <ul className="space-y-2 mb-3">
            {lines.map((l) => (
              <li
                key={l.id}
                className={`text-[13px] ${
                  l.state === "done"
                    ? "text-emerald-300"
                    : l.state === "error"
                      ? "text-amber-300"
                      : "text-white/80"
                }`}
              >
                {l.text}
              </li>
            ))}
          </ul>
          {briefProgress && running && (
            <div className="mb-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${briefProgress.total > 0 ? (briefProgress.done / briefProgress.total) * 100 : 0}%`,
                  background: GOLD,
                }}
              />
            </div>
          )}
          {running && (
            <div className="flex items-center gap-2 text-[12.5px] text-white/65">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
            </div>
          )}
          {fatal && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 mt-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" />
              <p className="text-[13px] text-red-200">{fatal}</p>
            </div>
          )}
          {done && (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Refresh complete.
            </div>
          )}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0B1224] p-6 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-white mb-2">
              Refresh IRIS for "{selectedMission?.name ?? selectedMission?.id.slice(0, 8)}"?
            </h3>
            <div className="text-[12.5px] text-white/65 space-y-2 mb-4">
              <p className="text-emerald-300">Will regenerate:</p>
              <ul className="list-disc list-inside text-white/70">
                <li>Extracted sections and questions (Pass 1 + Pass 2)</li>
                <li>Intelligence graph nodes (requirements + territory)</li>
                <li>All question briefs (queued + regenerated)</li>
                <li>Engagement config from confirmed extractions</li>
              </ul>
              <p className="text-amber-300 mt-3">Will preserve:</p>
              <ul className="list-disc list-inside text-white/70">
                <li>User-confirmed win themes, north star, decisions</li>
                <li>Team assignments and writer progress</li>
                <li>Mission documents (re-read, not deleted)</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="px-4 py-2 rounded-md text-[13px] font-medium border border-white/15 text-white/80 hover:bg-white/[0.04]"
              >
                Cancel
              </button>
              <button
                onClick={run}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold"
                style={{ background: GOLD, color: NAVY }}
              >
                <Zap className="h-4 w-4" /> Run Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
