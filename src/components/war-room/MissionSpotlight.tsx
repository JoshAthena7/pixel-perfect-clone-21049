/**
 * MissionSpotlight
 *
 * A passive, human, daily-rotating fact card placed in the Mission workspace.
 * Uses the existing trivia.ts library (100+ Indiana facts).
 * Rotates once per day using day-of-year modulo.
 *
 * LOCATION: Mission environment only (/command page)
 * PURPOSE: Culture, connection, identity — not workflow
 * DESIGN: Slim, elegant, zero interaction required
 */
import { useMemo } from "react";
import { useEngagement } from "@/hooks/use-engagement";
import { questionForDay, getQuestionDay } from "@/lib/trivia-helpers";

// State emoji map — add more states as missions are added
const STATE_EMOJI: Record<string, string> = {
  IN: "🏎️", OH: "🌰", KY: "🐴", TX: "⭐", FL: "🌴",
  CA: "🌊", NY: "🗽", IL: "🏙️", PA: "🔔", GA: "🍑",
  NC: "🌲", VA: "🏛️", MI: "🚗", WI: "🧀", MN: "❄️",
  TN: "🎸", AZ: "🌵", CO: "🏔️", WA: "🍎", OR: "🌲",
};

const DEFAULT_CATEGORY = "Mission Spotlight";
const CATEGORY_BY_STATE: Record<string, string> = {
  IN: "Indiana Spotlight",
  OH: "Ohio Spotlight",
  KY: "Kentucky Spotlight",
  TX: "Texas Spotlight",
  FL: "Florida Spotlight",
  CA: "California Spotlight",
  NY: "New York Spotlight",
};

interface Props {
  /** Override the state code (defaults to engagement state) */
  stateCode?: string;
}

export function MissionSpotlight({ stateCode }: Props) {
  const { engagement } = useEngagement();

  const state = stateCode ?? (engagement as any)?.state ?? "IN";
  const emoji = STATE_EMOJI[state] ?? "📍";
  const category = CATEGORY_BY_STATE[state] ?? DEFAULT_CATEGORY;

  // Rotate daily — deterministic, no network call, instant render
  const today = useMemo(() => {
    const trivia = questionForDay(getQuestionDay());
    return trivia?.fact ?? null;
  }, []);

  if (!today) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 20px",
        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.015)",
      }}
    >
      {/* State/mission icon */}
      <span
        style={{
          fontSize: 22,
          lineHeight: 1,
          flexShrink: 0,
          marginTop: 1,
          opacity: 0.85,
        }}
      >
        {emoji}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Category label */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted-foreground)",
            opacity: 0.55,
            marginBottom: 4,
          }}
        >
          {category}
        </div>

        {/* The fact */}
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--muted-foreground)",
            margin: 0,
            fontStyle: "normal",
            opacity: 0.85,
          }}
        >
          {today}
        </p>
      </div>
    </div>
  );
}
