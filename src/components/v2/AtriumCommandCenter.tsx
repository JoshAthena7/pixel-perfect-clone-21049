// PR Phase-2: Atrium command center primitives.
// These components are presentational and accept already-loaded data from
// the Athena HQ page (no new server functions). They live above the existing
// mission card grid and are designed to leave the mission card data model
// untouched.

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

// ── shared types (loose; mirror what /home already queries) ─────────────────
export type AcMission = {
  id: string;
  name: string;
  client: string | null;
  state?: string | null;
  health: string | null;
  status: string | null;
  submission_date: string | null;
  question_count: number | null;
};

export type AcQuestion = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  pens_down_date: string | null;
  health: string | null;
  assigned_writer_id?: string | null;
  status?: string | null;
};

// ── helpers ─────────────────────────────────────────────────────────────────

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function computeMissionHealth(
  mission: AcMission,
  questions: AcQuestion[],
): "green" | "yellow" | "red" {
  const qHealths = questions.map((q) => (q.health ?? "").toLowerCase());
  if (qHealths.includes("red")) return "red";
  if (qHealths.includes("yellow")) return "yellow";
  if (qHealths.length > 0 && qHealths.every((h) => h === "green")) return "green";
  const m = (mission.health ?? "").toLowerCase();
  if (m === "red" || m === "critical") return "red";
  if (m === "yellow" || m === "at risk" || m === "at_risk") return "yellow";
  return "green";
}

// ── Portfolio Status Strip ──────────────────────────────────────────────────

export function PortfolioStatusStrip({
  missions,
  missionQuestions,
  activeFilter,
  onFilterChange,
}: {
  missions: AcMission[];
  missionQuestions: AcQuestion[];
  activeFilter: "all" | "red" | "yellow" | "green";
  onFilterChange: (f: "all" | "red" | "yellow" | "green") => void;
}) {
  const buckets = useMemo(() => {
    let red = 0, yellow = 0, green = 0;
    let nearest: { name: string; days: number; health: string } | null = null;
    for (const m of missions) {
      const qs = missionQuestions.filter((q) => q.mission_id === m.id);
      const h = computeMissionHealth(m, qs);
      if (h === "red") red++;
      else if (h === "yellow") yellow++;
      else green++;
      const d = daysUntil(m.submission_date);
      if (d !== null && d >= 0 && (!nearest || d < nearest.days)) {
        nearest = { name: m.name, days: d, health: h };
      }
    }
    return { red, yellow, green, total: missions.length, nearest };
  }, [missions, missionQuestions]);

  const Item = ({
    label,
    count,
    color,
    value,
  }: {
    label: string;
    count: number;
    color: string;
    value: "red" | "yellow" | "green";
  }) => {
    const isActive = activeFilter === value;
    return (
      <button
        type="button"
        onClick={() => onFilterChange(isActive ? "all" : value)}
        className={`group flex items-center gap-2 rounded-md px-2.5 py-1 text-sm transition ${
          isActive ? "bg-foreground/10" : "hover:bg-foreground/5"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="font-semibold tabular-nums">{count}</span>
        <span className="text-muted-foreground">{label}</span>
      </button>
    );
  };

  return (
    <section className="rounded-[12px] border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <Item label="Critical" count={buckets.red} color="bg-red-500" value="red" />
          <span className="text-muted-foreground/40">·</span>
          <Item label="At Risk" count={buckets.yellow} color="bg-amber-400" value="yellow" />
          <span className="text-muted-foreground/40">·</span>
          <Item label="On Track" count={buckets.green} color="bg-emerald-500" value="green" />
          <span className="text-muted-foreground/40">·</span>
          <span className="px-2.5 py-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{buckets.total}</span> Total
          </span>
          {activeFilter !== "all" && (
            <button
              onClick={() => onFilterChange("all")}
              className="ml-1 text-[11px] uppercase tracking-wider text-primary hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
        {buckets.nearest && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>Nearest submission:</span>
            <span className="font-medium text-foreground">{buckets.nearest.name}</span>
            <span>·</span>
            <span className="font-semibold tabular-nums text-foreground">{buckets.nearest.days}d</span>
            <span>·</span>
            <span
              className={
                buckets.nearest.health === "red"
                  ? "text-red-400"
                  : buckets.nearest.health === "yellow"
                  ? "text-amber-400"
                  : "text-emerald-400"
              }
            >
              {buckets.nearest.health === "red"
                ? "Critical"
                : buckets.nearest.health === "yellow"
                ? "At Risk"
                : "On Track"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Attention Panel ─────────────────────────────────────────────────────────

type AttentionItem = {
  id: string;
  type: "critical" | "atrisk" | "intel" | "milestone" | "rec";
  missionId: string;
  missionName: string;
  title: string;
  implication: string;
  actionLabel: string;
  actionTo: string;
  actionParams?: Record<string, string>;
  actionSearch?: Record<string, string>;
};

function buildAttentionItems(
  missions: AcMission[],
  missionQuestions: AcQuestion[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const m of missions) {
    const qs = missionQuestions.filter((q) => q.mission_id === m.id);
    const subDays = daysUntil(m.submission_date);
    const reds = qs.filter((q) => (q.health ?? "").toLowerCase() === "red");
    const yellows = qs.filter((q) => (q.health ?? "").toLowerCase() === "yellow");
    const unassigned = qs.filter((q) => !q.assigned_writer_id);

    // Critical: red questions
    for (const q of reds.slice(0, 2)) {
      items.push({
        id: `crit-${q.id}`,
        type: "critical",
        missionId: m.id,
        missionName: m.name,
        title: `Section ${q.question_number} flagged critical`,
        implication:
          subDays !== null && subDays >= 0
            ? `${subDays} day${subDays === 1 ? "" : "s"} to submission — needs strategic revision.`
            : "Needs strategic revision.",
        actionLabel: "Go to Section",
        actionTo: "/missions/$missionId/sections/$questionId",
        actionParams: { missionId: m.id, questionId: q.id },
      });
    }

    // Critical: unassigned sections close to deadline
    if (unassigned.length >= 2 && subDays !== null && subDays <= 14) {
      items.push({
        id: `unassigned-${m.id}`,
        type: "critical",
        missionId: m.id,
        missionName: m.name,
        title: `${unassigned.length} sections unassigned${
          subDays >= 0 ? `, deadline in ${subDays} days` : ""
        }`,
        implication: "Writers have not been assigned to required sections.",
        actionLabel: "View Sections",
        actionTo: "/missions/$missionId/sections",
        actionParams: { missionId: m.id },
      });
    }

    // At risk: yellow questions
    if (yellows.length > 0) {
      items.push({
        id: `risk-${m.id}`,
        type: "atrisk",
        missionId: m.id,
        missionName: m.name,
        title: `${yellows.length} section${yellows.length === 1 ? "" : "s"} need${
          yellows.length === 1 ? "s" : ""
        } attention`,
        implication: "IRIS health score below threshold — monitor closely.",
        actionLabel: "View Sections",
        actionTo: "/missions/$missionId/sections",
        actionParams: { missionId: m.id },
      });
    }

    // Milestone: submission within 7 days
    if (subDays !== null && subDays >= 0 && subDays <= 7) {
      items.push({
        id: `mile-${m.id}`,
        type: "milestone",
        missionId: m.id,
        missionName: m.name,
        title: `Submission in ${subDays} day${subDays === 1 ? "" : "s"}`,
        implication: "Confirm final QA gate status and section sign-offs.",
        actionLabel: "Mission Brief",
        actionTo: "/missions/$missionId/brief",
        actionParams: { missionId: m.id },
      });
    }
  }
  // Sort: critical > atrisk > intel > milestone > rec
  const order = { critical: 0, atrisk: 1, intel: 2, milestone: 3, rec: 4 } as const;
  items.sort((a, b) => order[a.type] - order[b.type]);
  return items;
}

const ATTN_DISMISS_KEY = "atrium:attn-dismissed:v1";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ATTN_DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveDismissed(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTN_DISMISS_KEY, JSON.stringify([...s]));
  } catch {
    /* noop */
  }
}

export function AttentionPanel({
  missions,
  missionQuestions,
  forceExpanded = false,
  criticalOnly = false,
  dimMissionIds,
}: {
  missions: AcMission[];
  missionQuestions: AcQuestion[];
  forceExpanded?: boolean;
  criticalOnly?: boolean;
  dimMissionIds?: Set<string>;
}) {
  const all = useMemo(
    () => buildAttentionItems(missions, missionQuestions),
    [missions, missionQuestions],
  );
  const [showAll, setShowAll] = useState(!criticalOnly);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const visible = useMemo(
    () =>
      all.filter((i) => {
        if (dismissed.has(i.id)) return false;
        if (criticalOnly && !showAll && !(i.type === "critical" || i.type === "atrisk")) return false;
        return true;
      }),
    [all, dismissed, criticalOnly, showAll],
  );
  const hiddenCount = criticalOnly && !showAll
    ? all.filter((i) => !dismissed.has(i.id) && !(i.type === "critical" || i.type === "atrisk")).length
    : 0;
  const hasCritical = visible.some((i) => i.type === "critical");
  const [open, setOpen] = useState(forceExpanded || hasCritical);
  useEffect(() => {
    setOpen(forceExpanded || hasCritical);
  }, [forceExpanded, hasCritical]);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  };
  const resetAll = () => {
    setDismissed(new Set());
    saveDismissed(new Set());
  };

  if (all.length === 0) return null;
  if (visible.length === 0) {
    return (
      <section className="rounded-[12px] border border-border bg-surface/60 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            All attention items resolved
          </span>
          <button onClick={resetAll} className="text-primary hover:underline">
            Show {all.length} dismissed
          </button>
        </div>
      </section>
    );
  }


  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 hover:bg-foreground/5"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-[color:var(--iris,#22d3ee)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground">
            IRIS Attention Items
          </span>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
            {visible.length}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ul className="divide-y divide-border">
          {visible.map((it) => (
            <AttentionRow
              key={it.id}
              item={it}
              onDismiss={() => dismiss(it.id)}
              dim={dimMissionIds?.has(it.missionId) ?? false}
            />
          ))}
          {hiddenCount > 0 && (
            <li className="px-4 py-2 text-right">
              <button onClick={() => setShowAll(true)} className="text-[11px] text-primary hover:underline">
                Show {hiddenCount} more (At Risk · Intel · Recommendations)
              </button>
            </li>
          )}
          {dismissed.size > 0 && (
            <li className="px-4 py-2 text-right">
              <button onClick={resetAll} className="text-[11px] text-primary hover:underline">
                {dismissed.size} dismissed — show
              </button>
            </li>
          )}
        </ul>
      )}

    </section>
  );
}

function AttentionRow({ item, onDismiss }: { item: AttentionItem; onDismiss: () => void }) {
  const meta =
    item.type === "critical"
      ? {
          icon: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
          label: "CRITICAL",
          labelClass: "text-red-400",
        }
      : item.type === "atrisk"
      ? {
          icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
          label: "AT RISK",
          labelClass: "text-amber-400",
        }
      : item.type === "intel"
      ? {
          icon: <Info className="h-3.5 w-3.5 text-sky-400" />,
          label: "INTEL",
          labelClass: "text-sky-400",
        }
      : item.type === "milestone"
      ? {
          icon: <CalendarClock className="h-3.5 w-3.5 text-emerald-400" />,
          label: "MILESTONE",
          labelClass: "text-emerald-400",
        }
      : {
          icon: <Sparkles className="h-3.5 w-3.5 text-foreground/60" />,
          label: "RECOMMENDATION",
          labelClass: "text-foreground/60",
        };

  return (
    <li className="group px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{meta.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${meta.labelClass}`}>
              {meta.label}
            </span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="truncate text-[12px] font-medium text-foreground">{item.missionName}</span>
          </div>
          <p className="mt-1 text-sm text-foreground">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.implication}</p>
          <div className="mt-2">
            <Link
              to={item.actionTo as never}
              params={(item.actionParams ?? {}) as never}
              search={(item.actionSearch ?? {}) as never}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/10"
            >
              {item.actionLabel} →
            </Link>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="opacity-0 transition group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    </li>
  );
}

// ── Due This Week strip ─────────────────────────────────────────────────────

export function DueThisWeek({
  missions,
  missionQuestions,
}: {
  missions: AcMission[];
  missionQuestions: AcQuestion[];
}) {
  const missionName = useMemo(
    () => new Map(missions.map((m) => [m.id, m.name] as const)),
    [missions],
  );
  const groups = useMemo(() => {
    const map = new Map<string, AcQuestion[]>(); // key: ISO date (yyyy-mm-dd)
    for (const q of missionQuestions) {
      if (!q.pens_down_date) continue;
      const d = daysUntil(q.pens_down_date);
      if (d === null || d < 0 || d > 7) continue;
      const key = q.pens_down_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(q);
      map.set(key, arr);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([iso, qs]) => ({ iso, days: daysUntil(iso)!, qs }));
  }, [missionQuestions]);

  if (groups.length === 0) return null;

  const labelFor = (days: number, iso: string) => {
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const toneFor = (days: number) =>
    days <= 1 ? "text-red-400" : days <= 5 ? "text-amber-400" : "text-foreground";

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Due This Week
        </span>
      </div>
      <ul className="divide-y divide-border">
        {groups.map((g) => (
          <li key={g.iso} className="flex items-start gap-4 px-4 py-2.5 text-sm">
            <span
              className={`w-24 shrink-0 font-medium tabular-nums ${toneFor(g.days)}`}
            >
              {labelFor(g.days, g.iso)}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              {g.qs.map((q) => (
                <Link
                  key={q.id}
                  to="/missions/$missionId/sections/$questionId"
                  params={{ missionId: q.mission_id, questionId: q.id }}
                  className="block truncate text-foreground/90 hover:text-primary"
                >
                  <span className="text-muted-foreground">
                    {missionName.get(q.mission_id) ?? "Mission"}:
                  </span>{" "}
                  <span className="font-medium">Section {q.question_number}</span>{" "}
                  <span className="text-muted-foreground">— {q.title}</span>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Morning Briefing ────────────────────────────────────────────────────────

const BRIEF_DISMISS_KEY = "atrium:morningbrief-dismissed-session";

export type BriefItem = {
  id: string;
  missionName: string;
  text: string;
};

export function MorningBriefing({ items }: { items: BriefItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (items.length === 0) return;
    if (window.sessionStorage.getItem(BRIEF_DISMISS_KEY) === "1") return;
    setOpen(true);
    const t = window.setTimeout(() => setOpen(false), 8000);
    return () => window.clearTimeout(t);
  }, [items.length]);

  if (!open || items.length === 0) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(BRIEF_DISMISS_KEY, "1");
    } catch { /* noop */ }
  };

  return (
    <section
      className="rounded-[12px] border px-4 py-3"
      style={{
        borderColor: "rgba(99,102,241,0.4)",
        background: "linear-gradient(135deg, rgba(99,102,241,0.10), rgba(99,102,241,0.02))",
      }}
    >
      <div className="flex items-start gap-3">
        <Zap className="mt-0.5 h-3.5 w-3.5" style={{ color: "#6366F1" }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#818cf8" }}
            >
              IRIS Briefing
            </span>
            <span className="text-[10px] text-muted-foreground">· since your last visit</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-foreground/90">
            {items.slice(0, 4).map((b) => (
              <li key={b.id}>
                <span className="text-muted-foreground">·</span>{" "}
                <span className="font-medium">{b.missionName}:</span> {b.text}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

// ── Mission filter / sort bar ───────────────────────────────────────────────

export type MissionSort = "submission" | "health" | "activity" | "alpha";

export function MissionFilterBar({
  total,
  search,
  onSearchChange,
  sort,
  onSortChange,
  healthFilter,
  onHealthChange,
}: {
  total: number;
  search: string;
  onSearchChange: (v: string) => void;
  sort: MissionSort;
  onSortChange: (s: MissionSort) => void;
  healthFilter: "all" | "red" | "yellow" | "green";
  onHealthChange: (h: "all" | "red" | "yellow" | "green") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-surface/60 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Active Missions ({total})
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as MissionSort)}
            className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="submission">Submission Date</option>
            <option value="health">IRIS Health Score</option>
            <option value="activity">Last Activity</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </label>
        <label className="text-[11px] text-muted-foreground">
          Health
          <select
            value={healthFilter}
            onChange={(e) => onHealthChange(e.target.value as "all" | "red" | "yellow" | "green")}
            className="ml-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Health</option>
            <option value="red">Critical Only</option>
            <option value="yellow">At Risk</option>
            <option value="green">On Track</option>
          </select>
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search missions…"
          className="w-56 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

export function sortAndFilterMissions(
  missions: AcMission[],
  missionQuestions: AcQuestion[],
  lastSignal: Record<string, string | null>,
  opts: {
    sort: MissionSort;
    health: "all" | "red" | "yellow" | "green";
    search: string;
  },
): AcMission[] {
  const q = opts.search.trim().toLowerCase();
  let out = missions.filter((m) => {
    if (q) {
      const hay = `${m.name} ${m.client ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (opts.health !== "all") {
      const qs = missionQuestions.filter((x) => x.mission_id === m.id);
      const h = computeMissionHealth(m, qs);
      if (h !== opts.health) return false;
    }
    return true;
  });
  const healthScore = (m: AcMission) => {
    const qs = missionQuestions.filter((x) => x.mission_id === m.id);
    const h = computeMissionHealth(m, qs);
    return h === "red" ? 0 : h === "yellow" ? 1 : 2;
  };
  out = [...out].sort((a, b) => {
    if (opts.sort === "alpha") return a.name.localeCompare(b.name);
    if (opts.sort === "health") return healthScore(a) - healthScore(b);
    if (opts.sort === "activity") {
      const ta = lastSignal[a.id] ? new Date(lastSignal[a.id]!).getTime() : 0;
      const tb = lastSignal[b.id] ? new Date(lastSignal[b.id]!).getTime() : 0;
      return tb - ta;
    }
    // submission
    const da = a.submission_date ? new Date(a.submission_date).getTime() : Infinity;
    const db = b.submission_date ? new Date(b.submission_date).getTime() : Infinity;
    return da - db;
  });
  return out;
}
