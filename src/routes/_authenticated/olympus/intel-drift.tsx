import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { recalibrateMissionIntel } from "@/lib/intel-drift.functions";

export const Route = createFileRoute("/_authenticated/olympus/intel-drift")({
  component: IntelDriftPage,
});

function IntelDriftPage() {
  const recalibrate = useServerFn(recalibrateMissionIntel);
  const [missionId, setMissionId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);

  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-missions-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,status")
        .neq("status", "Archived")
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  const run = async () => {
    if (!missionId) {
      toast.error("Select a mission.");
      return;
    }
    if (reason.trim().length < 4) {
      toast.error("Describe what changed (a few words is enough).");
      return;
    }
    setBusy(true);
    setLastResult(null);
    try {
      const res: any = await recalibrate({
        data: { missionId, reason: reason.trim() },
      });
      setLastResult(res);
      toast.success(
        `Recalibrated · ${res.memoriesSuperseded} memories superseded · ${res.cacheCleared} briefs cleared · ${res.researched} questions re-researched`,
      );
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalibration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-8 py-8 max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          Olympus · Leadership Only
        </div>
        <h1 className="mt-1 text-xl font-semibold">Intel Drift</h1>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Declare an intel drift when the procurement reality has shifted and the Oracle or IRIS
          are operating on stale assumptions. Recalibration regenerates the Mission Intelligence DNA
          from the latest RFP, supersedes prior mission-scoped IRIS memories (kept for audit),
          clears every cached brief, re-runs the top research questions through Perplexity,
          and posts a Global Briefing to the mission team. Audited.
        </p>
      </div>

      <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-6 space-y-5">
        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Mission
          </label>
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            disabled={busy}
            className="mt-1.5 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select a mission…</option>
            {missions.map((m: any) => (
              <option key={m.id} value={m.id}>
                {[m.name, m.client, m.state].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            What changed? (recorded in audit log and team briefing)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="e.g. State released Amendment 4 — population scope expanded to include dual eligibles"
            className="mt-1.5 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={busy || !missionId}
            className="inline-flex items-center gap-2 rounded-[8px] bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {busy ? "Recalibrating…" : "Declare Intel Drift & Recalibrate"}
          </button>
          {busy && (
            <span className="text-[11px] text-muted-foreground">
              30–60 seconds while research runs.
            </span>
          )}
        </div>
      </div>

      {lastResult && (
        <div className="mt-6 rounded-[10px] border border-border bg-surface p-5 text-xs">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Last Recalibration
          </div>
          <ul className="space-y-1.5 text-foreground/90">
            <li>DNA: {lastResult.dna?.ok ? "regenerated" : `FAILED — ${lastResult.dna?.error}`}</li>
            <li>{lastResult.memoriesSuperseded} mission-scoped IRIS memories superseded</li>
            <li>{lastResult.cacheCleared} cached briefs cleared</li>
            <li>
              {lastResult.researched} research questions re-run
              {lastResult.researchFailed ? ` (${lastResult.researchFailed} failed)` : ""}
            </li>
            <li className="text-muted-foreground">
              Global Briefing posted to the mission team. Audit entry written.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
