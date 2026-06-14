/**
 * 3-2-1 BLAST OFF overlay for the mission launch button.
 *
 * Self-contained: kicks off the actual launch work passed in via onLaunch
 * (DB update + IRIS fire-and-forget triggers), then plays the countdown
 * animation. When both the launch promise resolves AND the animation
 * finishes, it calls onComplete which navigates the user away.
 */
import { useEffect, useState } from "react";
import { Rocket, CheckCircle2 } from "lucide-react";

type Phase = "3" | "2" | "1" | "blast" | "ready";

export function LaunchSequence({
  onLaunch,
  onComplete,
}: {
  onLaunch: () => Promise<void>;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("3");
  const [launchErr, setLaunchErr] = useState<string | null>(null);
  const [launchDone, setLaunchDone] = useState(false);

  // Kick off the real launch work in parallel with the animation.
  useEffect(() => {
    let cancelled = false;
    onLaunch()
      .then(() => {
        if (!cancelled) setLaunchDone(true);
      })
      .catch((e) => {
        if (!cancelled) setLaunchErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drive the countdown animation.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("2"), 900);
    const t2 = setTimeout(() => setPhase("1"), 1800);
    const t3 = setTimeout(() => setPhase("blast"), 2700);
    const t4 = setTimeout(() => setPhase("ready"), 3800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  // Once animation done AND launch done, hand off.
  useEffect(() => {
    if (phase === "ready" && launchDone && !launchErr) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [phase, launchDone, launchErr, onComplete]);

  const bigText =
    phase === "blast" || phase === "ready" ? "BLAST OFF" : phase;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border bg-[#0a1428] p-10 text-center shadow-2xl transition-all duration-500"
        style={{
          borderColor:
            phase === "ready" ? "rgba(196,154,34,0.65)" : "rgba(255,255,255,0.08)",
          boxShadow:
            phase === "ready"
              ? "0 0 80px -10px rgba(196,154,34,0.55), 0 0 0 1px rgba(196,154,34,0.3)"
              : "0 30px 80px -10px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center justify-center mb-6">
          <div
            className={`inline-flex h-14 w-14 items-center justify-center rounded-full transition-all duration-500 ${
              phase === "ready"
                ? "bg-[#C49A22]/25 scale-110"
                : "bg-[#C49A22]/15"
            }`}
          >
            {phase === "ready" ? (
              <CheckCircle2 className="h-7 w-7 text-[#C49A22]" />
            ) : (
              <Rocket
                className={`h-7 w-7 text-[#C49A22] ${
                  phase === "blast" ? "animate-bounce" : "animate-pulse"
                }`}
              />
            )}
          </div>
        </div>

        <div
          key={phase}
          className={`font-light tracking-tight transition-all duration-300 ${
            phase === "blast" || phase === "ready"
              ? "text-5xl text-[#C49A22]"
              : "text-7xl text-white"
          }`}
          style={{
            animation: "lsPop 0.45s ease-out",
            textShadow:
              phase === "blast" || phase === "ready"
                ? "0 0 32px rgba(196,154,34,0.6)"
                : "none",
          }}
        >
          {bigText}
        </div>

        <div className="mt-5 text-[11px] uppercase tracking-[0.32em] font-mono text-white/55">
          {phase === "ready"
            ? launchDone
              ? "Mission active · entering briefing"
              : "Finalizing…"
            : phase === "blast"
              ? "Igniting IRIS pipelines"
              : "Launch sequence engaged"}
        </div>

        {launchErr && (
          <div className="mt-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            {launchErr}
          </div>
        )}
      </div>

      <style>{`
        @keyframes lsPop {
          0%   { opacity: 0; transform: scale(0.6); }
          60%  { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
