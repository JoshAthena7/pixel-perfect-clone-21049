import { createFileRoute, Outlet, Link, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function MissionNotFound() {
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
  component: () => <Outlet />,
  errorComponent: ({ error }) => {
    if (typeof window !== "undefined") console.error("[mission route]", error);
    return <MissionNotFound />;
  },
  notFoundComponent: () => <MissionNotFound />,
});
