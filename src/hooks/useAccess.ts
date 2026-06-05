import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, canAccessMission } from "@/lib/access.functions";

function isDemoMode() {
  return typeof window !== "undefined" && window.localStorage.getItem("demo_mode") === "1";
}

export function useMyAccess() {
  const fn = useServerFn(getMyAccess);
  const demo = isDemoMode();
  return useQuery({
    queryKey: ["my-access", demo],
    queryFn: () =>
      demo
        ? Promise.resolve({ isAdmin: true, userId: "demo-user" })
        : fn(),
    staleTime: 60_000,
  });
}

export function useIsAdmin() {
  const { data, isLoading } = useMyAccess();
  return { isAdmin: data?.isAdmin ?? false, isLoading };
}

export function useMissionAccess(missionId: string | undefined) {
  const fn = useServerFn(canAccessMission);
  const demo = isDemoMode();
  return useQuery({
    queryKey: ["mission-access", missionId, demo],
    enabled: !!missionId,
    queryFn: () =>
      demo
        ? Promise.resolve({ allowed: true, isAdmin: true })
        : fn({ data: { missionId: missionId! } }),
    staleTime: 60_000,
  });
}
