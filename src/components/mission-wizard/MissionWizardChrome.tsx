import { ChevronLeft } from "lucide-react";

const STEPS = [
  "Meet IRIS",
  "Upload",
  "Analyzing",
  "Structure",
  "Mission Memory",
  "Intel Drop",
  "Team",
  "Mission Brain",
  "Athena Insights",
  "Launch",
];

export function MissionWizardChrome({
  step,
  onBack,
}: {
  /** 1-10 */
  step: number;
  onBack?: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-40 w-full"
      style={{
        background: "rgba(8,12,20,0.92)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <style>{`
        @keyframes iris-dot-pulse {
          0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(201,168,76,0.5); }
          50% { opacity:.6; box-shadow:0 0 0 6px rgba(201,168,76,0); }
        }
      `}</style>

      {/* Top status bar */}
      <div className="max-w-[1200px] mx-auto px-6 h-10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "#c9a84c",
              animation: "iris-dot-pulse 2s ease-in-out infinite",
            }}
          />
          <span
            className="text-[11px] tracking-[0.22em] uppercase font-medium"
            style={{ color: "#c9a84c" }}
          >
            IRIS
          </span>
          <span className="text-[11px] tracking-[0.14em] uppercase text-white/40">
            Mission Intelligence Officer
          </span>
        </div>
        {onBack && step > 1 && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[12px] text-white/50 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        )}
      </div>

      {/* 10-step progress */}
      <div className="max-w-[1200px] mx-auto px-6 pb-3">
        <div className="flex items-center gap-1.5">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex-1 flex flex-col items-stretch gap-1.5">
                <div
                  className="h-[3px] rounded-full transition-all"
                  style={{
                    background: done || active ? "#c9a84c" : "rgba(255,255,255,0.08)",
                    boxShadow: active ? "0 0 10px rgba(201,168,76,0.55)" : "none",
                    opacity: done ? 0.55 : 1,
                  }}
                />
                <span
                  className="text-[9.5px] tracking-[0.08em] uppercase truncate text-center"
                  style={{
                    color: active
                      ? "#c9a84c"
                      : done
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.25)",
                  }}
                >
                  {n}. {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
