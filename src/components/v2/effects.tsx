import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** EFFECT 2: Animated LIVE badge */
export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return <span className="live-badge">{label}</span>;
}

/** EFFECT 4: Scanning beam empty state */
export function ScanningBeam({ message = "IRIS is scanning the industry" }: { message?: string }) {
  return (
    <div className="scan-stage">
      <div className="scan-text">
        <span className="cursor-blink">{message}</span>
      </div>
    </div>
  );
}

/** EFFECT 5: Typewriter text — types in character by character */
export function TypewriterText({
  text,
  speed = 30,
  className = "",
}: { text: string; speed?: number; className?: string }) {
  const [out, setOut] = useState("");
  const lastRef = useRef("");
  useEffect(() => {
    // Reset if text actually changed
    if (text === lastRef.current) return;
    lastRef.current = text;
    setOut("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return <span className={className}>{out}</span>;
}

/** EFFECT 9: Signal strength bars in place of HIGH/MEDIUM/LOW badges */
export function SignalStrengthBars({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const tip =
    level === "HIGH" ? "HIGH — IRIS scored this as highly relevant to this mission" :
    level === "MEDIUM" ? "MEDIUM — IRIS sees moderate relevance to this mission" :
    "LOW — IRIS sees limited direct relevance";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="signal-bars" data-level={level} role="img" aria-label={tip}>
            <span /><span /><span />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** EFFECT 10: Inline TRANSMITTED toast inside a card */
export function TransmittedFlash({
  show,
  label = "TRANSMITTED ✓",
  tone = "teal",
}: { show: boolean; label?: string; tone?: "teal" | "red" }) {
  if (!show) return null;
  return <span key={`${label}-${show}`} className={`transmitted-toast tone-${tone}`}>{label}</span>;
}

/** EFFECT 11: IRIS waveform indicator */
export function IrisWaveform() {
  return (
    <span className="iris-waveform" aria-hidden>
      <span /><span /><span /><span /><span />
    </span>
  );
}

/** EFFECT 12: CountUp number with easing */
export function CountUp({
  value, duration = 600, className = "", tone,
}: { value: number; duration?: number; className?: string; tone?: "alert" | "calm" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setN(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={`attention-number mono ${className}`} data-tone={tone}>{n}</span>;
}

/** EFFECT 15: IRIS status indicator (always-on, header) */
export function IrisStatusIndicator() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="iris-pulse-dot" aria-label="IRIS is active and monitoring" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">IRIS is active and monitoring</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
