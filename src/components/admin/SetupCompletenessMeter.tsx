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
        Every field you complete gives IRIS a clearer picture of your competitive position.
      </p>

      {pct >= 50 && !complete && (
        <p className="mt-3 flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
          <Check className="h-4 w-4" />
          IRIS is now active. Continue completing sections to sharpen your intelligence profile.
        </p>
      )}

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
            <>
              <div className="mt-4 text-[10px] uppercase tracking-[0.2em] font-mono text-amber-700 dark:text-amber-300">
                Help IRIS get smarter:
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missing.map((f, i) => (
                  <button
                    type="button"
                    key={f.key}
                    onClick={() => {
                      const el = document.getElementById(f.sectionId);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className={
                      i === 0
                        ? "inline-flex items-center gap-1.5 rounded-full border border-amber-500 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-500/30 transition-colors cursor-pointer"
                        : "inline-flex items-center rounded-full border border-amber-500/40 bg-background/60 px-2 py-0.5 text-[11px] font-mono text-amber-800 dark:text-amber-200 hover:bg-amber-500/10 transition-colors cursor-pointer"
                    }
                  >
                    {f.label}
                    {i === 0 && <span className="opacity-80">· Start here →</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
