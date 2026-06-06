import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/flight-deck")({
  ssr: false,
  component: FlightDeckResolver,
});

function FlightDeckResolver() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["flight-deck-default-mission"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: memberships, error: memberError } = await supabase
        .from("mission_members")
        .select("mission_id, missions:mission_id(status)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (memberError) throw memberError;

      const first = (memberships ?? []).find((row: any) => {
        const status = (row.missions?.status ?? "").toLowerCase();
        return !["closed", "archived", "won", "lost", "submitted"].includes(status);
      }) ?? memberships?.[0];

      return first?.mission_id as string | undefined;
    },
  });

  if (isLoading) {
    return <div className="px-6 py-12 text-sm text-muted-foreground">Opening Flight Deck…</div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">No mission Flight Deck available</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join or select a mission to open its live Flight Deck.</p>
        <Link to="/home" className="mt-4 inline-flex rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40">
          Go to missions
        </Link>
      </div>
    );
  }

  return <Navigate to="/missions/$missionId/flight-deck" params={{ missionId: data }} replace />;
}