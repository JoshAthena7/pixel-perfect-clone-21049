import { useEffect, useState } from "react";
import {
  Check,
  Pencil,
  RefreshCw,
  FileText,
  HelpCircle,
  ListChecks,
  Award,
  Calendar,
  AlertTriangle,
  Users,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type CardKey =
  | "snapshot"
  | "questions"
  | "requirements"
  | "evaluation"
  | "dates"
  | "risks"
  | "competitors"
  | "themes";

type CardDef = {
  key: CardKey;
  title: string;
  icon: LucideIcon;
  headline: string;
  body: string;
};

type CardState = "neutral" | "accepted" | "edited";

export function MissionAnalysisResults({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const [cards, setCards] = useState<CardDef[]>(() => defaultCards());
  const [states, setStates] = useState<Record<CardKey, CardState>>({
    snapshot: "neutral",
    questions: "neutral",
    requirements: "neutral",
    evaluation: "neutral",
    dates: "neutral",
    risks: "neutral",
    competitors: "neutral",
    themes: "neutral",
  });
  const [editing, setEditing] = useState<CardKey | null>(null);
  const [editValue, setEditValue] = useState("");

  // Pull real counts/summaries when available; fall back to defaults so the
  // screen always renders meaningfully.
  useEffect(() => {
    (async () => {
      const [mission, sections, questions, reqs, evalCrit, dates, risks, comps, themes] =
        await Promise.all([
          supabase.from("missions").select("name, client_name, agency_name, submission_deadline").eq("id", missionId).maybeSingle(),
          supabase.from("mission_sections").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("mission_questions").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("mission_compliance_requirements").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("mission_evaluation_criteria").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("mission_timeline").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("mission_risks").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("competitor_profiles").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
          supabase.from("win_themes").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
        ]);

      const m = mission.data;
      setCards((cur) =>
        cur.map((c) => {
          if (c.key === "snapshot" && m) {
            const deadline = m.submission_deadline
              ? new Date(m.submission_deadline).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—";
            return {
              ...c,
              headline: m.name ?? c.headline,
              body: `${m.client_name ?? "—"}${m.agency_name ? ` · ${m.agency_name}` : ""}\nDue ${deadline}`,
            };
          }
          if (c.key === "questions" && typeof questions.count === "number" && questions.count > 0) {
            return { ...c, headline: `${questions.count} questions`, body: `Organized across ${sections.count ?? "several"} sections.` };
          }
          if (c.key === "requirements" && typeof reqs.count === "number" && reqs.count > 0) {
            return { ...c, headline: `${reqs.count} requirements`, body: "Mandatory, technical, and administrative." };
          }
          if (c.key === "evaluation" && typeof evalCrit.count === "number" && evalCrit.count > 0) {
            return { ...c, headline: `${evalCrit.count} categories`, body: "Weights and scoring rules captured." };
          }
          if (c.key === "dates" && typeof dates.count === "number" && dates.count > 0) {
            return { ...c, headline: `${dates.count} key dates`, body: "Q&A windows, submission, and decision dates." };
          }
          if (c.key === "risks" && typeof risks.count === "number" && risks.count > 0) {
            return { ...c, headline: `${risks.count} risks flagged`, body: "Compliance, capability, and pricing exposure." };
          }
          if (c.key === "competitors" && typeof comps.count === "number" && comps.count > 0) {
            return { ...c, headline: `${comps.count} likely bidders`, body: "Incumbents, frequent winners, and dark horses." };
          }
          if (c.key === "themes" && typeof themes.count === "number" && themes.count > 0) {
            return { ...c, headline: `${themes.count} draft win themes`, body: "Aligned to what the state actually wants." };
          }
          return c;
        }),
      );
    })();
  }, [missionId]);

  function setStatus(key: CardKey, status: CardState) {
    setStates((s) => ({ ...s, [key]: status }));
  }

  function openEdit(key: CardKey) {
    const c = cards.find((x) => x.key === key);
    setEditing(key);
    setEditValue(c?.body ?? "");
  }

  function saveEdit() {
    if (!editing) return;
    setCards((cur) =>
      cur.map((c) => (c.key === editing ? { ...c, body: editValue } : c)),
    );
    setStatus(editing, "edited");
    setEditing(null);
  }

  function replaceCard(key: CardKey) {
    // For now "Replace" just nudges the card back to neutral and clears any
    // edits — the real regen lives in the post-launch Oracle panels.
    setStates((s) => ({ ...s, [key]: "neutral" }));
    setCards((cur) =>
      cur.map((c) => (c.key === key ? defaultCards().find((d) => d.key === key)! : c)),
    );
  }

  const acceptedCount = Object.values(states).filter((s) => s === "accepted").length;
  const totalCount = cards.length;

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{ background: "#080c14", color: "white" }}
    >
      <div className="w-full max-w-[1100px] mx-auto">
        {/* IRIS header */}
        <div className="flex items-start gap-4 mb-8">
          <div
            className="shrink-0 rounded-full flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              background: "rgba(127,119,221,0.12)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 0 24px rgba(167,139,250,0.25)",
            }}
          >
            <IrisMark size={32} glow />
          </div>
          <div className="pt-1 flex-1">
            <div
              className="text-[11px] uppercase tracking-[0.22em]"
              style={{ color: "#c9a84c" }}
            >
              IRIS · Mission Analysis Complete
            </div>
            <div className="text-white text-[22px] mt-1.5 leading-snug">
              Here's what I found.{" "}
              <span className="text-white/55">
                Correct anything that doesn't look right.
              </span>
            </div>
            <div className="text-white/45 text-[12px] mt-1.5">
              {acceptedCount} of {totalCount} confirmed · nothing is locked, you
              can edit any of these later
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card
              key={c.key}
              def={c}
              state={states[c.key]}
              onAccept={() => setStatus(c.key, "accepted")}
              onEdit={() => openEdit(c.key)}
              onReplace={() => replaceCard(c.key)}
            />
          ))}
        </div>

        {/* Continue */}
        <div className="mt-10 flex justify-end items-center gap-4">
          <span className="text-[12px] text-white/40">
            You can revisit any of these from IRIS after launch.
          </span>
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-all"
            style={{
              background: "#c9a84c",
              color: "#080c14",
              boxShadow: "0 8px 24px -8px rgba(201,168,76,0.55)",
            }}
          >
            Looks good — continue →
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(5,12,24,0.78)" }}
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-[520px] rounded-xl p-6"
            style={{
              background: "#0F1E36",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div
                  className="text-[11px] uppercase tracking-[0.22em]"
                  style={{ color: "#c9a84c" }}
                >
                  Edit · {cards.find((c) => c.key === editing)?.title}
                </div>
                <div className="text-white text-[16px] mt-1">
                  Tell IRIS what's right.
                </div>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="text-white/40 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={5}
              className="w-full rounded-lg px-3 py-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none resize-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-md text-[13px] text-white/65 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="px-4 py-2 rounded-md text-[13px] font-medium"
                style={{ background: "#c9a84c", color: "#080c14" }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  def,
  state,
  onAccept,
  onEdit,
  onReplace,
}: {
  def: CardDef;
  state: CardState;
  onAccept: () => void;
  onEdit: () => void;
  onReplace: () => void;
}) {
  const Icon = def.icon;
  const accepted = state === "accepted";
  const edited = state === "edited";
  return (
    <div
      className="relative rounded-xl p-5 flex flex-col transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${accepted ? "rgba(16,185,129,0.55)" : "rgba(255,255,255,0.08)"}`,
        boxShadow: accepted
          ? "0 0 24px -8px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.03)"
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Edited badge */}
      {edited && (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: "rgba(201,168,76,0.18)",
            border: "1px solid rgba(201,168,76,0.5)",
            color: "#F5E6B8",
          }}
        >
          <Pencil className="h-2.5 w-2.5" />
          Edited
        </span>
      )}
      {accepted && (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: "rgba(16,185,129,0.18)",
            border: "1px solid rgba(16,185,129,0.5)",
            color: "#A7F3D0",
          }}
        >
          <Check className="h-2.5 w-2.5" />
          Confirmed
        </span>
      )}

      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
          style={{
            background: "rgba(201,168,76,0.1)",
            border: "1px solid rgba(201,168,76,0.3)",
          }}
        >
          <Icon className="h-4 w-4" style={{ color: "#c9a84c" }} />
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
          {def.title}
        </div>
      </div>

      <div className="text-white text-[16px] font-medium leading-snug">
        {def.headline}
      </div>
      <div className="text-white/55 text-[13px] mt-1.5 leading-relaxed whitespace-pre-line flex-1">
        {def.body}
      </div>

      {/* Action row */}
      <div className="mt-4 pt-3 flex items-center gap-1.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <ActionButton
          onClick={onAccept}
          label="Accept"
          icon={Check}
          tone={accepted ? "active-green" : "default"}
        />
        <ActionButton
          onClick={onEdit}
          label="Edit"
          icon={Pencil}
          tone={edited ? "active-gold" : "default"}
        />
        <ActionButton
          onClick={onReplace}
          label="Replace"
          icon={RefreshCw}
          tone="default"
        />
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  icon: Icon,
  tone,
}: {
  onClick: () => void;
  label: string;
  icon: LucideIcon;
  tone: "default" | "active-green" | "active-gold";
}) {
  const styles =
    tone === "active-green"
      ? {
          background: "rgba(16,185,129,0.15)",
          border: "1px solid rgba(16,185,129,0.5)",
          color: "#A7F3D0",
        }
      : tone === "active-gold"
        ? {
            background: "rgba(201,168,76,0.15)",
            border: "1px solid rgba(201,168,76,0.5)",
            color: "#F5E6B8",
          }
        : {
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
          };
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all hover:brightness-110",
      )}
      style={styles}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function defaultCards(): CardDef[] {
  return [
    {
      key: "snapshot",
      title: "Mission Snapshot",
      icon: FileText,
      headline: "Your mission at a glance",
      body: "Client, agency, and submission date pulled from setup.",
    },
    {
      key: "questions",
      title: "Questions Found",
      icon: HelpCircle,
      headline: "Pulling questions…",
      body: "I'll list every question I extracted, grouped by section.",
    },
    {
      key: "requirements",
      title: "Requirements Found",
      icon: ListChecks,
      headline: "Building requirements list…",
      body: "Mandatory, technical, and administrative requirements.",
    },
    {
      key: "evaluation",
      title: "Evaluation Categories",
      icon: Award,
      headline: "Mapping the scoring rubric…",
      body: "Each category, its weight, and how the state will score.",
    },
    {
      key: "dates",
      title: "Key Dates",
      icon: Calendar,
      headline: "Compiling the timeline…",
      body: "Q&A windows, intent-to-bid, submission, award decision.",
    },
    {
      key: "risks",
      title: "Potential Risks",
      icon: AlertTriangle,
      headline: "Scanning for exposure…",
      body: "Compliance gaps, capability stretch, pricing pressure.",
    },
    {
      key: "competitors",
      title: "Suggested Competitors",
      icon: Users,
      headline: "Identifying likely bidders…",
      body: "Incumbents, frequent winners in this state, dark horses.",
    },
    {
      key: "themes",
      title: "Suggested Win Themes",
      icon: Sparkles,
      headline: "Drafting win themes…",
      body: "Aligned to what the state actually wants to hear.",
    },
  ];
}
