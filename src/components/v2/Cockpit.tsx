import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { daysUntil } from "@/lib/countdowns";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { SOSModal } from "@/components/v2/SOSButton";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { toast } from "sonner";
import { Sparkles, Zap, Target, Phone, MoreHorizontal, AlertTriangle, ChevronRight, ChevronDown } from "lucide-react";

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  health: "red" | "yellow" | "green" | null;
  status: string | null;
  current_score: number | null;
};

type Props = {
  missionId: string;
  me: string;
  myQuestions: Q[];
  allQuestions: Q[];
  updateStatus: (q: Q, db: string) => Promise<void>;
};

// ---------- helpers ----------

function fmtFull(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  ready_for_review: "In Review",
  approved: "Complete",
};

function statusLabel(db: string | null | undefined) {
  return STATUS_LABEL[db ?? "not_started"] ?? "Not Started";
}

function statusPillStyle(db: string | null | undefined): React.CSSProperties {
  const v = db ?? "not_started";
  if (v === "in_progress") return { background: "rgba(59,127,255,0.12)", color: "#3b7fff" };
  if (v === "ready_for_review") return { background: "rgba(34,197,94,0.10)", color: "#22c55e" };
  if (v === "approved") return { background: "rgba(34,197,94,0.15)", color: "#22c55e" };
  return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)" };
}

function cmpNum(a: string, b: string): number {
  const ap = a.split(".").map((s) => parseInt(s, 10));
  const bp = b.split(".").map((s) => parseInt(s, 10));
  const n = Math.max(ap.length, bp.length);
  for (let i = 0; i < n; i++) {
    const x = ap[i] ?? 0, y = bp[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b);
    if (x !== y) return x - y;
  }
  return 0;
}

// ---------- top: instrument panel ----------

function Instrument({
  label, value, sub, isFirst, isLast,
}: {
  label: string; value: React.ReactNode; sub: React.ReactNode; isFirst?: boolean; isLast?: boolean;
}) {
  return (
    <div
      className="flex flex-1 flex-col gap-[2px]"
      style={{
        padding: isFirst ? "0 16px 0 0" : isLast ? "0 0 0 16px" : "0 16px",
        borderRight: isLast ? "none" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.22)" }}>{label}</div>
      <div className="font-mono text-[16px] font-medium leading-[1.1] text-white">{value}</div>
      <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{sub}</div>
    </div>
  );
}

function HealthDot({ health }: { health: "red" | "yellow" | "green" }) {
  const bg = health === "red" ? "#ef4444" : health === "yellow" ? "#f59e0b" : "#22c55e";
  const shadow = health === "red" ? "rgba(239,68,68,0.6)" : health === "yellow" ? "rgba(245,158,11,0.6)" : "rgba(34,197,94,0.6)";
  return (
    <span
      className="inline-block align-middle"
      style={{ width: 7, height: 7, borderRadius: "50%", marginRight: 4, background: bg, boxShadow: `0 0 5px ${shadow}` }}
    />
  );
}

// ---------- co-pilot strip ----------

type Broadcast = { id: string; from_name: string | null; text: string; created_at: string; mission_id: string };

function CoPilotStrip({ missionId, me }: { missionId: string; me: string }) {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ["cockpit-copilot", missionId, me],
    queryFn: async () => {
      const { data: bs } = await supabase
        .from("broadcasts")
        .select("id,from_name,text,created_at,mission_id")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(20);
      const ids = (bs ?? []).map((b) => b.id);
      if (ids.length === 0) return [] as Broadcast[];
      const { data: reads } = await supabase
        .from("note_reads").select("note_id").eq("user_id", me).in("note_id", ids);
      const seen = new Set((reads ?? []).map((r) => r.note_id));
      return (bs ?? []).filter((b) => !seen.has(b.id)) as Broadcast[];
    },
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("note_reads").insert({ note_id: id, user_id: me, mission_id: missionId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cockpit-copilot", missionId, me] }),
  });

  if (messages.length === 0) return null;
  const m = messages[0];
  const sender = (m.from_name ?? "Lead").split(/\s+/)[0];

  return (
    <div
      style={{
        background: "rgba(245,158,11,0.05)",
        borderBottom: "1px solid rgba(245,158,11,0.15)",
        borderLeft: "3px solid rgba(245,158,11,0.6)",
        padding: "9px 20px",
      }}
      className="flex items-center gap-3"
    >
      <span
        className="shrink-0 font-semibold uppercase"
        style={{
          fontSize: 9, letterSpacing: "0.16em",
          color: "rgba(245,158,11,0.8)",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 4, padding: "2px 7px",
        }}
      >
        Co-Pilot{messages.length > 1 ? `  1 of ${messages.length}` : ""}
      </span>
      <span className="shrink-0 text-[12px] font-semibold" style={{ color: "rgba(245,158,11,0.9)" }}>
        {sender} →
      </span>
      <span className="flex-1 truncate text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
        "{m.text}"
      </span>
      <button
        onClick={() => ack.mutate(m.id)}
        className="shrink-0 font-semibold transition"
        style={{
          height: 26, padding: "0 12px",
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 5,
          color: "rgba(245,158,11,0.8)",
          fontSize: 11,
        }}
      >
        Got it ✓
      </button>
    </div>
  );
}

// ---------- control bar ----------

function ControlBar({
  missionId, suggestedQ, openSOS, openScore, openPhone,
}: {
  missionId: string;
  suggestedQ: Q | null;
  openSOS: () => void;
  openScore: () => void;
  openPhone: () => void;
}) {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const ghostBtn = "inline-flex items-center justify-center gap-2 font-semibold transition";

  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: "#0a1628",
        borderBottom: "2px solid rgba(255,255,255,0.06)",
        padding: "12px 24px",
        justifyContent: "space-between",
      }}
    >
      <div className="flex flex-1 items-center" style={{ gap: 7 }}>
        <span className="mr-1 shrink-0 text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.18)" }}>
          Controls
        </span>

        {/* Ask IRIS */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-ask-iris", { detail: { missionId, questionId: suggestedQ?.id } }))}
          className={ghostBtn}
          style={{
            height: 44, padding: "0 18px",
            background: "rgba(8,145,178,0.12)",
            border: "1.5px solid rgba(8,145,178,0.4)",
            borderRadius: 9, color: "#0891b2",
            fontSize: 13, fontWeight: 700,
          }}
        >
          <span className="iris-pulse-dot" />
          Ask IRIS
        </button>

        {/* Open Question (primary gold) */}
        {suggestedQ && (
          <Link
            to="/missions/$missionId/questions/$questionId"
            params={{ missionId, questionId: suggestedQ.id }}
            className={ghostBtn}
            style={{
              height: 44, padding: "0 20px",
              background: "linear-gradient(135deg, #d4a235, #b8841e)",
              border: "none", borderRadius: 9, color: "#fff",
              fontSize: 14, fontWeight: 800,
              boxShadow: "0 4px 18px rgba(180,120,20,0.35)",
            }}
          >
            Open Q{suggestedQ.question_number} →
          </Link>
        )}

        {/* Update Reality */}
        <button
          onClick={() => openUpdateReality(suggestedQ?.id ?? null)}
          className={ghostBtn}
          style={{
            height: 44, padding: "0 18px",
            background: "#3b7fff", border: "none", borderRadius: 9,
            color: "#fff", fontSize: 13, fontWeight: 700,
          }}
        >
          <Zap className="h-4 w-4" /> Update Reality
        </button>

        {/* Score Me */}
        <button
          onClick={openScore}
          className={ghostBtn}
          style={{
            height: 44, padding: "0 16px",
            background: "rgba(255,255,255,0.04)",
            border: "1.5px solid rgba(255,255,255,0.09)",
            borderRadius: 9, color: "rgba(255,255,255,0.6)",
            fontSize: 13, fontWeight: 500,
          }}
        >
          <Target className="h-4 w-4" /> Score Me
        </button>

        {/* Phone a Friend */}
        <button
          onClick={openPhone}
          className={ghostBtn}
          style={{
            height: 44, padding: "0 16px",
            background: "rgba(124,58,237,0.08)",
            border: "1.5px solid rgba(124,58,237,0.22)",
            borderRadius: 9, color: "#a78bfa",
            fontSize: 13, fontWeight: 500,
          }}
        >
          <Phone className="h-4 w-4" /> Phone a Friend
        </button>

        {/* More */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="inline-flex items-center justify-center transition"
            style={{
              height: 44, width: 44,
              background: "rgba(255,255,255,0.04)",
              border: "1.5px solid rgba(255,255,255,0.07)",
              borderRadius: 9, color: "rgba(255,255,255,0.3)",
            }}
            aria-label="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-52 overflow-hidden rounded-md border border-border bg-surface shadow-xl">
              <button
                onClick={() => { setMoreOpen(false); navigate({ to: "/missions/$missionId/intelligence", params: { missionId } }).catch(() => navigate({ to: "/intelligence" })); }}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-hover"
              >
                Full intelligence
              </button>
              <button
                onClick={() => { setMoreOpen(false); navigate({ to: "/missions/$missionId/sources", params: { missionId } }).catch(() => {}); }}
                className="block w-full px-3 py-2 text-left text-xs hover:bg-surface-hover"
              >
                Source documents
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SOS — isolated right */}
      <button
        onClick={openSOS}
        className="inline-flex items-center font-semibold transition"
        style={{
          height: 44, padding: "0 18px", gap: 6,
          background: "rgba(239,68,68,0.1)",
          border: "1.5px solid rgba(239,68,68,0.35)",
          borderRadius: 9, color: "#ef4444",
          fontSize: 13, fontWeight: 800, letterSpacing: "0.06em",
        }}
      >
        <AlertTriangle className="h-[15px] w-[15px]" /> SOS
      </button>

      <style>{`
        .iris-pulse-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #0891b2;
          animation: iris-pulse 2.5s infinite;
        }
        @keyframes iris-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(8,145,178,0.5); }
          50% { box-shadow: 0 0 0 5px rgba(8,145,178,0); }
        }
      `}</style>
    </div>
  );
}

// ---------- main cockpit ----------

export function Cockpit({ missionId, me, myQuestions, allQuestions, updateStatus }: Props) {
  const [sosOpen, setSosOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const OTHERS_KEY = `atlas_cockpit_view_${missionId}`;
  const [view, setView] = useState<"mine" | "all">(() => {
    if (typeof window === "undefined") return "mine";
    try { return (localStorage.getItem(OTHERS_KEY) as "mine" | "all") || "mine"; } catch { return "mine"; }
  });
  useEffect(() => { try { localStorage.setItem(OTHERS_KEY, view); } catch { /* */ } }, [OTHERS_KEY, view]);

  // mission for submission date
  const { data: mission } = useQuery({
    queryKey: ["cockpit-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("submission_date,title").eq("id", missionId).maybeSingle();
      return data as { submission_date: string | null; title: string } | null;
    },
  });

  // next upcoming gate
  const { data: nextGate } = useQuery({
    queryKey: ["cockpit-gate", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []).find((g: any) => g.target_date && new Date(g.target_date) >= new Date()) ?? null;
    },
  });

  // IRIS brief cache
  const { data: briefRow } = useQuery({
    queryKey: ["cockpit-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("iris_brief_cache").select("brief_text").eq("scope", "mission").eq("ref_id", missionId).maybeSingle();
      return data as { brief_text: string | null } | null;
    },
  });

  // listen for SOS / Score / Phone events from command palette
  useEffect(() => {
    const onSOS = () => setSosOpen(true);
    const onScore = () => setScoreOpen(true);
    const onPhone = () => setPhoneOpen(true);
    window.addEventListener("atlas:open-sos", onSOS as EventListener);
    window.addEventListener("atlas:open-score-me", onScore as EventListener);
    window.addEventListener("atlas:open-phone-a-friend", onPhone as EventListener);
    return () => {
      window.removeEventListener("atlas:open-sos", onSOS as EventListener);
      window.removeEventListener("atlas:open-score-me", onScore as EventListener);
      window.removeEventListener("atlas:open-phone-a-friend", onPhone as EventListener);
    };
  }, []);

  // derived
  const counts = useMemo(() => {
    let r = 0, y = 0, g = 0;
    for (const q of myQuestions) {
      if (q.health === "red") r++;
      else if (q.health === "yellow") y++;
      else g++;
    }
    return { r, y, g };
  }, [myQuestions]);

  const overallHealth: "red" | "yellow" | "green" =
    counts.r > 0 ? "red" : counts.y > 0 ? "yellow" : "green";

  const nearestPensDown = useMemo(() => {
    const dated = myQuestions
      .filter((q) => q.pens_down_date)
      .sort((a, b) => new Date(a.pens_down_date!).getTime() - new Date(b.pens_down_date!).getTime());
    return dated[0] ?? null;
  }, [myQuestions]);

  const pensDownDays = nearestPensDown ? daysUntil(nearestPensDown.pens_down_date) : null;
  const gateDays = nextGate?.target_date ? daysUntil(nextGate.target_date) : null;
  const submitDays = mission?.submission_date ? daysUntil(mission.submission_date) : null;

  // IRIS suggested question
  const suggestedQ = useMemo(() => {
    const sorted = [...myQuestions].sort((a, b) => {
      const rank = (h: Q["health"]) => (h === "red" ? 0 : h === "yellow" ? 1 : h === "green" ? 3 : 2);
      const d = rank(a.health) - rank(b.health);
      if (d !== 0) return d;
      const ad = daysUntil(a.pens_down_date) ?? 9999;
      const bd = daysUntil(b.pens_down_date) ?? 9999;
      return ad - bd;
    });
    return sorted[0] ?? null;
  }, [myQuestions]);

  // attention summary
  const needAttention = myQuestions.filter((q) => q.health === "red" || q.health === "yellow");

  // brief panel rows
  const row1Text = needAttention.length === 0
    ? "All on track"
    : `${needAttention.map((q) => `Q${q.question_number}`).slice(0, 3).join(" and ")} need your attention`;
  const row1Urgent = needAttention.some((q) => q.health === "red");

  const row2 = suggestedQ
    ? { text: `Q${suggestedQ.question_number} · Pens Down ${fmtFull(suggestedQ.pens_down_date).replace(/, \d{4}$/, "")} · ${pensDownDays ?? "—"} days`, amber: (pensDownDays ?? 99) < 14 }
    : { text: "—", amber: false };

  const row4 = nextGate
    ? { text: `${nextGate.gate_name} · ${fmtFull(nextGate.target_date).replace(/, \d{4}$/, "")} · ${gateDays} days`, amber: (gateDays ?? 99) < 7 }
    : { text: "—", amber: false };

  // questions section
  const myQuestionsSorted = useMemo(() => {
    return [...myQuestions].sort((a, b) => {
      const rank = (h: Q["health"]) => (h === "red" ? 0 : h === "yellow" ? 1 : h === "green" ? 3 : 2);
      const d = rank(a.health) - rank(b.health);
      if (d !== 0) return d;
      return (daysUntil(a.pens_down_date) ?? 9999) - (daysUntil(b.pens_down_date) ?? 9999);
    });
  }, [myQuestions]);

  const allHealthCounts = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const q of allQuestions) {
      if (q.health === "red") r++;
      else if (q.health === "yellow") y++;
      else g++;
    }
    return { g, y, r };
  }, [allQuestions]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      {/* 1 — INSTRUMENT PANEL */}
      <div
        className="flex items-center"
        style={{
          background: "linear-gradient(180deg, #0d1a2e 0%, #091220 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "11px 24px",
        }}
      >
        <Instrument
          isFirst
          label="Mission Health"
          value={
            <span style={{ color: overallHealth === "red" ? "#ef4444" : overallHealth === "yellow" ? "#f59e0b" : "#fff" }}>
              <HealthDot health={overallHealth} />
              {overallHealth === "yellow" ? "Yellow" : overallHealth === "red" ? "Red" : "Green"}
            </span>
          }
          sub={
            needAttention.length === 0
              ? "All on track"
              : `${needAttention.length} need attention`
          }
        />
        <Instrument
          label="Pens Down"
          value={
            <span style={{ color: (pensDownDays ?? 99) < 14 ? "#ef4444" : "#fff" }}>
              {pensDownDays !== null ? `${pensDownDays} days` : "—"}
            </span>
          }
          sub={nearestPensDown ? fmtFull(nearestPensDown.pens_down_date) : "—"}
        />
        <Instrument
          label="Next Gate"
          value={
            nextGate ? (
              <span style={{ color: (gateDays ?? 99) < 7 ? "#f59e0b" : "#fff" }}>
                {nextGate.gate_name}
              </span>
            ) : "—"
          }
          sub={nextGate ? `${fmtFull(nextGate.target_date).replace(/, \d{4}$/, "")} · ${gateDays} days` : "None scheduled"}
        />
        <Instrument
          label="My Questions"
          value={myQuestions.length}
          sub={
            <span>
              <span style={{ color: "#22c55e" }}>{counts.g} green</span>
              {" · "}
              <span style={{ color: "#f59e0b" }}>{counts.y} yellow</span>
            </span>
          }
        />
        <Instrument
          isLast
          label="Submission"
          value={submitDays !== null ? `${submitDays} days` : "—"}
          sub={mission?.submission_date ? fmtFull(mission.submission_date) : "—"}
        />
      </div>

      {/* 2 — CO-PILOT STRIP */}
      <CoPilotStrip missionId={missionId} me={me} />

      {/* 3 — CONTROL BAR */}
      <ControlBar
        missionId={missionId}
        suggestedQ={suggestedQ}
        openSOS={() => setSosOpen(true)}
        openScore={() => setScoreOpen(true)}
        openPhone={() => setPhoneOpen(true)}
      />

      {/* 4 — MAIN AREA */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: IRIS Co-Pilot */}
        <aside
          className="flex shrink-0 flex-col"
          style={{
            width: 210,
            background: "rgba(8,145,178,0.03)",
            borderRight: "1px solid rgba(8,145,178,0.09)",
            padding: 14, gap: 11,
          }}
        >
          <div className="flex items-center" style={{ gap: 7 }}>
            <span className="iris-pulse-dot-left" />
            <span className="text-[9px] font-bold uppercase" style={{ letterSpacing: "0.22em", color: "#0891b2" }}>
              IRIS · Co-Pilot
            </span>
          </div>

          <div
            className="italic"
            style={{
              fontSize: 11.5, lineHeight: 1.65,
              color: "rgba(255,255,255,0.52)",
              borderLeft: "2px solid rgba(8,145,178,0.28)",
              paddingLeft: 9,
            }}
          >
            "{(briefRow?.brief_text ?? `${suggestedQ ? `Q${suggestedQ.question_number} is your priority. ` : ""}${nextGate ? `${nextGate.gate_name} is in ${gateDays} days. ` : ""}Stay focused on what's urgent.`)
              .split(/(?<=[.!?])\s+/).slice(0, 3).join(" ")}"
          </div>

          <div style={{ height: 1, background: "rgba(8,145,178,0.1)" }} />

          <InsightBlock tag="State Priority" body="Evaluators weight county-level deployment above national frameworks." />
          <InsightBlock tag="Differentiation" body="Deep local data competitors cannot match. Lead with specifics." />
          <InsightBlock tag="⚠ Compliance" body="Reference the DOH plan by name in your response." amber />

          <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.18)", marginTop: 6 }}>
            ● High confidence · 4 sources
          </div>

          <div
            className="mt-auto flex flex-col"
            style={{
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              gap: 5,
            }}
          >
            <Link to="/missions/$missionId" params={{ missionId }} className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
              Source documents →
            </Link>
            <Link to="/missions/$missionId" params={{ missionId }} className="text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
              Full intelligence →
            </Link>
          </div>

          <style>{`
            .iris-pulse-dot-left {
              width: 7px; height: 7px; border-radius: 50%; background: #0891b2;
              animation: iris-pulse 2.5s infinite;
            }
          `}</style>
        </aside>

        {/* RIGHT: Brief Panel + Questions */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {/* 4-row brief panel */}
          <div
            className="shrink-0 overflow-hidden"
            style={{
              margin: "12px 16px 0",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 9,
            }}
          >
            <BriefRow label="TODAY" value={row1Text} urgent={row1Urgent} />
            <BriefRow label="NEXT STEP" value={row2.text} amber={row2.amber} />
            <BriefRow
              label="WAITING ON"
              value={suggestedQ ? `SME response pending · Q${suggestedQ.question_number}` : "Nothing waiting"}
              muted={!suggestedQ}
            />
            <BriefRow label="NEXT GATE" value={row4.text} amber={row4.amber} last />
          </div>

          {/* Questions */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "12px 16px" }}>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.2em", color: "rgba(255,255,255,0.22)" }}>
                {view === "mine" ? "My Assignments" : "All Questions"}
              </span>
              <div className="flex" style={{ gap: 4 }}>
                <ToggleBtn active={view === "mine"} onClick={() => setView("mine")}>Mine {myQuestions.length}</ToggleBtn>
                <ToggleBtn active={view === "all"} onClick={() => setView("all")}>All {allQuestions.length}</ToggleBtn>
              </div>
            </div>

            {/* Suggested question card */}
            {suggestedQ && (
              <Link
                to="/missions/$missionId/questions/$questionId"
                params={{ missionId, questionId: suggestedQ.id }}
                className="mb-2.5 flex items-center justify-between transition hover:translate-x-[2px]"
                style={{
                  background: "rgba(59,127,255,0.07)",
                  border: "1px solid rgba(59,127,255,0.18)",
                  borderRadius: 9, padding: "9px 13px",
                }}
              >
                <div>
                  <div className="text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.14em", color: "#0891b2", marginBottom: 2 }}>
                    ● IRIS · Start here
                  </div>
                  <div className="text-[13px] font-semibold text-white">
                    Q{suggestedQ.question_number} · {suggestedQ.title}
                  </div>
                  <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)", marginTop: 1 }}>
                    {pensDownDays !== null ? `${pensDownDays} days` : "—"} · {suggestedQ.health ?? "—"}
                  </div>
                </div>
                <ChevronRight className="h-[18px] w-[18px]" style={{ color: "#3b7fff" }} />
              </Link>
            )}

            {/* Question rows */}
            {(view === "mine" ? myQuestionsSorted : allQuestions).map((q) => (
              <CockpitQRow
                key={q.id}
                q={q}
                missionId={missionId}
                isMine={q.assigned_writer_id === me}
                updateStatus={updateStatus}
              />
            ))}

            {view === "mine" && myQuestionsSorted.length === 0 && (
              <div className="rounded-md border border-dashed border-border bg-surface/40 p-8 text-center text-sm text-muted-foreground">
                No questions assigned to you yet.
              </div>
            )}
          </div>

          {/* All questions row */}
          <button
            onClick={() => setView(view === "all" ? "mine" : "all")}
            className="flex items-center justify-between border-t transition hover:bg-white/[0.03]"
            style={{
              padding: "9px 16px",
              borderTopColor: "rgba(255,255,255,0.05)",
            }}
          >
            <span className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.28)" }}>
              <span style={{ opacity: 0.4, fontSize: 13 }}>›</span> All questions · {allQuestions.length} total
            </span>
            <span className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#22c55e" }} /><span style={{ color: "#22c55e" }}>{allHealthCounts.g}</span></span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} /><span style={{ color: "#f59e0b" }}>{allHealthCounts.y}</span></span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} /><span style={{ color: "#ef4444" }}>{allHealthCounts.r}</span></span>
            </span>
          </button>
        </section>
      </div>

      {/* modals */}
      {sosOpen && <SOSModal missionId={missionId} onClose={() => setSosOpen(false)} />}
      <ScoreMeOverlay open={scoreOpen} onClose={() => setScoreOpen(false)} missionId={missionId} lockedQuestionId={suggestedQ?.id} />
      {phoneOpen && suggestedQ && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={suggestedQ.id}
          questionNumber={suggestedQ.question_number}
          meId={me}
          meName=""
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </div>
  );
}

function InsightBlock({ tag, body, amber }: { tag: string; body: string; amber?: boolean }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div className="text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.15em", color: amber ? "rgba(245,158,11,0.8)" : "rgba(8,145,178,0.6)", marginBottom: 2 }}>
        {tag}
      </div>
      <div className="text-[11px]" style={{ lineHeight: 1.55, color: "rgba(255,255,255,0.38)" }}>
        {body}
      </div>
    </div>
  );
}

function BriefRow({ label, value, urgent, amber, muted, last }: { label: string; value: string; urgent?: boolean; amber?: boolean; muted?: boolean; last?: boolean }) {
  const color = urgent ? "#ef4444" : amber ? "#f59e0b" : muted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)";
  return (
    <div
      className="flex items-center"
      style={{
        height: 34, padding: "0 14px", gap: 14,
        borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span className="shrink-0 text-[9px] font-semibold uppercase" style={{ width: 78, letterSpacing: "0.18em", color: "rgba(255,255,255,0.22)" }}>
        {label}
      </span>
      <span className="flex-1 truncate text-[12px]" style={{ color, fontWeight: urgent ? 600 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-semibold transition"
      style={{
        height: 22, padding: "0 10px", borderRadius: 5,
        fontSize: 10, border: "none",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.22)",
      }}
    >
      {children}
    </button>
  );
}

function CockpitQRow({ q, missionId, isMine, updateStatus }: {
  q: Q; missionId: string; isMine: boolean; updateStatus: (q: Q, db: string) => Promise<void>;
}) {
  const days = daysUntil(q.pens_down_date);
  const dot = q.health === "red" ? "#ef4444" : q.health === "yellow" ? "#f59e0b" : "#22c55e";
  const shadow = q.health === "red" ? "rgba(239,68,68,0.5)" : q.health === "yellow" ? "rgba(245,158,11,0.5)" : "rgba(34,197,94,0.5)";
  const countdownColor = days === null ? "rgba(255,255,255,0.25)" : days < 7 ? "#ef4444" : days < 14 ? "#f59e0b" : "rgba(255,255,255,0.25)";

  const row = (
    <div
      className="flex items-center transition"
      style={{
        height: 44, gap: 11, padding: "0 5px", borderRadius: 7,
        borderLeft: isMine ? "2px solid #3b7fff" : "2px solid transparent",
        background: isMine ? "rgba(59,127,255,0.04)" : "transparent",
      }}
    >
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: `0 0 4px ${shadow}`, flexShrink: 0 }} />
      <span className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.4)", width: 34, flexShrink: 0 }}>
        Q{q.question_number}
      </span>
      <span className="flex-1 truncate text-[13px] font-medium text-white">{q.title}</span>
      <span
        className="shrink-0 font-semibold"
        style={{ ...statusPillStyle(q.status), fontSize: 10, padding: "2px 7px", borderRadius: 5 }}
        onClick={isMine ? (e) => { e.preventDefault(); e.stopPropagation(); /* opens StatusPill in workspace */ } : undefined}
      >
        {statusLabel(q.status)}
      </span>
      <span className="shrink-0 text-right text-[11px] font-semibold" style={{ width: 30, color: countdownColor }}>
        {days !== null ? `${days}d` : "—"}
      </span>
    </div>
  );

  return (
    <Link
      to="/missions/$missionId/questions/$questionId"
      params={{ missionId, questionId: q.id }}
      className="block hover:bg-white/[0.03]"
      style={{ borderRadius: 7, marginBottom: 2 }}
    >
      {row}
    </Link>
  );
}
