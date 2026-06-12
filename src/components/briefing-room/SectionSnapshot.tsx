import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSnapshot } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";
import { formatProgramType } from "./format";

function fmtCurrency(n: number | null | undefined): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

const NOT_SET = (
  <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>Not set</span>
);

function Field({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className="mt-1" style={{ color: color ?? "white", fontSize: 12 }}>
        {value || NOT_SET}
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
  const m = data.mission ?? {};
  const days = data.daysToDeadline;
  const dayColor = days == null ? "rgba(255,255,255,0.4)" : days < 14 ? "#f08080" : days < 30 ? "#EF9F27" : "white";
  const currency = fmtCurrency(m.contract_value);

  return (
    <SectionCard
      title="Mission Snapshot"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=1`}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
        <div className="space-y-3">
          <Field label="Client" value={m.client_name} />
          <Field label="Procurement" value={m.name} />
          <Field label="State" value={m.state} />
          <Field label="Program Type" value={formatProgramType(m.program_type)} />
        </div>
        <div className="space-y-3">
          <Field label="Estimated Contract Value" value={currency} />
          <Field label="Submission Date" value={fmtDate(m.submission_deadline)} />
          <Field
            label="Days Remaining"
            value={days == null ? null : days < 0 ? `${Math.abs(days)} days past` : `${days} days`}
            color={dayColor}
          />
        </div>
        <div className="space-y-3">
          <Field label="Prime Contractor" value={null} />
          <Field label="Engagement Lead" value={data.leadName} />
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Intel Coverage
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div
                className="flex-1 h-1 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${Math.round(m.intelligence_graph_completeness ?? 0)}%`,
                    background: "#C49A2B",
                  }}
                />
              </div>
              <span style={{ color: "#C49A2B", fontSize: 11 }}>
                {Math.round(m.intelligence_graph_completeness ?? 0)}%
              </span>
            </div>
          </div>
          <Field label="Writers / SMEs" value={`${data.writers} writers · ${data.smes} SMEs`} />
        </div>
      </div>
    </SectionCard>
  );
}
