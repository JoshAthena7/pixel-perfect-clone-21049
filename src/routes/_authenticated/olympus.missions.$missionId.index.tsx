import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy mission URL — redirect to the new sidebar-driven route tree.
// Old `?tab=foo` deep links are mapped to the matching new sub-route.
const TAB_TO_SUB: Record<string, string> = {
  overview: "briefing",
  work: "qa",
  oracle: "oracle",
  team: "team",
  settings: "settings",
};

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/")({
  beforeLoad: ({ params, search }) => {
    const tab = (search as { tab?: string })?.tab;
    const sub = tab && TAB_TO_SUB[tab] ? TAB_TO_SUB[tab] : "briefing";
    throw redirect({
      to: `/missions/$missionId/${sub}` as never,
      params: { missionId: params.missionId } as never,
    });
  },
});
