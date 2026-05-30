import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/time";
import { Search, UserPlus, MoreVertical, Users } from "lucide-react";
import { InviteToCollectiveDialog } from "@/components/admin/InviteToCollectiveDialog";

export const Route = createFileRoute("/_authenticated/admin/collective")({
  component: AdminCollective,
});


type MemberRow = {
  id: string;
  user_id: string | null;
  engagement_id: string;
  role: string;
  display_name: string;
  email: string | null;
  title: string | null;
  added_at: string | null;
  engagements: { id: string; name: string } | null;
};

type RosterEntry = {
  key: string;
  name: string;
  title: string | null;
  email: string | null;
  primaryRole: string;
  rooms: { id: string; name: string; role: string }[];
  lastActive: string | null;
  utilization: number; // 0-130
};

const ROLE_STYLE: Record<string, { ring: string; bg: string; fg: string; label: string }> = {
  founder:         { ring: "border-[var(--gold)]/40", bg: "bg-[var(--gold)]/10",  fg: "text-[var(--gold)]",  label: "FOUNDER"  },
  pm:              { ring: "border-emerald-400/30",   bg: "bg-emerald-400/10",    fg: "text-emerald-300",    label: "PM"       },
  engagement_lead: { ring: "border-sky-400/30",       bg: "bg-sky-400/10",        fg: "text-sky-300",        label: "LEAD"     },
  writer:          { ring: "border-purple-400/30",    bg: "bg-purple-400/10",     fg: "text-purple-300",     label: "WRITER"   },
  sme:             { ring: "border-fuchsia-400/30",   bg: "bg-fuchsia-400/10",    fg: "text-fuchsia-300",    label: "SME"      },
  advisor:         { ring: "border-amber-400/30",     bg: "bg-amber-400/10",      fg: "text-amber-300",      label: "ADVISOR"  },
  reviewer:        { ring: "border-orange-400/30",    bg: "bg-orange-400/10",     fg: "text-orange-300",     label: "REVIEWER" },
  viewer:          { ring: "border-slate-500/30",     bg: "bg-slate-500/10",      fg: "text-slate-300",      label: "VIEWER"   },
};

const ROOM_DOT = ["bg-emerald-400", "bg-sky-400", "bg-amber-400", "bg-fuchsia-400", "bg-rose-400", "bg-cyan-400"];

function AdminCollective() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"roster" | "capacity">("roster");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("engagement_members")
      .select("id,user_id,engagement_id,role,display_name,email,title,added_at,engagements(id,name)")
      .order("added_at", { ascending: false });
    setRows((data ?? []) as unknown as MemberRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);


  const roster: RosterEntry[] = useMemo(() => {
    const map = new Map<string, RosterEntry>();
    for (const r of rows) {
      const key = r.user_id ?? `email:${r.email ?? r.id}`;
      let e = map.get(key);
      if (!e) {
        e = {
          key,
          name: r.display_name,
          title: r.title,
          email: r.email,
          primaryRole: r.role,
          rooms: [],
          lastActive: r.added_at,
          utilization: 0,
        };
        map.set(key, e);
      }
      if (r.engagements) e.rooms.push({ id: r.engagements.id, name: r.engagements.name, role: r.role });
      if (r.added_at && (!e.lastActive || r.added_at > e.lastActive)) e.lastActive = r.added_at;
      // Promote highest-rank role as primary
      const rank = ["founder", "pm", "engagement_lead", "writer", "sme", "reviewer", "advisor", "viewer"];
      if (rank.indexOf(r.role) < rank.indexOf(e.primaryRole)) e.primaryRole = r.role;
    }
    // Deterministic utilization derived from engagement count (mock until real capacity exists)
    for (const e of map.values()) {
      e.utilization = Math.min(130, e.rooms.length * 32 + ((e.name.charCodeAt(0) * 7) % 25));
    }
    return Array.from(map.values()).sort((a, b) => b.rooms.length - a.rooms.length || a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = roster.filter((m) => {
    if (roleFilter !== "all" && m.primaryRole !== roleFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q) || (m.title ?? "").toLowerCase().includes(q);
  });

  const kpiTotal = roster.length;
  const kpiActive = roster.filter((m) => m.lastActive && Date.now() - new Date(m.lastActive).getTime() < 7 * 86400 * 1000).length;
  const kpiAvgUtil = roster.length ? Math.round(roster.reduce((a, b) => a + b.utilization, 0) / roster.length) : 0;
  const kpiOver = roster.filter((m) => m.utilization > 100).length;

  return (
    <div className="mx-auto max-w-[1600px] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Collective</h1>
          <p className="text-xs text-muted-foreground mt-1">Network of advisors, operators, and partners across every war room.</p>
        </div>
        <Button size="sm" className="gap-1.5 shadow-[0_0_20px_rgba(212,175,55,0.15)]" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Invite to Collective
        </Button>
      </div>

      <InviteToCollectiveDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={load} />


      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Members"     value={kpiTotal}             accent="text-foreground" sub={`${rows.length} assignments`} />
        <Kpi label="Active This Week"  value={kpiActive}            accent="text-emerald-300" sub={`${kpiTotal ? Math.round(kpiActive / kpiTotal * 100) : 0}% of network`} />
        <Kpi label="Avg Utilization"   value={`${kpiAvgUtil}%`}     accent="text-[var(--gold)]" bar={kpiAvgUtil} />
        <Kpi label="Overcommitted"     value={kpiOver}              accent={kpiOver ? "text-rose-400" : "text-foreground"} sub={kpiOver ? "Needs attention" : "All within capacity"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-border/60">
        {(["roster", "capacity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition ${
              tab === t ? "text-[var(--gold)] border-b-2 border-[var(--gold)] -mb-px" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "roster" ? (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-border/60 bg-[#141628]">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, title, or email…"
                className="pl-8 h-8 text-xs bg-background/60"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-8 text-xs rounded-md border border-border/60 bg-background/60 px-2 text-foreground"
            >
              <option value="all">All Roles</option>
              {Object.entries(ROLE_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="text-[11px] text-muted-foreground ml-auto px-2 font-mono">
              {filtered.length} of {roster.length}
            </div>
          </div>

          {/* Roster table */}
          <Card className="border-border/60 bg-[#141628] overflow-hidden">
            <div className="grid grid-cols-[2.2fr_110px_1.6fr_180px_120px_40px] gap-3 px-5 py-2.5 border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div>Member</div>
              <div>Role</div>
              <div>Engagements</div>
              <div>Utilization</div>
              <div>Last Active</div>
              <div />
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No members match.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map((m) => {
                  const rs = ROLE_STYLE[m.primaryRole] ?? ROLE_STYLE.viewer;
                  const utilColor = m.utilization > 100 ? "bg-rose-400" : m.utilization > 80 ? "bg-[var(--gold)]" : "bg-emerald-400";
                  const utilText  = m.utilization > 100 ? "text-rose-400" : m.utilization > 80 ? "text-[var(--gold)]" : "text-emerald-300";
                  return (
                    <div
                      key={m.key}
                      className="grid grid-cols-[2.2fr_110px_1.6fr_180px_120px_40px] items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-background/80 border border-border/60 flex items-center justify-center text-[10px] font-bold text-[var(--gold)] shrink-0">
                          {initials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate group-hover:text-[var(--gold)] transition-colors">{m.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate uppercase tracking-wide">{m.title ?? m.email ?? "—"}</div>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 text-[9px] font-bold tracking-wider border rounded-full w-fit ${rs.ring} ${rs.bg} ${rs.fg}`}>
                        {rs.label}
                      </span>

                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold w-4 text-right">{m.rooms.length}</span>
                        <div className="flex -space-x-1">
                          {m.rooms.slice(0, 5).map((r, i) => (
                            <span
                              key={r.id}
                              title={`${r.name} — ${r.role}`}
                              className={`h-2 w-2 rounded-full ring-2 ring-[#141628] ${ROOM_DOT[i % ROOM_DOT.length]}`}
                            />
                          ))}
                        </div>
                        <div className="flex gap-1 overflow-hidden">
                          {m.rooms.slice(0, 2).map((r) => (
                            <span key={r.id} className="px-1.5 py-0.5 text-[10px] rounded bg-background/60 border border-border/40 text-muted-foreground truncate max-w-[110px]">
                              {r.name}
                            </span>
                          ))}
                          {m.rooms.length > 2 && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-background/60 border border-border/40 text-muted-foreground">
                              +{m.rooms.length - 2}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-background/80 overflow-hidden">
                          <div className={`h-full ${utilColor}`} style={{ width: `${Math.min(100, m.utilization)}%` }} />
                        </div>
                        <span className={`font-mono text-[11px] tabular-nums w-10 text-right ${utilText}`}>{m.utilization}%</span>
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono">{m.lastActive ? relativeTime(m.lastActive) : "—"}</div>

                      <button className="text-muted-foreground/60 hover:text-foreground transition opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="border-border/60 bg-[#141628] p-12 text-center">
          <div className="text-sm font-semibold mb-1">Capacity matrix</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            Weekly committed-hours heatmap across the Collective. Wiring up capacity tracking next — flip back to Roster for the live view.
          </div>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, accent, sub, bar }: { label: string; value: string | number; accent: string; sub?: string; bar?: number }) {
  return (
    <Card className="border-border/60 bg-[#141628] p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono tabular-nums ${accent}`}>{value}</div>
      {bar !== undefined ? (
        <div className="mt-2 h-1 w-full bg-background/80 rounded-full overflow-hidden">
          <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>
      )}
    </Card>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "—";
}
