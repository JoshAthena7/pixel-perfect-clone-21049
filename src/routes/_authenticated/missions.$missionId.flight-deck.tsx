import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlightDeckLayout } from "@/components/flight-deck/FlightDeckLayout";
import { supabase } from "@/integrations/supabase/client";
import { useMissionMeta } from "@/hooks/useMissionMeta";

export const Route = createFileRoute("/_authenticated/missions/$missionId/flight-deck")({
  component: FlightDeckRoute,
});

function FlightDeckRoute() {
  const { missionId } = Route.useParams();
  const { data: meta } = useMissionMeta(missionId);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("current_atlas_member_id");
      setMemberId((data as string) ?? null);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <FlightDeckLayout
        memberId={memberId}
        activeMissionId={missionId}
        activeMissionName={meta?.name ?? "Mission"}
        activeMissionStatus={meta?.status ?? null}
        onPrefillIris={(t) =>
          window.dispatchEvent(new CustomEvent("atlas:iris:prefill", { detail: t }))
        }
      />
    </div>
  );
}
