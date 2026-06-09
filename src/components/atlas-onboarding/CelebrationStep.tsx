import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  completeAtlasOnboarding,
  getAtlasCelebrationContext,
  type CelebrationContext,
} from "@/lib/atlas-onboarding-gate.functions";

const GOLD = "#C9922A";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  sme: "Subject Matter Expert",
  reviewer: "Reviewer",
  unassigned: "unassigned",
};

function reveal(delayMs: number): React.CSSProperties {
  return {
    opacity: 0,
    animation: `atlas-step-reveal 600ms ease-out ${delayMs}ms forwards`,
  };
}

export function CelebrationStep({ onComplete }: { onComplete: () => void }) {
  const fetchCtx = useServerFn(getAtlasCelebrationContext);
  const finishFn = useServerFn(completeAtlasOnboarding);
  const [ctx, setCtx] = useState<CelebrationContext | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    let alive = true;
    fetchCtx()
      .then((res) => {
        if (alive) setCtx(res);
      })
      .catch(() => {
        if (alive)
          setCtx({
            firstName: null,
            lastName: null,
            atlasRole: "unassigned",
            firstMission: null,
          });
      });
    return () => {
      alive = false;
    };
  }, [fetchCtx]);

  async function onEnter() {
    setSubmitting(true);
    setError(null);
    try {
      await finishFn();
      onComplete();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  }

  if (!ctx) {
    return (
      <div className="w-full flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} />
      </div>
    );
  }

  const firstName = ctx.firstName ?? "there";
  const role = ctx.atlasRole ?? "unassigned";
  const roleLabel = ROLE_LABEL[role] ?? role;
  const isUnassigned = role === "unassigned";

  return (
    <div className="relative w-full max-w-[560px] mx-auto text-center">
      {!reduced && <GoldParticles />}

      <div style={reveal(200)}>
        <MarkPulse />
      </div>

      <div
        className="mt-6 text-[11px] font-bold uppercase tracking-[0.42em]"
        style={{ ...reveal(800), color: GOLD }}
      >
        Clearance granted
      </div>

      <h1
        className="mt-5 text-3xl sm:text-5xl font-semibold leading-tight text-white"
        style={reveal(1300)}
      >
        Welcome to the collective, {firstName}.
      </h1>

      <p
        className="mt-5 text-base sm:text-lg"
        style={{ ...reveal(1900), color: GOLD }}
      >
        {isUnassigned
          ? "Your role will be assigned before your first mission."
          : `You're joining as ${roleLabel}.`}
      </p>

      <div className="mt-7" style={reveal(2500)}>
        {ctx.firstMission ? (
          <div
            className="rounded-xl px-5 py-4 text-left"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${GOLD}66`,
            }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-[0.32em]"
              style={{ color: GOLD }}
            >
              Your first mission
            </div>
            <div className="mt-2 text-base font-semibold text-white">
              {ctx.firstMission.name}
            </div>
            {ctx.firstMission.subtitle && (
              <div className="mt-1 text-sm text-white/70">
                {ctx.firstMission.subtitle}
              </div>
            )}
            <div className="mt-3 text-xs text-white/60">
              Your team is waiting.
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/65">
            Your first mission assignment is coming. Stay ready.
          </p>
        )}
      </div>

      <p
        className="mt-7 text-sm text-white/70"
        style={reveal(3100)}
      >
        Everything you need is inside. Let's build something that matters.
      </p>

      <div className="mt-8 flex flex-col items-center" style={reveal(3700)}>
        <button
          type="button"
          onClick={onEnter}
          disabled={submitting}
          className="rounded-lg px-8 py-3.5 text-base font-bold transition-all hover:brightness-110 hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
          style={{
            background: GOLD,
            color: "#0D1B3E",
            boxShadow: `0 0 28px ${GOLD}66, 0 0 60px ${GOLD}33`,
          }}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Finalizing…
            </span>
          ) : (
            "Enter ATLAS →"
          )}
        </button>
        {error && (
          <div className="mt-4 text-sm flex flex-col items-center gap-2" style={{ color: "#F5A623" }}>
            <span>Something went wrong. Please try again.</span>
            <button
              type="button"
              onClick={onEnter}
              className="underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes atlas-step-reveal {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes atlas-mark-pulse {
          0%, 100% { filter: drop-shadow(0 0 0 ${GOLD}00); transform: scale(1); }
          50%      { filter: drop-shadow(0 0 14px ${GOLD}AA); transform: scale(1.04); }
        }
        @keyframes atlas-drift {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          15%  { opacity: 0.18; }
          85%  { opacity: 0.18; }
          100% { transform: translateY(-120vh) translateX(var(--dx, 0px)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function MarkPulse() {
  return (
    <div
      className="mx-auto"
      style={{ width: 64, height: 64, animation: "atlas-mark-pulse 1200ms ease-out 400ms 1" }}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        {[8, 24, 40, 56].map((cx) => (
          <g key={cx} fill={GOLD}>
            <circle cx={cx} cy={20} r="4" />
            <path d={`M ${cx - 6} 46 Q ${cx} 28 ${cx + 6} 46 Z`} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function GoldParticles() {
  const dots = Array.from({ length: 14 }, (_, i) => i);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {dots.map((i) => {
        const left = (i * 37) % 100;
        const dur = 18 + ((i * 7) % 14);
        const delay = (i * 1.3) % 12;
        const size = 2 + (i % 3);
        const dx = ((i % 5) - 2) * 20;
        return (
          <span
            key={i}
            style={
              {
                position: "absolute",
                left: `${left}%`,
                bottom: -10,
                width: size,
                height: size,
                borderRadius: 9999,
                background: GOLD,
                opacity: 0,
                animation: `atlas-drift ${dur}s linear ${delay}s infinite`,
                "--dx": `${dx}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
