import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getAtlasOnboardingState,
  type AtlasOnboardingState,
} from "@/lib/atlas-onboarding-gate.functions";
import { WelcomeStep } from "@/components/atlas-onboarding/WelcomeStep";
import { HipaaStep } from "@/components/atlas-onboarding/HipaaStep";
import { PhotoStep } from "@/components/atlas-onboarding/PhotoStep";
import { ResumeStep } from "@/components/atlas-onboarding/ResumeStep";
import { CelebrationStep } from "@/components/atlas-onboarding/CelebrationStep";


/**
 * Atlas onboarding shell.
 *
 * Visual chrome only — the 5 steps will render inside `<StepFrame>` in
 * future prompts. This route also serves as the redirect target for the
 * Atlas onboarding gate: anyone with `atlas_onboarding_complete = false`
 * lands here regardless of which URL they tried to open.
 */
export const Route = createFileRoute("/atlas-onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AtlasOnboardingShell,
});

const NAVY = "#0D1B3E";
const GOLD = "#C9922A";

function AtlasOnboardingShell() {
  const navigate = useNavigate();
  const getState = useServerFn(getAtlasOnboardingState);
  const [state, setState] = useState<AtlasOnboardingState | null>(null);
  // When the user clicks "← Back" we render an earlier step without
  // mutating server state. Cleared whenever the gate state refreshes.
  const [viewOverride, setViewOverride] = useState<1 | 2 | 3 | 4 | 5 | null>(
    null,
  );

  const refreshState = useCallback(async () => {
    try {
      const res = await getState();
      if (res.status === "complete") {
        navigate({ to: "/flight-deck", replace: true });
        return;
      }
      setViewOverride(null);
      setState(res);
    } catch (e) {
      console.error("[atlas-onboarding] gate state failed", e);
      setState({ status: "no_member" });
    }
  }, [getState, navigate]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);


  if (!state) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: NAVY }}
      >
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  if (state.status === "no_member") {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-6 text-center"
        style={{ background: NAVY, color: "#fff" }}
      >
        <div className="max-w-md">
          <AthenaLogo />
          <h1 className="mt-6 text-2xl font-semibold">You're not on the Athena roster yet</h1>
          <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            Please contact your Engagement Lead to be added before onboarding.
          </p>
        </div>
      </div>
    );
  }

  if (state.status !== "incomplete") {
    return null; // navigated away by the effect
  }

  // incomplete — step is 0..4 (= last completed). The "current" step the
  // user should be on is step + 1 (1..5). Resume copy when step > 0.
  const lastCompleted = state.step;
  const naturalStep = (lastCompleted + 1) as 1 | 2 | 3 | 4 | 5;
  // viewOverride lets back navigation render an earlier step.
  const currentStep = viewOverride ?? naturalStep;
  void state.resuming; // resume copy currently lives inside each step component
  void naturalStep;


  return (
    <div
      className="fixed inset-0 flex flex-col items-center px-4 py-10 sm:py-14 overflow-y-auto"
      style={{ background: NAVY, color: "#fff" }}
    >
      <AthenaLogo />
      <StepDots current={currentStep} />

      <main className="mt-10 w-full max-w-4xl flex-1 flex items-start sm:items-center justify-center">
        {currentStep === 1 ? (
          <WelcomeStep firstName={state.firstName} onAdvanced={refreshState} />
        ) : currentStep === 2 ? (
          <HipaaStep
            onAdvanced={refreshState}
            onBack={() => setViewOverride(1)}
          />
        ) : currentStep === 3 ? (
          <PhotoStep
            onAdvanced={refreshState}
            onBack={() => setViewOverride(2)}
          />
        ) : currentStep === 4 ? (
          <ResumeStep
            onAdvanced={refreshState}
            onBack={() => setViewOverride(3)}
          />
        ) : (
          <CelebrationStep
            onComplete={() => navigate({ to: "/flight-deck", replace: true })}
          />
        )}
      </main>

    </div>
  );
}

const STEP_TITLES = [
  "Welcome to Athena",
  "HIPAA acknowledgement",
  "Add a profile photo",
  "Upload your resume",
  "All set",
];

function StepDots({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="mt-8 flex items-center gap-3" aria-label="Onboarding progress">
      {[1, 2, 3, 4, 5].map((n) => {
        const completed = n < current;
        const active = n === current;
        const size = active ? 14 : 10;
        return (
          <span
            key={n}
            aria-current={active ? "step" : undefined}
            className={active ? "atlas-dot-pulse" : undefined}
            style={{
              width: size,
              height: size,
              borderRadius: 9999,
              background: completed || active ? GOLD : "transparent",
              border: `2px solid ${GOLD}`,
              transition: "all 200ms ease",
              display: "inline-block",
            }}
          />
        );
      })}
      <style>{`
        @keyframes atlas-dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${GOLD}55; }
          50% { box-shadow: 0 0 0 6px ${GOLD}00; }
        }
        .atlas-dot-pulse { animation: atlas-dot-pulse 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function AthenaLogo() {
  // Placeholder logo mark — four stylized figures in gold.
  return (
    <div className="flex flex-col items-center">
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        {[8, 24, 40, 56].map((cx) => (
          <g key={cx} fill={GOLD}>
            <circle cx={cx} cy={20} r="4" />
            <path d={`M ${cx - 6} 46 Q ${cx} 28 ${cx + 6} 46 Z`} />
          </g>
        ))}
      </svg>
      <div
        className="mt-3 text-[10px] font-bold tracking-[0.42em]"
        style={{ color: GOLD }}
      >
        ATHENA STRATEGY GROUP
      </div>
    </div>
  );
}
