import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, AlertCircle, Sparkles, Clock, Lightbulb, Copy, Check } from "lucide-react";
import type { DimensionResult, DimensionStatus, ScoreMeV2Result } from "@/lib/score-me-v2.functions";
import { logScoreMeInteraction } from "@/lib/score-me-interactions.functions";

const DIM_HELP: Record<DimensionResult["key"], string> = {
  person_first: "Universal language compliance. Always on.",
  outline_template: "Structure against the engagement's outline template.",
  style_guide: "Voice, tone, terminology, acronym usage.",
  contract_sow: "Commitments, scope, timelines, staffing alignment.",
  win_themes: "Are win themes present, prominent, and evidenced?",
  state_priorities: "State frameworks, local data, weighted criteria.",
  proof_points: "Forward-looking — where evidence would strengthen claims.",
};

function statusStyle(s: DimensionStatus) {
  switch (s) {
    case "green":
      return { dot: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/[0.04]", label: "Clear", icon: CheckCircle2 };
    case "yellow":
      return { dot: "bg-amber-400", text: "text-amber-300", border: "border-amber-500/30", bg: "bg-amber-500/[0.05]", label: "Needs attention", icon: AlertTriangle };
    case "red":
      return { dot: "bg-red-500", text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/[0.05]", label: "Needs attention", icon: AlertCircle };
    case "opportunity":
      return { dot: "bg-sky-400", text: "text-sky-300", border: "border-sky-500/30", bg: "bg-sky-500/[0.04]", label: "Opportunities", icon: Lightbulb };
    case "pending":
      return { dot: "bg-muted-foreground", text: "text-muted-foreground", border: "border-border", bg: "bg-muted/20", label: "Pending upload", icon: Clock };
  }
}

export function Scorecard({
  result,
  missionId,
  onAnother,
  onClose,
}: {
  result: ScoreMeV2Result;
  missionId: string;
  onAnother: () => void;
  onClose: () => void;
}) {
  // Sort: person-first first if flagged, then yellows/reds, opportunities, then greens, pending last.
  const order = (d: DimensionResult): number => {
    if (d.key === "person_first" && (d.status === "yellow" || d.status === "red")) return 0;
    if (d.status === "red") return 1;
    if (d.status === "yellow") return 2;
    if (d.status === "opportunity") return 3;
    if (d.status === "green") return 4;
    return 5;
  };
  const ordered = [...result.dimensions].sort((a, b) => order(a) - order(b));

  const submitted = new Date(result.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-sky-300">
            IRIS assessment
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            Q{result.question.question_number} — {result.question.title}
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Submitted {submitted} ·{" "}
            <span className={result.gapCount > 0 ? "text-amber-300" : "text-emerald-400"}>
              {result.gapCount} {result.gapCount === 1 ? "gap" : "gaps"} identified
            </span>{" "}
            ·{" "}
            <span className="text-sky-300">
              {result.opportunityCount} strengthening{" "}
              {result.opportunityCount === 1 ? "opportunity" : "opportunities"}
            </span>
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-right">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Dimensions active
          </div>
          <div className="mt-1 text-lg font-medium">
            {result.uploadsActive} <span className="text-muted-foreground">/ {result.uploadsTotal}</span>
          </div>
        </div>
      </div>

      {/* Scorecard rows */}
      <div className="space-y-3">
        {ordered.map((d) => (
          <DimensionRow
            key={d.key}
            dim={d}
            questionId={result.question.id}
            missionId={missionId}
          />
        ))}
      </div>

      {/* IRIS note */}
      {result.irisNote && (
        <div className="mt-6 rounded-[12px] border border-sky-500/25 bg-sky-500/[0.04] px-5 py-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
                IRIS note
              </div>
              <p className="mt-1 text-sm leading-relaxed text-foreground/85">{result.irisNote}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onAnother}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-hover"
        >
          Score another draft
        </button>
        <button
          onClick={onClose}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DimensionRow({ dim }: { dim: DimensionResult }) {
  const s = statusStyle(dim.status);
  const Icon = s.icon;
  return (
    <section className={`overflow-hidden rounded-[10px] border ${s.border} ${s.bg}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {dim.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${s.text}`}>
              <Icon className="h-3 w-3" />
              {s.label}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">
            {dim.summary || DIM_HELP[dim.key]}
          </p>

          {dim.status === "pending" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Upload via Mission → Vault to activate this check.
            </p>
          )}

          {dim.findings.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-border/40 pt-3 text-[12.5px] leading-relaxed">
              {dim.findings.map((f, i) => (
                <li key={i} className="text-foreground/80">
                  <span className="mr-1 text-muted-foreground">→</span>
                  {f.paragraph && (
                    <span className="mr-1 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {f.paragraph}
                    </span>
                  )}
                  <span>{f.text}</span>
                  {f.suggestion && (
                    <div className="mt-1 rounded border border-border bg-background/60 px-2 py-1.5 text-[12px]">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        Try:
                      </span>{" "}
                      <span className="text-foreground/85">{f.suggestion}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
