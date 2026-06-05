import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, canAccessMission } from "@/lib/access.functions";

export function useMyAccess() {
  const fn = useServerFn(getMyAccess);
  return useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
}

export function useIsAdmin() {
  const { data, isLoading } = useMyAccess();
  return { isAdmin: data?.isAdmin ?? false, isLoading };
}

export function useMissionAccess(missionId: string | undefined) {
  const fn = useServerFn(canAccessMission);
  return useQuery({
    queryKey: ["mission-access", missionId],
    enabled: !!missionId,
    queryFn: () => fn({ data: { missionId: missionId! } }),
    staleTime: 60_000,
  });
}
