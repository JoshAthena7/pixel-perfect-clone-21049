/**
 * Admin-only card on the Mission Command Center for missions that launched
 * before the BLAST OFF→IRIS pipeline patch shipped. Shows only when:
 *   1) mission.status = 'active'
 *   2) caller has the 'admin' role (via has_role RPC / user_roles)
 *   3) intelligence_graph_nodes count for this mission = 0
 *
 * Click → blocking modal that:
 *   - awaits processRFPDocuments (via runIrisRfpExtraction)
 *   - fires extractRequirementNodesFromRFP + seedTerritoryIntelligence in parallel
 *   - queues briefs and generates with concurrency=3, live progress
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runIrisRfpExtraction } from "@/lib/run-iris-rfp.browser";
import {
  extractRequirementNodesFromRFP,
  seedTerritoryIntelligence,
} from "@/lib/iris-territory.functions";
import { generateIrisBrief } from "@/lib/iris-brief-generator.functions";
import { mapNarrativeStructure } from "@/lib/oracle/map-narrative-structure.functions";

const GOLD = "#C9972B";
const NAVY = "#0B4F8A";

type Line = { id: string; text: string; state: "pending" | "done" | "error" };

export function RerunIrisCard({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const extractNodesFn = useServerFn(extractRequirementNodesFromRFP);
  const seedTerritoryFn = useServerFn(seedTerritoryIntelligence);
  const generateBriefFn = useServerFn(generateIrisBrief);

  const { data: gate } = useQuery({
    queryKey: ["rerun-iris-gate", missionId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return { show: false };
      const [{ data: roles }, { data: mission }, { count: nodeCount }, { count: qCount }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.user.id)
          .eq("role", "admin"),
        supabase.from("missions").select("status").eq("id", missionId).maybeSingle(),
        supabase
          .from("intelligence_graph_nodes")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("mission_questions")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
      ]);
      const isAdmin = (roles?.length ?? 0) > 0;
      const isActive = mission?.status === "active";
      const needsRun = (nodeCount ?? 0) === 0 || (qCount ?? 0) === 0;
      return { show: isAdmin && isActive && needsRun };
    },
  });

  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [briefProgress, setBriefProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  function push(id: string, text: string, state: Line["state"] = "pending") {
    setLines((cur) => [...cur, { id, text, state }]);
  }
  function update(id: string, text: string, state: Line["state"]) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, text, state } : l)));
  }

  async function run() {
    setRunning(true);
    setDone(false);
    setFatal(null);
    setLines([]);
    setBriefProgress(null);

    // STEP 1
    push("rfp", "⏳ Processing uploaded documents…");
    try {
      await runIrisRfpExtraction(missionId, { force: true });
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
      .eq("mission_id", missionId)
      .eq("is_withdrawn", false);
    if (!qCount || qCount === 0) {
      update("rfp", "❌ No questions were extracted from your documents.", "error");
      setFatal("No questions were extracted. Check that your RFP files uploaded correctly.");
      setRunning(false);
      return;
    }
    update("rfp", `✅ Documents processed — ${qCount} question${qCount === 1 ? "" : "s"} extracted`, "done");

    // STEP 2
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
      console.error("[rerun-iris] extractRequirementNodesFromRFP failed", nodesRes.reason);
      update("nodes", `⚠ Requirement node extraction failed (continuing)`, "error");
    }
    if (terrRes.status === "fulfilled") {
      const seeded = (terrRes.value as { seeded?: number })?.seeded ?? 0;
      update("territory", `✅ Territory intel seeded (${seeded} node${seeded === 1 ? "" : "s"})`, "done");
    } else {
      console.error("[rerun-iris] seedTerritoryIntelligence failed", terrRes.reason);
      update("territory", `⚠ Territory seeding failed (continuing)`, "error");
    }

    // STEP 3 — queue briefs
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
      .in("iris_brief_status", ["pending", "error"]);
    update("queue", `✅ ${qIds.length} brief${qIds.length === 1 ? "" : "s"} queued`, "done");

    // STEP 4 — generate with concurrency = 3
    push("gen", `⏳ Generating briefs… 0 of ${qIds.length} complete`);
    setBriefProgress({ done: 0, total: qIds.length, failed: 0 });
    let completed = 0;
    let failed = 0;
    const CONCURRENCY = 3;
    let cursor = 0;
    async function worker() {
      while (cursor < qIds.length) {
        const idx = cursor++;
        const qid = qIds[idx];
        try {
          await generateBriefFn({ data: { missionId, questionId: qid } });
        } catch (e) {
          failed += 1;
          console.error("[rerun-iris] brief failed for", qid, e);
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
      Array.from({ length: Math.min(CONCURRENCY, qIds.length) }, () => worker()),
    );
    update(
      "gen",
      failed > 0
        ? `✅ ${completed - failed} briefs generated, ${failed} failed — retry from the question list`
        : `✅ All ${completed} briefs generated`,
      failed > 0 ? "error" : "done",
    );

    setRunning(false);
    setDone(true);
  }

  function closeAndRefresh() {
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["rerun-iris-gate", missionId] });
    qc.invalidateQueries();
  }

  if (!gate?.show) return null;

  return (
    <>
      <div
        className="mb-5 rounded-lg p-4 flex items-center justify-between gap-4"
        style={{ background: GOLD, color: NAVY }}
      >
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="text-[14px] font-semibold">IRIS hasn't fully processed this mission yet</p>
            <p className="text-[12.5px] opacity-80 mt-0.5">
              Questions and/or intelligence nodes are missing. Run IRIS now to extract
              questions from your RFP, build the Mission Intelligence Graph, and generate
              question briefs.
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold border-2"
          style={{ background: NAVY, color: GOLD, borderColor: NAVY }}
        >
          ⚡ Re-run IRIS Processing
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0B1224] p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
              <h2 className="text-[16px] font-semibold text-white">
                IRIS is Processing Your Documents
              </h2>
            </div>
            <p className="text-[12.5px] text-white/55 mb-4">
              This may take a few minutes. Please do not close this window.
            </p>

            {lines.length === 0 && !running && !fatal && (
              <p className="text-[13px] text-white/70 mb-4">
                Ready to start. IRIS will process documents, build the graph, and generate
                question briefs.
              </p>
            )}

            <ul className="space-y-2 mb-4 max-h-[50vh] overflow-y-auto">
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
              <div className="mb-4">
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${briefProgress.total > 0 ? (briefProgress.done / briefProgress.total) * 100 : 0}%`,
                      background: GOLD,
                    }}
                  />
                </div>
              </div>
            )}

            {fatal && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-red-200">{fatal}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {!running && !done && !fatal && (
                <button
                  onClick={run}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold"
                  style={{ background: GOLD, color: NAVY }}
                >
                  <Sparkles className="h-4 w-4" /> Start Processing
                </button>
              )}
              {running && (
                <div className="flex items-center gap-2 text-[13px] text-white/70">
                  <Loader2 className="h-4 w-4 animate-spin" /> Working…
                </div>
              )}
              {fatal && !running && (
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-md text-[13px] font-medium border border-white/15 text-white/80 hover:bg-white/[0.04]"
                >
                  Close
                </button>
              )}
              {done && (
                <button
                  onClick={closeAndRefresh}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold"
                  style={{ background: GOLD, color: NAVY }}
                >
                  <CheckCircle2 className="h-4 w-4" /> Done — View Mission
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
