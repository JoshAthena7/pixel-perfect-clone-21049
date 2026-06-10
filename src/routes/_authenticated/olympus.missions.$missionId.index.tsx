import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/olympus/missions/$missionId/")({
  component: MissionCommandCenter,
});

function MissionCommandCenter() {
  const { missionId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id, name, client_name, status")
        .eq("id", missionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to="/olympus/missions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> All missions
      </Link>
      {isLoading ? (
        <Skeleton className="h-10 w-2/3" />
      ) : (
        <>
          <h1 className="text-3xl font-bold text-foreground">{data?.name ?? "Mission"}</h1>
          <p className="text-muted-foreground mb-8">{data?.client_name}</p>
          <div className="rounded-xl border border-border bg-surface/40 p-10 text-center">
            <p className="text-lg text-muted-foreground">Mission Command Center — coming soon.</p>
          </div>
        </>
      )}
    </div>
  );
}
