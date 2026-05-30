import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useEngagement } from "@/hooks/use-engagement";
import { supabase } from "@/integrations/supabase/client";
import athenaLogo from "@/assets/athena-logo-dark.png";
import { AlertTriangle, Siren, ShieldAlert, Thermometer, Calendar, LogOut } from "lucide-react";
import { HookFailuresPanel } from "@/components/HookFailuresPanel";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview — Athena" }] }),
  component: OverviewPage,
});

type Rollup = {
  health: string | null;
  temperature_score: number | null;
  client_sentiment: string | null;
  open_sos: number;
  open_risks: number;
};

const HEALTH_COLORS: Record<string, string> = {
  Green: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300",
  Yellow: "border-amber-500/60 bg-amber-500/10 text-amber-300",
  Red: "border-red-500/60 bg-red-500/10 text-red-300",
};

function OverviewPage() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const navigate = useNavigate();
  const [rollups, setRollups] = useState<Record<string, Rollup>>({});
  const [fetching, setFetching] = useState(true);

  const leadership = memberships.filter(
    (m) => m.role === "founder" || m.role === "pm" || m.role === "engagement_lead"
  );

  useEffect(() => {
    if (loading) return;
    // Guard: must have founder/pm somewhere
    const hasFounderOrPm = memberships.some((m) => m.role === "founder" || m.role === "pm");
    if (!hasFounderOrPm) {
      navigate({ to: "/select-engagement", replace: true });
    }
  }, [loading, memberships, navigate]);

  useEffect(() => {
    if (leadership.length === 0) return;
    let cancelled = false;
    async function go() {
      setFetching(true);
      const ids = leadership.map((m) => m.engagement.id);
      const [snapshotsRes, sosRes, risksRes] = await Promise.all([
        supabase
          .from("snapshots")
          .select("engagement_id, health, temperature_score, client_sentiment, snapshot_date")
          .in("engagement_id", ids)
          .order("snapshot_date", { ascending: false }),
        supabase
          .from("sos_alerts")
          .select("engagement_id, status")
          .in("engagement_id", ids)
          .neq("status", "Resolved"),
        supabase
          .from("risks")
          .select("engagement_id, status")
          .in("engagement_id", ids)
          .eq("status", "Open"),
      ]);
      if (cancelled) return;
      const map: Record<string, Rollup> = {};
      for (const id of ids) {
        map[id] = { health: null, temperature_score: null, client_sentiment: null, open_sos: 0, open_risks: 0 };
      }
      // Latest snapshot per engagement (results ordered desc)
      for (const s of (snapshotsRes.data ?? []) as any[]) {
        if (map[s.engagement_id] && map[s.engagement_id].health === null) {
          map[s.engagement_id].health = s.health;
          map[s.engagement_id].temperature_score = s.temperature_score;
          map[s.engagement_id].client_sentiment = s.client_sentiment;
        }
      }
      for (const r of (sosRes.data ?? []) as any[]) map[r.engagement_id].open_sos += 1;
      for (const r of (risksRes.data ?? []) as any[]) map[r.engagement_id].open_risks += 1;
      setRollups(map);
      setFetching(false);
    }
    go();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadership.length]);

  function enter(id: string) {
    switchEngagement(id);
    navigate({ to: "/command", replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={athenaLogo} alt="Athena" className="h-10 w-auto" />
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--gold)]">Athena</div>
              <h1 className="text-xl font-bold">Leadership Overview</h1>
              <p className="text-xs text-muted-foreground">{leadership.length} engagements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/engagement/new" })}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ background: "var(--gold, #c9b370)", color: "#0d0d14" }}
            >
              + New Engagement
            </button>
            <button
              onClick={() => navigate({ to: "/select-engagement" })}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              All engagements
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>

        {fetching ? (
          <div className="text-sm text-muted-foreground">Loading rollups…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leadership.map((m) => {
              const r = rollups[m.engagement.id];
              const alarmed = r && (r.open_sos > 0 || r.health === "Red");
              return (
                <button
                  key={m.engagement.id}
                  onClick={() => enter(m.engagement.id)}
                  className={`flex flex-col gap-3 rounded-xl border bg-surface p-5 text-left transition hover:bg-surface-hover ${
                    alarmed ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border hover:border-[var(--gold)]/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold">{m.engagement.name}</div>
                      <div className="truncate text-sm text-muted-foreground">{m.engagement.client}</div>
                    </div>
                    {alarmed && <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-surface-hover px-1.5 py-0.5">{m.engagement.status}</span>
                    {m.engagement.submission_date && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(m.engagement.submission_date).toLocaleDateString()}
                      </span>
                    )}
                    {r?.health && (
                      <span className={`rounded border px-1.5 py-0.5 ${HEALTH_COLORS[r.health] ?? ""}`}>
                        {r.health}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                    <div className="flex flex-col items-center">
                      <Siren className={`h-4 w-4 ${r?.open_sos ? "text-red-400" : "text-muted-foreground"}`} />
                      <span className="mt-1 font-bold">{r?.open_sos ?? 0}</span>
                      <span className="text-[10px] text-muted-foreground">SOS</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <ShieldAlert className={`h-4 w-4 ${r?.open_risks ? "text-amber-400" : "text-muted-foreground"}`} />
                      <span className="mt-1 font-bold">{r?.open_risks ?? 0}</span>
                      <span className="text-[10px] text-muted-foreground">Risks</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <Thermometer className="h-4 w-4 text-muted-foreground" />
                      <span className="mt-1 font-bold">{r?.temperature_score ?? "—"}</span>
                      <span className="text-[10px] text-muted-foreground">Temp</span>
                    </div>
                  </div>

                  {r?.client_sentiment && (
                    <div className="text-[11px] text-muted-foreground">
                      Sentiment: <span className="text-foreground">{r.client_sentiment}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
