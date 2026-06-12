import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSnapshot } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";
import { formatProgramType } from "./format";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function Tile({
  label,
  value,
  color = "white",
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div className="mt-1 truncate" style={{ color, fontSize: 12, fontWeight: 600 }}>
        {value || <span style={{ color: "rgba(255,255,255,0.35)", fontStyle: "italic", fontWeight: 400 }}>Not set</span>}
      </div>
    </div>
  );
}

export function SectionSnapshot({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getSnapshot);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "snapshot", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  const m = data.mission ?? ({} as any);
  const days = data.daysToDeadline;
  const submission =
    days == null
      ? fmtDate(m.submission_deadline)
      : `${fmtDate(m.submission_deadline)} · ${days < 0 ? `${Math.abs(days)}d past` : `${days}d left`}`;
  const subColor =
    days == null ? "white" : days < 14 ? "#f08080" : days < 30 ? "#EF9F27" : "white";
  const oc = (data as any).openConflicts ?? 0;
  const ocColor = oc === 0 ? "#7DCF7D" : oc < 3 ? "#EF9F27" : "#f08080";
  const coverage = Math.round(m.intelligence_graph_completeness ?? 0);

  return (
    <SectionCard
      title="Mission Snapshot"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=1`}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Client" value={m.client_name} />
        <Tile label="Program Type" value={formatProgramType(m.program_type)} />
        <Tile label="Submission" value={submission} color={subColor} />
        <Tile label="Intel Coverage" value={`${coverage}%`} color="#C49A2B" />
        <Tile label="State" value={m.state} />
        <Tile label="Prime Contractor" value={null} />
        <Tile label="Writers / SMEs" value={`${data.writers} / ${data.smes}`} />
        <Tile
          label="Open Conflicts"
          value={oc === 0 ? "None" : String(oc)}
          color={ocColor}
        />
      </div>
    </SectionCard>
  );
}
