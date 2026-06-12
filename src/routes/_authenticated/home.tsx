import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function HomeRoute() {
  const { data, isLoading } = useQuery({
    queryKey: ["home-router-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      return (data ?? []) as { id: string }[];
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (data && data.length > 0) {
    return (
      <Navigate
        to="/missions/$missionId/briefing"
        params={{ missionId: data[0].id }}
        replace
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <div style={{ color: "white", fontSize: 22, fontWeight: 500 }}>
        Good morning.
      </div>
      <p className="mt-3" style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
        You don't have any missions yet. Create one to get started.
      </p>
      <Link
        to="/olympus/missions/new"
        className="inline-flex items-center gap-2 mt-8 px-4 py-2 rounded-md"
        style={{ background: "#C49A2B", color: "#0a0a0a", fontSize: 13, fontWeight: 600 }}
      >
        <Plus className="h-4 w-4" />
        New Mission
      </Link>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRoute,
});


export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRoute,
});
