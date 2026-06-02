import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal, relativeTime } from "@/lib/signals";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Activity, AlertOctagon, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/attention")({
  component: AttentionView,
});

type RealityUpdate = {
  id: string;
  question_id: string;
  mission_id: string;
  user_name: string;
  signal_type: "learned" | "need" | "unchanged";
  need_type: "direction" | "decision" | "help" | "air_cover" | null;
  details: string | null;
  resolved: boolean;
  created_at: string;
};

const NEED_BADGE: Record<string, { label: string; cls: string }> = {
  direction: { label: "NEED DIRECTION", cls: "border-blue-500/40 bg-blue-500/10 text-blue-400" },
  decision: { label: "NEED DECISION", cls: "border-purple-500/40 bg-purple-500/10 text-purple-400" },
  help: { label: "NEED HELP", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  air_cover: { label: "NEED AIR COVER", cls: "border-red-500/40 bg-red-500/10 text-red-400" },
};

function AttentionView() {
  const qc = useQueryClient();
  const [respondTo, setRespondTo] = useState<RealityUpdate | null>(null);

  // Attention needed: unresolved 'need' signals
  const { data: needs = [] } = useQuery({
    queryKey: ["attention-needs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("id,question_id,mission_id,user_name,signal_type,need_type,details,resolved,created_at")
        .eq("signal_type", "need")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return (data ?? []) as RealityUpdate[];
    },
    refetchInterval: 60_000,
  });

  // Gates approaching (next 30 days)
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const { data: gates = [] } = useQuery({
    queryKey: ["attention-gates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date,mission_id")
        .lte("target_date", in30)
        .gte("target_date", new Date().toISOString().slice(0, 10))
        .order("target_date", { ascending: true });
      return data ?? [];
    },
  });

  // What's changed (last 48h)
  const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: changed = [] } = useQuery({
    queryKey: ["attention-changed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reality_updates")
        .select("id,question_id,mission_id,user_name,signal_type,need_type,details,created_at")
        .gte("created_at", since48)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  // Responses at risk: no RU in 7d AND pens_down within 21d
  const { data: atRisk = [] } = useQuery({
    queryKey: ["attention-at-risk"],
    queryFn: async () => {
      const in21 = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const { data: qs } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,assigned_writer_id")
        .lte("pens_down_date", in21)
        .gte("pens_down_date", today);
      if (!qs || qs.length === 0) return [];
      const ids = qs.map((q) => q.id);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recent } = await supabase
        .from("reality_updates")
        .select("question_id")
        .in("question_id", ids)
        .gte("created_at", sevenDaysAgo);
      const recentSet = new Set((recent ?? []).map((r: any) => r.question_id));
      return qs.filter((q) => !recentSet.has(q.id));
    },
  });

  // Mission name & question title lookups
  const allQids = Array.from(new Set([
    ...needs.map((n) => n.question_id),
    ...changed.map((c: any) => c.question_id),
  ]));
  const allMids = Array.from(new Set([
    ...needs.map((n) => n.mission_id),
    ...changed.map((c: any) => c.mission_id),
    ...gates.map((g: any) => g.mission_id),
    ...atRisk.map((q: any) => q.mission_id),
  ]));
  const allWids = Array.from(new Set(atRisk.map((q: any) => q.assigned_writer_id).filter(Boolean)));

  const { data: qLookup = {} } = useQuery<Record<string, { question_number: string; title: string }>>({
    queryKey: ["attention-q-lookup", allQids.join(",")],
    enabled: allQids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("question_records").select("id,question_number,title").in("id", allQids);
      return Object.fromEntries((data ?? []).map((q: any) => [q.id, { question_number: q.question_number, title: q.title }]));
    },
  });

  const { data: mLookup = {} } = useQuery<Record<string, string>>({
    queryKey: ["attention-m-lookup", allMids.join(",")],
    enabled: allMids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", allMids);
      return Object.fromEntries((data ?? []).map((m: any) => [m.id, m.name]));
    },
  });

  const { data: wLookup = {} } = useQuery<Record<string, string>>({
    queryKey: ["attention-w-lookup", allWids.join(",")],
    enabled: allWids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", allWids);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.display_name || p.email]));
    },
  });

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 space-y-10">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Bridge</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Attention</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">What matters today across every mission.</p>
      </div>

      {/* Attention Needed */}
      <Section
        icon={<AlertOctagon className="h-3.5 w-3.5 text-destructive" />}
        title="Attention Needed"
        count={needs.length}
      >
        {needs.length === 0 ? (
          <Empty>No outstanding requests. The line is quiet.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {needs.map((n) => {
              const badge = n.need_type ? NEED_BADGE[n.need_type] : null;
              const q = qLookup[n.question_id];
              return (
                <li key={n.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {badge && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                        <Link
                          to="/missions/$missionId/questions/$questionId"
                          params={{ missionId: n.mission_id, questionId: n.question_id }}
                          className="text-sm font-medium hover:text-primary"
                        >
                          {q ? `${q.question_number} — ${q.title}` : "Response"}
                        </Link>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {mLookup[n.mission_id] ?? "—"}
                        </span>
                      </div>
                      {n.details && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.details.slice(0, 80)}{n.details.length > 80 ? "…" : ""}</p>
                      )}
                      <div className="text-[10px] text-muted-foreground">{n.user_name} · {relativeTime(n.created_at)}</div>
                    </div>
                    <button
                      onClick={() => setRespondTo(n)}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Respond
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Gates Approaching */}
      <Section
        icon={<CalendarClock className="h-3.5 w-3.5 text-primary" />}
        title="Gates Approaching"
        count={gates.length}
      >
        {gates.length === 0 ? (
          <Empty>No gates in the next 30 days.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {gates.map((g: any) => {
              const days = Math.ceil((new Date(g.target_date).getTime() - Date.now()) / 86400000);
              const tone = days < 7 ? "text-destructive" : days < 14 ? "text-amber-400" : "text-emerald-400";
              return (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="font-medium">{g.gate_name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{mLookup[g.mission_id] ?? "—"}</span>
                  <span className="flex-1 text-xs text-muted-foreground">{new Date(g.target_date).toLocaleDateString()}</span>
                  <span className={`text-sm font-semibold tabular-nums ${tone}`}>{days}d</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* What's Changed */}
      <Section
        icon={<Activity className="h-3.5 w-3.5 text-primary" />}
        title="What's Changed"
        count={changed.length}
        hint="Last 48 hours"
      >
        {changed.length === 0 ? (
          <Empty>No reality updates in the last 48 hours.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {changed.map((c: any) => {
              const q = qLookup[c.question_id];
              const cls =
                c.signal_type === "learned" ? "text-emerald-400"
                : c.signal_type === "need" ? "text-amber-400"
                : "text-muted-foreground";
              return (
                <li key={c.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
                      {c.signal_type}
                    </span>
                    <Link
                      to="/missions/$missionId/questions/$questionId"
                      params={{ missionId: c.mission_id, questionId: c.question_id }}
                      className="hover:text-primary"
                    >
                      {q ? `${q.question_number} — ${q.title}` : "Response"}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">· {c.user_name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(c.created_at)}</span>
                  </div>
                  {c.details && <p className="mt-1 text-xs text-muted-foreground">{c.details.slice(0, 120)}{c.details.length > 120 ? "…" : ""}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Responses at Risk */}
      <Section
        icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
        title="Responses at Risk"
        count={atRisk.length}
        hint="Silent 7d+ · pens down within 21d"
      >
        {atRisk.length === 0 ? (
          <Empty>Every at-risk response has recent activity.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {atRisk.map((q: any) => {
              const days = q.pens_down_date
                ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
                : null;
              const tone = days !== null && days < 7 ? "text-destructive" : "text-amber-400";
              return (
                <li key={q.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Link
                    to="/missions/$missionId/questions/$questionId"
                    params={{ missionId: q.mission_id, questionId: q.id }}
                    className="font-medium hover:text-primary"
                  >
                    {q.question_number} — {q.title}
                  </Link>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{mLookup[q.mission_id] ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{q.assigned_writer_id ? wLookup[q.assigned_writer_id] ?? "—" : "Unassigned"}</span>
                  {days !== null && <span className={`ml-auto text-sm font-semibold tabular-nums ${tone}`}>{days}d</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {respondTo && (
        <RespondDrawer
          update={respondTo}
          onClose={() => setRespondTo(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["attention-needs"] });
            setRespondTo(null);
          }}
        />
      )}
    </div>
  );
}

function Section({
  icon, title, count, hint, children,
}: { icon: React.ReactNode; title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
          {count > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{count}</span>
          )}
        </div>
        {hint && <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function RespondDrawer({
  update, onClose, onDone,
}: { update: RealityUpdate; onClose: () => void; onDone: () => void }) {
  const [guidance, setGuidance] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!guidance.trim()) return;
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from("question_records")
        .update({ guidance: guidance.trim() })
        .eq("id", update.question_id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("reality_updates")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", update.id);
      if (e2) throw e2;

      await createSignal({
        mission_id: update.mission_id,
        source_module: "attention_view",
        signal_type: "leadership_guidance_added",
        signal_title: "Leadership guidance added",
        signal_summary: guidance.trim().slice(0, 200),
        severity: "info",
        related_question_id: update.question_id,
      });

      toast.success("Guidance sent.");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md border-l border-border bg-background p-6 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Respond</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground space-y-1">
          <div>{update.user_name} · {relativeTime(update.created_at)}</div>
          {update.details && <div className="text-foreground/80">{update.details}</div>}
        </div>
        <label className="mt-4 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Your guidance</label>
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={6}
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary/60 focus:outline-none"
          placeholder="Give them the direction they need…"
          autoFocus
        />
        <button
          onClick={submit}
          disabled={saving || !guidance.trim()}
          className="mt-3 w-full rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Sending…" : "Send guidance & resolve"}
        </button>
      </div>
    </div>
  );
}
