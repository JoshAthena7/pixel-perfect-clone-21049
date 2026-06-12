import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, X, Undo2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IrisMark } from "@/components/iris/IrisMark";
import { cn } from "@/lib/utils";

type Insight = {
  id: string;
  title: string;
  body: string;
  status: "pending" | "accepted" | "rejected" | "editing";
  edited?: boolean;
};

const SEED: Omit<Insight, "status">[] = [
  {
    id: "s1",
    title: "Continuity over disruption",
    body: "DCF appears to value continuity and trust over disruption. Lead with stewardship language, not transformation rhetoric.",
  },
  {
    id: "s2",
    title: "Risk-aversion signal",
    body: "Evaluation weighting on past performance (35%) suggests the buyer fears execution risk more than they crave innovation.",
  },
  {
    id: "s3",
    title: "Incumbent shadow",
    body: "Two amendments narrowed staffing language toward the incumbent's bench profile. Expect a defended incumbency.",
  },
  {
    id: "s4",
    title: "Political surface area",
    body: "Recent legislative oversight on this program means the buyer needs a partner who won't generate headlines. Quiet competence wins.",
  },
  {
    id: "s5",
    title: "Hidden decision-maker",
    body: "The contracting officer signs, but the program director's name appears in 6 of 8 amendments. Build the narrative for her.",
  },
  {
    id: "s6",
    title: "Pricing posture",
    body: "Cost is weighted at 20% — not decisive, but a poorly justified premium will be used as a reason to drop us. Show the math.",
  },
  {
    id: "s7",
    title: "Compliance as differentiator",
    body: "Three competitors have had recent compliance findings on similar work. A clean compliance story is a wedge, not table stakes.",
  },
];

export function AthenaInsightsScreen({
  missionId,
  onContinue,
}: {
  missionId: string;
  onContinue: () => void;
}) {
  const [insights, setInsights] = useState<Insight[]>(
    SEED.map((s) => ({ ...s, status: "pending" })),
  );
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accepted = useMemo(
    () => insights.filter((i) => i.status === "accepted"),
    [insights],
  );
  const remaining = useMemo(
    () => insights.filter((i) => i.status !== "rejected"),
    [insights],
  );

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  function update(id: string, patch: Partial<Insight>) {
    setInsights((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function accept(i: Insight) {
    update(i.id, { status: "accepted" });
    try {
      await supabase.from("iris_memories").insert({
        mission_id: missionId,
        category: "strategic_insight",
        content: `${i.title}: ${i.body}`,
        importance: "high",
        source: "athena",
        tags: ["athena_insight", "mission_guidance"],
      });
    } catch (e) {
      console.error("persist insight", e);
    }
  }

  function reject(i: Insight) {
    update(i.id, { status: "rejected" });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ id: i.id, title: i.title });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function undoReject() {
    if (!undo) return;
    update(undo.id, { status: "pending" });
    setUndo(null);
  }

  return (
    <div
      className="min-h-screen px-4 py-10"
      style={{ background: "#0A1628", color: "white" }}
    >
      <div className="max-w-[1240px] mx-auto">
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
              style={{ color: "#C49A2B" }}
            >
              IRIS · Athena Insights
            </div>
            <div className="text-white text-[18px] mt-1 leading-snug">
              These are my strategic reads on this opportunity.{" "}
              <span className="text-white/55">Tell me if I'm wrong.</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          {/* Insight cards */}
          <div className="space-y-3">
            {remaining.length === 0 && (
              <div
                className="rounded-xl px-6 py-12 text-center text-white/45 text-[14px]"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px dashed rgba(255,255,255,0.1)",
                }}
              >
                All reads addressed.
              </div>
            )}
            {remaining.map((i) => (
              <InsightCard
                key={i.id}
                insight={i}
                onAccept={() => accept(i)}
                onReject={() => reject(i)}
                onStartEdit={() => update(i.id, { status: "editing" })}
                onSaveEdit={(title, body) =>
                  update(i.id, {
                    title,
                    body,
                    status: "pending",
                    edited: true,
                  })
                }
                onCancelEdit={() => update(i.id, { status: "pending" })}
              />
            ))}
          </div>

          {/* Mission Guidance panel */}
          <aside
            className="rounded-xl p-5 h-fit lg:sticky lg:top-6"
            style={{
              background: "rgba(196,154,43,0.04)",
              border: "1px solid rgba(196,154,43,0.25)",
              boxShadow: "0 0 40px -20px rgba(196,154,43,0.35)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4" style={{ color: "#C49A2B" }} />
              <div
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{ color: "#C49A2B" }}
              >
                Mission Guidance
              </div>
              <span className="ml-auto text-[11px] text-white/45">
                {accepted.length} accepted
              </span>
            </div>

            {accepted.length === 0 ? (
              <p className="text-[13px] text-white/40 leading-relaxed">
                Accept the reads that ring true. They'll stack here as guidance
                for every writer on this mission.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {accepted.map((i) => (
                  <li
                    key={i.id}
                    className="rounded-lg px-3 py-2.5 text-[12.5px] text-white/85 leading-snug"
                    style={{
                      background: "rgba(196,154,43,0.08)",
                      border: "1px solid rgba(196,154,43,0.3)",
                    }}
                  >
                    <span style={{ color: "#C49A2B", fontWeight: 600 }}>
                      {i.title}.
                    </span>{" "}
                    {i.body}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="mt-12 flex justify-end">
          <button
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[14px] font-medium transition-all"
            style={{
              background: "#C49A2B",
              color: "#0A1628",
              boxShadow: "0 8px 24px -8px rgba(196,154,43,0.55)",
            }}
          >
            Continue →
          </button>
        </div>
      </div>

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl"
            style={{
              background: "#0F1F36",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span className="text-[13px] text-white/80">
              Rejected "{undo.title}"
            </span>
            <button
              onClick={undoReject}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1 rounded"
              style={{ color: "#C49A2B" }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({
  insight,
  onAccept,
  onReject,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  insight: Insight;
  onAccept: () => void;
  onReject: () => void;
  onStartEdit: () => void;
  onSaveEdit: (title: string, body: string) => void;
  onCancelEdit: () => void;
}) {
  const [title, setTitle] = useState(insight.title);
  const [body, setBody] = useState(insight.body);

  useEffect(() => {
    setTitle(insight.title);
    setBody(insight.body);
  }, [insight.title, insight.body]);

  const isAccepted = insight.status === "accepted";
  const isEditing = insight.status === "editing";

  return (
    <div
      className={cn(
        "rounded-xl p-5 transition-all",
        isAccepted && "ring-0",
      )}
      style={{
        background: isAccepted
          ? "rgba(196,154,43,0.06)"
          : "rgba(255,255,255,0.03)",
        border: isAccepted
          ? "1px solid #C49A2B"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isAccepted
          ? "0 0 24px -10px rgba(196,154,43,0.6)"
          : "none",
      }}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent border-b border-white/15 pb-1.5 text-[15px] font-medium text-white focus:outline-none focus:border-[#C49A2B]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full bg-transparent text-[13.5px] text-white/85 leading-relaxed resize-none focus:outline-none rounded-md px-3 py-2"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-1.5 text-[12.5px] text-white/55 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => onSaveEdit(title.trim() || insight.title, body.trim() || insight.body)}
              className="px-3 py-1.5 text-[12.5px] font-medium rounded"
              style={{ background: "#C49A2B", color: "#0A1628" }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-[15px] font-medium text-white">
                {insight.title}
              </h3>
              {insight.edited && (
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "#C49A2B",
                    background: "rgba(196,154,43,0.12)",
                    border: "1px solid rgba(196,154,43,0.3)",
                  }}
                >
                  Edited
                </span>
              )}
              {isAccepted && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                  style={{ color: "#0A1628", background: "#C49A2B" }}
                >
                  <Check className="h-2.5 w-2.5" />
                  Guidance
                </span>
              )}
            </div>
            <p className="text-[13.5px] text-white/75 leading-relaxed">
              {insight.body}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ActionBtn
              label="Accept"
              onClick={onAccept}
              active={isAccepted}
              activeColor="#7BC47F"
            >
              <Check className="h-4 w-4" />
            </ActionBtn>
            <ActionBtn label="Edit" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </ActionBtn>
            <ActionBtn label="Reject" onClick={onReject} hoverColor="#E57373">
              <X className="h-4 w-4" />
            </ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  label,
  active,
  activeColor,
  hoverColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  activeColor?: string;
  hoverColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center rounded-md w-8 h-8 transition-all"
      style={{
        background: active
          ? `${activeColor}22`
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? activeColor : "rgba(255,255,255,0.1)"}`,
        color: active ? activeColor : hoverColor ?? "rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}
