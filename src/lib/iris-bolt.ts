/**
 * IRIS bolt flash event system.
 *
 * Fires a single 500ms pulse on any subscribed element (typically the
 * ⚡ Zap / IrisMark icons sprinkled across the platform) whenever IRIS
 * produces new output — brief ready, score returned, whisper arrived, etc.
 *
 * Producers:  triggerIrisBolt("brief" | "score" | "whisper" | "alert")
 * Consumers:  const ref = useIrisBoltRef();          // flashes on any scope
 *             const ref = useIrisBoltRef("brief");   // flashes only on brief
 *
 * The ref attaches to any HTMLElement. CSS `.iris-bolt-active` class is
 * added for 500ms then removed; keyframes live in src/styles.css.
 */
import { useEffect, useRef } from "react";

const EVENT_NAME = "iris-bolt-flash";
const FLASH_CLASS = "iris-bolt-active";
const FLASH_MS = 520;

export type IrisBoltScope = "brief" | "score" | "whisper" | "alert" | "iris";

export function triggerIrisBolt(scope: IrisBoltScope = "iris") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { scope } }));
}

export function useIrisBoltRef<T extends HTMLElement = HTMLElement>(
  scopeFilter?: IrisBoltScope,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: IrisBoltScope }>).detail;
      if (scopeFilter && detail?.scope && detail.scope !== scopeFilter) return;
      const el = ref.current;
      if (!el) return;
      el.classList.remove(FLASH_CLASS);
      // Force reflow so the class re-add restarts the animation.
      void el.offsetWidth;
      el.classList.add(FLASH_CLASS);
      window.setTimeout(() => {
        el.classList.remove(FLASH_CLASS);
      }, FLASH_MS);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [scopeFilter]);

  return ref;
}
