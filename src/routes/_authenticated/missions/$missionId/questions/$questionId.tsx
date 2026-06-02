import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSignal } from "@/lib/signals";
import { irisAskQuestion } from "@/lib/iris-ask.functions";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Send, ChevronDown, ChevronRight, X, MessageSquare, AlertTriangle, Flag } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/questions/$questionId",
)({
  component: ResponseView,
});

type Q = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  question_text: string;
  pens_down_date: string | null;
  current_focus: string | null;
  next_step: string | null;
  waiting_on: string | null;
  guidance: string | null;
  requirements: string[] | null;
  mandatory_language: string[] | null;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  current_score: number | null;
  health_drivers: any;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
};

type Gate = { id: string; gate_name: string; target_date: string | null };
type WinTheme = { id: string; title: string; question_ids: string[] | null };
type Profile = { id: string; display_name: string | null; email: string | null };
type Rel = { related_question_id: string; relationship_type: string; conflict_detected: boolean; conflict_description: string | null };
type RelatedQ = { id: string; question_number: string; title: string };
type Intel = {
  iris_brief: string | null;
  state_priorities: string | null;
  procurement_priorities: string | null;
  competitor_signals: string | null;
  compliance_flags: string[] | null;
};
type Collab = { id: string; entry_type: string; body: string; author_name: string; created_at: string; resolved: boolean };
type GateStatus = { gate_id: string; status: string; reviewer_notes: string | null };
type Score = { score: number; score_type: string; scored_at: string; review_notes: string | null };

const HEALTH_DOT: Record<string, string> = {
  red: "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]",
  yellow: "bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.6)]",
  green: "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]",
};

function firstName(p?: Profile | null): string {
  if (!p) return "Unassigned";
  const n = p.display_name || p.email?.split("@")[0] || "";
  return n.split(" ")[0] || "—";
}

function daysUntil(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

type NeedType = "direction" | "decision" | "help" | "air_cover";
type Choice = null | "learned" | "need" | "unchanged";

const NEED_COLORS: Record<NeedType, { bg: string; border: string; text: string; label: string }> = {
  direction: { bg: "rgba(59,130,246,0.15)", border: "#3b82f6", text: "#60a5fa", label: "NEED DIRECTION" },
  decision: { bg: "rgba(168,85,247,0.15)", border: "#a855f7", text: "#c084fc", label: "NEED DECISION" },
  help: { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#fbbf24", label: "NEED HELP" },
  air_cover: { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#f87171", label: "NEED AIR COVER" },
};

function ResponseView() {
  const { missionId, questionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: q, isLoading } = useQuery({
    queryKey: ["question", questionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,question_text,pens_down_date,current_focus,next_step,waiting_on,guidance,requirements,mandatory_language,status,health,current_score,health_drivers,assigned_writer_id,assigned_sme_id")
        .eq("id", questionId)
        .maybeSingle();
      if (error) throw error;
      return data as Q | null;
    },
  });

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

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,target_date")
        .eq("mission_id", missionId)
        .order("gate_order");
      return (data ?? []) as Gate[];
    },
  });

  const { data: winThemes = [] } = useQuery({
    queryKey: ["mission-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,question_ids")
        .eq("mission_id", missionId);
      return (data ?? []) as WinTheme[];
    },
  });
  const connectedThemes = winThemes.filter((w) => (w.question_ids ?? []).includes(questionId));

  const { data: relations = [] } = useQuery({
    queryKey: ["question-relations", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_relationships")
        .select("related_question_id,relationship_type,conflict_detected,conflict_description")
        .eq("question_id", questionId);
      return (data ?? []) as Rel[];
    },
  });
  const relatedIds = relations.map((r) => r.related_question_id);
  const { data: relatedQs = [] } = useQuery({
    queryKey: ["related-q-records", relatedIds.join(",")],
    enabled: relatedIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title")
        .in("id", relatedIds);
      return (data ?? []) as RelatedQ[];
    },
  });
  const relById = Object.fromEntries(relatedQs.map((r) => [r.id, r]));

  const { data: intel, isLoading: intelLoading } = useQuery({
    queryKey: ["question-intel", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_intelligence")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags")
        .eq("question_id", questionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Intel | null;
    },
  });

  const { data: collabs = [] } = useQuery({
    queryKey: ["question-collabs", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_collaboration")
        .select("id,entry_type,body,author_name,created_at,resolved")
        .eq("question_id", questionId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Collab[];
    },
  });
  const openCollabs = collabs.filter(
    (c) => !c.resolved && (c.entry_type === "sme_request" || c.entry_type === "decision_needed"),
  );

  const { data: gateStatuses = [] } = useQuery({
    queryKey: ["question-gate-status", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_gate_status")
        .select("gate_id,status,reviewer_notes")
        .eq("question_id", questionId);
      return (data ?? []) as GateStatus[];
    },
  });

  const { data: scoreHistory = [] } = useQuery({
    queryKey: ["question-scores", questionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_scores")
        .select("score,score_type,scored_at,review_notes")
        .eq("question_id", questionId)
        .order("scored_at", { ascending: true });
      return (data ?? []) as Score[];
    },
  });

  // ----- Local UI state -----
  const [scoreOpen, setScoreOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [realityOpen, setRealityOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  // Update Reality
  const [choice, setChoice] = useState<Choice>(null);
  const [needType, setNeedType] = useState<NeedType | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitUpdate = useMutation({
    mutationFn: async () => {
      if (!choice || !q) return;
      setSubmitting(true);
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = profile?.display_name || profile?.email?.split("@")[0] || "Unknown";
      const { error } = await supabase.from("reality_updates").insert({
        question_id: questionId, mission_id: missionId, user_id: user.id, user_name: name,
        signal_type: choice, need_type: choice === "need" ? needType : null,
        details: details.trim() || null,
      });
      if (error) throw error;
      const severity =
        choice === "need" && (needType === "air_cover" || needType === "decision") ? "critical"
        : choice === "need" ? "warning" : "info";
      const titleMap: Record<string, string> = {
        learned: "Writer learned something",
        need: needType ? NEED_COLORS[needType].label : "Writer needs something",
        unchanged: "Status check — no change",
      };
      await createSignal({
        mission_id: missionId, source_module: "response_view",
        signal_type: choice === "need" ? "decision_needed" : "comment_added",
        signal_title: `${titleMap[choice]} · ${q.question_number}`,
        signal_summary: details.trim() || q.title,
        severity, related_question_id: questionId,
      }, qc);
    },
    onSuccess: () => {
      toast.success("Signal sent.");
      setChoice(null); setNeedType(null); setDetails(""); setSubmitting(false); setRealityOpen(