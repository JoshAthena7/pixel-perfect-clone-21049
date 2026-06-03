import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime, createSignal } from "@/lib/signals";
import { ArrowRight, Megaphone, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AmendmentDashboardBanner } from "@/components/AmendmentDashboardBanner";
import { MissionRoomHero, EnterStudioCTA } from "@/components/v2/MissionRoomHero";

export const Route = createFileRoute("/_authenticated/missions/$missionId/overview")({
  component: MissionOverviewPage,
});

type Question = {
  id: string;
  question_number: string;
  title: string;
  health: string | null;
  current_score: number | null;
  status: string | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  health_drivers: Record<string, string> | null;
};

type Collab = {
  id: string;
  question_id: string | null;
  mission_id: string;
  entry_type: string;
  body: string | null;
  author_id: string | null;
  author_name: string;
  created_at: string;
  resolved: boolean;
};

type Conflict = {
  id: string;
  question_a_id: string;
  question_b_id: string;
  severity: string | null;
  resolved_at: string | null;
};

type Gate = {
  id: string;
  gate_name: string;
  target_date: string | null;
  gate_order: number;
};

type Note = { id: string; from_name: string; text: string; created_at: string };

type Signal = {
  id: string;
  signal_type: string;
  signal_title: string;
  signal_summary: string | null;
  created_at: string;
  related_question_id: string | null;
  user_id: string | null;
};

const NEED_TYPES = ["decision_needed", "sme_request", "air_cover"] as const;
const NEED_LABEL: Record<string, string> = {
  decision_needed: "Requested decision",
  sme_request: "Requested help",
  air_cover: "Requested air cover",
  note: "Shared intelligence",
  leadership_guidance: "Guidance given",
};

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}
function firstName(name: string | null | undefined): string {
  if (!name) return "Someone";
  return name.trim().split(/\s+/)[0];
}
function daysTo(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function MissionOverviewPage() {
  const { missionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── DATA ──────────────────────────────────────────────
  const { data: me } = useQuery({
    queryKey: ["overview-me", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const [{ data: prof }, { data: mem }] = await Promise.all([
        supabase.from("profiles").select("id,display_name,email").eq("id", user.id).maybeSingle(),
        supabase.from("mission_members").select("role").eq("mission_id", missionId).eq("user_id", user.id).maybeSingle(),
      ]);
      return {
        id: user.id,
        name: prof?.display_name ?? prof?.email?.split("@")[0] ?? "Leader",
        role: mem?.role ?? null,
      };
    },
  });
  const isLeader = me?.role === "admin" || me?.role === "lead";

  const { data: mission } = useQuery({
    queryKey: ["overview-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["overview-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,health,current_score,status,pens_down_date,assigned_writer_id,health_drivers")
        .eq("mission_id", missionId);
      return (data ?? []) as Question[];
    },
  });

  const { data: needs = [] } = useQuery<Collab[]>({
    queryKey: ["overview-needs", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,entry_type,body,author_id,author_name,created_at,resolved")
        .eq("mission_id", missionId)
        .eq("resolved", false)
        .in("entry_type", NEED_TYPES as unknown as string[])
        .order("created_at", { ascending: true });
      return (data ?? []) as Collab[];
    },
  });

  const { data: conflicts = [] } = useQuery<Conflict[]>({
    queryKey: ["overview-conflicts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("id,question_a_id,question_b_id,severity,resolved_at")
        .eq("mission_id", missionId)
        .is("resolved_at", null);
      return (data ?? []) as Conflict[];
    },
  });

  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ["overview-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date,gate_order")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  const since24h = useMemo(() => new Date(Date.now() - 86400000).toISOString(), []);

  const { data: recentSignals = [] } = useQuery<Signal[]>({
    queryKey: ["overview-signals-24h", missionId, since24h],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,signal_type,signal_title,signal_summary,created_at,related_question_id,user_id")
        .eq("mission_id", missionId)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false });
      return (data ?? []) as Signal[];
    },
  });

  const { data: recentCollab = [] } = useQuery<Collab[]>({
    queryKey: ["overview-collab-24h", missionId, since24h],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,question_id,mission_id,entry_type,body,author_id,author_name,created_at,resolved")
        .eq("mission_id", missionId)
        .gte("created_at", since24h)
        .neq("entry_type", "leadership_guidance")
        .order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["overview-notes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,from_name,text,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as Note[];
    },
  });

  // ADD 7: writers in this mission (denominator for read receipts)
  const { data: writerMembers = [] } = useQuery<Array<{ user_id: string }>>({
    queryKey: ["overview-writer-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role")
        .eq("mission_id", missionId)
        .eq("role", "writer");
      return (data ?? []) as Array<{ user_id: string }>;
    },
  });

  // ADD 7: note read receipts
  const noteIds = notes.map((n) => n.id);
  const { data: noteReads = [] } = useQuery<Array<{ note_id: string; user_id: string }>>({
    queryKey: ["overview-note-reads", missionId, noteIds.join(",")],
    enabled: noteIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("note_reads")
        .select("note_id,user_id")
        .in("note_id", noteIds);
      return (data ?? []) as Array<{ note_id: string; user_id: string }>;
    },
  });

  // ── DERIVATIONS ──────────────────────────────────────
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const counts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const q of questions) {
      const h = (q.health ?? "").toLowerCase();
      if (h === "green") g++;
      else if (h === "yellow") y++;
      else if (h === "red") r++;
    }
    return { green: g, yellow: y, red: r, total: questions.length };
  }, [questions]);

  const overallHealth: "Red" | "Yellow" | "Green" =
    counts.red > 0 ? "Red" : counts.yellow > 0 ? "Yellow" : "Green";

  const submissionDays = daysTo(mission?.submission_date ?? null);

  const conflictQids = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) {
      if ((c.severity ?? "").toLowerCase() === "critical") {
        s.add(c.question_a_id);
        s.add(c.question_b_id);
      }
    }
    return s;
  }, [conflicts]);

  const atRisk = useMemo(() => {
    const items: Array<{ q: Question; reason: string; priority: number; days: number | null }> = [];
    for (const q of questions) {
      const d = daysTo(q.pens_down_date);
      let reason: string | null = null;
      let priority = 0;
      if (!q.assigned_writer_id && d !== null && d <= 14) {
        reason = "No writer assigned"; priority = 1;
      } else if (conflictQids.has(q.id)) {
        reason = "Alignment conflict — unresolved"; priority = 2;
      } else if (q.current_score !== null && Number(q.current_score) < 3.0 && d !== null && d <= 14) {
        reason = `Below standard · ${d}d to Pens Down`; priority = 3;
      } else if ((q.health ?? "").toLowerCase() === "red") {
        const driver = q.health_drivers ? Object.values(q.health_drivers)[0] : null;
        reason = driver ? `Health: Red · ${driver}` : "Health: Red"; priority = 4;
      }
      if (reason) items.push({ q, reason, priority, days: d });
    }
    items.sort((a, b) => a.priority - b.priority || (a.days ?? 999) - (b.days ?? 999));
    return items;
  }, [questions, conflictQids]);

  const nextGate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = gates.filter((g) => g.target_date && g.target_date >= today);
    return upcoming[0] ?? null;
  }, [gates]);

  const gateBuckets = useMemo(() => {
    let standard = 0, below = 0, ready = 0;
    for (const q of questions) {
      const s = q.current_score === null ? null : Number(q.current_score);
      if (s !== null && s >= 4.5) ready++;
      else if (s !== null && s < 3.0) below++;
      else standard++;
    }
    return { needsStandard: standard, below, ready };
  }, [questions]);

  const irisBrief = useMemo(() => {
    if (!mission) return "";
    const sentences: string[] = [];
    if (counts.red > 0 || counts.yellow > 0) {
      sentences.push(`${counts.yellow} Yellow and ${counts.red} Red question${counts.yellow + counts.red === 1 ? "" : "s"} need attention.`);
    } else if (counts.total > 0) {
      sentences.push(`All ${counts.total} questions are Green.`);
    }
    if (nextGate?.target_date) {
      const d = daysTo(nextGate.target_date);
      const flagged = questions.filter((q) => q.current_score !== null && Number(q.current_score) < 4.5).length;
      if (d !== null && d >= 0) sentences.push(`${nextGate.gate_name} is in ${d} day${d === 1 ? "" : "s"} with ${flagged} question${flagged === 1 ? "" : "s"} below standard.`);
    }
    const oldest = needs[0];
    if (oldest) {
      const q = oldest.question_id ? qById.get(oldest.question_id) : null;
      sentences.push(`${firstName(oldest.author_name)} ${NEED_LABEL[oldest.entry_type] ?? "needs help"}${q ? ` on Q${q.question_number}` : ""}.`);
    }
    const unassigned = questions.filter((q) => !q.assigned_writer_id && q.pens_down_date);
    if (unassigned.length > 0) {
      const u = unassigned[0];
      const d = daysTo(u.pens_down_date);
      sentences.push(`Q${u.question_number} has no writer assigned${d !== null ? ` and ${d} day${d === 1 ? "" : "s"} to Pens Down` : ""}.`);
    }
    if (sentences.length === 0) sentences.push("Mission is operating normally. No immediate leadership attention required.");
    return sentences.slice(0, 4).join(" ");
  }, [mission, counts, nextGate, needs, questions, qById]);

  const [briefStamp, setBriefStamp] = useState<Date>(() => new Date());

  // ADD 6 — IRIS Focus Today: pick the single highest-risk question
  const focusQuestion = useMemo(() => {
    type FocusReason = { q: Question; reason: string; rationale: string; priority: number };
    const candidates: FocusReason[] = [];
    const unresolvedConflictQids = new Set<string>();
    for (const c of conflicts) {
      unresolvedConflictQids.add(c.question_a_id);
      unresolvedConflictQids.add(c.question_b_id);
    }
    const openNeedsByQ = new Map<string, Collab[]>();
    for (const n of needs) {
      if (!n.question_id) continue;
      const arr = openNeedsByQ.get(n.question_id) ?? [];
      arr.push(n);
      openNeedsByQ.set(n.question_id, arr);
    }
    for (const q of questions) {
      const d = daysTo(q.pens_down_date);
      const h = (q.health ?? "").toLowerCase();
      const smeNeeds = (openNeedsByQ.get(q.id) ?? []).filter((c) => c.entry_type === "sme_request");
      const oldestSme = smeNeeds.length
        ? Math.max(...smeNeeds.map((c) => Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000)))
        : 0;
      // 1. Red + no writer + Pens Down within 14 days
      if (h === "red" && !q.assigned_writer_id && d !== null && d <= 14) {
        candidates.push({
          q,
          reason: "no writer assigned",
          rationale: `Q${q.question_number} ${q.title} has no writer assigned with ${d} day${d === 1 ? "" : "s"} to Pens Down. This is the highest risk question on the mission today.`,
          priority: 1,
        });
      }
      // 2. Red + Pens Down within 7 days
      if (h === "red" && d !== null && d <= 7) {
        candidates.push({
          q,
          reason: "red with deadline imminent",
          rationale: `Q${q.question_number} ${q.title} is Red with only ${d} day${d === 1 ? "" : "s"} to Pens Down. This is the highest risk question on the mission today.`,
          priority: 2,
        });
      }
      // 3. Yellow + unresolved conflict + Pens Down within 14 days
      if (h === "yellow" && unresolvedConflictQids.has(q.id) && d !== null && d <= 14) {
        candidates.push({
          q,
          reason: "unresolved alignment conflict",
          rationale: `Q${q.question_number} ${q.title} has an unresolved alignment conflict with ${d} day${d === 1 ? "" : "s"} to Pens Down. This is the highest risk question on the mission today.`,
          priority: 3,
        });
      }
      // 4. Yellow + SME silent > 3 days + Pens Down within 14 days
      if (h === "yellow" && oldestSme > 3 && d !== null && d <= 14) {
        candidates.push({
          q,
          reason: "SME silent",
          rationale: `Q${q.question_number} ${q.title} has had no SME response for ${oldestSme} days with ${d} day${d === 1 ? "" : "s"} to Pens Down. This is the highest risk question on the mission today.`,
          priority: 4,
        });
      }
    }
    if (candidates.length === 0) {
      // 5. Fallback — lowest score + nearest Pens Down
      const scored = questions
        .filter((q) => q.current_score !== null && q.pens_down_date)
        .sort((a, b) => {
          const sa = Number(a.current_score), sb = Number(b.current_score);
          if (sa !== sb) return sa - sb;
          return (daysTo(a.pens_down_date) ?? 999) - (daysTo(b.pens_down_date) ?? 999);
        });
      const top = scored[0];
      if (top && (top.health ?? "").toLowerCase() !== "green") {
        const d = daysTo(top.pens_down_date);
        candidates.push({
          q: top,
          reason: "lowest score and nearest deadline",
          rationale: `Q${top.question_number} ${top.title} has the lowest current score (${Number(top.current_score).toFixed(1)}) with ${d ?? "?"} day${d === 1 ? "" : "s"} to Pens Down. Focus here today.`,
          priority: 5,
        });
      }
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0] ?? null;
  }, [questions, conflicts, needs]);


  // ── MUTATIONS ────────────────────────────────────────
  const respondMutation = useMutation({
    mutationFn: async ({ need, text }: { need: Collab; text: string }) => {
      if (!me) throw new Error("Not signed in");
      if (!need.question_id) throw new Error("Missing question");
      const { error: e1 } = await supabase.from("question_collaboration").insert({
        question_id: need.question_id,
        mission_id: need.mission_id,
        author_id: me.id,
        author_name: me.name,
        entry_type: "leadership_guidance",
        body: text.trim(),
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("question_collaboration")
        .update({ resolved: true, resolved_by: me.id, resolved_at: new Date().toISOString() })
        .eq("id", need.id);
      if (e2) throw e2;
      if (need.question_id) {
        await createSignal({
          mission_id: need.mission_id,
          source_module: "overview",
          signal_type: "leadership_guidance_added",
          signal_title: `Guidance for ${firstName(need.author_name)}`,
          severity: "info",
          related_question_id: need.question_id,
        }, qc);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview-needs", missionId] });
      qc.invalidateQueries({ queryKey: ["overview-collab-24h", missionId, since24h] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (need: Collab) => {
      if (!me) throw new Error("Not signed in");
      const { error } = await supabase
        .from("question_collaboration")
        .update({ resolved: true, resolved_by: me.id, resolved_at: new Date().toISOString() })
        .eq("id", need.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["overview-needs", missionId] }),
  });

  // ── RENDER ───────────────────────────────────────────
   return (
    <div className="mx-auto max-w-[1100px] px-8 py-10 space-y-8 page-enter">
      {/* BLOCK 0 — AMENDMENT BANNER */}
      <AmendmentDashboardBanner missionId={missionId} />

      {/* BLOCK 1 — HEADER */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <HealthDot tone={overallHealth} />
          <h1 className="text-3xl font-semibold tracking-tight">{mission?.name ?? "…"}</h1>
          {mission?.client && (
            <span className="text-sm text-muted-foreground">· {mission.client}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {mission?.submission_date ? new Date(mission.submission_date).toLocaleDateString() : "No submission date"}
          {submissionDays !== null && (
            <> · <span className={submissionDays <= 7 ? "text-destructive" : submissionDays <= 21 ? "text-amber-400" : ""}>
              {submissionDays < 0 ? `${Math.abs(submissionDays)}d overdue` : `${submissionDays}d to submission`}
            </span></>
          )}
          {mission?.status && <> · {mission.status}</>}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="text-emerald-400">{counts.green} Green</span> · <span className="text-amber-400">{counts.yellow} Yellow</span> · <span className="text-destructive">{counts.red} Red</span> · {counts.total} Total Questions
        </p>
      </header>

      {/* BLOCK 2 — IRIS MISSION BRIEF */}
      <section className="iris-panel rounded-[12px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="iris-label flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
            </span>
            IRIS
          </div>
          <button
            onClick={() => { setBriefStamp(new Date()); qc.invalidateQueries({ queryKey: ["overview-questions", missionId] }); qc.invalidateQueries({ queryKey: ["overview-needs", missionId] }); }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{irisBrief || "Generating…"}</p>
        <p className="mt-2 text-[10px] text-muted-foreground">● IRIS · Updated {relativeTime(briefStamp.toISOString())}</p>
      </section>

      {/* ADD 6 — IRIS FOCUS TODAY */}
      <section className="iris-panel rounded-[12px] border border-[color:var(--iris,#22d3ee)]/30 border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04] p-5">
        <div className="iris-label flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--iris,#22d3ee)]/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[color:var(--iris,#22d3ee)]" />
          </span>
          IRIS · FOCUS TODAY
        </div>
        {focusQuestion ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{focusQuestion.rationale}</p>
            <button
              onClick={() => navigate({ to: "/missions/$missionId/questions/$questionId", params: { missionId, questionId: focusQuestion.q.id } })}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--iris,#22d3ee)] hover:underline"
            >
              Open Q{focusQuestion.q.question_number} <ArrowRight className="h-3 w-3" />
            </button>
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-emerald-400/80">
            No focus question today. All questions are on track.
          </p>
        )}
      </section>

      {/* MISSION ROOM HERO — Vault + Oracle */}
      <MissionRoomHero missionId={missionId} />





      {/* BLOCK 3 — NEEDS YOUR ATTENTION */}
      <SectionBlock
        title="Needs Your Attention"
        count={needs.length}
        countTone={needs.length > 0 ? "amber" : "green"}
        empty={
          <p className="text-sm text-emerald-400/80">No open needs. The team is operating independently.</p>
        }
        emptyWhen={needs.length === 0}
      >
        <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface">
          {needs.map((n) => (
            <NeedRow
              key={n.id}
              need={n}
              question={n.question_id ? qById.get(n.question_id) : null}
              isLeader={isLeader}
              onRespond={(text) => respondMutation.mutateAsync({ need: n, text })}
              onDismiss={() => dismissMutation.mutateAsync(n)}
            />
          ))}
        </ul>
      </SectionBlock>

      {/* BLOCK 4 — RESPONSES AT RISK */}
      <SectionBlock
        title="Responses at Risk"
        count={atRisk.length}
        countTone={atRisk.length > 0 ? "red" : "green"}
        empty={<p className="text-sm text-emerald-400/80">No responses at risk. All questions on track.</p>}
        emptyWhen={atRisk.length === 0}
      >
        <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface">
          {atRisk.map(({ q, reason, days }) => (
            <li key={q.id} className="flex items-center gap-3 px-4 py-3">
              <HealthDot tone={((q.health ?? "yellow").charAt(0).toUpperCase() + (q.health ?? "yellow").slice(1)) as any} size="sm" />
              <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">Q{q.question_number}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{q.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{reason}</div>
              </div>
              {q.pens_down_date && (
                <span className={`text-[11px] tabular-nums ${days !== null && days <= 7 ? "text-destructive" : "text-muted-foreground"}`}>
                  {new Date(q.pens_down_date).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => navigate({ to: "/missions/$missionId/questions/$questionId", params: { missionId, questionId: q.id } })}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
              >
                Open in Studio <ArrowRight className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      </SectionBlock>

      {/* BLOCK 5 — NEXT GATE */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Next Gate</h2>
        {nextGate ? (
          <div className="rounded-[10px] border border-border bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-semibold">{nextGate.gate_name}</span>
              <span className="text-sm text-muted-foreground">· {nextGate.target_date && new Date(nextGate.target_date).toLocaleDateString()}</span>
              {(() => {
                const d = daysTo(nextGate.target_date);
                if (d === null) return null;
                return <span className={`text-sm ${d <= 7 ? "text-destructive font-medium" : "text-muted-foreground"}`}>· {d}d away</span>;
              })()}
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Not yet at standard (≥4.5)" value={gateBuckets.needsStandard} />
              <Stat label="Below passing (<3.0)" value={gateBuckets.below} tone={gateBuckets.below > 0 ? "red" : undefined} />
              <Stat label="Complete & ready" value={gateBuckets.ready} tone="green" />
            </div>
            {gateBuckets.needsStandard + gateBuckets.below > 0 && (
              <p className="text-xs text-muted-foreground">
                {gateBuckets.needsStandard + gateBuckets.below} question{gateBuckets.needsStandard + gateBuckets.below === 1 ? "" : "s"} need to reach 4.5 before {nextGate.gate_name}.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-border p-4 text-sm text-muted-foreground">
            No review gates scheduled.
            {isLeader && (
              <> · <Link to="/olympus/gates" className="text-primary hover:underline">Add a gate in Admin →</Link></>
            )}
          </div>
        )}
      </section>

      {/* BLOCK 6 — WHAT CHANGED TODAY */}
      <WhatChangedBlock
        signals={recentSignals}
        collab={recentCollab}
        qById={qById}
        canBroadcast={isLeader}
        missionId={missionId}
        meName={me?.name ?? "Leader"}
        meId={me?.id ?? null}
        onSent={() => qc.invalidateQueries({ queryKey: ["overview-notes", missionId] })}
      />

      {/* BLOCK 7 — LEADERSHIP NOTES */}
      <LeadershipNotesBlock
        notes={notes}
        canWrite={isLeader}
        isLeader={isLeader}
        missionId={missionId}
        meName={me?.name ?? "Leader"}
        meId={me?.id ?? null}
        myRole={me?.role ?? null}
        writerIds={writerMembers.map((m) => m.user_id)}
        noteReads={noteReads}
        onSaved={() => qc.invalidateQueries({ queryKey: ["overview-notes", missionId] })}
        onReadsChanged={() => qc.invalidateQueries({ queryKey: ["overview-note-reads", missionId] })}
      />


      {/* ENTER STUDIO CTA — the writer's next step */}
      <EnterStudioCTA
        missionId={missionId}
        assignedCount={me ? questions.filter((q) => q.assigned_writer_id === me.id).length : 0}
        attentionCount={me ? questions.filter((q) => q.assigned_writer_id === me.id && ((q.health ?? "").toLowerCase() === "red" || (q.health ?? "").toLowerCase() === "yellow")).length : 0}
      />
    </div>
  );
}

// ── COMPONENTS ────────────────────────────────────────

function SectionBlock({
  title, count, countTone, children, empty, emptyWhen,
}: {
  title: string; count: number; countTone: "amber" | "red" | "green";
  children: React.ReactNode; empty: React.ReactNode; emptyWhen: boolean;
}) {
  const toneCls =
    countTone === "red" ? "bg-destructive/15 text-destructive border-destructive/30" :
    countTone === "amber" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
        <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold ${toneCls}`}>{count}</span>
      </div>
      {emptyWhen ? empty : children}
    </section>
  );
}

function NeedRow({
  need, question, isLeader, onRespond, onDismiss,
}: {
  need: Collab;
  question: Question | null | undefined;
  isLeader: boolean;
  onRespond: (text: string) => Promise<unknown>;
  onDismiss: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await onRespond(text);
      setDone(`Response sent to ${firstName(need.author_name)}.`);
      setText("");
      setTimeout(() => { setDone(null); setOpen(false); }, 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }
  async function dismiss() {
    try { await onDismiss(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={need.author_name} />
        <span className="text-sm font-medium">{firstName(need.author_name)}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground truncate">
          {question ? `Q${question.question_number} ${question.title}` : "General"}
        </span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{NEED_LABEL[need.entry_type] ?? need.entry_type.replace(/_/g, " ")}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(need.created_at)}</span>
        {isLeader && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="ml-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Respond <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {need.body && (
        <p className="mt-1.5 ml-11 text-sm text-foreground/80">{need.body}</p>
      )}
      {open && isLeader && (
        <div className="mt-3 ml-11 space-y-2">
          {done ? (
            <p className="text-xs text-emerald-400">{done}</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your guidance or decision..."
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  Send Response
                </button>
                <button
                  onClick={dismiss}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function WhatChangedBlock({
  signals, collab, qById, canBroadcast, missionId, meName, meId, onSent,
}: {
  signals: Signal[]; collab: Collab[]; qById: Map<string, Question>;
  canBroadcast: boolean; missionId: string; meName: string; meId: string | null;
  onSent: () => void;
}) {
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  type Item = {
    key: string; created_at: string; authorName: string; questionLabel: string;
    activityLabel: string; body: string | null;
  };
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const c of collab) {
      if (c.entry_type === "leadership_guidance") continue;
      const q = c.question_id ? qById.get(c.question_id) : null;
      out.push({
        key: `c-${c.id}`,
        created_at: c.created_at,
        authorName: c.author_name,
        questionLabel: q ? `Q${q.question_number}` : "Mission",
        activityLabel: NEED_LABEL[c.entry_type] ?? c.entry_type.replace(/_/g, " "),
        body: c.body,
      });
    }
    for (const s of signals) {
      const q = s.related_question_id ? qById.get(s.related_question_id) : null;
      const label = s.signal_type === "nothing_changed" ? "Checked in"
        : s.signal_type === "decision_needed" ? "Requested decision"
        : s.signal_type === "sme_request" ? "Requested help"
        : s.signal_type === "air_cover" ? "Requested air cover"
        : s.signal_title;
      out.push({
        key: `s-${s.id}`,
        created_at: s.created_at,
        authorName: "IRIS",
        questionLabel: q ? `Q${q.question_number}` : "Mission",
        activityLabel: label,
        body: s.signal_summary,
      });
    }
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return out;
  }, [signals, collab, qById]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">What Changed Today</h2>
          <p className="text-[11px] text-muted-foreground">Last 24 hours</p>
        </div>
        {canBroadcast && (
          <button
            onClick={() => setShowBroadcast(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Megaphone className="h-3 w-3" /> Broadcast to Team
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
          <p>No signals today.</p>
          {canBroadcast && (
            <p>
              Remind the team to check in.{" "}
              <button onClick={() => setShowBroadcast(true)} className="text-primary hover:underline">Send Broadcast →</button>
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface">
          {items.map((it) => {
            const isIris = it.authorName === "IRIS";
            return (
            <li key={it.key} className={`px-4 py-3 ${isIris ? "border-l-2 border-l-[color:var(--iris,#22d3ee)] bg-[color:var(--iris,#22d3ee)]/[0.04]" : ""}`}>
              <button
                onClick={() => setExpanded((cur) => (cur === it.key ? null : it.key))}
                className="flex w-full items-center gap-3 text-left"
              >
                {isIris ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--iris,#22d3ee)]">● IRIS</span>
                ) : (
                  <>
                    <Avatar name={it.authorName} />
                    <span className="text-sm font-medium">{firstName(it.authorName)}</span>
                  </>
                )}
                <span className="text-xs text-muted-foreground">· {it.questionLabel}</span>
                <span className="text-xs text-muted-foreground">· {it.activityLabel}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{relativeTime(it.created_at)}</span>
              </button>
              {expanded === it.key && it.body && (
                <p className={`mt-2 text-sm text-foreground/80 whitespace-pre-wrap ${isIris ? "ml-4" : "ml-11"}`}>{it.body}</p>
              )}
            </li>
            );
          })}
        </ul>
      )}
      {showBroadcast && (
        <BroadcastModal
          onClose={() => setShowBroadcast(false)}
          missionId={missionId}
          meName={meName}
          meId={meId}
          onSent={() => { setShowBroadcast(false); onSent(); }}
        />
      )}
    </section>
  );
}

function BroadcastModal({
  onClose, missionId, meName, meId, onSent,
}: { onClose: () => void; missionId: string; meName: string; meId: string | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function send() {
    if (!text.trim() || !meId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("broadcasts").insert({
        mission_id: missionId,
        user_id: meId,
        from_name: meName,
        text: text.trim().slice(0, 2000),
      });
      if (error) throw error;
      toast.success("Broadcast sent");
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Broadcast to Team</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Message to the full mission team..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={send}
            disabled={saving || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Send Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadershipNotesBlock({
  notes, canWrite, isLeader, missionId, meName, meId, myRole, writerIds, noteReads, onSaved, onReadsChanged,
}: {
  notes: Note[]; canWrite: boolean; isLeader: boolean; missionId: string;
  meName: string; meId: string | null; myRole: string | null;
  writerIds: string[];
  noteReads: Array<{ note_id: string; user_id: string }>;
  onSaved: () => void;
  onReadsChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [remindBusy, setRemindBusy] = useState<string | null>(null);
  const visible = showAll ? notes : notes.slice(0, 3);

  // Map note_id -> Set<user_id> of writers that have seen it
  const writerSet = useMemo(() => new Set(writerIds), [writerIds]);
  const seenByNote = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const r of noteReads) {
      if (!writerSet.has(r.user_id)) continue;
      (m[r.note_id] ??= new Set()).add(r.user_id);
    }
    return m;
  }, [noteReads, writerSet]);

  // Mark all currently-visible notes as seen by the current user (writers only)
  // The "intended audience" tracking only records writers; admins/leaders viewing
  // do not generate a read entry.
  useEffect(() => {
    if (!meId || myRole !== "writer" || notes.length === 0) return;
    const myReadIds = new Set(noteReads.filter((r) => r.user_id === meId).map((r) => r.note_id));
    const toMark = notes.filter((n) => !myReadIds.has(n.id));
    if (toMark.length === 0) return;
    let cancelled = false;
    (async () => {
      const rows = toMark.map((n) => ({
        note_id: n.id,
        user_id: meId,
        mission_id: missionId,
      }));
      const { error } = await supabase.from("note_reads").upsert(rows, {
        onConflict: "note_id,user_id",
        ignoreDuplicates: true,
      });
      if (!cancelled && !error) onReadsChanged();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, myRole, notes.length, noteReads.length, missionId]);

  async function post() {
    if (!text.trim() || !meId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("broadcasts").insert({
        mission_id: missionId,
        user_id: meId,
        from_name: meName,
        text: text.trim().slice(0, 4000),
      });
      if (error) throw error;
      toast.success("Note posted");
      setText("");
      setAddOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function remindTeam(noteId: string) {
    if (!meId) return;
    setRemindBusy(noteId);
    try {
      const { error } = await supabase.from("broadcasts").insert({
        mission_id: missionId,
        user_id: meId,
        from_name: meName,
        text: "Please review the latest leadership note in Mission Overview.",
      });
      if (error) throw error;
      toast.success("Reminder sent to team");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRemindBusy(null);
    }
  }

  const writerTotal = writerIds.length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leadership Notes</h2>
        {canWrite && !addOpen && (
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            + Add Note
          </button>
        )}
      </div>

      {addOpen && (
        <div className="rounded-[10px] border border-border bg-surface p-4 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Post strategic guidance for the team."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={post}
              disabled={saving || !text.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Post Note
            </button>
            <button
              onClick={() => { setAddOpen(false); setText(""); }}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 && !addOpen ? (
        canWrite ? (
          <p className="text-sm text-muted-foreground">Post strategic guidance for the team.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No leadership notes yet.</p>
        )
      ) : (
        <ul className="space-y-2">
          {visible.map((n) => {
            const seenCount = seenByNote[n.id]?.size ?? 0;
            const ageHours = (Date.now() - new Date(n.created_at).getTime()) / 3_600_000;
            const allSeen = writerTotal > 0 && seenCount >= writerTotal;
            const staleNoReads = ageHours > 4 && seenCount === 0;
            const unreadCount = Math.max(0, writerTotal - seenCount);
            const showStaleWarning = ageHours > 48 && !allSeen && writerTotal > 0;
            return (
              <li key={n.id} className="rounded-[10px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{firstName(n.from_name)}</span>
                  <span className="text-[11px] text-muted-foreground">{relativeTime(n.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{n.text}</p>
                {isLeader && writerTotal > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <span
                      className={`text-[11px] ${
                        allSeen ? "text-emerald-400" : staleNoReads ? "text-amber-400" : "text-muted-foreground"
                      }`}
                    >
                      Seen by {seenCount} of {writerTotal} writers
                      {allSeen && " ✓"}
                    </span>
                    {showStaleWarning && (
                      <>
                        <span className="text-[11px] text-amber-400">
                          ⚠ Not seen by {unreadCount} writer{unreadCount === 1 ? "" : "s"}
                        </span>
                        <button
                          onClick={() => remindTeam(n.id)}
                          disabled={remindBusy === n.id}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          {remindBusy === n.id ? "Sending…" : "Remind Team"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 3 && !showAll && (
        <button onClick={() => setShowAll(true)} className="text-xs text-primary hover:underline">View all →</button>
      )}
    </section>

  );
}

// ── PRIMITIVES ────────────────────────────────────────

function HealthDot({ tone, size = "md" }: { tone: "Green" | "Yellow" | "Red"; size?: "sm" | "md" }) {
  const color = tone === "Red" ? "bg-destructive shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]"
    : tone === "Yellow" ? "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.4)]"
    : "bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.4)]";
  const dim = size === "sm" ? "h-2 w-2" : "h-3 w-3";
  return <span className={`inline-block rounded-full ${dim} ${color}`} />;
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
      {initialsOf(name)}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "red" | "amber" | "green" }) {
  const cls = tone === "red" ? "text-destructive" : tone === "amber" ? "text-amber-400" : tone === "green" ? "text-emerald-400" : "text-foreground";
  return (
    <div className="rounded-[8px] border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
