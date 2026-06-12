import { createFileRoute, Outlet, Link, notFound, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("missions")
      .select("id")
      .eq("id", params.missionId)
      .maybeSingle();
    if (error || !data) throw notFound();
    return { missionId: params.missionId };
  },
  component: MissionLayout,
  errorComponent: () => <MissionNotFound />,
  notFoundComponent: () => <MissionNotFound />,
});

const TABS = [
  { id: "briefing", label: "Briefing", to: "/missions/$missionId/briefing" as const },
  { id: "oracle", label: "Oracle", to: "/missions/$missionId/oracle" as const },
  { id: "insights", label: "Insights", to: "/missions/$missionId/insights" as const },
];

function MissionLayout() {
  const { missionId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Only show the tab strip on the three main content tabs (and the mission index).
  const tabbedSegments = ["briefing", "oracle", "insights"];
  const seg = pathname.split("/")[3] ?? "";
  const showTabs = tabbedSegments.includes(seg) || seg === "";

  return (
    <div>
      {showTabs && (
        <div
          className="sticky top-12 z-30 flex items-center gap-1 px-6 h-10"
          style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <Link
            to="/home"
            className="inline-flex items-center mr-3 hover:text-white"
            style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}
          >
            ← Missions
          </Link>

          {TABS.map((t) => {
            const active = seg === t.id || (seg === "" && t.id === "briefing");
            return (
              <Link
                key={t.id}
                to={t.to}
                params={{ missionId }}
                className="px-3 py-1.5 rounded-md transition-colors hover:bg-white/[0.05]"
                style={{
                  fontSize: 12,
                  color: active ? "#c9a84c" : "rgba(255,255,255,0.55)",
                  fontWeight: active ? 600 : 400,
                  borderBottom: active ? "2px solid #c9a84c" : "2px solid transparent",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}
      <Outlet />
    </div>
  );
}

function MissionNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div style={{ color: "white", fontSize: 16, fontWeight: 500 }}>
          Mission not found.
        </div>
        <div className="mt-2" style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
          The mission you are looking for does not exist or you do not have access to it.
        </div>
        <Link
          to="/home"
          className="mt-6 inline-block hover:underline"
          style={{ color: "#C49A2B", fontSize: 13, fontWeight: 500 }}
        >
          ← Back to missions
        </Link>
      </div>
    </div>
  );
}
