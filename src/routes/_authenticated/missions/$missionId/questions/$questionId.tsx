import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisAskQuestion } from "@/lib/iris-ask.functions";
import { generateQuestionCoaching } from "@/lib/iris-question-coaching.functions";
import { openUpdateReality } from "@/components/v2/UpdateRealityModal";
import { SOSButton } from "@/components/v2/SOSButton";
import { PhoneAFriendOverlay } from "@/components/v2/PhoneAFriendOverlay";
import { IrisCorrectable } from "@/components/v2/IrisCorrectable";
import { ScoreMeOverlay } from "@/components/v2/ScoreMeOverlay";
import { CompliancePanel as ComplianceRequirementsPanel } from "@/components/v2/CompliancePanel";
import { getLastQuestionVisit, markQuestionVisited } from "@/lib/writer-utils";
import { CoPilotInbox } from "@/components/v2/CoPilotInbox";
import { ConfidenceButton, ConfidenceDot } from "@/components/v2/CockpitConfidence";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { ThreadPanel } from "@/components/threads/ThreadPanel";
import {
  Sparkles, Send, RefreshCw, AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
  CheckCircle2, ArrowLeftRight, FileEdit, Lightbulb, Pin, CornerDownLeft, X, LifeBuoy,
  MoreHorizontal, Phone, ArrowRight, Bell,
} from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: CockpitPage,
});

/* ──────────────────────────── types ──────────────────────────── */

type Q = {
  id: string; mission_id: string; question_number: string; title: string;
  question_text: string; pens_down_date: string | null;
  guidance: string | null; requirements: string[] | null; mandatory_language: string[] | null;
  status: string | null; health: "red" | "yellow" | "green" | null;
  health_drivers: any; assigned_writer_id: string | null; assigned_sme_id: string | null;
  section_number: string | null; page_limit: number | null; evaluation_weight: number | null;
  writer_confidence: "confident" | "uncertain" | "stuck" | null;
};
type Profile = { id: string; display_name: string | null; email: string | null };
type Intel = {
  iris_brief: string | null; state_priorities: string | null;
  procurement_priorities: string | null; competitor_signals: string | null;
  compliance_flags: string[] | null; relevant_research: string[] | null;
  generated_at?: string;
};
type Collab = {
  id: string; entry_type: string; body: string; author_name: string;
  created_at: string; resolved: boolean;
};
type Mission = { id: string; name: string; submission_date: string | null };
type Gate = { id: string; gate_name: string; target_date: string | null };
type WinTheme = { id: string; title: string; question_ids: string[] | null };

/* ──────────────────────────── helpers ──────────────────────────── */

const HEALTH_HEX: Record<string, string> = {
  red: "#ef4444", yellow: "#eab308", green: "#22c55e",
};

function daysUntil(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function firstName(p?: Profile | null): string {
  if (!p) return "—";
  const n = p.display_name || p.email?.split("@")[0] || "";
  return n.split(" ")[0] || "—";
}

/* ──────────────────────────── page ──────────────────────────── */

function CockpitPage() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* current user + role */
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles").select("id,display_name,email").eq("id", user.id).maybeSingle();
      return profile as Profile | null;
    },
  });
  const { data: role } = useQuery({
    queryKey: ["cockpit-role", missionId, me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members").select("role")
        .eq("mission_id", missionId).eq("user_id", me!.id).maybeSingle();
      return (data?.role as string | undefined) ?? null;
    },
  });
  const isSME = role === "sme";

  /* the question */
  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,pens_down_date,guidance,requirements,mandatory_language,status,health,health_drivers,assigned_writer_id,assigned_sme_id,section_number,page_limit,evaluation_weight,writer_confidence")
        .eq("id", questionId).maybeSingle();
      if (error) throw error;
      return data as Q | null;
    },
  });

  /* mission + gates for health strip */
  const { data: mission } = useQuery({
    queryKey: ["mission-meta", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions").select("id,name,submission_date").eq("id", missionId).maybeSingle();
      return data as Mission | null;
    },
  });
  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("target_date", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });
  const nextGate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return gates.find((g) => g.target_date && g.target_date >= today) ?? null;
  }, [gates]);

  /* mission-wide health counts for the sticky strip */
  const { data: missionHealth = { green: 0, yellow: 0, red: 0 } } = useQuery({
    queryKey: ["mission-health-counts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("health")
        .eq("mission_id", missionId);
      const counts = { green: 0, yellow: 0, red: 0 } as Record<"green" | "yellow" | "red", number>;
      for (const r of data ?? []) {
        const h = (r.health as string) ?? "";
        if (h === "green" || h === "yellow" || h === "red") counts[h]++;
      }
      return counts;
    },
  });

  /* writer's other assigned questions in this mission */
  const { data: myQuestions = [] } = useQuery({
    queryKey: ["cockpit-my-questions", missionId, me?.id, isSME],
    enabled: !!me?.id,
    queryFn: async () => {
      const col = isSME ? "assigned_sme_id" : "assigned_writer_id";
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,pens_down_date,health,writer_confidence,status,updated_at")
        .eq("mission_id", missionId).eq(col, me!.id)
        .order("question_number");
      return (data ?? []) as Array<{ id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null; writer_confidence: "confident" | "uncertain" | "stuck" | null; status: string | null; updated_at: string | null }>;
    },
  });

  /* intel — drives morning brief + 2x2 grid */
  const { data: intel, isLoading: intelLoading, refetch: refetchIntel } = useQuery({
    queryKey: ["question-intel", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_intelligence")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags,relevant_research,generated_at")
        .eq("question_id", questionId)
        .order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return data as Intel | null;
    },
  });
  const coachingFn = useServerFn(generateQuestionCoaching);
  const [coachingPending, setCoachingPending] = useState(false);
  const regenerateCoaching = async (force: boolean) => {
    setCoachingPending(true);
    try {
      await coachingFn({ data: { questionId, force } });
      await refetchIntel();
      if (force) toast.success("IRIS brief refreshed.");
    } catch (e: any) {
      toast.error(e?.message ?? "IRIS refresh failed");
    } finally { setCoachingPending(false); }
  };
  useEffect(() => {
    if (intelLoading || intel || coachingPending) return;
    regenerateCoaching(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelLoading, intel?.generated_at]);

  /* profiles for writer/SME labels */
  const profileIds = [q?.assigned_writer_id, q?.assigned_sme_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["question-profiles", profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", profileIds);
      return (data ?? []) as Profile[];
    },
  });
  const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));

  /* win themes (chips) */
  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes").select("id,title,question_ids").eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedThemes = winThemes.filter((w) => (w.question_ids ?? []).includes(questionId));

  /* health drivers compact list */
  const drivers = useMemo<string[]>(() => {
    const list: string[] = [];
    if (q?.health_drivers && typeof q.health_drivers === "object") {
      for (const v of Object.values(q.health_drivers)) {
        if (typeof v === "string" && v.trim()) list.push(v);
      }
    }
    return list.slice(0, 4);
  }, [q]);

  /* What Changed feed */
  const { data: collabs = [] } = useQuery({
    queryKey: ["question-collabs", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,entry_type,body,author_name,created_at,resolved")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false }).limit(30);
      return (data ?? []) as Collab[];
    },
  });
  const { data: amendmentChanges = [] } = useQuery({
    queryKey: ["amendment-changes", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("amendment_changes")
        .select("id,description,writer_action_required,acknowledged,created_at,severity")
        .contains("affected_question_ids", [questionId])
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{ id: string; description: string; writer_action_required: string | null; acknowledged: boolean; created_at: string; severity: string }>;
    },
  });

  /* last visit + mark as visited on mount */
  const lastVisitRef = useRef<number>(0);
  useEffect(() => {
    lastVisitRef.current = getLastQuestionVisit(questionId);
    // mark after we record what was unread
    const t = setTimeout(() => markQuestionVisited(questionId), 500);
    return () => clearTimeout(t);
  }, [questionId]);

  type FeedItem = {
    kind: "sme" | "intel" | "leader" | "conflict" | "amendment" | "leader_reply" | "decision";
    id: string;
    title: string;
    author: string;
    created_at: string;
    body: string;
    ackButton?: { label: string; onClick: () => void } | null;
  };
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const c of collabs) {
      const base = { id: c.id, author: c.author_name, created_at: c.created_at, body: c.body };
      if (c.entry_type === "sme_response" || c.entry_type === "sme_input") {
        items.push({ kind: "sme", title: `${c.author_name} responded`, ...base });
      } else if (c.entry_type === "leadership_note" || c.entry_type === "broadcast") {
        items.push({ kind: "leader", title: `${c.author_name} posted a leadership note`, ...base });
      } else if (c.entry_type === "decision_response") {
        items.push({ kind: "leader_reply", title: `${c.author_name} responded to your decision request`, ...base });
      } else if (c.entry_type === "decision_logged" || c.entry_type === "decision") {
        items.push({ kind: "decision", title: `Decision logged`, ...base });
      } else if (c.entry_type === "alignment_conflict") {
        items.push({ kind: "conflict", title: `IRIS detected an alignment conflict`, ...base });
      }
    }
    for (const a of amendmentChanges) {
      items.push({
        kind: "amendment",
        id: a.id,
        title: `Amendment affects your question`,
        author: "Admin",
        created_at: a.created_at,
        body: `${a.description}${a.writer_action_required ? `\n\nWhat you need to do: ${a.writer_action_required}` : ""}`,
        ackButton: a.acknowledged ? null : {
          label: "Acknowledge",
          onClick: async () => {
            const { data: auth } = await supabase.auth.getUser();
            await supabase.from("amendment_changes")
              .update({ acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
              .eq("id", a.id);
            qc.invalidateQueries({ queryKey: ["amendment-changes", questionId] });
          },
        },
      });
    }
    return items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [collabs, amendmentChanges, qc, questionId]);

  const lastVisitTimeStr = lastVisitRef.current
    ? timeAgo(new Date(lastVisitRef.current).toISOString())
    : "your first visit";

  /* writer + sme */
  const writer = q?.assigned_writer_id ? profById[q.assigned_writer_id] : null;
  const sme = q?.assigned_sme_id ? profById[q.assigned_sme_id] : null;

  /* derived */
  const pdDays = daysUntil(q?.pens_down_date ?? null);
  const gateDays = daysUntil(nextGate?.target_date ?? null);
  const subDays = daysUntil(mission?.submission_date ?? null);
  const healthHex = HEALTH_HEX[q?.health ?? "yellow"];

  /* UI state */
  const [askOpen, setAskOpen] = useState(false);
  const [getHelpOpen, setGetHelpOpen] = useState(false);
  const [scoreMeOpen, setScoreMeOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setPhoneOpen(true);
    window.addEventListener("atlas:open-phone-a-friend", onOpen);
    return () => window.removeEventListener("atlas:open-phone-a-friend", onOpen);
  }, []);

  /* Ask IRIS */
  const askFn = useServerFn(irisAskQuestion);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const onAsk = async () => {
    if (!prompt.trim()) return;
    setAsking(true); setAnswer("");
    try {
      const r = await askFn({ data: { questionId, prompt: prompt.trim() } });
      setAnswer(r.answer);
    } catch (e: any) {
      setAnswer(`_Error: ${e?.message ?? "unknown"}_`);
    } finally { setAsking(false); }
  };

  /* ──────── Situation engine ──────── */
  // Unread co-pilot messages targeted to me on this question/mission
  const { data: unreadCopilotCount = 0 } = useQuery({
    queryKey: ["copilot-unread", missionId, questionId, me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pilot_copilot_messages")
        .select("id,to_user_id,is_broadcast,acknowledged")
        .eq("mission_id", missionId)
        .or(`question_id.eq.${questionId},is_broadcast.eq.true`);
      return (data ?? []).filter((m: any) =>
        !m.acknowledged && (m.to_user_id === me!.id || m.is_broadcast)
      ).length;
    },
  });

  // Last check-in (latest signal authored by me on this mission)
  const { data: lastCheckInAt } = useQuery({
    queryKey: ["last-checkin", missionId, me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("created_at")
        .eq("mission_id", missionId)
        .eq("user_id", me!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.created_at as string | null) ?? null;
    },
  });

  // Brief read this session (sessionStorage flag keyed by question)
  const briefSeenKey = `cockpit:brief-seen:${questionId}`;
  const [briefSeenThisSession, setBriefSeenThisSession] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !!sessionStorage.getItem(briefSeenKey);
  });
  useEffect(() => {
    if (!intel?.iris_brief || briefSeenThisSession) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(briefSeenKey, "1");
      setBriefSeenThisSession(true);
    }, 6000); // counts as read after 6s of brief being visible
    return () => clearTimeout(t);
  }, [intel?.iris_brief, briefSeenThisSession, briefSeenKey]);

  type PrimaryAction = "read_copilot" | "check_in" | "read_iris" | "get_help" | "urgent_write" | "default";
  const primaryAction: PrimaryAction = useMemo(() => {
    if (unreadCopilotCount > 0) return "read_copilot";
    const hoursSinceCheckIn = lastCheckInAt
      ? (Date.now() - new Date(lastCheckInAt).getTime()) / 3_600_000
      : Infinity;
    const pd = daysUntil(q?.pens_down_date ?? null);
    if (hoursSinceCheckIn > 20 && pd !== null && pd < 14) return "check_in";
    if (q?.writer_confidence === "stuck") return "get_help";
    if (pd !== null && pd >= 0 && pd < 7 && q?.status !== "approved") return "urgent_write";
    if (intel?.iris_brief && !briefSeenThisSession) return "read_iris";
    return "default";
  }, [unreadCopilotCount, lastCheckInAt, q?.pens_down_date, q?.writer_confidence, q?.status, intel?.iris_brief, briefSeenThisSession]);

  const microLabel: string = useMemo(() => {
    switch (primaryAction) {
      case "read_copilot": return "Your Co-Pilot sent you a message.";
      case "check_in":     return "You haven't checked in today.";
      case "read_iris":    return "Read IRIS before you write.";
      case "get_help":     return "You marked yourself as stuck.";
      case "urgent_write": return `${daysUntil(q?.pens_down_date ?? null) ?? "—"} days to Pens Down.`;
      default:             return `Q${q?.question_number ?? ""} is open.`;
    }
  }, [primaryAction, q?.pens_down_date, q?.question_number]);

  /* ──────── Suggested question (IRIS) ──────── */
  const suggestedQuestion = useMemo(() => {
    if (myQuestions.length === 0) return null;
    const list = [...myQuestions];
    const score = (mq: typeof list[number]) => {
      const d = daysUntil(mq.pens_down_date);
      const dScore = d === null ? 9999 : Math.max(0, d);
      const hScore = mq.health === "red" ? 0 : mq.health === "yellow" ? 1 : 2;
      const stuck = mq.writer_confidence === "stuck" ? -1 : 0;
      return hScore * 10000 + dScore + stuck;
    };
    list.sort((a, b) => score(a) - score(b));
    const top = list[0];
    if (!top) return null;
    return top;
  }, [myQuestions]);

  /* First-visit tooltips */
  const [tipStage, setTipStage] = useState<0 | 1 | 2>(0); // 0 = brief, 1 = action bar, 2 = done
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem("cockpit:has_used");
    if (seen) { setTipStage(2); return; }
    setTipStage(0);
    const t1 = setTimeout(() => setTipStage(1), 4000);
    const t2 = setTimeout(() => {
      setTipStage(2);
      localStorage.setItem("cockpit:has_used", "1");
    }, 7000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  /* Sublabels for overflow menu — disappear after first use */
  const [showSublabels, setShowSublabels] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("cockpit:overflow_used");
  });
  const markOverflowUsed = () => {
    localStorage.setItem("cockpit:overflow_used", "1");
    setShowSublabels(false);
  };



  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading…</div>;
  if (!q) {
    return (
      <div className="px-8 py-12 text-sm">
        Response not found.{" "}
        <Link to="/missions/$missionId/questions" params={{ missionId }} className="text-primary hover:underline">Back</Link>
      </div>
    );
  }

  const isLead = role === "admin" || role === "lead";
  const isAssignedWriter = !!me?.id && q.assigned_writer_id === me.id;
  const isAssignedSme = !!me?.id && q.assigned_sme_id === me.id;
  const isReadOnlyView = isLead && !isAssignedWriter && !isAssignedSme;

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh" }} className="text-foreground">
      <ThreadsLauncher questionId={questionId} />
      {isReadOnlyView && (
        <div
          className="sticky top-0 z-40 flex h-10 items-center justify-between gap-3 border-b px-10 text-[12px]"
          style={{ background: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.4)", color: "#fde68a" }}
        >
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5" />
            <span className="font-semibold">VIEWING {firstName(writer).toUpperCase()}'S COCKPIT</span>
            <span className="opacity-80">· Read-only · {firstName(writer)} cannot see you here</span>
          </div>
          <Link
            to="/missions/$missionId/overview"
            params={{ missionId }}
            className="text-[11px] underline-offset-2 hover:underline"
          >
            ← Back to Mission Room
          </Link>
        </div>
      )}
      {/* 1. HEALTH STRIP — sticky */}
      <Link
        to="/missions/$missionId/overview"
        params={{ missionId }}
        className={`sticky top-0 z-30 flex h-9 items-center gap-3 border-b px-10 text-[12px] backdrop-blur transition-colors hover:bg-[#0a1426]/95 ${
          primaryAction === "urgent_write" ? "animate-pulse" : ""
        }`}
        style={{
          background: primaryAction === "urgent_write" ? "rgba(127,29,29,0.6)" : "rgba(6,11,20,0.95)",
          borderColor: primaryAction === "urgent_write" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.06)",
        }}
        title="Open Mission Brief"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: healthHex, boxShadow: `0 0 6px ${healthHex}` }} />
        <span className="text-foreground font-medium truncate">{mission?.name ?? "Mission"}</span>
        <Dot />
        <span className="text-[11px]" style={{ color: "#22c55e" }}>{missionHealth.green} Green</span>
        <span className="text-[11px]" style={{ color: "#eab308" }}>{missionHealth.yellow} Yellow</span>
        <span className="text-[11px]" style={{ color: "#ef4444" }}>{missionHealth.red} Red</span>
        {nextGate && gateDays !== null && (
          <>
            <Dot />
            <span style={gateDays <= 3 ? { color: "#ef4444" } : gateDays <= 7 ? { color: "#eab308" } : { color: "var(--muted-foreground)" }}>
              {nextGate.gate_name} in {gateDays}d
            </span>
          </>
        )}
        {subDays !== null && (
          <>
            <Dot />
            <span className={subDays < 7 ? "font-bold" : ""} style={{ color: subDays < 7 ? "#ef4444" : subDays <= 14 ? "#eab308" : "var(--muted-foreground)" }}>
              Submission in {subDays}d
            </span>
          </>
        )}
      </Link>

      <div className="mx-auto max-w-[960px] px-10 pt-32 pb-16">
        {/* 2. IRIS MORNING BRIEF — 3 sentences max */}
        <section
          className="relative mb-6 rounded-[12px] border px-6 py-5"
          style={{ background: "rgba(8,145,178,0.05)", borderColor: "rgba(8,145,178,0.15)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot" /> IRIS — Your Morning Brief
            </span>
            <button
              onClick={() => regenerateCoaching(true)}
              disabled={coachingPending}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {intel?.generated_at && <span>Updated {timeAgo(intel.generated_at)} · </span>}
              <RefreshCw className={`h-3 w-3 ${coachingPending ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          {intelLoading || coachingPending ? (
            <div className="iris-loading-text"><span className="iris-dot" /> IRIS is preparing your brief…</div>
          ) : intel?.iris_brief ? (
            <MorningBriefBody text={intel.iris_brief} missionId={missionId} questionId={questionId} />
          ) : (
            <p className="text-sm text-muted-foreground"><span className="iris-dot mr-2" /> IRIS is preparing your brief.</p>
          )}
          {tipStage === 0 && !isReadOnlyView && (
            <FirstVisitTooltip>IRIS briefs you here every morning.</FirstVisitTooltip>
          )}
        </section>

        {/* 3. FROM YOUR CO-PILOT — only renders when messages exist (component handles visibility) */}
        {!isReadOnlyView && me?.id && (
          <CoPilotInbox missionId={missionId} questionId={questionId} currentUserId={me.id} />
        )}

        {/* 4. WHAT CHANGED — filtered to this writer's questions, max 5 */}
        <WhatChangedFiltered
          feed={feed}
          lastVisit={lastVisitRef.current}
          lastVisitTimeStr={lastVisitTimeStr}
        />

        {/* 5. BRIEF PANEL — 4 fixed rows */}
        <BriefPanel
          todayCount={myQuestions.filter((mq) => mq.health === "red" || mq.health === "yellow").length}
          nextStep={suggestedQuestion}
          waitingCount={collabs.filter((c) => !c.resolved && (c.entry_type === "sme_request" || c.entry_type === "direction_request" || c.entry_type === "decision_needed" || c.entry_type === "review_request")).length}
          nextGateName={nextGate?.gate_name ?? null}
          nextGateDate={nextGate?.target_date ?? null}
        />

        {/* 6. SUGGESTED QUESTION — IRIS pick */}
        {!isReadOnlyView && !isSME && suggestedQuestion && suggestedQuestion.id !== questionId && (
          <section className="mb-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#22d3ee" }}>
              <span className="iris-dot mr-1.5" /> IRIS suggests starting with:
            </div>
            <Link
              to="/missions/$missionId/questions/$questionId"
              params={{ missionId, questionId: suggestedQuestion.id }}
              className="flex h-[52px] w-full items-center justify-between rounded-[10px] border px-5 transition hover:-translate-y-px"
              style={{ background: "rgba(59,127,255,0.08)", borderColor: "rgba(59,127,255,0.25)" }}
            >
              <span className="truncate text-[14px] font-semibold text-foreground">
                Q{suggestedQuestion.question_number} · {suggestedQuestion.title}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
            </Link>
            <div className="mt-1.5 pl-1 text-[11px] text-muted-foreground">
              {(() => {
                const d = daysUntil(suggestedQuestion.pens_down_date);
                const dStr = d === null ? "—" : d < 0 ? `${Math.abs(d)}d overdue` : `${d} days`;
                const h = suggestedQuestion.health;
                const hStr = h ? `● ${h[0].toUpperCase() + h.slice(1)}` : "—";
                const reason = suggestedQuestion.writer_confidence === "stuck"
                  ? "You marked it stuck"
                  : h === "red" ? "Most urgent" : h === "yellow" ? "Needs attention" : "Next up";
                return `${dStr} · ${hStr} · ${reason}`;
              })()}
            </div>
          </section>
        )}

        {/* 7. MY ASSIGNMENTS — 52px rows */}
        {!isReadOnlyView && (
          <MyAssignments
            questions={myQuestions}
            missionId={missionId}
            activeQuestionId={questionId}
            qc={qc}
          />
        )}

        {/* 8. QUESTION WORKSPACE — 2 columns: context + IRIS */}
        <section className="mt-8 grid gap-6 md:grid-cols-[55fr_45fr]">
          {/* LEFT — QUESTION CONTEXT */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="h-2 w-2 rounded-full" style={{ background: healthHex, boxShadow: `0 0 6px ${healthHex}` }} />
                <span className="font-mono text-muted-foreground">Q{q.question_number}</span>
                <span className="font-semibold text-foreground truncate">· {q.title}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Writer: <span className="text-foreground">{firstName(writer)}</span></span>
                {sme && <span>SME: <span className="text-foreground">{firstName(sme)}</span></span>}
                <span>Pens Down: <span className="text-foreground">{fmtDate(q.pens_down_date)}</span></span>
              </div>
            </div>

            {!isSME && (q.health === "red" || q.health === "yellow") && drivers.length > 0 && (
              <div
                className="rounded-md border-l-2 px-3 py-2 text-[12px]"
                style={{ borderColor: q.health === "red" ? "#ef4444" : "#eab308", background: "rgba(234,179,8,0.05)", color: q.health === "red" ? "#fca5a5" : "#fde68a" }}
              >
                <AlertTriangle className="mr-1.5 inline h-3 w-3" />
                {drivers.slice(0, 2).join(" · ")}
              </div>
            )}

            {connectedThemes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {connectedThemes.map((w) => (
                  <span key={w.id} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    {w.title}
                  </span>
                ))}
              </div>
            )}

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Question</div>
              <p className="mt-2 text-[14px] leading-[1.7] text-foreground whitespace-pre-wrap">{q.question_text}</p>
            </div>

            {q.requirements && q.requirements.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Requirements</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
                  {q.requirements.slice(0, 6).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
                {q.mandatory_language && q.mandatory_language.length > 0 && (
                  <div className="mt-2 border-l-2 px-3 py-1.5 text-[12px]" style={{ borderColor: "#eab308", background: "rgba(234,179,8,0.05)", color: "#fde68a" }}>
                    Required: {q.mandatory_language.join(" — ")}
                  </div>
                )}
              </div>
            )}

            <div className="text-[12px] text-muted-foreground">
              <Link
                to="/missions/$missionId/overview"
                params={{ missionId }}
                className="hover:text-foreground"
              >
                Source documents →
              </Link>
            </div>
          </div>

          {/* RIGHT — IRIS INTELLIGENCE (exactly 3 insights) */}
          <div className="space-y-4 border-l-[3px] pl-5" style={{ borderColor: "rgba(34,211,238,0.5)" }}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#22d3ee" }}>
                <span className="iris-dot" /> Intelligence for this question
              </span>
              <span className="text-[11px] text-muted-foreground">
                {intel?.generated_at && <>Updated {timeAgo(intel.generated_at)}</>}
              </span>
            </div>
            <IntelPanel
              label="State Priority"
              content={intel?.state_priorities}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            <IntelPanel
              label="Procurement Signal"
              content={intel?.procurement_priorities}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            <IntelPanel
              label="Differentiation"
              content={intel?.competitor_signals}
              sourceCount={intel?.relevant_research?.length ?? 0}
              missionId={missionId} questionId={questionId}
            />
            {intel?.compliance_flags && intel.compliance_flags.length > 0 && (
              <div className="text-[12px]" style={{ color: "#eab308" }}>
                ⚠ Required: {intel.compliance_flags[0]}
              </div>
            )}
            <div className="pt-2 text-[12px] text-muted-foreground space-y-1">
              <Link to="/missions/$missionId/overview" params={{ missionId }} className="block hover:text-foreground">
                Source documents →
              </Link>
              <Link to="/missions/$missionId/overview" params={{ missionId }} className="block hover:text-foreground">
                Full intelligence →
              </Link>
            </div>
          </div>
        </section>
      </div>


      {/* FIXED ACTION BAR (top) */}
      <div
        className={`fixed inset-x-0 top-14 z-40 border-b ${tipStage === 1 && !isReadOnlyView ? "ring-2 ring-primary/40" : ""}`}
        style={{ background: "rgba(6,11,20,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Micro-label — tells the writer why the bar looks the way it does */}
        {!isReadOnlyView && !isSME && (
          <div
            className="pt-2 pb-1 text-center text-[11px] text-muted-foreground max-md:hidden"
            style={{ letterSpacing: "0.04em" }}
          >
            {microLabel}
          </div>
        )}

        {/* "Nothing Changed — Check In" ghost button for check_in priority */}
        {primaryAction === "check_in" && !isReadOnlyView && !isSME && (
          <div className="mx-auto max-w-[1100px] px-10 pb-2 max-md:hidden">
            <button
              onClick={() => openUpdateReality(questionId)}
              className="w-full rounded-md border border-white/15 bg-transparent py-2 text-xs font-semibold text-foreground hover:bg-white/5"
            >
              Nothing Changed — Check In
            </button>
          </div>
        )}

        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-3 px-10 max-md:hidden">
          {/* LEFT */}
          <div className="flex items-center gap-2">
            {isReadOnlyView ? (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Read-only — actions disabled
              </span>
            ) : isSME ? (
              <button
                onClick={() => openUpdateReality(questionId)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Submit SME Input
              </button>
            ) : (
              <button
                onClick={() => openUpdateReality(questionId)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  primaryAction === "check_in"
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/40 hover:opacity-90"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                Update Reality
              </button>
            )}
            {!isReadOnlyView && (
              <button
                onClick={() => setAskOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition ${
                  primaryAction === "read_iris"
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/40 hover:opacity-90"
                    : "border border-primary/40 bg-transparent text-primary hover:bg-primary/10"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> Ask IRIS
              </button>
            )}
            {!isSME && !isReadOnlyView && (
              <ConfidenceButton
                questionId={questionId}
                questionNumber={q.question_number}
                currentLevel={q.writer_confidence ?? null}
                onStuckEscalate={() => setGetHelpOpen(true)}
              />
            )}
          </div>

          {/* CENTER status */}
          <div className="hidden items-center gap-2 text-[12px] text-muted-foreground md:flex">
            <span className="h-2 w-2 rounded-full" style={{ background: healthHex, boxShadow: `0 0 6px ${healthHex}` }} />
            <span className="font-mono">Q{q.question_number}</span>
            <Dot />
            <PensDownLabel days={pdDays} compact />
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2">
            {!isSME && !isReadOnlyView && (
              <>
                <button
                  onClick={() => { setPhoneOpen(true); markOverflowUsed(); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-white/20 hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" /> Phone a Friend
                </button>
                <button
                  onClick={() => { setGetHelpOpen(true); markOverflowUsed(); }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
                    primaryAction === "get_help"
                      ? "border border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                      : "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:text-foreground"
                  }`}
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Get Help
                </button>
                <CockpitOverflow
                  open={overflowOpen}
                  setOpen={setOverflowOpen}
                  showSublabels={showSublabels}
                  primaryAction={primaryAction}
                  onScoreMe={() => { setScoreMeOpen(true); setOverflowOpen(false); markOverflowUsed(); }}
                  onPhoneAFriend={() => { setOverflowOpen(false); markOverflowUsed(); setPhoneOpen(true); }}
                  onGetHelp={() => { setGetHelpOpen(true); setOverflowOpen(false); markOverflowUsed(); }}
                />
              </>
            )}
            {!isSME && !isReadOnlyView && (
              <div className="[&>div>button]:hidden">
                <GetHelpDropdown
                  open={getHelpOpen} setOpen={setGetHelpOpen}
                  missionId={missionId} questionId={questionId} questionNumber={q.question_number}
                  meId={me?.id ?? null} meName={firstName(me)}
                  onSent={() => qc.invalidateQueries({ queryKey: ["question-collabs", questionId] })}
                />
              </div>
            )}
            {!isSME && !isReadOnlyView && <SOSButton missionId={missionId} questionId={questionId} />}
          </div>

          {/* First-visit tooltip pointing at the action bar */}
          {tipStage === 1 && !isReadOnlyView && (
            <div className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[110%]">
              <FirstVisitTooltip>This is how you talk to your team.</FirstVisitTooltip>
            </div>
          )}
        </div>


        {/* MOBILE 2×2 ACTION GRID */}
        <div className="md:hidden grid grid-cols-2 gap-2 p-3">
          {isReadOnlyView ? (
            <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-center text-xs text-amber-200">
              Read-only — actions disabled
            </div>
          ) : (
            <>
              <button
                onClick={() => openUpdateReality(questionId)}
                className="h-14 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 active:opacity-80"
              >
                {isSME ? "Submit SME Input" : "Update Reality"}
              </button>
              {!isSME ? (
                <SOSButton missionId={missionId} questionId={questionId} />
              ) : (
                <button
                  onClick={() => setAskOpen(true)}
                  className="h-14 rounded-md border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  Ask IRIS
                </button>
              )}
              <button
                onClick={() => setAskOpen(true)}
                className="h-14 inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-4 w-4" /> Ask IRIS
              </button>
              {!isSME && (
                <div className="h-14 [&>div]:h-full [&>div>button]:h-full [&>div>button]:w-full [&>div>button]:justify-center">
                  <GetHelpDropdown
                    open={getHelpOpen} setOpen={setGetHelpOpen}
                    missionId={missionId} questionId={questionId} questionNumber={q.question_number}
                    meId={me?.id ?? null} meName={firstName(me)}
                    onSent={() => qc.invalidateQueries({ queryKey: ["question-collabs", questionId] })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ASK IRIS DRAWER */}
      {askOpen && (
        <AskDrawer onClose={() => setAskOpen(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
                placeholder="Ask IRIS anything about this question…"
                autoFocus
                className="iris-input flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm placeholder:text-muted-foreground/60"
              />
              <button
                onClick={onAsk} disabled={asking || !prompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> {asking ? "…" : "Send"}
              </button>
            </div>
            {(asking || answer) && (
              <div className="iris-panel rounded-r-md px-4 py-3 text-sm">
                <div className="mb-2"><span className="iris-label"><span className="iris-dot" />IRIS</span></div>
                {asking ? (
                  <div className="iris-loading-text"><span className="iris-dot" /> IRIS is thinking…</div>
                ) : (
                  <IrisCorrectable
                    contentType="ask_iris"
                    contentBlock={answer}
                    missionId={missionId}
                    questionId={questionId}
                  >
                    <div className="whitespace-pre-wrap text-foreground pr-8">{answer}</div>
                  </IrisCorrectable>
                )}
              </div>
            )}
          </div>
        </AskDrawer>
      )}

      <ScoreMeOverlay
        open={scoreMeOpen}
        onClose={() => setScoreMeOpen(false)}
        missionId={missionId}
        lockedQuestionId={questionId}
      />

      {phoneOpen && (
        <PhoneAFriendOverlay
          missionId={missionId}
          questionId={questionId}
          questionNumber={q.question_number}
          meId={me?.id ?? null}
          meName={firstName(me)}
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── sub-components ──────────────────────────── */

function Dot() {
  return <span className="text-muted-foreground/40">·</span>;
}

function PensDownLabel({ days, compact }: { days: number | null; compact?: boolean }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const color = days < 7 ? "#ef4444" : days <= 14 ? "#eab308" : undefined;
  const bold = days < 7;
  return (
    <span style={color ? { color, fontWeight: bold ? 600 : undefined } : { color: "var(--muted-foreground)" }}>
      {days < 0 ? `${Math.abs(days)}d overdue` : compact ? `${days}d to Pens Down` : `${days} days to Pens Down`}
    </span>
  );
}

function FeedRow({
  item,
  unread,
}: {
  item: {
    kind: "sme" | "intel" | "leader" | "conflict" | "amendment" | "leader_reply" | "decision";
    id: string; title: string; author: string; created_at: string; body: string;
    ackButton?: { label: string; onClick: () => void } | null;
  };
  unread: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta: Record<string, { icon: any; color: string }> = {
    sme: { icon: MessageSquare, color: "#22c55e" },
    intel: { icon: Sparkles, color: "#22d3ee" },
    leader: { icon: Pin, color: "#f59e0b" },
    conflict: { icon: AlertTriangle, color: "#ef4444" },
    amendment: { icon: FileEdit, color: "#f59e0b" },
    leader_reply: { icon: CornerDownLeft, color: "#3b82f6" },
    decision: { icon: CheckCircle2, color: "#a855f7" },
  };
  const m = meta[item.kind];
  const Icon = m.icon;
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] transition hover:bg-white/[0.04] ${unread ? "text-foreground" : "text-muted-foreground"}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
        <span className="flex-1 truncate">{item.title}</span>
        <span className="text-[11px] text-muted-foreground/70 shrink-0">
          {item.author} · {timeAgo(item.created_at)}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="ml-7 mr-2 mt-1 mb-2 rounded-md border border-white/5 bg-black/20 px-3 py-2.5 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
          {item.body}
          {item.ackButton && (
            <div className="mt-2">
              <button
                onClick={() => item.ackButton!.onClick()}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                {item.ackButton.label} →
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Hard cap an insight to N sentences for the writer-facing Cockpit. */
function clampSentences(text: string, max: number): { clipped: string; truncated: boolean } {
  if (!text) return { clipped: "", truncated: false };
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  if (parts.length <= max) return { clipped: text.trim(), truncated: false };
  return { clipped: parts.slice(0, max).join("").trim(), truncated: true };
}

function IntelPanel({
  label, content, sourceCount, missionId, questionId,
}: { label: string; content: string | null | undefined; sourceCount: number; missionId: string; questionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const raw = (content ?? "").trim();
  // Cockpit discipline: hard cap at 4 sentences per insight at render time.
  const { clipped, truncated } = clampSentences(raw, 4);
  const display = expanded ? raw : clipped;
  const confidence: "High" | "Lower" = sourceCount >= 2 ? "High" : "Lower";
  const confColor = confidence === "High" ? "#22c55e" : "#eab308";

  return (
    <div className="iris-panel rounded-r-[10px] p-4 relative">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#22d3ee" }}>
        {label}
      </div>
      {raw ? (
        <IrisCorrectable
          contentType="question_brief"
          contentBlock={raw}
          missionId={missionId}
          questionId={questionId}
        >
          <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap pr-8">{display}</p>
        </IrisCorrectable>
      ) : (
        <p className="text-[13px] text-muted-foreground italic">No intelligence yet.</p>
      )}
      {raw && (
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span style={{ color: confColor }}>
            {confidence === "High"
              ? `● High confidence · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
              : "⚠ IRIS inference — verify before citing"}
          </span>
          {truncated && (
            <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground">
              {expanded ? "Show less ↑" : "View full intelligence ↓"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CompliancePanel({
  flags, missionId, questionId,
}: { flags: string[] | null; missionId: string; questionId: string }) {
  // Cockpit discipline: writers see ONE compliance note max — the most critical.
  // Additional notes live in the Source Library / Compliance Check section below.
  const all = flags ?? [];
  const has = all.length > 0;
  const primary = has ? all[0] : null;
  const extraCount = Math.max(0, all.length - 1);

  return (
    <div
      className="rounded-[10px] p-4 relative"
      style={{
        background: "rgba(245,158,11,0.04)",
        borderLeft: `3px solid ${has ? "#eab308" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: has ? "#fbbf24" : "var(--muted-foreground)" }}>
        {has && <AlertTriangle className="h-3 w-3" />}
        {has ? "⚠ Required" : "Past Performance"}
      </div>
      {primary ? (
        <IrisCorrectable
          contentType="question_brief"
          contentBlock={primary}
          missionId={missionId}
          questionId={questionId}
        >
          <p className="text-[13px] leading-relaxed pr-8" style={{ color: "#fde68a" }}>
            {primary}
          </p>
        </IrisCorrectable>
      ) : (
        <p className="text-[13px] text-muted-foreground italic">
          No past-performance match yet. Athena's wins on similar questions will surface here once IRIS Memory has examples.
        </p>
      )}
      {extraCount > 0 && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          +{extraCount} more compliance note{extraCount === 1 ? "" : "s"} available in the Compliance Check section below.
        </div>
      )}
    </div>
  );
}

function GetHelpDropdown({
  open, setOpen, missionId, questionId, questionNumber, meId, meName, onSent,
}: {
  open: boolean; setOpen: (b: boolean) => void;
  missionId: string; questionId: string; questionNumber: string;
  meId: string | null; meName: string;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<null | "direction" | "decision" | "sme" | "review">(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const TYPES = {
    direction: { label: "Direction Needed", desc: "I need strategic guidance", routeTo: "Engagement Lead", color: "#3b82f6" },
    decision: { label: "Decision Needed", desc: "I need a decision made", routeTo: "Engagement Lead", color: "#a855f7" },
    sme: { label: "SME Input Needed", desc: "I need domain expertise", routeTo: "SME + PM", color: "#f59e0b" },
    review: { label: "Review Needed", desc: "I need someone to review my draft", routeTo: "Lead / Reviewer", color: "#22c55e" },
  } as const;

  const submit = async () => {
    if (!activeType || !meId) return;
    setSending(true);
    try {
      const entryType =
        activeType === "decision" ? "decision_needed" :
        activeType === "sme" ? "sme_request" :
        activeType === "review" ? "review_request" : "direction_request";
      const { error } = await supabase.from("question_collaboration").insert({
        question_id: questionId, mission_id: missionId,
        author_id: meId, author_name: meName,
        entry_type: entryType, body: body.trim() || "(no detail provided)",
      });
      if (error) throw error;
      await createSignal({
        mission_id: missionId, source_module: "cockpit",
        signal_type: activeType === "decision" ? "decision_needed" : "comment_added",
        signal_title: `${TYPES[activeType].label} · Q${questionNumber}`,
        signal_summary: body.trim() || TYPES[activeType].desc,
        severity: activeType === "decision" ? "critical" : "warning",
        related_question_id: questionId,
      }, qc);
      toast.success(`Sent to ${TYPES[activeType].routeTo}.`);
      setOpen(false); setActiveType(null); setBody("");
      onSent();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally { setSending(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-white/20"
      >
        <Lightbulb className="h-3.5 w-3.5" /> Get Help <ChevronUp className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[340px] rounded-lg border border-white/10 bg-[#0a0e1a] p-3 shadow-2xl">
          {!activeType ? (
            <div className="space-y-1.5">
              {(Object.keys(TYPES) as Array<keyof typeof TYPES>).map((k) => {
                const t = TYPES[k];
                return (
                  <button
                    key={k}
                    onClick={() => setActiveType(k)}
                    className="block w-full rounded-md border border-white/5 bg-white/[0.02] p-3 text-left hover:bg-white/[0.06] transition"
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.color }}>
                      {t.label}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">"{t.desc}"</div>
                    <div className="mt-1 text-[10px] text-muted-foreground/60">→ Routes to {t.routeTo}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TYPES[activeType].color }}>
                  {TYPES[activeType].label}
                </div>
                <button onClick={() => setActiveType(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
              <textarea
                value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))}
                placeholder="Add context (optional)…"
                rows={4}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs"
                autoFocus
              />
              <button
                onClick={submit} disabled={sending}
                className="w-full rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "Sending…" : `Send to ${TYPES[activeType].routeTo}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AskDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0a0e1a] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "#22d3ee" }}>
            <span className="iris-dot" /> Ask IRIS
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ──────────── First-visit tooltip ──────────── */
function FirstVisitTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-30 max-w-[260px] rounded-md border px-3 py-2 text-[12px] shadow-lg animate-in fade-in"
      style={{
        background: "rgba(34,211,238,0.12)",
        borderColor: "rgba(34,211,238,0.4)",
        color: "#cffafe",
        backdropFilter: "blur(6px)",
      }}
    >
      <span className="iris-dot mr-1.5" />
      {children}
    </div>
  );
}

/* ──────────── Cockpit overflow menu (Score Me · Phone a Friend · Get Help) ──────────── */
function CockpitOverflow({
  open, setOpen, showSublabels, primaryAction,
  onScoreMe, onPhoneAFriend, onGetHelp,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  showSublabels: boolean;
  primaryAction: "read_copilot" | "check_in" | "read_iris" | "get_help" | "urgent_write" | "default";
  onScoreMe: () => void;
  onPhoneAFriend: () => void;
  onGetHelp: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);

  const helpHighlighted = primaryAction === "get_help";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="More actions"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${
          helpHighlighted
            ? "border-amber-500/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
            : "border-white/10 bg-transparent text-muted-foreground hover:text-foreground hover:border-white/20"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[300px] overflow-hidden rounded-lg border border-white/10 bg-[#0a0e1a] shadow-2xl">
          <OverflowItem
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Score Me"
            sublabel={showSublabels ? "How would this score right now?" : undefined}
            onClick={onScoreMe}
          />
          <div className="h-px bg-white/5" />
          <OverflowItem
            icon={<Phone className="h-3.5 w-3.5" />}
            label="Phone a Friend"
            sublabel={showSublabels ? "Talk to someone who has done this." : undefined}
            onClick={onPhoneAFriend}
          />
          <div className="h-px bg-white/5" />
          <OverflowItem
            icon={<Lightbulb className="h-3.5 w-3.5" />}
            label="Get Help"
            sublabel={showSublabels ? "Ask leadership for what you need." : undefined}
            onClick={onGetHelp}
            highlighted={helpHighlighted}
          />
        </div>
      )}
    </div>
  );
}

function OverflowItem({
  icon, label, sublabel, onClick, highlighted,
}: { icon: React.ReactNode; label: string; sublabel?: string; onClick: () => void; highlighted?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition ${
        highlighted ? "bg-amber-500/10 hover:bg-amber-500/15" : "hover:bg-white/5"
      }`}
    >
      <span className={`mt-0.5 ${highlighted ? "text-amber-300" : "text-muted-foreground"}`}>{icon}</span>
      <span className="flex-1">
        <span className={`block text-sm font-semibold ${highlighted ? "text-amber-100" : "text-foreground"}`}>{label}</span>
        {sublabel && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{sublabel}</span>
        )}
      </span>
    </button>
  );
}

/* ──────────── Morning Brief — 3-sentence hard cap with Read more ──────────── */
function MorningBriefBody({ text, missionId, questionId }: { text: string; missionId: string; questionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const truncated = parts.length > 3;
  const clipped = truncated ? parts.slice(0, 3).join("").trim() : text.trim();
  const display = expanded ? text.trim() : clipped;
  return (
    <div>
      <IrisCorrectable contentType="morning_brief" contentBlock={text} missionId={missionId} questionId={questionId}>
        <p className="text-[14px] leading-[1.7] pr-8" style={{ color: "rgba(255,255,255,0.75)" }}>{display}</p>
      </IrisCorrectable>
      {truncated && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-2 text-[12px] text-muted-foreground hover:text-foreground">
          {expanded ? "Show less ↑" : "Read more ↓"}
        </button>
      )}
    </div>
  );
}

/* ──────────── What Changed (max 5, expandable) ──────────── */
function WhatChangedFiltered({
  feed, lastVisit, lastVisitTimeStr,
}: {
  feed: Array<{ kind: "sme" | "intel" | "leader" | "conflict" | "amendment" | "leader_reply" | "decision"; id: string; title: string; author: string; created_at: string; body: string; ackButton?: { label: string; onClick: () => void } | null }>;
  lastVisit: number;
  lastVisitTimeStr: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? feed : feed.slice(0, 5);
  const extra = Math.max(0, feed.length - 5);
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">What Changed</span>
        <span className="text-[11px] text-muted-foreground/70">Since {lastVisitTimeStr}</span>
      </div>
      {feed.length === 0 ? (
        <div className="text-[13px]" style={{ color: "#22c55e" }}>You're current. Go write.</div>
      ) : (
        <>
          <ul className="space-y-1">
            {shown.map((item) => (
              <FeedRow key={`${item.kind}-${item.id}`} item={item} unread={+new Date(item.created_at) > lastVisit} />
            ))}
          </ul>
          {extra > 0 && !showAll && (
            <button onClick={() => setShowAll(true)} className="mt-2 text-[12px] text-muted-foreground hover:text-foreground">
              · · · {extra} more
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ──────────── Brief Panel — 4 fixed rows ──────────── */
function BriefPanel({
  todayCount, nextStep, waitingCount, nextGateName, nextGateDate,
}: {
  todayCount: number;
  nextStep: { question_number: string; title: string; pens_down_date: string | null } | null;
  waitingCount: number;
  nextGateName: string | null;
  nextGateDate: string | null;
}) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Today",
      value: todayCount > 0
        ? <span>{todayCount} question{todayCount === 1 ? "" : "s"} need attention</span>
        : <span className="text-muted-foreground">All on track</span>,
    },
    {
      label: "Next Step",
      value: nextStep ? (() => {
        const d = daysUntil(nextStep.pens_down_date);
        const dStr = d === null ? "—" : d < 0 ? `${Math.abs(d)}d overdue` : `${d} days`;
        return <span className="truncate">Q{nextStep.question_number} · {nextStep.title} · {dStr}</span>;
      })() : <span className="text-muted-foreground">—</span>,
    },
    {
      label: "Waiting On",
      value: waitingCount > 0
        ? <span>{waitingCount} open item{waitingCount === 1 ? "" : "s"}</span>
        : <span className="text-muted-foreground">Nothing waiting</span>,
    },
    {
      label: "Next Gate",
      value: nextGateName ? <span>{nextGateName} · {fmtDate(nextGateDate)}</span> : <span className="text-muted-foreground">—</span>,
    },
  ];
  return (
    <section className="mb-6 rounded-[10px] border bg-white/[0.02] px-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      {rows.map((r, i) => (
        <div key={r.label} className={`flex h-9 items-center gap-4 ${i < rows.length - 1 ? "border-b" : ""}`} style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <span className="w-[90px] text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{r.label}</span>
          <span className="flex-1 truncate text-[13px] text-foreground">{r.value}</span>
        </div>
      ))}
    </section>
  );
}

/* ──────────── My Assignments — 52px rows w/ inline status pill ──────────── */
const STATUS_OPTIONS = ["Not Started", "In Progress", "In Review", "Complete"] as const;
type StatusLabel = typeof STATUS_OPTIONS[number];

function statusLabel(raw: string | null | undefined): StatusLabel {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("complete") || s === "approved") return "Complete";
  if (s.includes("review")) return "In Review";
  if (s.includes("progress") || s === "drafting" || s === "draft") return "In Progress";
  return "Not Started";
}
function statusToDb(s: StatusLabel): string {
  return s === "Not Started" ? "not_started" : s === "In Progress" ? "in_progress" : s === "In Review" ? "in_review" : "complete";
}

function MyAssignments({
  questions, missionId, activeQuestionId, qc,
}: {
  questions: Array<{ id: string; question_number: string; title: string; pens_down_date: string | null; health: string | null; status: string | null; updated_at: string | null }>;
  missionId: string;
  activeQuestionId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [filter, setFilter] = useState<"mine" | "all">("mine");
  const [allQs, setAllQs] = useState<typeof questions | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    if (filter !== "all" || allQs) return;
    setLoadingAll(true);
    supabase.from("question_records")
      .select("id,question_number,title,pens_down_date,health,status,updated_at")
      .eq("mission_id", missionId).order("question_number")
      .then(({ data }) => { setAllQs((data ?? []) as any); setLoadingAll(false); });
  }, [filter, allQs, missionId]);

  const list = filter === "all" ? (allQs ?? []) : questions;

  const updateStatus = async (id: string, next: StatusLabel) => {
    const dbVal = statusToDb(next);
    const { error } = await supabase.from("question_records").update({ status: dbVal }).eq("id", id);
    if (error) { toast.error("Could not update status"); return; }
    toast.success(`Status: ${next}`);
    qc.invalidateQueries({ queryKey: ["cockpit-my-questions"] });
    qc.invalidateQueries({ queryKey: ["question", id] });
    if (filter === "all") setAllQs(null);
  };

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">My Assignments</span>
        <div className="inline-flex rounded-md border border-white/10 p-0.5 text-[11px]">
          <button
            onClick={() => setFilter("mine")}
            className={`rounded-sm px-2 py-0.5 ${filter === "mine" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >My Questions</button>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-sm px-2 py-0.5 ${filter === "all" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >All</button>
        </div>
      </div>
      <div className="rounded-[10px] border bg-white/[0.02]" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {loadingAll ? (
          <div className="px-4 py-6 text-[12px] text-muted-foreground">Loading…</div>
        ) : list.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-muted-foreground">No assigned questions.</div>
        ) : list.map((mq, i) => {
          const active = mq.id === activeQuestionId;
          const d = daysUntil(mq.pens_down_date);
          const dotColor = HEALTH_HEX[mq.health ?? "yellow"];
          const dStr = d === null ? "—" : d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`;
          const dColor = d === null ? undefined : d < 7 ? "#ef4444" : d <= 14 ? "#eab308" : undefined;
          return (
            <div
              key={mq.id}
              className={`flex h-[52px] items-center gap-3 px-4 ${i > 0 ? "border-t" : ""} ${active ? "border-l-2" : ""} transition hover:bg-white/[0.03]`}
              style={{
                borderColor: "rgba(255,255,255,0.05)",
                borderLeftColor: active ? "#3b7fff" : undefined,
                background: active ? "rgba(59,127,255,0.05)" : undefined,
              }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
              <Link
                to="/missions/$missionId/questions/$questionId"
                params={{ missionId, questionId: mq.id }}
                className="flex flex-1 items-center gap-3 truncate"
              >
                <span className="font-mono text-[11px] text-muted-foreground">Q{mq.question_number}</span>
                <span className="flex-1 truncate text-[13px] text-foreground">{mq.title}</span>
              </Link>
              <StatusPill current={statusLabel(mq.status)} onPick={(s) => updateStatus(mq.id, s)} />
              <span className="w-[70px] text-right text-[12px]" style={{ color: dColor, fontWeight: d !== null && d < 7 ? 600 : undefined }}>
                {dStr}
              </span>
              <span className="hidden w-[80px] text-right text-[11px] text-muted-foreground md:inline">
                {mq.updated_at ? timeAgo(mq.updated_at) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ current, onPick }: { current: StatusLabel; onPick: (s: StatusLabel) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const color = current === "Complete" ? "#22c55e" : current === "In Review" ? "#22d3ee" : current === "In Progress" ? "#eab308" : "#94a3b8";
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-white/5"
        style={{ borderColor: `${color}55`, color }}
      >
        {current} <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-md border border-white/10 bg-[#0a0e1a] p-1 shadow-2xl">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onPick(s); }}
              className={`block w-full rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-white/5 ${current === s ? "text-foreground font-semibold" : "text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadsLauncher({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Open internal threads (Athena-only)"
        aria-label="Threads"
        className="fixed right-6 bottom-6 z-40 inline-flex items-center gap-2.5 rounded-full px-5 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] shadow-2xl transition hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-5px_rgba(94,234,212,0.6)]"
        style={{
          background: "linear-gradient(135deg, #0d9488, #14b8a6)",
          border: "1px solid rgba(94,234,212,0.7)",
          color: "#ecfeff",
          boxShadow: "0 8px 32px -4px rgba(20,184,166,0.55), 0 0 0 4px rgba(94,234,212,0.12)",
        }}
      >
        <MessageSquare className="h-4 w-4" />
        Threads
      </button>
      <ThreadPanel
        open={open}
        onClose={() => setOpen(false)}
        objectType="question_record"
        objectId={questionId}
      />
    </>
  );
}



