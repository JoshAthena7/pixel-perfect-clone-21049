// LINE OF SIGHT — intelligence bridge in Flight Deck.
// Surfaces Thread decisions from connected sections, Oracle intel
// specifically relevant to this question, and unresolved conflicts.
// NEVER surfaces draft content — only message_type=decision and curated intel.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ArrowRight, BookOpen, GitBranch, Loader2 } from "lucide-react";
import { getLineOfSight } from "@/lib/iris-line-of-sight.functions";

const PURPLE = "rgba(127,119,221,0.9)";
const BLUE = "rgba(74,111,165,0.95)";
const AMBER = "rgba(239,159,39,0.95)";

type Props = {
  missionId: string;
  questionId: string;
  onOpenConnectedThread?: (questionId: string) => void;
  onOpenOracleItem?: (feedItemId: string) => void;
  onFlagInPulse?: (conflictDescription: string) => void;
};

export function LineOfSightBlock({
  missionId,
  questionId,
  onOpenConnectedThread,
  onOpenOracleItem,
  onFlagInPulse,
}: Props) {
  const fetchLOS = useServerFn(getLineOfSight);
  const { data, isLoading } = useQuery({
    queryKey: ["line-of-sight", missionId, questionId],
    queryFn: () => fetchLOS({ data: { missionId, questionId } }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
        <Loader2 className="h-3 w-3 animate-spin" />
        IRIS is connecting the dots…
      </div>
    );
  }

  const hasAny =
    (data?.connections?.length ?? 0) > 0 ||
    (data?.intel?.length ?? 0) > 0 ||
    (data?.conflicts?.length ?? 0) > 0;

  if (!hasAny) {
    return (
      <div
        className="rounded-lg text-center italic px-3 py-4"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.45)",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        IRIS is analyzing connections across this mission's questions. This populates after team members begin
        capturing decisions in their Threads.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Conflicts first */}
      {data!.conflicts.map((c) => (
        <ConflictCard key={c.id} c={c} onFlag={onFlagInPulse} />
      ))}

      {/* Then connected-section decisions */}
      {data!.connections
        .filter((c) => c.decisions.length > 0)
        .map((c) =>
          c.decisions.map((d) => (
            <DecisionCard
              key={d.id}
              sectionLabel={c.other_section_name ?? c.other_question_number ?? "Connected question"}
              rationale={c.iris_rationale}
              decisionText={d.body}
              when={d.created_at}
              onOpenThread={() => onOpenConnectedThread?.(c.other_question_id)}
            />
          )),
        )}

      {/* Win Theme Alignment (connections without decisions yet) */}
      {data!.connections
        .filter((c) => c.connection_type === "win_theme_alignment" && c.decisions.length === 0)
        .slice(0, 3)
        .map((c) => (
          <AlignmentCard
            key={c.id}
            sectionLabel={c.other_section_name ?? c.other_question_number ?? "Related section"}
            rationale={c.iris_rationale}
            onOpenThread={() => onOpenConnectedThread?.(c.other_question_id)}
          />
        ))}

      {/* Oracle intel relevant here */}
      {data!.intel.map((i) => (
        <OracleIntelCard
          key={i.id}
          headline={i.headline}
          category={i.category}
          note={data!.iris_intel_note}
          onOpenInOracle={() => onOpenOracleItem?.(i.id)}
        />
      ))}
    </div>
  );
}

/* ---------------- TYPE A — Thread Decision ---------------- */
function DecisionCard({
  sectionLabel,
  rationale,
  decisionText,
  when,
  onOpenThread,
}: {
  sectionLabel: string;
  rationale: string | null;
  decisionText: string;
  when: string;
  onOpenThread: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = decisionText.length > 120;
  const shown = !expanded && isLong ? decisionText.slice(0, 120) + "…" : decisionText;
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "rgba(127,119,221,0.06)", border: "0.5px solid rgba(127,119,221,0.2)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="rounded uppercase tracking-wider"
          style={{
            fontSize: 9,
            padding: "1px 6px",
            color: PURPLE,
            background: "rgba(127,119,221,0.12)",
            border: "0.5px solid rgba(127,119,221,0.3)",
            fontWeight: 600,
          }}
        >
          Team Decision
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{sectionLabel}</span>
        <span className="ml-auto" style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
          {formatDistanceToNow(new Date(when), { addSuffix: true })}
        </span>
      </div>
      <div className="text-white" style={{ fontSize: 11, lineHeight: 1.6 }}>
        {shown}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 underline"
            style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}
          >
            {expanded ? "less" : "more"}
          </button>
        )}
      </div>
      {rationale && (
        <p className="italic mt-1.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
          {rationale}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenThread}
        className="inline-flex items-center gap-1 mt-2 hover:underline"
        style={{ fontSize: 10, color: PURPLE }}
      >
        📌 Notes <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ---------------- TYPE B — IRIS Intelligence ---------------- */
function OracleIntelCard({
  headline,
  category,
  note,
  onOpenInOracle,
}: {
  headline: string;
  category: string;
  note: string | null;
  onOpenInOracle: () => void;
}) {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "rgba(74,111,165,0.06)", border: "0.5px solid rgba(74,111,165,0.2)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <BookOpen className="h-3 w-3" style={{ color: BLUE }} />
        <span
          className="rounded uppercase tracking-wider"
          style={{
            fontSize: 9,
            padding: "1px 6px",
            color: BLUE,
            background: "rgba(74,111,165,0.12)",
            border: "0.5px solid rgba(74,111,165,0.3)",
            fontWeight: 600,
          }}
        >
          IRIS Intel
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{category}</span>
      </div>
      <div className="text-white" style={{ fontSize: 11, lineHeight: 1.5 }}>
        {headline}
      </div>
      {note && (
        <p className="italic mt-1.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
          {note}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenInOracle}
        className="inline-flex items-center gap-1 mt-2 hover:underline"
        style={{ fontSize: 10, color: BLUE }}
      >
        View in IRIS <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/* ---------------- TYPE C — Conflict ---------------- */
function ConflictCard({
  c,
  onFlag,
}: {
  c: { id: string; conflict_description: string; detected_from: string | null; severity: string };
  onFlag?: (desc: string) => void;
}) {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "rgba(239,159,39,0.05)", border: "0.5px solid rgba(239,159,39,0.2)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AlertTriangle className="h-3 w-3" style={{ color: AMBER }} />
        <span
          className="rounded uppercase tracking-wider"
          style={{
            fontSize: 9,
            padding: "1px 6px",
            color: AMBER,
            background: "rgba(239,159,39,0.12)",
            border: "0.5px solid rgba(239,159,39,0.3)",
            fontWeight: 600,
          }}
        >
          ⚠ Decision Conflict
        </span>
      </div>
      <div className="text-white" style={{ fontSize: 11, lineHeight: 1.5 }}>
        {c.conflict_description}
      </div>
      {c.detected_from && (
        <p className="italic mt-1.5" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
          {c.detected_from}
        </p>
      )}
      {onFlag && (
        <button
          type="button"
          onClick={() => onFlag(c.conflict_description)}
          className="inline-flex items-center gap-1 mt-2 hover:underline"
          style={{ fontSize: 10, color: AMBER }}
        >
          Flag in Mission Pulse <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ---------------- Win Theme Alignment (decision-less connection) ---------------- */
function AlignmentCard({
  sectionLabel,
  rationale,
  onOpenThread,
}: {
  sectionLabel: string;
  rationale: string | null;
  onOpenThread: () => void;
}) {
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "rgba(127,119,221,0.04)", border: "0.5px dashed rgba(127,119,221,0.25)" }}
    >
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="h-3 w-3" style={{ color: PURPLE }} />
        <span style={{ fontSize: 9, color: PURPLE, fontWeight: 600, letterSpacing: 0.5 }}>
          WIN THEME ALIGNMENT
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>· {sectionLabel}</span>
      </div>
      {rationale && (
        <p className="italic" style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          {rationale}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenThread}
        className="inline-flex items-center gap-1 mt-1.5 hover:underline"
        style={{ fontSize: 10, color: PURPLE }}
      >
        📌 Notes <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
