import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Plus, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { getHomeData, type HomeData, type HomeMissionAdmin, type HomeMissionWriter, type HomeAssignment } from "@/lib/home.functions";

const GOLD = "#C49A2B";

function urgencyColor(days: number | null): string {
  if (days === null) return "rgba(255,255,255,0.5)";
  if (days < 14) return "#E04A4A";
  if (days < 30) return "#EF9F27";
  return GOLD;
}

function healthBadge(status: string | null) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    at_risk: { label: "AT RISK", bg: "rgba(224,74,74,0.15)", color: "#f08080" },
    on_track: { label: "ON TRACK", bg: "rgba(125,207,125,0.15)", color: "#7dcf7d" },
    not_started: { label: "NOT STARTED", bg: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" },
  };
  const item = map[status ?? "not_started"] ?? map.not_started;
  return (
    <span
      style={{
        background: item.bg,
        color: item.color,
        fontSize: 9,
        padding: "2px 6px",
        borderRadius: 4,
        letterSpacing: "0.05em",
        fontWeight: 600,
        textTransform: "uppercase",
      }}
    >
      {item.label}
    </span>
  );
}

function IrisBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 24,
        background: "rgba(127,119,221,0.08)",
        border: "0.5px solid rgba(127,119,221,0.25)",
        borderRadius: 10,
        padding: "12px 16px",
        color: "rgba(220,216,255,0.9)",
        fontSize: 13,
        lineHeight: 1.55,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <Eye size={14} style={{ marginTop: 2, color: "rgba(200,195,255,0.85)" }} />
      <div>{children}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 32, fontWeight: 600, color: color ?? "white", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function AdminMissionCard({ m }: { m: HomeMissionAdmin }) {
  const color = urgencyColor(m.days_to_deadline);
  return (
    <Link
      to="/missions/$missionId/briefing"
      params={{ missionId: m.id }}
      className="block rounded-xl p-5 transition-colors hover:bg-white/[0.03]"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div style={{ color: "white", fontSize: 16, fontWeight: 500 }}>{m.name}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
            {m.client_name ?? "—"}
          </div>
        </div>
        <div style={{ color, fontSize: 12, whiteSpace: "nowrap", fontWeight: 500 }}>
          {m.days_to_deadline !== null
            ? `${m.days_to_deadline}d to submission`
            : "No deadline set"}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[120px]" style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, m.intel_completeness))}%`,
              height: "100%",
              background: GOLD,
            }}
          />
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{m.intel_completeness}% intel</span>
        {m.at_risk_count > 0 && (
          <span
            style={{
              background: "rgba(224,74,74,0.15)",
              color: "#f08080",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {m.at_risk_count} AT RISK
          </span>
        )}
        <span
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {m.team_count} team
        </span>
        <span
          style={{
            background: "rgba(125,207,125,0.12)",
            color: "#7dcf7d",
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          ACTIVE
        </span>
      </div>
    </Link>
  );
}

function WriterMissionBlock({ m }: { m: HomeMissionWriter }) {
  const color = urgencyColor(m.days_to_deadline);
  return (
    <div className="mt-6">
      <div
        className="rounded-xl p-4 mb-2"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "0.5px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div style={{ color: "white", fontSize: 15, fontWeight: 500 }}>{m.name}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{m.client_name ?? "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color, fontSize: 12, fontWeight: 500 }}>
              {m.days_to_deadline !== null ? `${m.days_to_deadline}d to submission` : "No deadline"}
            </div>
            {m.at_risk_count > 0 && (
              <div style={{ color: "#f08080", fontSize: 10, marginTop: 2 }}>
                {m.at_risk_count} at risk
              </div>
            )}
          </div>
        </div>
      </div>
      <ul className="space-y-1">
        {m.assignments.map((a) => (
          <WriterAssignmentRow key={a.id} missionId={m.id} a={a} />
        ))}
      </ul>
    </div>
  );
}

function WriterAssignmentRow({ missionId, a }: { missionId: string; a: HomeAssignment }) {
  const truncated = a.question_text.length > 60 ? a.question_text.slice(0, 60).trimEnd() + "…" : a.question_text;
  return (
    <li
      className="rounded-lg flex items-center gap-3 px-3 py-2"
      style={{ background: "rgba(255,255,255,0.015)", border: "0.5px solid rgba(255,255,255,0.05)" }}
    >
      <span style={{ fontFamily: "monospace", fontSize: 11, color: GOLD, width: 60, flexShrink: 0 }}>
        {a.question_number ?? "—"}
      </span>
      <span style={{ flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 12 }}>{truncated}</span>
      {healthBadge(a.health_status)}
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", minWidth: 60, textAlign: "right" }}>
        {a.due_date ? format(new Date(a.due_date), "MMM d") : "—"}
      </span>
      <Link
        to="/missions/$missionId/flight-deck"
        params={{ missionId }}
        search={{ question: a.question_id } as any}
        style={{ color: GOLD, fontSize: 11, whiteSpace: "nowrap" }}
      >
        Open in Flight Deck →
      </Link>
    </li>
  );
}

export function HomePage() {
  const fn = useServerFn(getHomeData);
  const { data } = useSuspenseQuery({
    queryKey: ["home-data"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <h1 style={{ color: "white", fontSize: 20, fontWeight: 500 }}>
          Good morning, {data.firstName}.
        </h1>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>{today}</div>
      </div>

      {data.role === "admin" ? <AdminView data={data} /> : <WriterView data={data} />}
    </div>
  );
}

function AdminView({ data }: { data: Extract<HomeData, { role: "admin" }> }) {
  const soonestColor = urgencyColor(data.soonestDays);
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Active Missions" value={data.activeMissionsCount} />
        <StatCard
          label="Questions at Risk"
          value={data.questionsAtRisk}
          color={data.questionsAtRisk > 0 ? "#f08080" : "white"}
        />
        <StatCard
          label="Days to Soonest Deadline"
          value={data.soonestDays === null ? "—" : data.soonestDays}
          color={soonestColor}
        />
      </div>

      {data.missions.length === 0 ? (
        <p className="text-center italic text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          No active missions yet.
        </p>
      ) : (
        <div className="space-y-3">
          {data.missions.map((m) => (
            <AdminMissionCard key={m.id} m={m} />
          ))}
        </div>
      )}

      {data.mostUrgent && (
        <IrisBubble>
          I am watching all {data.activeMissionsCount} active mission
          {data.activeMissionsCount === 1 ? "" : "s"}.{" "}
          <strong style={{ color: "white" }}>{data.mostUrgent.name}</strong> needs the most attention —{" "}
          {data.mostUrgent.days !== null
            ? `${data.mostUrgent.days} days to submission`
            : "no deadline set"}{" "}
          and {data.mostUrgent.atRisk} question{data.mostUrgent.atRisk === 1 ? "" : "s"} at risk.
        </IrisBubble>
      )}

      <div className="mt-8 flex justify-center">
        <Link
          to="/olympus/missions/new"
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 transition-colors hover:bg-[color:var(--athena-gold)]/10"
          style={{
            border: `1px solid ${GOLD}`,
            color: GOLD,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Plus size={14} />
          Create New Mission
        </Link>
      </div>
    </>
  );
}

function WriterView({ data }: { data: Extract<HomeData, { role: "writer" }> }) {
  if (data.totalAssignments === 0) {
    return (
      <>
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontStyle: "italic" }}>
            No assignments yet. Your Engagement Lead will assign questions to you.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Your missions
      </div>

      {data.missions.map((m) => (
        <WriterMissionBlock key={m.id} m={m} />
      ))}

      <IrisBubble>
        {data.firstAtRiskQuestion ? (
          <>
            You have <strong style={{ color: "white" }}>{data.totalAssignments}</strong> question
            {data.totalAssignments === 1 ? "" : "s"} assigned.{" "}
            <strong style={{ color: "white" }}>{data.firstAtRiskQuestion}</strong> needs your attention first.
          </>
        ) : (
          <>
            All your questions are on track. Keep going.{" "}
            <CheckCircle2 size={12} style={{ display: "inline", color: "#7dcf7d", marginLeft: 4 }} />
          </>
        )}
      </IrisBubble>
    </>
  );
}
