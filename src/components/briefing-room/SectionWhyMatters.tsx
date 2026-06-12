import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWhyMatters } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";

function Card({ label, body }: { label: string; body: string | null }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
    >
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div
        className="mt-2"
        style={
          body
            ? { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.7 }
            : { color: "rgba(255,255,255,0.35)", fontSize: 12, fontStyle: "italic" }
        }
      >
        {body || "Not yet set — configure in Olympus."}
      </div>
    </div>
  );
}

export function SectionWhyMatters({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getWhyMatters);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "why", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  return (
    <SectionCard
      title="Why This Mission Matters"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=3`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card label="Why the client is pursuing it" body={data.whyClientPursuing} />
        <Card label="Why it matters to Athena" body={data.whyMattersToAthena} />
        <Card label="What is at stake" body={data.whatIsAtStake} />
        <Card label="Key market dynamics" body={data.keyMarketDynamics} />
      </div>
    </SectionCard>
  );
}
