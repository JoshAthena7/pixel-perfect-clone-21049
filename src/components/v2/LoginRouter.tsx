// Phase 3 — post-auth routing. Mount once inside _authenticated layout.
// Runs once per tab session per user. Honors deep links. Restores last
// visited path when session is < 4h old.
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SESSION_RECENCY_HOURS,
  shouldHonorDeepLink,
  type RoutingRole,
} from "@/lib/routing-role";

const LAST_SEEN_KEY = "atlas.lastSeenAt";
const LAST_PATH_KEY = "atlas.lastPath";

function key(prefix: string, userId: string) {
  return `${prefix}.${userId}`;
}

export function LoginRouter() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const didRunRef = useRef(false);

  // (last-visited tracking lives in the per-user effect below)


  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    (async () => {
      if (typeof window === "undefined") return;
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const routedKey = key("atlas.routed", user.id);
      try {
        if (window.sessionStorage.getItem(routedKey) === "1") return;
      } catch { /* noop */ }

      // Deep link wins.
      if (shouldHonorDeepLink(window.location.pathname)) {
        try { window.sessionStorage.setItem(routedKey, "1"); } catch { /* noop */ }
        return;
      }

      // Session recency: < 4h since last seen → restore last path.
      try {
        const lastSeenRaw = window.sessionStorage.getItem(key(LAST_SEEN_KEY, user.id))
          ?? window.localStorage.getItem(key(LAST_SEEN_KEY, user.id));
        const lastPath = window.sessionStorage.getItem(key(LAST_PATH_KEY, user.id))
          ?? window.localStorage.getItem(key(LAST_PATH_KEY, user.id));
        if (lastSeenRaw && lastPath) {
          const ageMs = Date.now() - Number(lastSeenRaw);
          if (ageMs < SESSION_RECENCY_HOURS * 60 * 60 * 1000) {
            window.sessionStorage.setItem(routedKey, "1");
            await navigate({ to: lastPath as never, replace: true });
            return;
          }
        }
      } catch { /* noop */ }

      // Cold login falls through to the matched authenticated route. Role-aware
      // defaults are fetched inside the destination page instead of during shell
      // startup, which prevents server-fn lookup races from blanking the app.
      try { window.sessionStorage.setItem(routedKey, "1"); } catch { /* noop */ }
    })();
  }, [navigate]);

  // Persist per-user lastPath/lastSeen on navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldHonorDeepLink(pathname)) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      try {
        window.localStorage.setItem(key(LAST_PATH_KEY, uid), pathname);
        window.localStorage.setItem(key(LAST_SEEN_KEY, uid), String(Date.now()));
      } catch { /* noop */ }
    })();
  }, [pathname]);

  return null;
}

// Read the cached routing role on the client (set by LoginRouter on cold login).
export function useCachedRoutingRole(): RoutingRole | null {
  if (typeof window === "undefined") return null;
  try {
    // We don't know the userId synchronously here. Best-effort scan.
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith("atlas.role.")) {
        return window.sessionStorage.getItem(k) as RoutingRole;
      }
    }
  } catch { /* noop */ }
  return null;
}
