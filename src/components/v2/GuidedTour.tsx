import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, ArrowRight, ArrowLeft } from "lucide-react";

export type TourStep = {
  /** CSS selector for the element to highlight. If omitted, the step centers on screen (intro / outro). */
  selector?: string;
  title: string;
  body: ReactNode;
  /** Where to place the tooltip relative to the target. Default: 'bottom'. */
  placement?: "top" | "bottom" | "left" | "right";
};

type Rect = { top: number; left: number; width: number; height: number };

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const PAD = 8;
const TIP_W = 360;

function computeTipPos(rect: Rect | null, placement: TourStep["placement"]) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { top: vh / 2 - 120, left: vw / 2 - TIP_W / 2, centered: true };
  }
  const p = placement ?? "bottom";
  let top = rect.top;
  let left = rect.left;
  if (p === "bottom") {
    top = rect.top + rect.height + PAD + 8;
    left = rect.left + rect.width / 2 - TIP_W / 2;
  } else if (p === "top") {
    top = rect.top - PAD - 8 - 180;
    left = rect.left + rect.width / 2 - TIP_W / 2;
  } else if (p === "right") {
    top = rect.top + rect.height / 2 - 90;
    left = rect.left + rect.width + PAD + 8;
  } else if (p === "left") {
    top = rect.top + rect.height / 2 - 90;
    left = rect.left - TIP_W - PAD - 8;
  }
  // clamp to viewport
  left = Math.max(12, Math.min(vw - TIP_W - 12, left));
  top = Math.max(12, Math.min(vh - 220, top));
  return { top, left, centered: false };
}

export function GuidedTour({
  open,
  steps,
  onClose,
  storageKey,
}: {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  /** If provided, remembers completion in localStorage to avoid auto-replaying. */
  storageKey?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);

  const step = steps[idx];

  useEffect(() => {
    if (!open) setIdx(0);
  }, [open]);

  // Recompute target rect when step changes / on resize / scroll.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const compute = () => {
      if (!step.selector) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // small delay to let scroll land
      requestAnimationFrame(() => setRect(getRect(step.selector!)));
    };
    compute();
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, step?.selector, tick]);

  if (!open || !step) return null;

  const finish = () => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        /* ignore */
      }
    }
    onClose();
  };

  const next = () => (idx < steps.length - 1 ? setIdx(idx + 1) : finish());
  const prev = () => idx > 0 && setIdx(idx - 1);

  const tip = computeTipPos(rect, step.placement);

  const overlay = (
    <div className="fixed inset-0 z-[10000] animate-fade-in" aria-modal role="dialog">
      {/* Dimmed background with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx={12}
                ry={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(2,6,14,0.72)"
          mask="url(#tour-mask)"
          style={{ backdropFilter: "blur(2px)" }}
        />
      </svg>

      {/* Spotlight outline ring */}
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[12px] transition-all duration-300"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow:
              "0 0 0 2px rgba(245,158,11,0.7), 0 0 24px rgba(245,158,11,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute rounded-[14px] border border-white/10 bg-[#0b1220] p-5 text-foreground shadow-2xl animate-scale-in"
        style={{ top: tip.top, left: tip.left, width: TIP_W }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--athena-gold,#f59e0b)]">
            <Sparkles className="h-3 w-3" />
            ATLAS Tour · {idx + 1} / {steps.length}
          </div>
          <button
            onClick={finish}
            aria-label="Close tour"
            className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
        <div className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{step.body}</div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={finish}
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={prev}
              disabled={idx === 0}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 px-2.5 text-[12px] text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <button
              onClick={next}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-3 text-[12px] font-medium text-background hover:opacity-90"
            >
              {idx === steps.length - 1 ? "Finish" : "Next"}
              {idx < steps.length - 1 && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
