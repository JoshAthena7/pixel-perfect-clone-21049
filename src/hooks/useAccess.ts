import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, canAccessMission } from "@/lib/access.functions";
import { supabase } from "@/integrations/supabase/client";

// Track session readiness so we never fire authenticated server fns
// without an Authorization header (which 500s as "Unauthorized").
function useHasSession() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setHasSession(!!session),
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);
  return hasSession;
}

export function useMyAccess() {
  const fn = useServerFn(getMyAccess);
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["my-access"],
    enabled: hasSession === true,
    queryFn: () => fn(),
    staleTime: 60_000,
  });
}

export function useIsAdmin() {
  const { data, isLoading, isFetching } = useMyAccess();
  return {
    isAdmin: data?.isAdmin ?? false,
    isLoading: isLoading || isFetching,
  };
}

export function useMissionAccess(missionId: string | undefined) {
  const fn = useServerFn(canAccessMission);
  const hasSession = useHasSession();
  return useQuery({
    queryKey: ["mission-access", missionId],
    enabled: !!missionId && hasSession === true,
    queryFn: () => fn({ data: { missionId: missionId! } }),
    staleTime: 60_000,
  });
}
