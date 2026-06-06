import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Constellation } from "@/components/v2/polish";
import { MissionIntelligenceGraph } from "@/components/v2/MissionIntelligenceGraph";
import { Eye, BookMarked, Compass, Play, Pause, ArrowRight, Database, Network, Lightbulb, Sparkles } from "lucide-react";

export const Route = createFileRoute("/iris")({
  head: () => ({
    meta: [
      { title: "IRIS — Healthcare Intelligence System by Athena Strategy Group" },
      {
        name: "description",
        content:
          "IRIS is the most advanced healthcare intelligence system ever built for Medicaid strategy. Intelligence. Readiness. Integration. Strategy.",
      },
      { property: "og:title", content: "IRIS — Healthcare Intelligence System" },
      {
        property: "og:description",
        content:
          "Intelligence. Readiness. Integration. Strategy. Built exclusively for the Athena Collective.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IrisPublicPage,
});

/* ───────────────────────────── shared bits ───────────────────────────── */

const GOLD = "var(--athena-gold, #C49A22)";

function IrisMark({ size = 40 }: { size?: number }) {
  return (
    <span
      aria-label="IRIS"
      className="inline-flex items-center justify-center rounded-full border"
      style={{
        width: size,
        height: size,
        background: "#0a0f1e",
        borderColor: "rgba(196,154,34,0.5)",
        boxShadow: "0 0 18px rgba(196,154,34,0.35)",
      }}
    >
      <span
        className="font-semibold tracking-[0.18em]"
        style={{
          color: GOLD,
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: size * 0.42,
        }}
      >
        IRIS
      </span>
    </span>
  );
}

/** Fade-in-on-view wrapper using IntersectionObserver. */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(14px)",
        transition: `opacity 900ms ease-out ${delay}ms, transform 900ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ───────────────────────────── page ───────────────────────────── */

function IrisPublicPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: "#05080f", fontFamily: "'Inter', sans-serif" }}>
      <PublicNav />
      <HeroSection />
      <WhatIrisIsSection />
      <GraphSection />
      <IrisSpeaksSection />
      <HowSheThinksSection />
      <CloseSection />
      <PublicFooter />
    </div>
  );
}

/* ───────────── nav ───────────── */

function PublicNav() {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 backdrop-blur-md"
      style={{ background: "rgba(5,8,15,0.55)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <IrisMark size={32} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Athena Strategy Group
          </span>
        </div>
        <a
          href="#collective"
          className="text-[11px] font-semibold uppercase tracking-[0.32em] transition-opacity hover:opacity-70"
          style={{ color: GOLD }}
        >
          The Collective →
        </a>
      </div>
    </header>
  );
}

/* ───────────── section 1: hero ───────────── */

function HeroSection() {
  return (
    <section className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-6">
      <Constellation opacity={0.14} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(196,154,34,0.10) 0%, rgba(5,8,15,0) 55%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <Reveal>
          <div className="mb-10 flex justify-center">
            <IrisMark size={72} />
          </div>
        </Reveal>

        <Reveal delay={200}>
          <h1
            className="text-balance leading-[0.95] tracking-tight"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(72px, 14vw, 196px)",
              color: GOLD,
              textShadow: "0 0 60px rgba(196,154,34,0.35)",
            }}
          >
            IRIS
          </h1>
        </Reveal>

        <Reveal delay={500}>
          <p
            className="mx-auto mt-8 max-w-2xl text-balance text-base font-semibold uppercase tracking-[0.45em] md:text-lg"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            Intelligence · Readiness · Integration · Strategy
          </p>
        </Reveal>

        <Reveal delay={1100}>
          <p
            className="mx-auto mt-12 max-w-2xl text-balance text-lg italic leading-relaxed md:text-xl"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            The most advanced healthcare intelligence system ever built for Medicaid strategy.
          </p>
        </Reveal>

        <Reveal delay={1700}>
          <div className="mt-20 flex flex-col items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span>Scroll to continue</span>
            <span aria-hidden className="h-10 w-px animate-pulse" style={{ background: GOLD }} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── section 2: what IRIS is ───────────── */

const CAPABILITIES = [
  {
    icon: Eye,
    title: "What she observes",
    body: "Federal policy shifts, state priorities, political signals, competitive intelligence, and community dynamics — continuously.",
  },
  {
    icon: BookMarked,
    title: "What she remembers",
    body: "Every procurement Athena has touched, every win theme that worked, every risk that was missed — institutional memory that compounds.",
  },
  {
    icon: Compass,
    title: "What she advises",
    body: "Mission briefs, environmental assessments, win strategies, competitive positioning — delivered in minutes, not weeks.",
  },
];

function WhatIrisIsSection() {
  return (
    <section className="relative w-full px-6 py-32 md:py-40" style={{ background: "#070b15" }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-20 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
              What IRIS Is
            </div>
            <h2
              className="mt-6 text-balance text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
            >
              An intelligence system that thinks the way healthcare strategists think.
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-px md:grid-cols-3" style={{ background: "rgba(196,154,34,0.18)" }}>
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={i * 150}>
              <CapabilityCard {...c} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilityCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative h-full p-10 transition-colors" style={{ background: "#070b15" }}>
      <div
        className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-full border transition-transform duration-500 group-hover:scale-110"
        style={{
          borderColor: "rgba(196,154,34,0.4)",
          background: "rgba(196,154,34,0.06)",
          boxShadow: "0 0 24px rgba(196,154,34,0.18)",
        }}
      >
        <Icon className="h-6 w-6" style={{ color: GOLD }} strokeWidth={1.5} />
      </div>
      <h3
        className="text-2xl"
        style={{ fontFamily: "'Cormorant Garamond', serif", color: GOLD }}
      >
        {title}
      </h3>
      <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
        {body}
      </p>
    </div>
  );
}

/* ───────────── section 3: intelligence graph demo ───────────── */

function GraphSection() {
  return (
    <section className="relative w-full px-6 py-32 md:py-40" style={{ background: "#05080f" }}>
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
              Live Demonstration
            </div>
            <h2
              className="mt-6 text-balance text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
            >
              Live Intelligence Graph — NJ CSOC 2026 Procurement
            </h2>
            <p className="mt-4 text-sm italic" style={{ color: "rgba(255,255,255,0.55)" }}>
              IRIS generated this in 47 seconds.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              borderColor: "rgba(196,154,34,0.25)",
              background: "#040814",
              boxShadow: "0 0 80px rgba(196,154,34,0.10), inset 0 0 60px rgba(0,0,0,0.6)",
            }}
          >
            <MissionIntelligenceGraph />
          </div>
        </Reveal>

        <Reveal delay={400}>
          <p className="mt-6 text-center text-xs uppercase tracking-[0.32em]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Hover any node — every entity, every connection, every signal.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── section 4: IRIS speaks ───────────── */

const IRIS_TRANSCRIPT =
  "Before there were platforms, there were rooms. Athena was built in that spirit. I was built to protect what makes those rooms special — the wisdom, the trust, the intelligence that only comes from people who have done this work from the inside. I am IRIS. And I am here.";

function IrisSpeaksSection() {
  const [playing, setPlaying] = useState(false);

  // Placeholder audio — ElevenLabs integration in Phase 2.
  // Toggles a faux 8-second "playing" state so the button feels alive.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPlaying(false), 8000);
    return () => clearTimeout(t);
  }, [playing]);

  return (
    <section className="relative w-full px-6 py-32 md:py-40" style={{ background: "#070b15" }}>
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
              In Her Voice
            </div>
            <h2
              className="mt-6 text-balance text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
            >
              IRIS speaks.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div
            className="rounded-2xl border p-8 md:p-12"
            style={{
              borderColor: "rgba(196,154,34,0.3)",
              background: "linear-gradient(180deg, #0a0f1e 0%, #060a14 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
            }}
          >
            <div className="flex items-center gap-6">
              <IrisMark size={80} />
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "rgba(255,255,255,0.55)" }}>
                  IRIS
                </div>
                <div className="mt-1 text-lg" style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.9)" }}>
                  A message to the Collective
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? "Pause IRIS" : "Play IRIS"}
                className="inline-flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                style={{
                  background: GOLD,
                  color: "#05080f",
                  boxShadow: "0 0 40px rgba(196,154,34,0.55)",
                }}
              >
                {playing ? <Pause className="h-7 w-7" strokeWidth={2.2} /> : <Play className="ml-1 h-7 w-7" strokeWidth={2.2} fill="#05080f" />}
              </button>
            </div>

            {/* Faux waveform */}
            <div className="mt-8 flex h-12 items-center gap-[3px]">
              {Array.from({ length: 64 }).map((_, i) => {
                const h = 20 + ((i * 37) % 80);
                return (
                  <span
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: `${h}%`,
                      background: GOLD,
                      opacity: playing ? 0.85 : 0.25,
                      transition: "opacity 200ms",
                      animation: playing ? `iris-wave 1.2s ease-in-out ${i * 30}ms infinite alternate` : "none",
                    }}
                  />
                );
              })}
            </div>

            <p
              className="mt-10 text-balance text-lg italic leading-relaxed md:text-xl"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.85)" }}
            >
              “{IRIS_TRANSCRIPT}”
            </p>

            <details className="mt-6 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              <summary className="cursor-pointer select-none uppercase tracking-[0.32em] hover:text-white/80">
                Transcript
              </summary>
              <p className="mt-3 leading-relaxed">{IRIS_TRANSCRIPT}</p>
            </details>
          </div>
        </Reveal>
      </div>

      <style>{`
        @keyframes iris-wave {
          0%   { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </section>
  );
}

/* ───────────── section 5: how she thinks ───────────── */

const FLOW = [
  { icon: Database, label: "Sources flow in", body: "Policy, procurements, signals, memory." },
  { icon: Network, label: "IRIS tags and connects", body: "Every entity placed in the graph." },
  { icon: Lightbulb, label: "Understanding emerges", body: "Patterns surface that no human could hold." },
  { icon: Sparkles, label: "Strategy surfaces", body: "Mission briefs, win themes, risk maps." },
];

function HowSheThinksSection() {
  return (
    <section className="relative w-full px-6 py-32 md:py-40" style={{ background: "#05080f" }}>
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-20 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
              How She Thinks
            </div>
            <h2
              className="mt-6 text-balance text-4xl leading-tight md:text-5xl"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
            >
              Truth becomes intelligence. Intelligence becomes strategy.
            </h2>
          </div>
        </Reveal>

        <div className="relative">
          {/* Connecting line */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden h-px md:block"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${GOLD} 20%, ${GOLD} 80%, transparent 100%)`,
              opacity: 0.4,
            }}
          />
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
            {FLOW.map((step, i) => (
              <Reveal key={step.label} delay={i * 200}>
                <FlowStep {...step} index={i + 1} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowStep({
  icon: Icon,
  label,
  body,
  index,
}: {
  icon: typeof Database;
  label: string;
  body: string;
  index: number;
}) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <div
        className="relative z-10 mb-6 flex h-14 w-14 items-center justify-center rounded-full border-2"
        style={{
          background: "#05080f",
          borderColor: GOLD,
          boxShadow: "0 0 30px rgba(196,154,34,0.4)",
        }}
      >
        <Icon className="h-6 w-6" style={{ color: GOLD }} strokeWidth={1.5} />
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: "rgba(255,255,255,0.4)" }}>
        Step {index}
      </div>
      <div
        className="mt-2 text-xl"
        style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
      >
        {label}
      </div>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
        {body}
      </p>
    </div>
  );
}

/* ───────────── section 6: close ───────────── */

function CloseSection() {
  return (
    <section
      id="collective"
      className="relative flex min-h-[80vh] w-full items-center justify-center overflow-hidden px-6 py-32"
      style={{ background: "#040814" }}
    >
      <Constellation opacity={0.10} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(196,154,34,0.12) 0%, rgba(5,8,15,0) 60%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <Reveal>
          <IrisMark size={56} />
        </Reveal>
        <Reveal delay={150}>
          <h2
            className="mt-10 text-balance text-4xl leading-tight md:text-6xl"
            style={{ fontFamily: "'Cormorant Garamond', serif", color: "rgba(255,255,255,0.95)" }}
          >
            IRIS is available exclusively to the Athena Collective.
          </h2>
        </Reveal>
        <Reveal delay={400}>
          <p
            className="mt-8 text-2xl italic md:text-3xl"
            style={{ fontFamily: "'Cormorant Garamond', serif", color: GOLD }}
          >
            Solutions with a soul.
          </p>
        </Reveal>
        <Reveal delay={650}>
          <a
            href="mailto:collective@athenastrategygroupinc.com?subject=Learn%20about%20the%20Collective"
            className="mt-14 inline-flex items-center gap-3 rounded-full border px-8 py-4 text-sm font-semibold uppercase tracking-[0.28em] transition-all hover:gap-5"
            style={{
              borderColor: GOLD,
              color: GOLD,
              background: "rgba(196,154,34,0.06)",
              boxShadow: "0 0 30px rgba(196,154,34,0.25)",
            }}
          >
            Learn about the Collective
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── footer ───────────── */

function PublicFooter() {
  return (
    <footer className="w-full px-6 py-10" style={{ background: "#03050b", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-4 text-[11px] uppercase tracking-[0.28em] md:flex-row" style={{ color: "rgba(255,255,255,0.4)" }}>
        <div className="flex items-center gap-3">
          <IrisMark size={24} />
          <span>Athena Strategy Group, Inc.</span>
        </div>
        <span>© {new Date().getFullYear()} — Built for the Collective.</span>
      </div>
    </footer>
  );
}
