/**
 * IRIS Mission Pulse — a 28px live intelligence feed strip.
 *
 * Continuously scrolls a stream of mission events (new approved signals,
 * writer check-ins, brief exports, sticky notes, SOS flags) right-to-left.
 * Hover pauses scroll and highlights the event under the cursor. Clicking
 * an event navigates to the relevant mission surface. Subscribes via
 * Supabase realtime so the feed updates as events happen.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useMissionPulse, type PulseEvent } from "@/hooks/useMissionPulse";

interface Props {
  missionId: string;
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function MissionPulseStrip({ missionId }: Props) {
  const navigate = useNavigate();
  const { events, isLive } = useMissionPulse(missionId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [newFlash, setNewFlash] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    const apply = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    if (events.length > prevCount.current && prevCount.current > 0) {
      setNewFlash(true);
      const t = setTimeout(() => setNewFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevCount.current = events.length;
  }, [events.length]);

  if (events.length === 0) return null;

  // Duplicate for seamless ticker loop.
  const display = [...events, ...events];
  const scrollDuration = Math.max(isMobile ? 40 : 30, display.length * (isMobile ? 5.2 : 4));
  const stripHeight = isMobile ? 32 : 28;
  const eventFontSize = isMobile ? 12 : 11;

  return (
    <div
      role="region"
      aria-label="Mission pulse — live intelligence feed"
      style={{
        width: "100%",
        height: stripHeight,
        background: "rgba(0,0,0,0.45)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
      className="mission-pulse-strip"
    >
      {/* LIVE badge — fixed left */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          height: "100%",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          zIndex: 2,
          background: "rgba(0,0,0,0.5)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: isLive ? "rgba(74,222,128,0.9)" : "rgba(148,163,184,0.6)",
            animation: "iris-pulse-live 2.2s ease-in-out infinite",
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 8,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.15em",
            color: isLive ? "rgba(74,222,128,0.7)" : "rgba(148,163,184,0.6)",
          }}
        >
          LIVE
        </span>
      </div>

      {/* New event flash */}
      {newFlash && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 80,
            height: "100%",
            background:
              "linear-gradient(to left, rgba(196,154,43,0.35), rgba(196,154,43,0))",
            animation: "iris-pulse-new 600ms ease-out forwards",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Scrolling content */}
      <div
        style={{
          flex: 1,
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          className="mission-pulse-track"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "100%",
            whiteSpace: "nowrap",
            animation: `iris-pulse-scroll ${scrollDuration}s linear infinite`,
            willChange: "transform",
          }}
        >
          {display.map((event, i) => (
            <button
              key={`${event.id}-${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate({ to: event.to, params: event.params });
              }}
              onMouseEnter={() => setHoveredId(`${event.id}-${i}`)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "0 8px",
                height: stripHeight,
                background:
                  hoveredId === `${event.id}-${i}`
                    ? "rgba(255,255,255,0.05)"
                    : "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: 2,
                transition: "background 150ms ease",
                marginRight: 48,
                font: "inherit",
                color: "inherit",
              }}
            >
              <span aria-hidden style={{ color: event.iconColor, fontSize: eventFontSize + 1, lineHeight: 1 }}>
                {event.icon}
              </span>
              <span
                style={{
                  fontSize: eventFontSize,
                  color: "rgba(255,255,255,0.65)",
                  fontWeight: 400,
                }}
              >
                {event.text}
              </span>
              <span
                style={{
                  fontSize: eventFontSize - 2,
                  color: "rgba(255,255,255,0.3)",
                  fontStyle: "italic",
                  marginLeft: 4,
                }}
              >
                · {relativeTime(event.time)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes iris-pulse-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes iris-pulse-live {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes iris-pulse-new {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .mission-pulse-strip:hover { background: rgba(0,0,0,0.6) !important; }
        .mission-pulse-strip:hover .mission-pulse-track { animation-play-state: paused !important; }
      `}</style>
    </div>
  );
}
