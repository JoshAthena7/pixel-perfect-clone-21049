import { useEffect, useState } from "react";
import { wisdomLine, type WisdomTone } from "@/lib/wisdom";

/**
 * AmbientWisdom — a quiet, slowly-rotating IRIS line. Lives in the bottom
 * of long-running rooms (Atrium) so the platform speaks even when idle.
 * Fades between lines every ~22 seconds. Respects reduced motion.
 */
export function AmbientWisdom({
  tone = "ambient",
  intervalMs = 22_000,
}: {
  tone?: WisdomTone;
  intervalMs?: number;
}) {
  const [line, setLine] = useState(() => wisdomLine(tone));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setInterval(() => {
      if (reduced) {
        setLine(wisdomLine(tone));
        return;
      }
      setVisible(false);
      window.setTimeout(() => {
        setLine(wisdomLine(tone));
        setVisible(true);
      }, 700);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [tone, intervalMs]);

  return (
    <div
      className="select-none text-center text-[12px] italic tracking-wide text-muted-foreground/60"
      style={{
        transition: "opacity 700ms ease",
        opacity: visible ? 1 : 0,
      }}
      aria-live="polite"
    >
      <span className="opacity-50">— </span>
      {line}
      <span className="opacity-50"> —</span>
    </div>
  );
}
