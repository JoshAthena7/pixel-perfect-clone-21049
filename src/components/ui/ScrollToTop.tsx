import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Instantly scrolls to top on route pathname change. Smooth scroll on
 * navigation is disorienting — use instant.
 */
export function ScrollToTop() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
