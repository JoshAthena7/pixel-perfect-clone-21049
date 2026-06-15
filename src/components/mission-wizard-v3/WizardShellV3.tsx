/**
 * v3 8-step IRIS-driven wizard shell.
 * Top progress bar, click-to-jump on visited steps, exit-saves-draft footer.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const WIZARD_STEPS = [
  { n: 1, label: "Fuel IRIS" },
  { n: 2, label: "Mission Basics" },
  { n: 3, label: "Strategy" },
  { n: 4, label: "Competitive" },
  { n: 5, label: "Intel Seeds" },
  { n: 6, label: "Review & Launch" },
] as const;

export const TOTAL_STEPS = WIZARD_STEPS.length;

export function WizardShellV3({
  missionId,
  step,
  visitedSteps,
  onJump,
  isLive = false,
  children,
}: {
  missionId: string;
  step: number;
  visitedSteps: number[];
  onJump: (s: number) => void;
  isLive?: boolean;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const visited = new Set(visitedSteps);
  const pct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "white" }}>
      {/* Header */}
      <header
        className="px-6 py-3 flex items-center gap-6 sticky top-0 z-30"
        style={{ background: "rgba(10,22,40,0.95)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link to="/olympus/missions" className="text-white text-[14px] font-medium tracking-wide shrink-0">
          ATLAS · <span className="text-white/65">Mission Setup</span>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="h-[3px] rounded-full bg-white/10 overflow-hidden">
            <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: "#C49A2B" }} />
          </div>
        </div>
        {isLive && (
          <Link
            to="/missions/$missionId/briefing"
            params={{ missionId }}
            className="text-[13px] shrink-0 px-3 py-1.5 rounded-md transition-colors"
            style={{ color: "#C49A2B", border: "1px solid rgba(196,154,43,0.4)" }}
            title="Return to the live mission brief"
          >
            ← View Live Mission
          </Link>
        )}
        <button
          onClick={() => navigate({ to: "/olympus/missions" })}
          className="text-[13px] text-white/55 hover:text-white shrink-0"
        >
          Exit Wizard
        </button>
      </header>

      {/* Step tabs */}
      <div
        className="px-6 py-3 flex items-center gap-1.5 overflow-x-auto"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {WIZARD_STEPS.map((s) => {
          const done = s.n < step && visited.has(s.n);
          const active = s.n === step;
          const clickable = visited.has(s.n) || s.n <= step;
          return (
            <button
              key={s.n}
              disabled={!clickable}
              onClick={() => clickable && onJump(s.n)}
              className={cn(
                "flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded transition-all whitespace-nowrap",
                active && "bg-amber-500/15",
                !active && clickable && "hover:bg-white/5",
                !clickable && "opacity-30 cursor-not-allowed",
              )}
              style={{ color: active ? "#C49A2B" : done ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.3)" }}
            >
              {done ? <Check className="h-3 w-3" /> : <span className="text-[10px] tabular-nums">{s.n}</span>}
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-[920px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function WizardFooter({
  step,
  onBack,
  onContinue,
  continueLabel = "Save & Continue",
  continueDisabled = false,
  continueHint,
}: {
  step: number;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueHint?: string;
}) {
  return (
    <div className="mt-10 pt-6 flex items-center justify-between gap-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={onBack}
        disabled={step <= 1}
        className="text-[13px] text-white/55 hover:text-white disabled:opacity-30"
      >
        ← Back
      </button>
      <span className="text-[12px] text-white/40">Step {step} of {TOTAL_STEPS}</span>
      <div className="flex items-center gap-3">
        {continueHint && <span className="text-[11px] text-white/45">{continueHint}</span>}
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="px-5 py-2 rounded-md text-[13.5px] font-medium disabled:opacity-40"
          style={{ background: "#C49A2B", color: "#0D1B3E" }}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}

export function WizardStepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-white text-[26px] font-medium leading-tight">{title}</h1>
      {subtitle && <p className="text-[14.5px] mt-1.5 text-white/55">{subtitle}</p>}
    </div>
  );
}
