import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users, ListChecks, Calendar, X } from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/olympus/missions/")({
  component: MissionsListPage,
});

import { IntelligenceCompletenessChip } from "@/components/mission-command/IntelligenceCompletenessChip";

type MissionRow = {
  id: string;
  name: string;
  client_name: string | null;
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
      "id, name, client_name, status, submission_deadline, blast_off_at, intelligence_graph_completeness, mission_team_members(count), mission_questions(count)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    client_name: m.client_name,
    status: m.status,
    submission_deadline: m.submission_deadline,
    blast_off_at: m.blast_off_at,
    team_count: m.mission_team_members?.[0]?.count ?? 0,
    question_count: m.mission_questions?.[0]?.count ?? 0,
    intel_completeness: typeof m.intelligence_graph_completeness === "number" ? m.intelligence_graph_completeness : null,
  }));
}

function MissionsListPage() {
  const navigate = useNavigate();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-foreground">Missions</h1>
            <span className="rounded-full bg-surface-hover border border-border px-3 py-1 text-xs text-muted-foreground">
              {total} mission{total === 1 ? "" : "s"}
            </span>
          </div>
          <Button
            onClick={() => navigate({ to: "/olympus/missions/new" })}
            className="bg-[var(--athena-gold)] text-[var(--athena-navy-dark)] hover:bg-[var(--athena-gold-light)]"
          >
            <Plus className="h-4 w-4" /> Create New Mission
          </Button>
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
              <MissionCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissionCard({ m }: { m: MissionRow }) {
  const to =
    m.status === "setup"
      ? "/olympus/missions/$missionId/wizard"
      : "/olympus/missions/$missionId";
  const daysOut = m.submission_deadline
    ? formatDistanceToNowStrict(new Date(m.submission_deadline), { unit: "day" })
    : null;
  return (
    <Link
      to={to}
      params={{ missionId: m.id }}
      className="block rounded-xl border border-border bg-surface/40 p-5 hover:bg-surface hover:border-[var(--athena-gold)]/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground truncate">{m.name}</h3>
          <p className="text-sm text-muted-foreground truncate">{m.client_name ?? "—"}</p>
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
      {m.status === "active" && m.blast_off_at && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Launched {format(new Date(m.blast_off_at), "MMMM d, yyyy")}
        </p>
      )}
    </Link>
  );
}

function EmptyMissions({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-16 text-center">
      <div className="mx-auto mb-5 h-14 w-14 rounded-full border-2 border-[var(--athena-gold)] flex items-center justify-center text-[var(--athena-gold)] font-bold tracking-widest">
        A
      </div>
      <p className="text-muted-foreground mb-5">
        No missions yet. Create your first mission to get started.
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
