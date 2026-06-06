import { useMemo } from "react";

const NOTES: string[] = [
  "On this day in ancient Athens, Athena gifted the city an olive tree. The vote was close.",
  "IRIS notes: it is Friday. The Oracle endorses this fully.",
  "The Athenians believed rest was sacred. IRIS does not disagree.",
  "Today's patron: Hermes — messenger, swift, remarkably good under pressure.",
  "IRIS has processed 14,000 documents this week. She is fine.",
  "The stars aligned over Olympus last night. Coincidentally, so did the team.",
  "Atlas held up the world before lunch today. So can you.",
  "Intelligence conditions: clear. Creativity: favorable. Coffee: non-negotiable.",
  "The Oracle consulted the heavens. Her recommendation: begin.",
  "The Collective worked 847 hours this week. The Oracle noticed.",
  "Somewhere in the Collective right now, someone is on their best draft. It shows.",
  "Wednesday belongs to no god in particular. IRIS finds this liberating.",
  "Odysseus took ten years to get home. Your deadline is much sooner. You've got this.",
  "The owl sees clearly in the dark. That's the job.",
  "In Delphi, the Oracle spoke in riddles. IRIS prefers plain language. Usually.",
  "Hermes once delivered a message before sunrise and napped by noon. Aspirational.",
  "Not all who wander are lost. But IRIS will find them anyway.",
  "The Parthenon was built with perfect proportion. Not because it was required. Because excellence was the standard.",
];

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Days since the Unix epoch — stable across timezone for local-midnight. */
function dayIndex(d: Date): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/** Pick today's note. Cycles through the library in order so the closest a
 *  given note can re-appear is once every NOTES.length days (currently 18). */
function pickNote(d: Date): string {
  const idx = ((dayIndex(d) % NOTES.length) + NOTES.length) % NOTES.length;
  return NOTES[idx];
}

export function IrisDailyNote() {
  const today = useMemo(() => new Date(), []);
  const note = useMemo(() => pickNote(today), [today]);
  const dayName = DAYS[today.getDay()];
  const dateLine = `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

  return (
    <section
      data-testid="iris-daily-note"
      aria-label="Today's IRIS note"
      className="relative w-full overflow-hidden border-y border-[color:var(--athena-gold,#C49A22)]/35"
      style={{ background: "#0d1220" }}
    >
      <DotField />

      <div
        data-testid="iris-daily-note-grid"
        className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-4 px-8 py-5 md:grid-cols-[220px_1fr_220px]"
      >
        {/* Left — date + day */}
        <div data-testid="iris-daily-note-left" className="md:border-r md:border-white/8 md:pr-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--athena-gold,#C49A22)]/80">
            {dayName}
          </div>
          <div className="mt-1 text-sm text-white/70">{dateLine}</div>
        </div>

        {/* Center — the note */}
        <div data-testid="iris-daily-note-center" className="text-center">
          <p
            className="text-balance text-base italic leading-relaxed text-white/85 md:text-[17px]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            “{note}”
          </p>
        </div>

        {/* Right — label + pulsing dot */}
        <div
          data-testid="iris-daily-note-right"
          className="flex items-center justify-end gap-2 md:border-l md:border-white/8 md:pl-6"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/55">
            Today's Note
          </span>
          <span
            data-testid="iris-daily-note-pulse"
            aria-hidden
            className="relative inline-flex h-2 w-2"
          >
            <span
              className="absolute inset-0 inline-flex h-full w-full rounded-full"
              style={{
                background: "var(--athena-gold, #C49A22)",
                boxShadow: "0 0 8px var(--athena-gold, #C49A22)",
              }}
            />
            <span
              className="absolute inset-0 inline-flex h-full w-full rounded-full"
              style={{
                background: "var(--athena-gold, #C49A22)",
                animation: "iris-note-pulse 2.2s ease-out infinite",
              }}
            />
          </span>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: "var(--athena-gold, #C49A22)" }}
          >
            IRIS
          </span>
        </div>
      </div>


      <style>{`
        @keyframes iris-note-pulse {
          0%   { transform: scale(1);   opacity: 0.7; }
          80%  { transform: scale(2.4); opacity: 0;   }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="Today's IRIS note"] [aria-hidden] span:last-child {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}

/* Sparse deterministic dot/star field inside the banner. */
function DotField() {
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    let seed = 41;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 60; i++) {
      out.push({
        x: rand() * 100,
        y: rand() * 100,
        r: 0.3 + rand() * 0.9,
        o: 0.1 + rand() * 0.28,
      });
    }
    return out;
  }, []);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r * 0.22}
          fill="#ffffff"
          opacity={s.o}
        />
      ))}
    </svg>
  );
}
