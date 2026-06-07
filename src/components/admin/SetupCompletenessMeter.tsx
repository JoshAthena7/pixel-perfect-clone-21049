import { Zap, Check } from "lucide-react";
import { computeSetupCompleteness } from "@/lib/iris-mission-context";

type Props = {
  mission: Record<string, any> | null | undefined;
  evaluationCount: number;
};

export function SetupCompletenessMeter({ mission, evaluationCount }: Props) {
  const { pct, filled, total, missing } = computeSetupCompleteness({
    mission,
    evaluationCount,
  });

  const complete = pct >= 100;

  return (
    <section
      className={[
        "rounded-lg border p-5",
        complete
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-mono">
            IRIS Intelligence Readiness
          </div>
          <h2 className="mt-1 text-lg font-light text-foreground">
            Setup Record — <span className="font-medium">{pct}% complete</span>
          </h2>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {filled} / {total} fields
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
        <div
          className={complete ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        IRIS needs these fields to generate accurate intelligence. The more you complete, the sharper your analysis becomes.
      </p>

      {complete ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" />
          Setup Record complete — IRIS is fully context-aware for this mission.
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Zap className="h-4 w-4" />
            IRIS is working with limited intelligence — complete these fields to sharpen your analysis.
          </p>
          {missing.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {missing.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center rounded-full border border-amber-500/40 bg-background/60 px-2 py-0.5 text-[11px] font-mono text-amber-800 dark:text-amber-200"
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
