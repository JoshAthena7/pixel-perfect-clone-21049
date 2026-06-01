import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Activity, Settings as SettingsIcon, AlertCircle, Plus, ArrowRight, X, Zap } from "lucide-react";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusPage,
});

type Tab = "status" | "missions" | "settings";

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  mission_id: string | null;
  action_type: string;
  action_summary: string;
  target_table: string | null;
};

function OlympusPage() {
  const [tab, setTab] = useState<Tab>("status");

  const { data: me } = useQuery({
    queryKey: ["olympus-me-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, hasNoMissions: true };
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data ?? []).map((r) => r.role);
      return {
        isAdmin: roles.includes("admin") || roles.includes("lead"),
        hasNoMissions: roles.length === 0,
      };
    },
  });

  // Allow first-time users (no missions yet) — they need Olympus to create the first mission.
  if (me && !me.isAdmin && !me.hasNoMissions) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Olympus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Olympus is restricted to mission admins and leads.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Olympus</div>
        <h1 className="h1-display mt-1">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mission lifecycle, audit trail, and firm-level configuration.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {([
          ["status", "Status", Activity],
          ["missions", "Missions", Shield],
          ["settings", "Settings", SettingsIcon],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm transition ${
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "status" && <StatusTab />}
      {tab === "missions" && <MissionsTab />}
      {tab === "settings" && <SettingsPlaceholder />}
    </div>
  );
}

/* ─── Status tab — ARCH-3 audit feed ────────────── */

function StatusTab() {
  const { data: audit = [], isLoading } = useQuery({
    queryKey: ["olympus-audit"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("olympus_audit_log")
        .select("id,created_at,user_name,mission_id,action_type,action_summary,target_table")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as AuditRow[];
    },
  });

  const missionIds = Array.from(new Set(audit.map((a) => a.mission_id).filter(Boolean) as string[]));
  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-audit-missions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", missionIds);
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const mMap = Object.fromEntries(missions.map((m) => [m.id, m.name]));

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Audit Trail</h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last 100</span>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : audit.length === 0 ? (
        <div className="p-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-foreground/90">No audited actions yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Privileged actions taken in Olympus will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {audit.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary normal-case tracking-normal">{a.action_type}</span>
                {a.mission_id && (
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 truncate max-w-[200px] normal-case tracking-normal">
                    {mMap[a.mission_id] ?? "Mission"}
                  </span>
                )}
                <span className="ml-auto">{relativeTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{a.action_summary}</p>
              {a.user_name && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">by {a.user_name}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Missions tab — lifecycle overview ────────── */

type MissionRow = {
  id: string;
  name: string;
  client: string;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  question_count: number | null;
};

function MissionsTab() {
  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["olympus-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,status,health,submission_date,question_count")
        .order("created_at", { ascending: false });
      return (data ?? []) as MissionRow[];
    },
  });

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">All Missions</h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{missions.length} total</span>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Mission</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left w-28">Status</th>
              <th className="px-4 py-3 text-left w-24">Health</th>
              <th className="px-4 py-3 text-left w-24">Questions</th>
              <th className="px-4 py-3 text-left w-32">Pens-down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {missions.map((m) => (
              <tr key={m.id} className="hover:bg-surface-hover">
                <td className="px-4 py-3">
                  <Link to="/missions/$missionId/settings" params={{ missionId: m.id }} className="font-medium hover:text-primary">
                    {m.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.client}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                    m.status === "Active" ? "bg-primary/15 text-primary"
                    : m.status === "Archived" ? "bg-muted text-muted-foreground"
                    : "bg-amber-500/15 text-amber-400"
                  }`}>{m.status ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{m.health ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{m.question_count ?? 0}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.submission_date ? new Date(m.submission_date).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-surface/50 p-12 text-center text-sm text-muted-foreground">
      Firm-level settings — Slack defaults, email templates, IRIS prompts — coming soon.
    </div>
  );
}
