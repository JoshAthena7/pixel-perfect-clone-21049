import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, ListChecks, Calendar, X, Trash2, ClipboardList, Rocket } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MissionCardMenu } from "@/components/missions/MissionCardMenu";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { useIsAdmin } from "@/hooks/useAccess";


import { IntelligenceCompletenessChip } from "@/components/mission-command/IntelligenceCompletenessChip";
import { MissionCardBadges } from "@/components/nav/MissionCardBadges";
import { getLastTab } from "@/lib/last-tab";

type MissionRow = {
  id: string;
  name: string;
  client_name: string | null;
  agency_name: string | null;
  status: string;
  submission_deadline: string | null;
  blast_off_at: string | null;
  team_count: number;
  question_count: number;
  intel_completeness: number | null;
};

const STATUSES: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "setup", label: "Setup" },
  { key: "active", label: "Active" },
  { key: "pens_down", label: "Pens Down" },
  { key: "submitted", label: "Submitted" },
  { key: "awarded", label: "Awarded" },
  { key: "archived", label: "Archived" },
];

const STATUS_STYLES: Record<string, string> = {
  setup: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  pens_down: "bg-red-500/15 text-red-400 border-red-500/30",
  submitted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  awarded: "bg-[var(--athena-gold)]/20 text-[var(--athena-gold)] border-[var(--athena-gold)]/40",
  not_awarded: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchMissions(): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from("missions")
    .select(
      "id, name, client_name, agency_name, status, submission_deadline, blast_off_at, intelligence_graph_completeness, mission_team_members(count), mission_questions(count)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    client_name: m.client_name,
    agency_name: m.agency_name,
    status: m.status,
    submission_deadline: m.submission_deadline,
    blast_off_at: m.blast_off_at,
    team_count: m.mission_team_members?.[0]?.count ?? 0,
    question_count: m.mission_questions?.[0]?.count ?? 0,
    intel_completeness: typeof m.intelligence_graph_completeness === "number" ? m.intelligence_graph_completeness : null,
  }));
}

export function MissionsListPage() {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["missions-list"],
    queryFn: fetchMissions,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 };
    for (const s of STATUSES) if (s.key !== "all") c[s.key] = 0;
    for (const m of data ?? []) c[m.status] = (c[m.status] ?? 0) + 1;
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (tab !== "all") rows = rows.filter((m) => m.status === tab);
    if (debounced.trim()) {
      const q = debounced.toLowerCase();
      rows = rows.filter(
        (m) => m.name.toLowerCase().includes(q) || (m.client_name ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, tab, debounced]);

  const total = data?.length ?? 0;

  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <MissionEditPanel
        missionId={editingId}
        open={!!editingId}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
      />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-foreground">Missions</h1>
            <span className="rounded-full bg-surface-hover border border-border px-3 py-1 text-xs text-muted-foreground">
              {total} mission{total === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/admin/team" })}
                className="border-border bg-surface/60"
              >
                <Users className="h-4 w-4" /> Manage Collective
              </Button>
            )}
            <Button
              onClick={() => navigate({ to: "/olympus/missions/new" })}
              className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
            >
              <Plus className="h-4 w-4" /> Create New Mission
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-2",
                tab === s.key
                  ? "border-[var(--athena-gold)] bg-[var(--athena-gold)]/10 text-foreground"
                  : "border-border bg-surface/40 text-muted-foreground hover:text-foreground hover:bg-surface",
              )}
            >
              {s.label}
              <span className="text-xs opacity-70">{counts[s.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search missions or clients…"
            className="pl-9"
          />
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-surface/40 p-5 space-y-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <div className="flex gap-3 pt-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-center">
            <p className="text-sm text-destructive mb-3">Failed to load missions.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !isError && total === 0 && (
          <EmptyMissions onCreate={() => navigate({ to: "/olympus/missions/new" })} />
        )}

        {!isLoading && !isError && total > 0 && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-surface/40 p-10 text-center">
            <p className="text-muted-foreground mb-3">No missions match your filters.</p>
            <button
              onClick={() => {
                setTab("all");
                setSearch("");
              }}
              className="text-sm text-[var(--athena-gold)] hover:underline inline-flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((m) => (
              <MissionCard key={m.id} m={m} onEdit={() => setEditingId(m.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissionCard({ m, onEdit }: { m: MissionRow; onEdit: () => void }) {
  const isSetup = m.status === "setup";
  const to = isSetup
    ? "/olympus/missions/$missionId/wizard"
    : "/olympus/missions/$missionId";
  const daysOut = m.submission_deadline
    ? formatDistanceToNowStrict(new Date(m.submission_deadline), { unit: "day" })
    : null;
  const search = !isSetup ? ({ tab: getLastTab(m.id) ?? "overview" } as any) : undefined;
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const onDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete "${m.name}" and start over?\n\nThis permanently removes the mission and all setup data. This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    const { error } = await supabase.from("missions").delete().eq("id", m.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message || "Could not delete mission");
      return;
    }
    toast.success("Mission deleted");
    qc.invalidateQueries({ queryKey: ["missions-list"] });
  };

  return (
    <div className="relative group">
      <MissionCardMenu
        missionId={m.id}
        missionName={m.name}
        status={m.status}
        onEdit={onEdit}
      />
      <Link
        to={to}
        params={{ missionId: m.id }}
        search={search}
        className="block rounded-xl border border-border bg-surface/40 p-5 pr-14 hover:bg-surface hover:border-[var(--athena-gold)]/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">{m.name}</h3>
            {(() => {
              const client = m.client_name ?? m.agency_name;
              if (client && client !== m.name) {
                return <p className="text-sm text-muted-foreground truncate">{client}</p>;
              }
              if (!client) {
                return <p className="text-sm text-muted-foreground/60 italic truncate">Client TBD</p>;
              }
              return null;
            })()}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider",
              STATUS_STYLES[m.status] ?? STATUS_STYLES.archived,
            )}
          >
            {statusLabel(m.status)}
          </span>
        </div>
        {m.intel_completeness != null && (
          <div className="mb-2">
            <IntelligenceCompletenessChip missionId={m.id} initial={m.intel_completeness} compact />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {daysOut && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> {daysOut} to submission
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {m.team_count} team
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> {m.question_count} questions
          </span>
        </div>
        <MissionCardBadges missionId={m.id} />
        {m.status === "active" && m.blast_off_at && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Launched {format(new Date(m.blast_off_at), "MMMM d, yyyy")}
          </p>
        )}
      </Link>
      {isSetup && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete mission and start over"
            title="Delete mission and start over"
            className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-background/80 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {deleting ? "Deleting…" : "Delete & start over"}
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyMissions({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-16 text-center flex flex-col items-center">
      <img
        src="/athena-mark-white.png"
        alt=""
        aria-hidden
        draggable={false}
        className="h-16 w-16 mb-6 opacity-90"
        style={{ objectFit: "contain" }}
      />
      <p className="text-white mb-1" style={{ fontSize: 18 }}>No active missions yet.</p>
      <p className="text-muted-foreground mb-6" style={{ fontSize: 14 }}>
        Create your first mission to get started.
      </p>
      <Button
        onClick={onCreate}
        className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
      >
        <Plus className="h-4 w-4" /> Create New Mission
      </Button>
    </div>
  );
}
