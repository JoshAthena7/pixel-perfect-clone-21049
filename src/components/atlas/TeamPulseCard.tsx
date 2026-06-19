/**
 * Team Pulse Card — three tabs on the Flight Deck:
 *   ✨ Inspiration | 🧠 Trivia | 🤝 Team
 *
 * Default tab rotates by day-of-week; last-chosen tab is remembered in
 * localStorage. Inspiration & Trivia are IRIS-generated per mission per day.
 * Team tab shows recent wins, supportive nudges, and a shoutout box.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Brain, Users, Loader2, PartyPopper, Send, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureMissionMoment } from "@/lib/atlas-moments.functions";
import { toast } from "sonner";

const GOLD = "#C49A2B";
type Tab = "inspiration" | "trivia" | "team";

function defaultTab(): Tab {
  const dow = new Date().getDay(); // 0 Sun ... 6 Sat
  if (dow === 0 || dow === 6) return "team";
  if (dow === 2 || dow === 4) return "trivia";
  return "inspiration";
}

const LS_KEY = "atlas:team-pulse:tab";

export function TeamPulseCard({ missionId }: { missionId: string | null }) {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return defaultTab();
    const stored = window.localStorage.getItem(LS_KEY) as Tab | null;
    return stored ?? defaultTab();
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, tab);
  }, [tab]);

  if (!missionId) return null;

  return (
    <div
      className="rounded-xl border bg-surface/30 overflow-hidden"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-1 px-2 pt-2">
        <TabBtn active={tab === "inspiration"} onClick={() => setTab("inspiration")} icon={<Sparkles className="h-3.5 w-3.5" />} label="Inspiration" />
        <TabBtn active={tab === "trivia"} onClick={() => setTab("trivia")} icon={<Brain className="h-3.5 w-3.5" />} label="Trivia" />
        <TabBtn active={tab === "team"} onClick={() => setTab("team")} icon={<Users className="h-3.5 w-3.5" />} label="Team" />
      </div>
      <div className="px-4 py-3">
        {tab === "inspiration" && <InspirationTab missionId={missionId} />}
        {tab === "trivia" && <TriviaTab missionId={missionId} />}
        {tab === "team" && <TeamTab missionId={missionId} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "rgba(196,154,43,0.12)" : "transparent",
        color: active ? GOLD : "rgba(255,255,255,0.6)",
      }}
    >
      {icon} {label}
    </button>
  );
}

/* -------------------- Inspiration -------------------- */
function InspirationTab({ missionId }: { missionId: string }) {
  const ensure = useServerFn(ensureMissionMoment);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["atlas-moment", "inspiration", missionId, new Date().toISOString().slice(0, 10)],
    queryFn: () => ensure({ data: { missionId, momentType: "inspiration" } }),
    retry: false,
  });

  if (isLoading) return <Loading text="IRIS is finding the moment…" />;
  if (error) return <ErrorBlock message={String((error as Error).message)} onRetry={() => refetch()} />;
  const c = (data?.content ?? {}) as { quote?: string; attribution?: string; context?: string };
  return (
    <div className="relative">
      <span
        className="absolute right-0 top-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{ background: "rgba(196,154,43,0.12)", color: GOLD, border: "1px solid rgba(196,154,43,0.3)" }}
      >
        Today's Inspiration
      </span>
      <div className="pr-32">
        <div className="italic leading-snug" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {c.quote || "—"}
        </div>
        {c.attribution && (
          <div className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            — <span style={{ color: GOLD }}>{c.attribution}</span>
          </div>
        )}
        {c.context && (
          <div className="mt-1 text-[10.5px] italic" style={{ color: "rgba(255,255,255,0.45)" }}>{c.context}</div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Trivia -------------------- */
function TriviaTab({ missionId }: { missionId: string }) {
  const ensure = useServerFn(ensureMissionMoment);
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `atlas-trivia-pick:${missionId}:${today}`;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["atlas-moment", "trivia", missionId, today],
    queryFn: () => ensure({ data: { missionId, momentType: "trivia" } }),
    retry: false,
  });
  const [picked, setPicked] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(storageKey);
    return v === null ? null : Number(v);
  });
  const [rolledUp, setRolledUp] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey) !== null;
  });

  function handlePick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    try { window.localStorage.setItem(storageKey, String(i)); } catch { /* ignore */ }
  }

  useEffect(() => {
    if (picked === null || rolledUp) return;
    const t = setTimeout(() => setRolledUp(true), 4000);
    return () => clearTimeout(t);
  }, [picked, rolledUp]);


  if (isLoading) return <Loading text="IRIS is drafting today's trivia…" />;
  if (error) return <ErrorBlock message={String((error as Error).message)} onRetry={() => refetch()} />;

  const c = (data?.content ?? {}) as {
    question?: string;
    options?: string[];
    correct_index?: number;
    explanation?: string;
  };
  const opts = Array.isArray(c.options) ? c.options : [];
  const correct = picked !== null && picked === c.correct_index;

  if (rolledUp) {
    return (
      <button
        onClick={() => setRolledUp(false)}
        className="w-full flex items-center justify-between rounded-md px-3 py-2 text-[11.5px] transition-colors"
        style={{
          background: correct ? "rgba(61,190,125,0.08)" : "rgba(224,74,74,0.08)",
          border: `1px solid ${correct ? "rgba(61,190,125,0.3)" : "rgba(224,74,74,0.3)"}`,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        <span>
          <span style={{ color: correct ? "#3DBE7D" : "#f08080", fontWeight: 600 }}>
            {correct ? "✓ Nailed it" : "✗ Missed it"}
          </span>
          <span className="ml-2 text-muted-foreground">Today's trivia answered</span>
        </span>
        <span className="text-[10px] text-muted-foreground">Show</span>
      </button>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{c.question || "—"}</div>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {opts.map((opt, i) => {
          const isCorrect = picked !== null && i === c.correct_index;
          const isWrongPick = picked === i && i !== c.correct_index;
          let bg = "rgba(255,255,255,0.04)";
          let border = "rgba(255,255,255,0.1)";
          let color = "rgba(255,255,255,0.85)";
          if (isCorrect) { bg = "rgba(61,190,125,0.15)"; border = "rgba(61,190,125,0.5)"; color = "#3DBE7D"; }
          else if (isWrongPick) { bg = "rgba(224,74,74,0.15)"; border = "rgba(224,74,74,0.5)"; color = "#f08080"; }
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => handlePick(i)}
              className="text-left rounded-md transition-colors disabled:cursor-default"
              style={{ background: bg, border: `0.5px solid ${border}`, color, padding: "6px 10px", fontSize: 11 }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && c.explanation && (
        <div
          className="mt-3 rounded-md px-3 py-2 text-[11px] italic"
          style={{ background: "rgba(196,154,43,0.06)", borderLeft: `2px solid ${GOLD}`, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}
        >
          {c.explanation}
        </div>
      )}
    </div>
  );
}


/* -------------------- Team -------------------- */
function TeamTab({ missionId }: { missionId: string }) {
  return (
    <div className="space-y-4">
      <IrisNudges missionId={missionId} />
      <ShoutoutBox missionId={missionId} />
    </div>
  );
}


function RecentWins({ missionId }: { missionId: string }) {
  const { data: events } = useQuery({
    queryKey: ["atlas-recent-wins", missionId],
    queryFn: async () => {
      const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [finalized, review, scores] = await Promise.all([
        supabase.from("question_progress")
          .select("id, question_id, assignee_id, status, status_changed_at")
          .eq("mission_id", missionId).eq("status", "finalized").gte("status_changed_at", since48).limit(10),
        supabase.from("question_progress")
          .select("id, question_id, assignee_id, status, status_changed_at")
          .eq("mission_id", missionId).eq("status", "internal_review").gte("status_changed_at", since24).limit(10),
        supabase.from("mock_scores")
          .select("id, question_id, recorded_by, score, scored_at")
          .eq("mission_id", missionId).gt("score", 80).gte("scored_at", since48).limit(10),
      ]);
      type Item = { kind: "finalized" | "review" | "score"; questionId: string | null; userId: string | null; when: string; meta?: string };
      const items: Item[] = [
        ...(finalized.data ?? []).map((r: any) => ({ kind: "finalized" as const, questionId: r.question_id, userId: r.assignee_id, when: r.status_changed_at })),
        ...(review.data ?? []).map((r: any) => ({ kind: "review" as const, questionId: r.question_id, userId: r.assignee_id, when: r.status_changed_at })),
        ...(scores.data ?? []).map((r: any) => ({ kind: "score" as const, questionId: r.question_id, userId: r.recorded_by, when: r.scored_at, meta: `${r.score}` })),
      ].sort((a, b) => +new Date(b.when) - +new Date(a.when)).slice(0, 6);
      const qids = Array.from(new Set(items.map(i => i.questionId).filter(Boolean))) as string[];
      const uids = Array.from(new Set(items.map(i => i.userId).filter(Boolean))) as string[];
      const [qs, users] = await Promise.all([
        qids.length ? supabase.from("mission_questions").select("id, question_number").in("id", qids) : Promise.resolve({ data: [] as any[] } as any),
        uids.length ? supabase.from("atlas_team_members").select("id, first_name, last_name").in("id", uids) : Promise.resolve({ data: [] as any[] } as any),
      ]);
      const qmap = new Map<string, string>((qs.data ?? []).map((q: any) => [q.id, q.question_number ?? "?"]));
      const umap = new Map<string, string>((users.data ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()]));
      return items.map(i => ({ ...i, qNum: i.questionId ? (qmap.get(i.questionId) ?? "?") : "?", who: i.userId ? (umap.get(i.userId) ?? "A teammate") : "A teammate" }));
    },
  });

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Recent Wins</div>
      {!events || events.length === 0 ? (
        <div className="mt-2 text-[11px] italic text-muted-foreground">The team is heads down. Check back soon.</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {events.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-[11.5px]">
              <PartyPopper className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: GOLD }} />
              <span style={{ color: "rgba(255,255,255,0.85)" }}>
                <span className="font-medium">{e.who}</span>{" "}
                {e.kind === "finalized" && <>finalized <span style={{ color: GOLD }}>{e.qNum}</span></>}
                {e.kind === "review" && <>moved <span style={{ color: GOLD }}>{e.qNum}</span> to internal review</>}
                {e.kind === "score" && <>scored <span style={{ color: "#3DBE7D" }}>{e.meta}</span> on <span style={{ color: GOLD }}>{e.qNum}</span></>}
                <span className="ml-1.5 text-[10px] text-muted-foreground">· {timeAgo(e.when)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IrisNudges({ missionId }: { missionId: string }) {
  const { data: nudges } = useQuery({
    queryKey: ["atlas-iris-nudges", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      const fourDaysAgo = new Date(Date.now() - 4 * 86400 * 1000).toISOString();
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select(`id, question_id, assigned_writer_id, last_activity_at,
          mission_questions:question_id(question_number, health_status, status),
          writer:atlas_team_members!mission_assignments_assigned_writer_id_fkey(first_name, last_name)`)
        .eq("mission_id", missionId)
        .lt("last_activity_at", fourDaysAgo)
        .limit(10);
      return (asgs ?? [])
        .filter((a: any) =>
          a.assigned_writer_id && a.assigned_writer_id !== me.user?.id
          && (a.mission_questions?.health_status === "at_risk" || a.mission_questions?.health_status === "blocked")
        )
        .slice(0, 2)
        .map((a: any) => ({
          name: `${a.writer?.first_name ?? ""} ${a.writer?.last_name ?? ""}`.trim() || "A teammate",
          qNum: a.mission_questions?.question_number ?? "?",
          days: Math.floor((Date.now() - +new Date(a.last_activity_at)) / 86400000),
        }));
    },
  });
  if (!nudges || nudges.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">IRIS Nudges</div>
      <div className="mt-2 space-y-2">
        {nudges.map((n, i) => (
          <div key={i} className="rounded-md px-3 py-2 text-[11.5px]" style={{ background: "rgba(127,119,221,0.06)", border: "1px solid rgba(127,119,221,0.2)", color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>
            <span style={{ color: "#C8C3FF" }}>{n.name}</span> hasn't touched <span style={{ color: GOLD }}>{n.qNum}</span> in {n.days} days. If they need a hand, reach out — the team has each other's back.
          </div>
        ))}
      </div>
    </div>
  );
}

function ShoutoutBox({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [toId, setToId] = useState<string>("");
  const [sending, setSending] = useState(false);

  const { data: teammates } = useQuery({
    queryKey: ["atlas-teammates", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      const { data: rows } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members:member_id(first_name, last_name)")
        .eq("mission_id", missionId);
      return (rows ?? [])
        .filter((r: any) => r.member_id !== me.user?.id)
        .map((r: any) => ({
          id: r.member_id as string,
          name: `${r.atlas_team_members?.first_name ?? ""} ${r.atlas_team_members?.last_name ?? ""}`.trim() || "Teammate",
        }));
    },
  });

  const { data: received } = useQuery({
    queryKey: ["atlas-shoutouts-mine", missionId],
    queryFn: async () => {
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return [];
      const { data: shouts } = await supabase
        .from("atlas_shoutouts")
        .select("id, message, from_user_id, created_at")
        .eq("mission_id", missionId)
        .eq("to_user_id", me.user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      const fromIds = Array.from(new Set((shouts ?? []).map((s: any) => s.from_user_id)));
      const { data: senders } = fromIds.length
        ? await supabase.from("atlas_team_members").select("id, first_name, last_name").in("id", fromIds)
        : { data: [] as any[] };
      const map = new Map<string, string>((senders ?? []).map((u: any) => [u.id, `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()]));
      return (shouts ?? []).map((s: any) => ({ ...s, from: map.get(s.from_user_id) ?? "A teammate" }));
    },
  });

  async function send() {
    if (!toId) { toast.error("Pick a teammate"); return; }
    const text = message.trim();
    if (!text) { toast.error("Write a message"); return; }
    if (text.length > 200) { toast.error("Keep it under 200 characters"); return; }
    setSending(true);
    const { data: me } = await supabase.auth.getUser();
    if (!me.user) { setSending(false); return; }
    if (me.user.id === toId) { toast.error("You can't shout out yourself"); setSending(false); return; }
    const { error } = await supabase.from("atlas_shoutouts").insert({
      mission_id: missionId, from_user_id: me.user.id, to_user_id: toId, message: text,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const recip = teammates?.find(t => t.id === toId);
    toast.success(`Shoutout sent to ${recip?.name ?? "teammate"} ✓`);
    setMessage("");
    setToId("");
    qc.invalidateQueries({ queryKey: ["atlas-shoutouts-mine", missionId] });
  }

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Shoutout</div>

      {received && received.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {received.map((s) => (
            <li
              key={s.id}
              className="rounded-md px-3 py-2 text-[11.5px]"
              style={{ background: "rgba(196,154,43,0.1)", border: "1px solid rgba(196,154,43,0.35)", color: "rgba(255,255,255,0.88)", lineHeight: 1.55 }}
            >
              <span className="font-semibold" style={{ color: GOLD }}>{s.from}:</span> {s.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 space-y-2">
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="w-full text-[12px] px-2 py-1.5 rounded-md bg-background/60 text-white border focus:outline-none"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <option value="">Shout out a teammate…</option>
          {(teammates ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 200))}
            placeholder="They'll see it in their cockpit."
            className="flex-1 text-[12px] px-2 py-1.5 rounded-md bg-background/60 text-white border focus:outline-none placeholder:text-muted-foreground"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            style={{ background: "rgba(196,154,43,0.15)", border: `1px solid ${GOLD}`, color: GOLD }}
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground/70">{200 - message.length} chars left</div>
      </div>
    </div>
  );
}

/* -------------------- shared -------------------- */
function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] italic text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {text}
    </div>
  );
}
function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-[11px]" style={{ background: "rgba(224,74,74,0.06)", border: "1px solid rgba(224,74,74,0.2)", color: "rgba(255,255,255,0.7)" }}>
      <span><Lock className="inline h-3 w-3 mr-1" /> IRIS is thinking — {message}</span>
      <button onClick={onRetry} className="underline text-[11px]" style={{ color: GOLD }}>Try again</button>
    </div>
  );
}
function timeAgo(iso: string): string {
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
