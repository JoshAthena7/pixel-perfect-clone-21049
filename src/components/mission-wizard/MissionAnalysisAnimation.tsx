import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { IrisMark } from "@/components/iris/IrisMark";

const TASKS = [
  "Reading documents",
  "Extracting requirements",
  "Building question structure",
  "Identifying evaluation criteria",
  "Detecting key dates",
  "Building compliance matrix",
  "Searching for risks",
  "Proposing win themes",
];

// Per-task dwell time in ms. Tuned so the whole sequence lands ~10s.
const DWELL = [900, 1100, 1300, 1200, 1000, 1300, 1400, 1200];

export function MissionAnalysisAnimation({
  onComplete,
}: {
  onComplete: () => void;
}) {
  // index of task currently running. -1 = not started. TASKS.length = all done.
  const [active, setActive] = useState(0);
  const [pulse, setPulse] = useState(0); // 0..100 within current task

  // Advance through tasks sequentially
  useEffect(() => {
    if (active >= TASKS.length) {
      const t = setTimeout(onComplete, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setActive((a) => a + 1), DWELL[active] ?? 1000);
    return () => clearTimeout(t);
  }, [active, onComplete]);

  // Smooth pulsing progress bar tied to active task duration
  useEffect(() => {
    if (active >= TASKS.length) {
      setPulse(100);
      return;
    }
    setPulse(0);
    const dwell = DWELL[active] ?? 1000;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / dwell) * 100);
      setPulse(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Overall progress for top bar
  const overall =
    active >= TASKS.length
      ? 100
      : Math.round(((active + pulse / 100) / TASKS.length) * 100);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#080c14", color: "white" }}
    >
      <style>{`
        @keyframes mission-task-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mission-dot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.35); opacity: 1; }
        }
        @keyframes mission-bar-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes mission-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Top progress bar */}
      <div
        className="h-[3px] w-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full transition-[width] duration-200 ease-out"
          style={{
            width: `${overall}%`,
            background:
              "linear-gradient(90deg, rgba(201,168,76,0.4) 0%, #c9a84c 50%, rgba(201,168,76,0.4) 100%)",
            backgroundSize: "200% 100%",
            animation: "mission-bar-shimmer 2.2s linear infinite",
            boxShadow: "0 0 12px rgba(201,168,76,0.6)",
          }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[640px]">
          {/* IRIS header */}
          <div className="flex items-start gap-4 mb-10">
            <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
              {/* Orbiting ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px dashed rgba(167,139,250,0.35)",
                  animation: "mission-orbit 8s linear infinite",
                }}
              />
              <div
                className="absolute inset-1 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(127,119,221,0.14)",
                  border: "1px solid rgba(167,139,250,0.4)",
                  boxShadow: "0 0 32px rgba(167,139,250,0.35)",
                }}
              >
                <IrisMark size={32} glow />
              </div>
            </div>
            <div className="pt-2 flex-1">
              <div
                className="text-[11px] uppercase tracking-[0.22em]"
                style={{ color: "#c9a84c" }}
              >
                IRIS · Analyzing your mission
              </div>
              <div className="text-white text-[20px] mt-1.5 leading-snug">
                {active >= TASKS.length
                  ? "Analysis complete."
                  : "Working through your documents now."}
              </div>
              <div className="text-white/50 text-[13px] mt-1">
                {active >= TASKS.length
                  ? "Bringing you into the mission…"
                  : `Step ${Math.min(active + 1, TASKS.length)} of ${TASKS.length}`}
              </div>
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-2.5">
            {TASKS.map((task, i) => {
              const state =
                i < active ? "done" : i === active ? "running" : "pending";
              if (state === "pending") {
                return (
                  <div
                    key={task}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg opacity-30"
                  >
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: "rgba(255,255,255,0.25)" }}
                    />
                    <span className="text-[14px] text-white/55">{task}</span>
                  </div>
                );
              }
              if (state === "done") {
                return (
                  <div
                    key={task}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      animation: "mission-task-in 0.35s ease-out",
                    }}
                  >
                    <div
                      className="h-5 w-5 rounded-full shrink-0 flex items-center justify-center"
                      style={{
                        background: "rgba(16,185,129,0.15)",
                        border: "1px solid rgba(16,185,129,0.45)",
                      }}
                    >
                      <Check className="h-3 w-3 text-emerald-400" />
                    </div>
                    <span className="text-[14px] text-white/75">{task}</span>
                  </div>
                );
              }
              // running
              return (
                <div
                  key={task}
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: "rgba(201,168,76,0.06)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    animation: "mission-task-in 0.35s ease-out",
                    boxShadow: "0 0 24px -8px rgba(201,168,76,0.35)",
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                      <span
                        className="absolute h-2.5 w-2.5 rounded-full"
                        style={{
                          background: "#c9a84c",
                          animation: "mission-dot-pulse 1.2s ease-in-out infinite",
                        }}
                      />
                      <Loader2
                        className="h-5 w-5 animate-spin"
                        style={{ color: "rgba(201,168,76,0.6)" }}
                        strokeWidth={1.4}
                      />
                    </div>
                    <span
                      className="text-[14px] font-medium"
                      style={{ color: "#F5E6B8" }}
                    >
                      {task}
                    </span>
                    <span className="ml-auto text-[11px] text-white/45">
                      {Math.round(pulse)}%
                    </span>
                  </div>
                  <div
                    className="h-[2px] w-full"
                    style={{ background: "rgba(201,168,76,0.15)" }}
                  >
                    <div
                      className="h-full transition-[width] duration-100"
                      style={{
                        width: `${pulse}%`,
                        background: "#c9a84c",
                        boxShadow: "0 0 8px rgba(201,168,76,0.7)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Whispered footer hint */}
          <div className="mt-10 text-center">
            <span className="text-[12px] text-white/35">
              You don't have to wait — IRIS keeps working in the background.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
