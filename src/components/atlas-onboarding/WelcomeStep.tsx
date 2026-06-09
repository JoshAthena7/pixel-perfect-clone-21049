import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAtlasOnboardingStep } from "@/lib/atlas-onboarding-gate.functions";

const GOLD = "#C9922A";
const NAVY = "#0D1B3E";

type Props = {
  firstName: string | null;
  onAdvanced: () => void;
};

/**
 * Step 1 — Welcome screen.
 *
 * Four staggered fade-up reveals (greeting → mission → context → CTA).
 * Clicking "Let's go" stamps onboarding_step_completed = 1 and writes
 * a step-1 activity log entry, then asks the shell to refresh state.
 */
export function WelcomeStep({ firstName, onAdvanced }: Props) {
  const advanceFn = useServerFn(updateAtlasOnboardingStep);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Start the reveal sequence on next frame so the initial paint includes
    // the pre-animation (opacity:0, translateY) state — otherwise the
    // animation can be skipped by the browser on first paint.
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => window.clearTimeout(t);
  }, []);

  async function handleClick() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await advanceFn({
        data: {
          step: 1,
          activityMessage: "Onboarding Step 1 completed — Welcome screen acknowledged",
        },
      });
      onAdvanced();
    } catch (e: any) {
      console.error("[atlas-onboarding] step 1 advance failed", e);
      toast.error(e?.message ?? "Couldn't continue. Please try again.");
      setSubmitting(false);
    }
  }

  const greeting = firstName ? `Welcome, ${firstName}.` : "Welcome.";

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      style={{
        backgroundImage: `radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, rgba(13,27,62,0) 60%)`,
      }}
    >
      <div className="w-full max-w-3xl px-4 text-center flex flex-col items-center">
        {/* Element 1 — Greeting */}
        <h1
          className="font-semibold text-white whitespace-nowrap text-[clamp(2rem,7vw,5rem)] leading-tight"
          style={revealStyle(mounted, 300)}
        >
          {greeting}
        </h1>

        {/* Element 2 — Mission line */}
        <p
          className="mt-8 sm:mt-10 text-base sm:text-xl md:text-2xl font-medium max-w-2xl"
          style={{ color: GOLD, ...revealStyle(mounted, 900) }}
        >
          You've been selected to join one of the most elite proposal teams in healthcare.
        </p>

        {/* Element 3 — What happens next */}
        <p
          className="mt-8 sm:mt-10 text-sm sm:text-base max-w-xl"
          style={{
            color: "rgba(255,255,255,0.7)",
            ...revealStyle(mounted, 1500),
          }}
        >
          Before we get started, we need just a few minutes of your time. This is a
          one-time setup — we promise it's worth it.
        </p>

        {/* Element 4 — CTA */}
        <div
          className="mt-10 sm:mt-14 w-full flex justify-center"
          style={revealStyle(mounted, 2100)}
        >
          <button
            type="button"
            onClick={handleClick}
            disabled={submitting}
            className="atlas-welcome-cta inline-flex items-center justify-center gap-2 rounded-xl font-bold px-10 py-4 text-base sm:text-lg w-4/5 sm:w-auto"
            style={{
              background: GOLD,
              color: NAVY,
              boxShadow: "0 8px 24px rgba(201,146,42,0.25)",
            }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Let's go <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes atlas-step-reveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .atlas-welcome-cta {
          transition: transform 200ms ease, filter 200ms ease, box-shadow 200ms ease;
        }
        .atlas-welcome-cta:hover:not(:disabled) {
          transform: scale(1.02);
          filter: brightness(1.07);
          box-shadow: 0 10px 28px rgba(201,146,42,0.35);
        }
        .atlas-welcome-cta:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function revealStyle(mounted: boolean, delayMs: number): React.CSSProperties {
  return mounted
    ? {
        animation: `atlas-step-reveal 600ms ease-out both`,
        animationDelay: `${delayMs}ms`,
      }
    : { opacity: 0, transform: "translateY(14px)" };
}
