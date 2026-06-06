import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDefaultLandingMission } from "@/lib/access.functions";

/**
 * When the gate evaluates to "not allowed", redirect the user to their default
 * landing mission Cockpit. If they have no mission at all, send them to /home.
 *
 * `gate` is a 3-state value: undefined while loading, true if allowed, false if blocked.
 */
export function useRedirectIfBlocked(gate: boolean | undefined) {
  const navigate = useNavigate();
  const fn = useServerFn(getDefaultLandingMission);
  const { data, isLoading } = useQuery({
    queryKey: ["default-landing-mission"],
    queryFn: () => fn(),
    enabled: gate === false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (gate !== false || isLoading) return;
    const missionId = data?.missionId ?? null;
    if (missionId) {
      navigate({ to: "/missions/$missionId", params: { missionId }, replace: true });
    } else {
      navigate({ to: "/home", replace: true });
    }
  }, [gate, isLoading, data?.missionId, navigate]);
}
