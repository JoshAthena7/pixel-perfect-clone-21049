import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MissionsListPage } from "@/components/missions/MissionsListPage";
import { getWriterMissionLanding, type WriterMissionCard } from "@/lib/writer-missions.functions";

export const Route = createFileRoute("/_authenticated/missions/")({
  component: MissionsRoute,
});

function MissionsRoute() {
  const getLanding = useServerFn(getWriterMissionLanding);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["writer-mission-landing"],
    queryFn: () => getLanding(),
    staleTime: 60_000,
  });

  if (data?.isAdmin) return <MissionsListPage />;
  if (data && !data.usedFallback && data.assignedCount === 1 && data.missions[0]) {
    return <Navigate to="/missions/$missionId/briefing" params={{ missionId: data.missions[0].id }} replace />;
  }

  return (
    <main className="min-h-[calc(100vh-48px)]" style={{ background: "#080c14" }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-7">
          <h1 className="text-2xl font-medium text-white">Missions</h1>
        </div>

        {isLoading && (
          <div className="rounded-lg border p-6 text-[14px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
            Loading missions…
          </div>
        )}

        {isError && (
          <div className="rounded-lg border p-6 text-[14px]" style={{ borderColor: "rgba(239,68,68,0.3)", color: "rgba(255,255,255,0.7)" }}>
            Could not load missions.
          </div>
        )}

        {!isLoading && !isError && data?.missions.length === 0 && (
          <div className="rounded-lg border p-6 text-[14px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)" }}>
            You haven't been added to a mission yet. Contact your admin.
          </div>
        )}

        {!isLoading && !isError && !!data?.missions.length && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.missions.map((mission) => (
              <WriterMissionCardLink key={mission.id} mission={mission} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function WriterMissionCardLink({ mission }: { mission: WriterMissionCard }) {
  return (
    <Link
      to="/missions/$missionId/briefing"
      params={{ missionId: mission.id }}
      className="group rounded-lg px-4 py-4 transition-colors"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-white">{mission.name}</div>
          {mission.agency && (
            <div className="mt-1 truncate text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              {mission.agency}
            </div>
          )}
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium  tracking-[0.08em]"
          style={{ borderColor: "rgba(34,197,94,0.35)", color: "#4ade80", background: "rgba(34,197,94,0.1)" }}
        >
          {mission.status}
        </span>
      </div>
    </Link>
  );
}
