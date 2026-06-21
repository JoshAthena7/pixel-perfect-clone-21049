import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Slim 2px gold progress bar at the very top of the viewport that animates
 * during route transitions. Linear/Vercel/GitHub pattern — communicates
 * "something is happening" without blocking content.
 */
export function RouteProgressBar() {
  const isLoading = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });
  const barRef = useRef<HTMLDivElement | null>(null);
  const fadeTimer = useRef<number | undefined>(undefined);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    window.clearTimeout(fadeTimer.current);
    window.clearTimeout(resetTimer.current);

    if (isLoading) {
      bar.style.transition = "none";
      bar.style.width = "0%";
      bar.style.opacity = "1";
      // force reflow so the next transition actually animates
      void bar.offsetHeight;
      bar.style.transition = "width 400ms cubic-bezier(0.25, 0, 0, 1)";
      bar.style.width = "82%";
    } else {
      bar.style.transition = "width 120ms ease-out";
      bar.style.width = "100%";
      fadeTimer.current = window.setTimeout(() => {
        bar.style.transition = "opacity 180ms ease-out";
        bar.style.opacity = "0";
        resetTimer.current = window.setTimeout(() => {
          bar.style.width = "0%";
        }, 200);
      }, 120);
    }

    return () => {
      window.clearTimeout(fadeTimer.current);
      window.clearTimeout(resetTimer.current);
    };
  }, [isLoading]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        ref={barRef}
        style={{
          height: "100%",
          width: "0%",
          opacity: 0,
          background:
            "linear-gradient(90deg, transparent 0%, #C49A2B 40%, #E0B341 80%, transparent 100%)",
          boxShadow: "0 0 8px rgba(224,179,65,0.45)",
        }}
      />
    </div>
  );
}
