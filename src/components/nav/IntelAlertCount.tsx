import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function IntelAlertCount() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const navigate = useNavigate();

  const insideMission = /^\/olympus\/missions\/[^/]+/.test(pathname) &&
    !pathname.endsWith("/new") && !pathname.endsWith("/wizard");
  const missionId = insideMission ? params.missionId : undefined;

  const { data: count = 0 } = useQuery({
    queryKey: ["intel-alert-count", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("intelligence_feed_items")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId!)
        .gte("iris_relevance_score", 70)
        .eq("is_reviewed", false);
      return count ?? 0;
    },
  });

  if (!missionId || count === 0) return null;

  return (
    <button
      type="button"
      title="High-relevance intelligence items awaiting review."
      onClick={() =>
        navigate({
          to: "/olympus/missions/$missionId",
          params: { missionId: missionId! },
          search: { tab: "oracle", sub: "feed" } as any,
        })
      }
      className="h-6 min-w-6 px-1.5 rounded-full bg-amber-500 text-[#0D1B3E] text-xs font-bold flex items-center justify-center hover:bg-amber-400"
    >
      {count}
    </button>
  );
}
