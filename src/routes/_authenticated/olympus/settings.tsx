import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";

export const Route = createFileRoute("/_authenticated/olympus/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const missionId = useSelectedOlympusMission();
  return (
    <div className="mx-auto max-w-5xl px-8 py-8 space-y-6">
      <header>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Settings</div>
        <h1 className="h1-display mt-1">Mission Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full mission-level settings (name, deadlines, scoring, danger zone) ship in Phase 6.
          {missionId && (
            <> For now, use the existing mission settings: <Link to="/missions/$missionId/settings" params={{ missionId }} className="text-primary hover:underline">open mission settings →</Link></>
          )}
        </p>
      </header>

      <IrisOperationsPanel />
    </div>
  );
}

/* IRIS Operations — preserved from previous Olympus build */

function IrisOperationsPanel() {
  const qc = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);

  const { data: rfpDocs = [] } = useQuery({
    queryKey: ["olympus-rfp-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_library")
        .select("id, name, mission_id, missions:mission_id(name)")
        .eq("is_rfp", true)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{ id: string; name: string; mission_id: string; missions: { name: string } | null }>;
    },
  });

  const { data: missionsList = [] } = useQuery({
    queryKey: ["olympus-missions-list"],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name,client").order("name");
      return (data ?? []) as Array<{ id: string; name: string; client: string }>;
    },
  });

  async function runRfpParse(documentId: string, label: string) {
    setRunning(`rfp:${documentId}`);
    try {
      const { parseRfpDocument } = await import("@/lib/rfp-parser.functions");
      const res = await parseRfpDocument({ data: { documentId } });
      toast.success(`Parsed "${label}": ${res.inserted} new questions (${res.total_detected ?? 0} detected)`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`RFP parse failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  }

  async function runMarketIntel() {
    setRunning("market");
    try {
      const { ingestMarketIntel } = await import("@/lib/market-intel.functions");
      const res = await ingestMarketIntel();
      toast.success(`Horizon Feed refreshed: ${res.inserted} new items (${res.fetched} fetched)`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`Market intel failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  }

  async function runMorningBriefs(missionId: string, missionName: string) {
    setRunning(`brief:${missionId}`);
    try {
      const { generateMissionQuestionBriefs } = await import("@/lib/iris-question-brief.functions");
      const res = await generateMissionQuestionBriefs({ data: { missionId, overwrite: false } });
      toast.success(`${missionName}: ${res.updated}/${res.total} morning briefs generated${res.failed ? ` (${res.failed} failed)` : ""}`);
      qc.invalidateQueries({ queryKey: ["olympus-audit"] });
    } catch (e) {
      toast.error(`Brief generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">IRIS Operations</h2>
        <p className="mt-1 text-xs text-muted-foreground">Manually trigger IRIS background jobs.</p>
      </div>
      <div className="divide-y divide-border">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Refresh Horizon Feed</div>
              <div className="text-xs text-muted-foreground">Pull fresh items from Federal Register, CMS, HHS, Medicaid.gov.</div>
            </div>
            <button onClick={runMarketIntel} disabled={running !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50">
              <Zap className="h-3.5 w-3.5" />{running === "market" ? "Running…" : "Run now"}
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 text-sm font-medium">Parse RFP → Question Records</div>
          {rfpDocs.length === 0 ? <div className="text-xs text-muted-foreground">No RFPs uploaded yet.</div> : (
            <ul className="space-y-2">
              {rfpDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{d.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{d.missions?.name ?? "—"}</div>
                  </div>
                  <button onClick={() => runRfpParse(d.id, d.name)} disabled={running !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50 shrink-0">
                    <Zap className="h-3 w-3" />{running === `rfp:${d.id}` ? "Parsing…" : "Parse"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="mb-1 text-sm font-medium">Generate Morning Briefs</div>
          <div className="mb-3 text-xs text-muted-foreground">Fill <code>current_focus</code>, <code>next_step</code>, <code>waiting_on</code> for every question in a mission.</div>
          {missionsList.length === 0 ? <div className="text-xs text-muted-foreground">No missions yet.</div> : (
            <ul className="space-y-2">
              {missionsList.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.client}</div>
                  </div>
                  <button onClick={() => runMorningBriefs(m.id, m.name)} disabled={running !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50 shrink-0">
                    <Zap className="h-3 w-3" />{running === `brief:${m.id}` ? "Briefing…" : "Generate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
