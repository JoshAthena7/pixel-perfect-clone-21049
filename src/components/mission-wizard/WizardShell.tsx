/**
 * v2 WizardShell — 5 steps with a thin gold progress bar, slim header,
 * centered content (max 720, or wide=true for journey/team).
 * Save & exit returns to /olympus/missions preserving whatever the step
 * component has already written to Supabase.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TOTAL = 5;
const STEP_LABELS: Record<number, string> = {
  1: "Upload RFP",
  2: "Set the Strategy",
  3: "Build the Team",
  4: "Set the Timeline",
  5: "BLAST OFF",
};

export function WizardShell({
  step,
  onBack,
  children,
  wide,
  irisStatus,
}: {
  step: number;
  onBack?: () => void;
  children: React.ReactNode;
  wide?: boolean;
  /** "IRIS is reading your RFP…" header chip. */
  irisStatus?: { reading: boolean } | null;
}) {
  const navigate = useNavigate();
  const clampedStep = Math.max(1, Math.min(TOTAL, step));
  const pct = (clampedStep / TOTAL) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A1628", color: "white" }}>
      {/* Header */}
      <header
        className="px-6 py-3 flex items-center gap-6"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <Link
          to="/olympus/missions"
          className="text-white text-[14px] font-medium tracking-wide shrink-0"
        >
          ATLAS · <span className="text-white/65">New Mission</span>
        </Link>

        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-white/55 text-[13px] shrink-0">
            Step {clampedStep} of {TOTAL}
          </span>
          <div className="flex-1 h-[3px] rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "#C49A2B" }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {irisStatus?.reading && (
            <span className="text-[12px] text-white/55 inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#A78BFA" }} />
              IRIS is reading your RFP…
            </span>
          )}
          <button
            onClick={() => navigate({ to: "/olympus/missions" })}
            className="text-[13px] text-white/55 hover:text-white"
          >
            Save and exit
          </button>
        </div>
      </header>

      {/* Body */}
      <main className={cn("flex-1 flex justify-center px-6 py-10", !wide && "items-start")}>
        <div className={cn("w-full", wide ? "max-w-[1200px]" : "max-w-[720px]")}>
          <div className="text-[11px] uppercase tracking-[0.22em] mb-3" style={{ color: "#C49A2B" }}>
            Step {clampedStep} of {TOTAL}
          </div>
          {children}

          {step > 1 && onBack && (
            <div className="mt-8">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-[13px] text-white/55 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function WizardStepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-white text-[28px] font-medium leading-tight">{title}</h1>
      {subtitle && (
        <p className="text-[15px] mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function stepLabel(n: number): string {
  return STEP_LABELS[n] ?? "";
}
