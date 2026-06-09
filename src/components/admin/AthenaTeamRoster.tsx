import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronUp,
  ChevronDown,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AtlasTeamSyncButton } from "@/components/admin/AtlasTeamSyncButton";
import { RowActions } from "@/components/admin/AthenaTeamRowActions";
import {
  AthenaTeamFilterBar,
  AthenaTeamTabs,
  EMPTY_FILTERS,
  filtersAreActive,
  type Filters,
  type TabKey,
} from "@/components/admin/AthenaTeamFilters";
import { AthenaTeamBulkBar } from "@/components/admin/AthenaTeamBulkBar";
import { PersonDetailDrawer } from "@/components/admin/PersonDetailDrawer";

type Member = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  job_title: string | null;
  talentdesk_status: "approved" | "pending_onboarding" | null;
  atlas_invite_status: string;
  atlas_invite_sent_at: string | null;
  atlas_first_login_at: string | null;
  atlas_last_active_at: string | null;
  atlas_role: string;
  atlas_profile_completeness: number;
  skills: string[] | null;
};

type SortKey = "name" | "last_active" | "profile";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

function fullName(m: Member) {
  const n = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  return n || m.email;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "Never";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const ATLAS_BADGE: Record<string, { label: string; cls: string }> = {
  not_invited: { label: "Not Invited", cls: "bg-zinc-700/40 text-zinc-200 border-zinc-600/60" },
  invite_sent: { label: "Invite Sent", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  never_logged_in: { label: "Never Logged In", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
  onboarding_incomplete: { label: "Onboarding Incomplete", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  sme: "SME",
  reviewer: "Reviewer",
  unassigned: "—",
};

export function AthenaTeamRoster() {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["atlas-team-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atlas_team_members")
        .select(
          "id,first_name,last_name,email,job_title,talentdesk_status,atlas_invite_status,atlas_invite_sent_at,atlas_first_login_at,atlas_last_active_at,atlas_role,atlas_profile_completeness,skills",
        )
        .eq("is_removed", false);
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: lastSync } = useQuery({
    queryKey: ["atlas-team-last-sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atlas_team_sync_log")
        .select("synced_at")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.synced_at ?? null;
    },
  });

  const counts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    for (const m of members) {
      if (m.talentdesk_status === "approved") approved++;
      else if (m.talentdesk_status === "pending_onboarding") pending++;
    }
    return { total: members.length, approved, pending };
  }, [members]);

  const allSkills = useMemo(() => {
    const s = new Set<string>();
    for (const m of members) for (const k of m.skills ?? []) if (k) s.add(k);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const tabFilter = useMemo(
    () => ({
      all: (_m: Member) => true,
      pending: (m: Member) =>
        m.atlas_invite_status === "invite_sent" || m.atlas_invite_status === "never_logged_in",
      active: (m: Member) => {
        const d = daysSince(m.atlas_last_active_at);
        return d !== null && d <= 30;
      },
      no_activity: (m: Member) => {
        const inviteDays = daysSince(m.atlas_invite_sent_at);
        const staleInvite =
          (m.atlas_invite_status === "invite_sent" ||
            m.atlas_invite_status === "never_logged_in") &&
          inviteDays !== null &&
          inviteDays > 14;
        const lastActiveDays = daysSince(m.atlas_last_active_at);
        const staleActivity = lastActiveDays !== null && lastActiveDays > 30;
        return staleInvite || staleActivity;
      },
      capacity: (_m: Member) => true,
    }),
    [],
  );

  const tabCounts = useMemo(
    () => ({
      all: members.filter(tabFilter.all).length,
      pending: members.filter(tabFilter.pending).length,
      active: members.filter(tabFilter.active).length,
      no_activity: members.filter(tabFilter.no_activity).length,
      capacity: members.filter(tabFilter.capacity).length,
    }),
    [members, tabFilter],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return members.filter((m) => {
      if (!tabFilter[activeTab](m)) return false;
      if (q) {
        const hay = [
          m.first_name ?? "",
          m.last_name ?? "",
          m.email,
          m.job_title ?? "",
          ...(m.skills ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.roles.size > 0 && !filters.roles.has(m.atlas_role)) return false;
      if (filters.atlasStatus !== "all" && m.atlas_invite_status !== filters.atlasStatus)
        return false;
      if (filters.tdStatus !== "all" && m.talentdesk_status !== filters.tdStatus) return false;
      if (filters.skills.size > 0) {
        const ms = new Set(m.skills ?? []);
        let any = false;
        for (const s of filters.skills) if (ms.has(s)) { any = true; break; }
        if (!any) return false;
      }
      return true;
    });
  }, [members, filters, activeTab, tabFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (activeTab === "capacity") {
      // Placeholder: sort alphabetically until missions are wired
      arr.sort((a, b) => fullName(a).localeCompare(fullName(b)));
      return arr;
    }
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === "name") {
        av = fullName(a).toLowerCase();
        bv = fullName(b).toLowerCase();
      } else if (sortKey === "last_active") {
        av = a.atlas_last_active_at ? Date.parse(a.atlas_last_active_at) : 0;
        bv = b.atlas_last_active_at ? Date.parse(b.atlas_last_active_at) : 0;
      } else if (sortKey === "profile") {
        av = a.atlas_profile_completeness;
        bv = b.atlas_profile_completeness;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, activeTab]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function handleTabChange(t: TabKey) {
    setActiveTab(t);
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }
  function handleFiltersChange(next: Filters) {
    setFilters(next);
    setPage(0);
  }
  function clearAllFilters() {
    setActiveTab("all");
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }

  const isFiltered = filtersAreActive(filters);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of sorted) {
        if (checked) next.add(r.id); else next.delete(r.id);
      }
      return next;
    });
  }

  const visibleSelectedCount = sorted.reduce((n, r) => (selected.has(r.id) ? n + 1 : n), 0);
  const headerCheckState: boolean | "indeterminate" =
    sorted.length > 0 && visibleSelectedCount === sorted.length
      ? true
      : visibleSelectedCount > 0
        ? "indeterminate"
        : false;
  const lastSyncLabel = lastSync ? formatDateTime(lastSync) : null;

  const qc = useQueryClient();
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  function clearSelection() {
    setSelected(new Set());
  }
  function refreshRoster() {
    qc.invalidateQueries({ queryKey: ["atlas-team-members"] });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Athena Team</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-default items-center rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium">
                    {counts.total} member{counts.total === 1 ? "" : "s"}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {counts.approved} Approved · {counts.pending} Pending TalentDesk Onboarding
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastSyncLabel
                ? `Last synced from TalentDesk: ${lastSyncLabel}`
                : "Roster has not been synced. Upload a TalentDesk CSV to begin."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled
              title="Coming soon"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" /> Export Roster
            </button>
            <AtlasTeamSyncButton />
          </div>
        </div>

        {/* Quick view tabs */}
        <AthenaTeamTabs activeTab={activeTab} counts={tabCounts} onChange={handleTabChange} />

        {/* Filter bar */}
        <AthenaTeamFilterBar
          filters={filters}
          setFilters={handleFiltersChange}
          allSkills={allSkills}
          onClearAll={clearAllFilters}
          filteredCount={filtered.length}
          totalCount={tabCounts[activeTab]}
        />

        {/* Bulk actions bar (renders when selection is non-empty) */}
        <AthenaTeamBulkBar
          selectedIds={selectedIds}
          onClear={clearSelection}
          onRefresh={refreshRoster}
        />

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-border bg-surface/40">
          <table className="w-full text-sm">
            <thead className="bg-surface/70 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={headerCheckState}
                    onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                    aria-label="Select all visible"
                  />
                </th>
                <SortHeader label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <th className="px-3 py-2.5 text-left font-medium">TD Status</th>
                <th className="px-3 py-2.5 text-left font-medium">ATLAS Status</th>
                <th className="px-3 py-2.5 text-left font-medium">Role</th>
                <th className="px-3 py-2.5 text-left font-medium">Missions</th>
                <SortHeader label="Last Active" active={sortKey === "last_active"} dir={sortDir} onClick={() => toggleSort("last_active")} />
                <SortHeader label="Profile" active={sortKey === "profile"} dir={sortDir} onClick={() => toggleSort("profile")} />
                <th className="w-10 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  {members.length === 0 ? (
                    "No team members found. Upload a TalentDesk CSV to get started."
                  ) : isFiltered || activeTab !== "all" ? (
                    <span>
                      No members match your filters.{" "}
                      <button
                        onClick={clearAllFilters}
                        className="text-[color:var(--athena-gold,#d4af37)] hover:underline"
                      >
                        Clear filters
                      </button>
                    </span>
                  ) : (
                    "No team members found."
                  )}
                </td></tr>

              ) : (
                pageRows.map((m, i) => <Row key={m.id} m={m} zebra={i % 2 === 1} selected={selected.has(m.id)} onOpenDetail={(id) => setDetailMemberId(id)} onToggle={(v) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (v) next.add(m.id); else next.delete(m.id);
                    return next;
                  });
                }} />)
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
              <div className="text-muted-foreground">
                Showing {safePage * PAGE_SIZE + 1}–{Math.min(sorted.length, (safePage + 1) * PAGE_SIZE)} of {sorted.length}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="px-2 text-muted-foreground">Page {safePage + 1} of {pageCount}</span>
                <button
                  onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 hover:bg-surface-hover disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <th className="px-3 py-2.5 text-left font-medium">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground"} hover:text-foreground`}
      >
        {label}
        {active ? (dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}

function Row({ m, zebra, selected, onToggle, onOpenDetail }: {
  m: Member; zebra: boolean; selected: boolean; onToggle: (v: boolean) => void;
  onOpenDetail: (id: string) => void;
}) {
  const lastActiveLabel = relativeTime(m.atlas_last_active_at);
  const inviteDays = daysSince(m.atlas_invite_sent_at);
  const isStaleInvite = !m.atlas_first_login_at && inviteDays !== null && inviteDays > 14;

  const atlasBadge = ATLAS_BADGE[m.atlas_invite_status] ?? {
    label: m.atlas_invite_status, cls: "bg-zinc-700/40 text-zinc-200 border-zinc-600/60",
  };
  const tdLabel = m.talentdesk_status === "approved" ? "Approved" : m.talentdesk_status === "pending_onboarding" ? "Pending Onboarding" : "—";
  const tdCls = m.talentdesk_status === "approved"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : m.talentdesk_status === "pending_onboarding"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
      : "bg-zinc-700/40 text-zinc-300 border-zinc-600/60";

  const pct = Math.max(0, Math.min(100, m.atlas_profile_completeness ?? 0));
  const barCls = pct <= 40 ? "[&>div]:bg-red-500" : pct <= 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500";

  return (
    <tr className={`border-t border-border/60 ${zebra ? "bg-surface/30" : "bg-transparent"} hover:bg-surface-hover/60`}>
      <td className="px-3 py-2.5">
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(Boolean(v))} aria-label={`Select ${fullName(m)}`} />
      </td>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={() => onOpenDetail(m.id)}
          className="text-left font-medium text-foreground hover:text-[color:var(--athena-gold)]"
        >
          {fullName(m)}
        </button>
        {m.job_title && <div className="text-[11px] text-muted-foreground">{m.job_title}</div>}
      </td>

      <td className="px-3 py-2.5">
        {/* TD Status — PILL shape */}
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tdCls}`}>
          TD · {tdLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {/* ATLAS Status — SQUARE chip, distinct from TD */}
        <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${atlasBadge.cls}`}>
          ATLAS · {atlasBadge.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={m.atlas_role === "unassigned" ? "text-muted-foreground" : ""}>
          {ROLE_LABEL[m.atlas_role] ?? m.atlas_role}
        </span>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">—</td>
      <td className="px-3 py-2.5">
        <span className={isStaleInvite ? "text-red-400" : m.atlas_last_active_at ? "" : "text-muted-foreground"}>
          {lastActiveLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Progress value={pct} className={`h-1.5 w-24 bg-surface ${barCls}`} />
          <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <RowActions
          member={{
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            email: m.email,
            job_title: m.job_title,
            talentdesk_status: m.talentdesk_status,
            atlas_invite_status: m.atlas_invite_status,
            atlas_role: m.atlas_role,
          }}
        />
      </td>
    </tr>
  );
}
