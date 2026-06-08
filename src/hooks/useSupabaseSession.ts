import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true once a Supabase session is present, false once it's gone,
 * and null while we haven't yet checked. Use this to gate `useQuery({ enabled })`
 * on server functions that require `requireSupabaseAuth`, so we don't fire
 * RPCs without a bearer (which would throw "Unauthorized: No authorization
 * header provided") during sign-out or initial mount.
 */
export function useHasSupabaseSession(): boolean | null {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}
