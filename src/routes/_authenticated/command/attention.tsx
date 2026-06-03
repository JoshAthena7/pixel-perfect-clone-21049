import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";
import { CalendarClock, Activity, Users, AlertTriangle, Radio, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/attention")({
  component: CommandCenter,
});

type RealityUpdate = {
  id: string;
  question_id: string;
  mission_id: string;
  user_id: string | null;
  user_name: string;
  signal_type: "learned" | "need" | "unchanged";
  need_type: "direction" | "decision" | "help" | "air_cover" | null;
  details: string | null;
  resolved: boolean;
  created_at: string;
};

type CollabEntry = {
  id: string;
  question_id: string;
  mission_id: string;
  author_id: string | null;
  author_name: string;
  entry_type: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

const NEED_LABEL: Record<string, string> = {
  decision_needed: "Decision Needed",
  sme_request: "Needs Help",
  air_cover: "Air Cover",
  direction: "Decision Needed",
  decision: "Decision Needed",
  help: "Needs Help",
  air_cover_need: "Air Cover",
};

const NEED_TONE: Record<string, string> = {
  decision_needed: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  sme_request: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  air_cover: "border-red-500/40 bg-red-500/10 text-red-300",
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function firstName(name: string) {
  return (name || "").split(/\s+/)[0] || "—";
}

function CommandCenter() {
  const qc = useQueryClient();

  // -------- Section 1: Health bar (all questions across missions) --------
  const { data: healthCounts = { total: 0, green: 0, yellow: 0, red: 0 } } = useQuery({
    queryKey: ["cc-health"],
    queryFn: async () => {
      const { data } = await supabase.from("question_records").select("health");
      const c = { total: 0, green: 0, yellow: 0, red: 0 };
      for (const r of data ?? []) {
        c.total++;
        if (r.health === "green") c.green++;
        else if (r.health === "red") c.red++;
        else c.yellow++;
      }
      return c;
    },
    refetchInterval: 60_000,
  });

  // -------- Section 2: Team Needs --------
  // Sources: question_collaboration (decision_needed, sme_request, air_cover) unresolved,
  // PLUS reality_updates with signal_type='need' unresolved.
  const { data: collabNeeds = [] } = useQuery({
    queryKey: ["cc-collab-needs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,author_id,author_name,entry_type,body,resolved,created_at")
        .in("entry_type", ["decision_needed", "sme_request", "air_cover"])
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return (data ?? []) as CollabEntry[];
    },
    refetchInterval: 60_000,
  });

  const { data: realityNeeds = [] } = useQuery({
    queryKey: ["cc-reality-needs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("id,question_id,mission_id,user_id,user_name,signal_type,need_type,details,resolved,created_at")
        .eq("signal_type", "need")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return (data ?? []) as RealityUpdate[];
    },
    refetchInterval: 60_000,
  });

  type Need = {
    source: "collab" | "reality";
    id: string;
    question_id: string;
    mission_id: string;
    author_name: string;
    type_key: string;
    label: string;
    body: string;
    created_at: string;
  };

  const needs: Need[] = useMemo(() => {
    const a: Need[] = collabNeeds.map((c) => ({
      source: "collab",
      id: c.id,
      question_id: c.question_id,
      mission_id: c.mission_id,
      author_name: c.author_name,
      type_key: c.entry_type,
      label: NEED_LABEL[c.entry_type] ?? c.entry_type,
      body: c.body,
      created_at: c.created_at,
    }));
    const b: Need[] = realityNeeds
      .filter((r) => r.need_type) // skip if no need_type
      .map((r) => {
        const map: Record<string, { key: string; label: string }> = {
          decision: { key: "decision_needed", label: "Decision Needed" },
          direction: { key: "decision_needed", label: "Decision Needed" },
          help: { key: "sme_request", label: "Needs Help" },
          air_cover: { key: "air_cover", label: "Air Cover" },
        };
        const m = map[r.need_type as string] ?? { key: "sme_request", label: "Needs Help" };
        return {
          source: "reality" as const,
          id: r.id,
          question_id: r.question_id,
          mission_id: r.mission_id,
          author_name: r.user_name,
          type_key: m.key,
          label: m.label,
          body: r.details ?? "",
          created_at: r.created_at,
        };
      });
    return [...a, ...b].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
  }, [collabNeeds, realityNeeds]);

  // -------- Section 3: Responses At Risk --------
  const { data: atRisk = [] } = useQuery({
    queryKey: ["cc-at-risk"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const { data: qs } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,health,health_drivers,current_score,pens_down_date,assigned_writer_id");
      const allQs = qs ?? [];
      const { data: conflicts } = await supabase
        .from("alignment_conflicts")
        .select("question_a_id,question_b_id,severity")
        .is("resolved_at", null)
        .eq("severity", "critical");
      const conflictQs = new Set<string>();
      for (const c of conflicts ?? []) {
        if (c.question_a_id) conflictQs.add(c.question_a_id);
        if (c.question_b_id) conflictQs.add(c.question_b_id);
      }

      const result = allQs
        .map((q: any) => {
          const days = q.pens_down_date
            ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
            : null;
          const within14 = q.pens_down_date && q.pens_down_date <= in14 && q.pens_down_date >= today;
          let reason: string | null = null;
          if (!q.assigned_writer_id && within14) reason = "No writer assigned";
          else if (conflictQs.has(q.id)) reason = "Alignment conflict — unresolved";
          else if (q.health === "red") {
            const drivers = q.health_drivers && typeof q.health_drivers === "object"
              ? Object.entries(q.health_drivers).find(([, v]) => v && v !== "ok" && v !== "green")
              : null;
            reason = drivers ? `Health: Red · ${String(drivers[0]).replace(/_/g, " ")}` : "Health: Red";
          } else if (q.current_score !== null && Number(q.current_score) < 3.0 && within14) {
            reason = `Below standard · ${days}d`;
          }
          return reason ? { ...q, days, reason } : null;
        })
        .filter(Boolean) as any[];
      return result.sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    },
    refetchInterval: 60_000,
  });

  // -------- Section 4: Gates Approaching --------
  const { data: gates = [] } = useQuery({
    queryKey: ["cc-gates"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: gs } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date,mission_id")
        .gte("target_date", today)
        .order("target_date", { ascending: true });
      const gates = gs ?? [];
      // Per mission, count questions not at standard
      const missionIds = Array.from(new Set(gates.map((g: any) => g.mission_id)));
      let notReady: Record<string, number> = {};
      if (missionIds.length > 0) {
        const { data: qs } = await supabase
          .from("question_records")
          .select("mission_id,current_score,health")
          .in("mission_id", missionIds);
        for (const q of qs ?? []) {
          const sub = Number(q.current_score ?? 0) < 4.5 || q.health !== "green";
          if (sub) notReady[q.mission_id] = (notReady[q.mission_id] ?? 0) + 1;
        }
      }
      return gates.map((g: any) => ({ ...g, notReady: notReady[g.mission_id] ?? 0 }));
    },
  });

  // -------- Section 5: What Changed (last 24h) --------
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: changedCollab = [] } = useQuery({
    queryKey: ["cc-changed-collab"],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,author_id,author_name,entry_type,body,created_at")
        .gte("created_at", since24)
        .neq("entry_type", "leadership_guidance")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
  const { data: changedReality = [] } = useQuery({
    queryKey: ["cc-changed-reality"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("id,question_id,mission_id,user_id,user_name,signal_type,need_type,details,created_at")
        .gte("created_at", since24)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  type Activity = {
    id: string;
    kind: "collab" | "reality";
    question_id: string;
    mission_id: string;
    author_name: string;
    label: string;
    body: string;
    created_at: string;
  };
  const activity: Activity[] = useMemo(() => {
    const fromCollab: Activity[] = (changedCollab as any[]).map((c) => {
      const lbl: Record<string, string> = {
        decision_needed: "Requested decision",
        sme_request: "Requested help",
        air_cover: "Requested air cover",
        note: "Shared intelligence",
        comment: "Shared intelligence",
      };
      return {
        id: `c-${c.id}`,
        kind: "collab",
        question_id: c.question_id,
        mission_id: c.mission_id,
        author_name: c.author_name,
        label: lbl[c.entry_type] ?? c.entry_type.replace(/_/g, " "),
        body: c.body ?? "",
        created_at: c.created_at,
      };
    });
    const fromReality: Activity[] = (changedReality as any[]).map((r) => {
      let label = "Checked in";
      if (r.signal_type === "learned") label = "Shared intelligence";
      else if (r.signal_type === "need") {
        const map: Record<string, string> = {
          decision: "Requested decision",
          direction: "Requested decision",
          help: "Requested help",
          air_cover: "Requested air cover",
        };
        label = map[r.need_type ?? ""] ?? "Requested help";
      } else if (r.signal_type === "unchanged") label = "Checked in";
      return {
        id: `r-${r.id}`,
        kind: "reality",
        question_id: r.question_id,
        mission_id: r.mission_id,
        author_name: r.user_name,
        label,
        body: r.details ?? "",
        created_at: r.created_at,
      };
    });
    return [...fromCollab, ...fromReality].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [changedCollab, changedReality]);

  // -------- Lookups --------
  const allQids = Array.from(new Set([
    ...needs.map((n) => n.question_id),
    ...atRisk.map((q: any) => q.id),
    ...activity.map((a) => a.question_id),
  ].filter(Boolean)));
  const allMids = Array.from(new Set([
    ...needs.map((n) => n.mission_id),
    ...atRisk.map((q: any) => q.mission_id),
    ...activity.map((a) => a.mission_id),
    ...gates.map((g: any) => g.mission_id),
  ].filter(Boolean)));

  const { data: qLookup = {} } = useQuery<Record<string, { question_number: string; title: string }>>({
    queryKey: ["cc-q-lookup", allQids.join(",")],
    enabled: allQids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("question_records").select("id,question_number,title").in("id", allQids);
      return Object.fromEntries((data ?? []).map((q: any) => [q.id, { question_number: q.question_number, title: q.title }]));
    },
  });
  const { data: mLookup = {} } = useQuery<Record<string, string>>({
    queryKey: ["cc-m-lookup", allMids.join(",")],
    enabled: allMids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", allMids);
      return Object.fromEntries((data ?? []).map((m: any) => [m.id, m.name]));
    },
  });

  const [broadcastOpen, setBroadcastOpen] = useState(false);

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-8 space-y-8">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Brief</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">The Brief</h1>
      </div>

      {/* Section 1: Health bar */}
      <div className="rounded-[12px] border border-border bg-surface px-5 py-3 flex items-center gap-6 text-sm">
        <span className="font-semibold tabular-nums">{healthCounts.total}</span>
        <span className="text-muted-foreground">Questions</span>
        <span className="text-border">·</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> <span className="font-medium tabular-nums">{healthCounts.green}</span> <span className="text-muted-foreground">Green</span></span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> <span className="font-medium tabular-nums">{healthCounts.yellow}</span> <span className="text-muted-foreground">Yellow</span></span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> <span className="font-medium tabular-nums">{healthCounts.red}</span> <span className="text-muted-foreground">Red</span></span>
      </div>

      {/* Section 2: Team Needs */}
      <Section
        icon={<Users className="h-3.5 w-3.5" />}
        title="Team Needs"
        badge={<CountBadge count={needs.length} tone={needs.length > 0 ? "amber" : "green"} />}
      >
        {needs.length === 0 ? (
          <Empty>No open team needs. The team is operating independently.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {needs.map((n) => (
              <NeedRow
                key={`${n.source}-${n.id}`}
                need={n}
                q={qLookup[n.question_id]}
                onResolved={() => {
                  qc.invalidateQueries({ queryKey: ["cc-collab-needs"] });
                  qc.invalidateQueries({ queryKey: ["cc-reality-needs"] });
                }}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* Section 3: Responses at Risk */}
      <Section
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        title="Responses at Risk"
        badge={<CountBadge count={atRisk.length} tone={atRisk.length > 0 ? "amber" : "green"} />}
      >
        {atRisk.length === 0 ? (
          <Empty>No responses at risk. All questions on track.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {atRisk.map((q: any) => (
              <li key={q.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${q.health === "red" ? "bg-red-500" : q.health === "yellow" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="font-medium shrink-0">Q{q.question_number}</span>
                <span className="truncate flex-1 min-w-0">{q.title}</span>
                <span className="text-xs text-amber-300 shrink-0">{q.reason}</span>
                {q.days !== null && (
                  <span className={`text-xs tabular-nums shrink-0 ${q.days < 7 ? "text-red-400" : "text-muted-foreground"}`}>{q.days}d</span>
                )}
                <Link
                  to="/missions/$missionId/questions/$questionId"
                  params={{ missionId: q.mission_id, questionId: q.id }}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Section 4: Gates Approaching */}
      <Section
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        title="Gates Approaching"
      >
        {gates.length === 0 ? (
          <Empty>
            No review gates scheduled. <Link to={"/missions" as any} className="text-primary hover:underline">Add gates in Mission Settings →</Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {gates.map((g: any) => {
              const days = Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86400000);
              const tone = days < 7 ? "text-red-400" : days < 14 ? "text-amber-400" : "text-muted-foreground";
              return (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="font-medium">{g.gate_name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{mLookup[g.mission_id] ?? ""}</span>
                  <span className={`text-xs tabular-nums ${tone}`}>{new Date(g.target_date).toLocaleDateString()}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">{g.notReady}</span> questions not yet at standard
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Section 5: What Changed */}
      <Section
        icon={<Activity className="h-3.5 w-3.5" />}
        title="What Changed"
        hint="Last 24 hours"
        action={
          <button
            onClick={() => setBroadcastOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-2.5 py-1 text-[11px] font-medium hover:bg-surface"
          >
            <Radio className="h-3 w-3" /> Broadcast to Team
          </button>
        }
      >
        {activity.length === 0 ? (
          <Empty>No signals in the last 24 hours.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((a) => (
              <ActivityRow key={a.id} a={a} q={qLookup[a.question_id]} />
            ))}
          </ul>
        )}
      </Section>

      {/* Footer link */}
      <div className="pt-2 text-center">
        <Link
          to={"/command/question-health" as any}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Mission Health — Score dashboard, alignment conflicts, full question list →
        </Link>
      </div>

      {broadcastOpen && <BroadcastModal onClose={() => setBroadcastOpen(false)} />}
    </div>
  );
}

function Section({
  icon, title, hint, badge, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
          {badge}
          {hint && <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">· {hint}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CountBadge({ count, tone }: { count: number; tone: "amber" | "green" }) {
  const cls = tone === "amber" && count > 0
    ? "bg-amber-500/15 text-amber-300"
    : "bg-emerald-500/15 text-emerald-300";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>{count}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function NeedRow({ need, q, onResolved }: { need: any; q?: { question_number: string; title: string }; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: prof } = u.user
        ? await supabase.from("profiles").select("display_name,email").eq("id", u.user.id).maybeSingle()
        : { data: null };
      const authorName = prof?.display_name ?? prof?.email?.split("@")[0] ?? "Leader";

      const { error: e1 } = await supabase.from("question_collaboration").insert({
        question_id: need.question_id,
        mission_id: need.mission_id,
        author_id: u.user?.id,
        author_name: authorName,
        entry_type: "leadership_guidance",
        body: text.trim(),
      });
      if (e1) throw e1;

      if (need.source === "collab") {
        await supabase
          .from("question_collaboration")
          .update({ resolved: true, resolved_by: u.user?.id, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      } else {
        await supabase
          .from("reality_updates")
          .update({ resolved: true, resolved_by: u.user?.id, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      }

      setDone(`Response sent to ${firstName(need.author_name)}.`);
      setTimeout(onResolved, 2000);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (need.source === "collab") {
        await supabase
          .from("question_collaboration")
          .update({ resolved: true, resolved_by: u.user?.id, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      } else {
        await supabase
          .from("reality_updates")
          .update({ resolved: true, resolved_by: u.user?.id, resolved_at: new Date().toISOString() })
          .eq("id", need.id);
      }
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const tone = NEED_TONE[need.type_key] ?? "border-border bg-muted text-muted-foreground";

  if (done) {
    return <li className="px-5 py-4 text-sm text-emerald-300">{done}</li>;
  }

  return (
    <li className="px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 shrink-0 rounded-full bg-muted text-[10px] font-semibold uppercase flex items-center justify-center text-muted-foreground">
          {initials(need.author_name)}
        </div>
        <span className="text-sm font-medium shrink-0">{firstName(need.author_name)}</span>
        <span className="text-border">·</span>
        {q ? (
          <Link
            to="/missions/$missionId/questions/$questionId"
            params={{ missionId: need.mission_id, questionId: need.question_id }}
            className="text-sm hover:text-primary truncate min-w-0 flex-1"
          >
            Q{q.question_number} — {q.title}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground flex-1">General</span>
        )}
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>
          {need.label}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(need.created_at)}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          Respond →
        </button>
      </div>
      {need.body && (
        <p className="mt-1.5 ml-10 text-xs text-muted-foreground line-clamp-2">{need.body}</p>
      )}
      {open && (
        <div className="mt-3 ml-10 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Type your guidance or decision..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send Response"}
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ActivityRow({ a, q }: { a: any; q?: { question_number: string; title: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-2.5 text-sm cursor-pointer hover:bg-surface-hover" onClick={() => setOpen((v) => !v)}>
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-6 shrink-0 rounded-full bg-muted text-[9px] font-semibold uppercase flex items-center justify-center text-muted-foreground">
          {initials(a.author_name)}
        </div>
        <span className="font-medium shrink-0">{firstName(a.author_name)}</span>
        <span className="text-border">·</span>
        <span className="text-muted-foreground shrink-0">{q ? `Q${q.question_number}` : "Mission"}</span>
        <span className="text-border">·</span>
        <span className="text-xs text-muted-foreground flex-1 truncate">{a.label}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(a.created_at)}</span>
      </div>
      {open && a.body && (
        <p className="mt-2 ml-8 text-xs text-muted-foreground whitespace-pre-wrap">{a.body}</p>
      )}
    </li>
  );
}

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [fromName, setFromName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("profiles").select("display_name,email").eq("id", data.user.id).maybeSingle()
        .then(({ data: p }) => setFromName(p?.display_name ?? data.user!.email?.split("@")[0] ?? ""));
    });
  }, []);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("broadcasts").insert({
        user_id: u.user.id,
        from_name: fromName.trim() || "Leadership",
        text: text.trim(),
        mission_id: null,
      });
      if (error) throw error;
      toast.success("Broadcast sent");
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[12px] border border-border bg-background p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Broadcast to Team</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Message to the full mission team..."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-hover">Cancel</button>
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Broadcast"}
          </button>
        </div>
      </div>
    </div>
  );
}
