import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { StateIntelGrid } from "@/components/state-intel/StateIntelGrid";

export const Route = createFileRoute("/_authenticated/admin/state-intel/")({
  validateSearch: z.object({
    from_mission: z.string().uuid().optional(),
    state: z.string().length(2).optional(),
  }),
  component: StateIntelIndex,
});

function StateIntelIndex() {
  const { from_mission } = Route.useSearch();
  return (
    <div>
      {from_mission && <ReturnBanner missionId={from_mission} />}
      <StateIntelGrid />
    </div>
  );
}

function ReturnBanner({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["state-intel-return-banner", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name")
        .eq("id", missionId)
        .maybeSingle();
      return data?.name ?? "mission";
    },
    staleTime: 60_000,
  });

  return (
    <div
      className="px-5 py-3 flex items-center gap-3"
      style={{
        background: "rgba(196,154,43,0.08)",
        borderBottom: "1px solid rgba(196,154,43,0.3)",
      }}
    >
      <Link
        to="/missions/$missionId/olympus"
        params={{ missionId }}
        className="inline-flex items-center gap-2 hover:underline"
        style={{ fontSize: 12, color: "#C49A2B", fontWeight: 600 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Return to {data ?? "mission"} ORACLE
      </Link>
    </div>
  );
}
