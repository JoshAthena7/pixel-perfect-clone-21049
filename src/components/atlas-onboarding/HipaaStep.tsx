import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Shield, Lock, EyeOff, Award, Loader2 } from "lucide-react";
import { acknowledgeAtlasHipaa } from "@/lib/atlas-onboarding-gate.functions";

const GOLD = "#C9922A";
const NAVY = "#0D1B3E";
const CARD_BG = "#11214A";
const CARD_BORDER = "#1E315F";

type Props = {
  onAdvanced: () => void;
  onBack: () => void;
};

const COMMITMENTS = [
  {
    icon: Shield,
    title: "HIPAA Compliance",
    body: "You agree to protect all protected health information (PHI) you encounter during engagements. You will never share, store, or transmit PHI outside of approved ATLAS channels.",
  },
  {
    icon: Lock,
    title: "Client Confidentiality",
    body: "All client information, proposal content, and engagement details are strictly confidential. You will not discuss or share any engagement details outside of the ATLAS platform or authorized communications.",
  },
  {
    icon: EyeOff,
    title: "Data Security",
    body: "You are responsible for keeping your ATLAS credentials secure. You will not share your login, access ATLAS on unsecured public networks, or attempt to access missions you have not been assigned to.",
  },
  {
    icon: Award,
    title: "Professional Standards",
    body: "You represent Athena Strategy Group in all client-facing work. You commit to delivering work that meets the quality standards set for each engagement and communicating proactively if you cannot meet a deadline.",
  },
] as const;

export function HipaaStep({ onAdvanced, onBack }: Props) {
  const ackFn = useServerFn(acknowledgeAtlasHipaa);
  const [mounted, setMounted] = useState(false);
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 16);
    return () => window.clearTimeout(t);
  }, []);

  const trimmed = signature.trim();
  const valid = trimmed.length >= 5;

  async function handleSubmit() {
    if (submitting) return;
    if (!valid) {
      setError("Please enter your full legal name to continue.");
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await ackFn({ data: { signature: trimmed } });
      onAdvanced();
    } catch (e: any) {
      console.error("[atlas-onboarding] step 2 ack failed", e);
      setError(
        "Something went wrong saving your acknowledgment. Please try again.",
      );
      setSubmitting(false);
    }
  }

  // Stagger offsets (ms)
  const cardsStart = 800; // after intro line (300 + 200 + 200 +  intro reveal)
  const cardStagger = 150;
  const sigStart = cardsStart + COMMITMENTS.length * cardStagger + 200;

  return (
    <div className="relative w-full flex justify-center">
      <div className="w-full max-w-[640px] px-4">
        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          className="atlas-back-link mb-4 text-xs sm:text-sm"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          ← Back
        </button>

        {/* Element 1 — step label */}
        <div
          className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.32em]"
          style={{ color: GOLD, ...revealStyle(mounted, 0) }}
        >
          Before we begin
        </div>

        {/* Element 2 — headline */}
        <h1
          className="mt-3 text-3xl sm:text-4xl font-semibold text-white"
          style={revealStyle(mounted, 200)}
        >
          A few things you need to know.
        </h1>

        {/* Element 3 — intro */}
        <p
          className="mt-4 text-sm sm:text-base max-w-xl"
          style={{
            color: "rgba(255,255,255,0.7)",
            ...revealStyle(mounted, 400),
          }}
        >
          You'll be working with sensitive health information. These aren't just
          checkboxes — they're real commitments we take seriously.
        </p>

        {/* Element 4 — Commitment cards */}
        <div className="mt-8 flex flex-col gap-3">
          {COMMITMENTS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="atlas-commit-card flex gap-4 rounded-xl p-5"
                style={{
                  background: CARD_BG,
                  border: `1px solid ${CARD_BORDER}`,
                  ...revealStyle(mounted, cardsStart + i * cardStagger),
                }}
              >
                <div className="shrink-0 mt-0.5">
                  <Icon size={22} color={GOLD} strokeWidth={2} />
                </div>
                <div>
                  <div className="font-bold text-white text-base">
                    {c.title}
                  </div>
                  <p
                    className="mt-1.5 text-sm leading-relaxed"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Element 5 — signature block */}
        <div className="mt-8" style={revealStyle(mounted, sigStart)}>
          <label
            htmlFor="hipaa-signature"
            className="block text-sm font-medium text-white"
          >
            Type your full legal name to acknowledge these commitments.
          </label>
          <input
            id="hipaa-signature"
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={signature}
            onChange={(e) => {
              setSignature(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Your full legal name"
            disabled={submitting}
            className={`mt-2 w-full rounded-lg px-4 py-3 text-base outline-none ${
              shake ? "atlas-shake" : ""
            }`}
            style={{
              background: NAVY,
              border: `1px solid ${GOLD}`,
              color: "#fff",
            }}
          />
          {error ? (
            <p className="mt-2 text-xs sm:text-sm" style={{ color: "#F5B845" }}>
              {error}
            </p>
          ) : (
            <p
              className="mt-2 text-xs"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              By signing you confirm you have read and agree to all four
              commitments above. This acknowledgment is timestamped and
              recorded.
            </p>
          )}

          {/* Element 6 — CTA */}
          <div className="mt-6 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!valid || submitting}
              className="atlas-welcome-cta inline-flex items-center justify-center gap-2 rounded-xl font-bold px-8 py-3.5 text-base w-4/5 sm:w-auto"
              style={{
                background: GOLD,
                color: NAVY,
                boxShadow: "0 8px 24px rgba(201,146,42,0.25)",
              }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              I acknowledge and agree <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes atlas-step-reveal {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes atlas-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .atlas-shake { animation: atlas-shake 380ms ease-in-out; border-color: #F5B845 !important; }
        .atlas-commit-card { transition: box-shadow 200ms ease, border-color 200ms ease; }
        .atlas-commit-card:hover {
          border-color: ${GOLD};
          box-shadow: inset 0 0 24px rgba(201,146,42,0.08);
        }
        .atlas-welcome-cta {
          transition: transform 200ms ease, filter 200ms ease, box-shadow 200ms ease, opacity 200ms ease;
        }
        .atlas-welcome-cta:hover:not(:disabled) {
          transform: scale(1.02);
          filter: brightness(1.07);
          box-shadow: 0 10px 28px rgba(201,146,42,0.35);
        }
        .atlas-welcome-cta:disabled { opacity: 0.4; cursor: not-allowed; }
        .atlas-back-link { transition: color 150ms ease; }
        .atlas-back-link:hover { color: #fff; }
      `}</style>
    </div>
  );
}

function revealStyle(mounted: boolean, delayMs: number): React.CSSProperties {
  return mounted
    ? {
        animation: `atlas-step-reveal 400ms ease-out both`,
        animationDelay: `${delayMs}ms`,
      }
    : { opacity: 0, transform: "translateY(14px)" };
}
