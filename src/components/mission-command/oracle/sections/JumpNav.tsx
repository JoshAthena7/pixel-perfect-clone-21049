import { useEffect, useState } from "react";
import { GOLD, SECTIONS, type SectionId } from "./coverage";

/** Scroll-spy hook: tracks which section anchor is most visible. */
export function useScrollSpy(): SectionId {
  const [active, setActive] = useState<SectionId>("summary");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = SECTIONS.map((s) => s.id);
    const els = ids
      .map((id) => document.getElementById(`section-${id}`))
      .filter((x): x is HTMLElement => !!x);
    if (els.length === 0) return;

    const ratios = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.set(e.target.id, e.intersectionRatio);
        }
        let best: SectionId = active;
        let bestRatio = -1;
        for (const id of ids) {
          const r = ratios.get(`section-${id}`) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = id;
          }
        }
        if (bestRatio > 0) setActive(best);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

export function scrollToSection(id: SectionId) {
  const el = document.getElementById(`section-${id}`);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 64;
  window.scrollTo({ top: y, behavior: "smooth" });
}

export function JumpNav({ active }: { active: SectionId }) {
  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1"
      style={{
        background: "#050d18",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 16px",
        margin: "0 -16px 16px -16px",
      }}
    >
      {SECTIONS.map((s, i) => {
        const isActive = active === s.id;
        return (
          <span key={s.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => scrollToSection(s.id)}
              className="transition-colors"
              style={{
                padding: "4px 10px",
                fontSize: 11,
                color: isActive ? "white" : "rgba(255,255,255,0.4)",
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${isActive ? "rgba(196,154,43,0.7)" : "transparent"}`,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
            {i < SECTIONS.length - 1 && (
              <span style={{ color: "rgba(255,255,255,0.15)", margin: "0 2px" }}>·</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
