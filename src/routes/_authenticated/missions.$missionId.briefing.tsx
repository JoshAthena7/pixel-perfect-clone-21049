import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Trophy,
  ChevronDown,
  AlertTriangle,
  Phone,
  Users,
  Sparkles,
  Settings,
  Rocket,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { BriefSectionDot } from "@/components/briefing-room/BriefSectionDot";
import { LaunchBriefSection } from "@/components/briefing-room/LaunchBriefSection";

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingPage,
});

const GOLD = "#d4a843";
const RED = "#e05252";
const GREEN = "#4caf7d";
const BLUE = "#5b9bd5";
const AMBER = "#f0c040";

const PAGE_BG = "#0a0a0f";
const CARD = "#13131a";
const CARD_2 = "#1c1c28";
const BORDER = "#2a2a3a";

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "rgba(255,255,255,0.45)",
  fontWeight: 600,
};

function BriefingPage() {
  const { missionId } = Route.useParams();

  return (
    <div style={{ background: PAGE_BG, color: "white", minHeight: "100vh" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-8 space-y-14">
        <Hero missionId={missionId} />
        <LaunchBriefSection missionId={missionId} />
        <NorthStar missionId={missionId} />
        <WhyMatters missionId={missionId} />
        <HowWeWin missionId={missionId} />
        <FlightRisks missionId={missionId} />
        <TodaysFocus missionId={missionId} />
        <MessageDiscipline missionId={missionId} />
        <Timeline missionId={missionId} />
        <SupportAndLaunch missionId={missionId} />
      </div>
    </div>
  );
}

/* ─────────── Section 1: Hero ─────────── */
function Hero({ missionId }: { missionId: string }) {
  const { data: mission } = useQuery({
    queryKey: ["brief-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name, client_name, contract_value, health_score")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const { data: submission } = useQuery({
    queryKey: ["brief-submission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_milestones")
        .select("milestone_date")
        .eq("mission_id", missionId)
        .eq("milestone_type", "submission")
        .order("milestone_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const subDate = submission?.milestone_date ? new Date(submission.milestone_date) : null;
  const daysRemaining = subDate
    ? Math.ceil((subDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const daysColor =
    daysRemaining === null
      ? null
      : daysRemaining >= 60
      ? GREEN
      : daysRemaining >= 30
      ? AMBER
      : RED;

  const health = mission?.health_score;
  const healthMeta =
    health == null
      ? null
      : health >= 70
      ? { label: "Healthy", color: GREEN }
      : health >= 40
      ? { label: "At Risk", color: AMBER }
      : { label: "Critical", color: RED };

  const chips: Array<{ label: string; value: React.ReactNode; color?: string }> = [];
  if (mission?.contract_value)
    chips.push({ label: "Contract Value", value: mission.contract_value });
  chips.push({
    label: "Submission",
    value: subDate
      ? subDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "TBD",
  });
  if (daysRemaining !== null)
    chips.push({
      label: "Days Remaining",
      value: `${daysRemaining}`,
      color: daysColor ?? undefined,
    });
  if (healthMeta)
    chips.push({
      label: "Mission Health",
      value: (
        <span className="flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: healthMeta.color }}
          />
          {healthMeta.label}
        </span>
      ),
    });

  return (
    <section
      className="rounded-2xl px-6 sm:px-10 py-10"
      style={{ background: "linear-gradient(180deg,#13131a 0%, #0a0a0f 100%)", border: `1px solid ${BORDER}` }}
    >
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
        {mission?.client_name ?? "—"}
      </div>
      <h1
        className="mt-1 font-bold truncate"
        style={{ fontSize: "clamp(24px, 3.2vw, 32px)", lineHeight: 1.15 }}
      >
        {mission?.name ?? "Mission"}
      </h1>
      <div className="mt-6 grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3">
        {chips.map((c) => (
          <div
            key={c.label}
            className="rounded-lg px-3 py-2"
            style={{ background: CARD_2, border: `1px solid ${BORDER}` }}
          >
            <div style={{ ...sectionLabel, fontSize: 9 }}>{c.label}</div>
            <div
              className="mt-1 font-semibold"
              style={{ fontSize: 14, color: c.color ?? "white" }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────── Section 2: North Star ─────────── */
function NorthStar({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["brief-northstar", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_north_star")
        .select("content, version, status, approved_at")
        .eq("mission_id", missionId)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  return (
    <section className="text-center py-8">
      <div style={sectionLabel}>North Star<BriefSectionDot missionId={missionId} section="north_star" /></div>
      {data?.content ? (
        <>
          <p
            className="mx-auto mt-8 max-w-3xl italic"
            style={{ fontSize: "clamp(20px, 2.2vw, 26px)", fontWeight: 300, lineHeight: 1.4 }}
          >
            "{data.content}"
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className="rounded px-2 py-0.5"
              style={{
                ...sectionLabel,
                fontSize: 10,
                color: GOLD,
                border: `1px solid ${GOLD}55`,
              }}
            >
              V{data.version}
            </span>
            <span style={{ ...sectionLabel, fontSize: 10, color: GREEN }}>Approved</span>
          </div>
        </>
      ) : (
        <p
          className="mx-auto mt-8 italic"
          style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}
        >
          North Star pending — configure in Olympus.
        </p>
      )}
    </section>
  );
}

/* ─────────── Section 3: Why This Matters ─────────── */
function WhyMatters({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["brief-why", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("why_it_matters")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  if (!data?.why_it_matters) return null;

  return (
    <section>
      <div style={sectionLabel} className="mb-3">
        Why This Matters
      </div>
      <div
        className="rounded-xl p-6"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.85)" }}>
          {data.why_it_matters}
        </p>
      </div>
    </section>
  );
}

/* ─────────── Section 4: How We Win ─────────── */
function HowWeWin({ missionId }: { missionId: string }) {
  const { data: themes = [] } = useQuery({
    queryKey: ["brief-winthemes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_win_themes")
        .select("*")
        .eq("mission_id", missionId)
        .eq("status", "active")
        .order("display_order", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  return (
    <section>
      <div style={sectionLabel} className="mb-4">
        How We Win<BriefSectionDot missionId={missionId} section="win_themes" />
      </div>
      {themes.length === 0 ? (
        <div
          className="rounded-xl p-6 italic"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.45)" }}
        >
          Win themes not yet defined — add them in Olympus.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((t) => (
            <WinThemeCard key={t.id} theme={t} missionId={missionId} />
          ))}
        </div>
      )}
    </section>
  );
}

function WinThemeCard({ theme, missionId }: { theme: any; missionId: string }) {
  const [open, setOpen] = useState(false);
  const relatedCount = Array.isArray(theme.related_intel_ids) ? theme.related_intel_ids.length : 0;
  const truncated =
    theme.why_it_matters && theme.why_it_matters.length > 80
      ? theme.why_it_matters.slice(0, 80) + "…"
      : theme.why_it_matters ?? "";

  return (
    <div
      className="rounded-xl p-5 cursor-pointer transition-all duration-150"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
      }}
      onClick={() => setOpen((v) => !v)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = GOLD;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 grid place-items-center rounded-lg"
          style={{ width: 36, height: 36, background: CARD_2, color: GOLD }}
        >
          <Trophy size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold truncate" style={{ fontSize: 15 }}>
              {theme.title}
            </h3>
            <ChevronDown
              size={16}
              style={{
                color: "rgba(255,255,255,0.4)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms",
              }}
            />
          </div>
          {!open && truncated && (
            <p className="mt-1" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              {truncated}
            </p>
          )}
          {theme.alignment_score != null && (
            <div className="mt-2" style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>
              {theme.alignment_score}% aligned
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {theme.why_it_matters && (
            <p style={{ color: "rgba(255,255,255,0.85)" }}>{theme.why_it_matters}</p>
          )}
          {theme.what_theyre_buying && (
            <div>
              <div style={{ ...sectionLabel, fontSize: 9 }}>What They're Really Buying</div>
              <p className="italic mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
                {theme.what_theyre_buying}
              </p>
            </div>
          )}
          {Array.isArray(theme.proof_points) && theme.proof_points.length > 0 && (
            <ul className="space-y-1">
              {theme.proof_points.map((p: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <Check size={14} style={{ color: GREEN, marginTop: 3 }} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {Array.isArray(theme.watch_outs) && theme.watch_outs.length > 0 && (
            <ul className="space-y-1">
              {theme.watch_outs.map((p: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle size={14} style={{ color: AMBER, marginTop: 3 }} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {relatedCount > 0 && (
            <Link
              to="/missions/$missionId/oracle"
              params={{ missionId }}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-2"
              style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}
            >
              {relatedCount} related signals <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── Section 5: Flight Risks ─────────── */
function FlightRisks({ missionId }: { missionId: string }) {
  const { data: risks = [] } = useQuery({
    queryKey: ["brief-risks", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_risks")
        .select("*")
        .eq("mission_id", missionId)
        .eq("status", "active");
      const order: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
      return ((data ?? []) as any[]).sort(
        (a, b) => (order[a.severity ?? ""] ?? 9) - (order[b.severity ?? ""] ?? 9),
      );
    },
  });

  if (risks.length === 0) return null;

  const top = risks.slice(0, 5);
  const extra = risks.length - top.length;

  const sevColor = (s: string) =>
    s === "critical" ? RED : s === "high" ? GOLD : s === "medium" ? AMBER : "rgba(255,255,255,0.4)";

  return (
    <section>
      <div style={sectionLabel} className="mb-4">
        Flight Risks<BriefSectionDot missionId={missionId} section="flight_risks" />
      </div>
      <div className="flex flex-wrap gap-3">
        {top.map((r: any) => (
          <div
            key={r.id}
            className="rounded-lg p-3 flex items-start gap-2 transition-all duration-150"
            title={[r.explanation, r.recommended_action && `\nRecommended: ${r.recommended_action}`]
              .filter(Boolean)
              .join("")}
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${sevColor(r.severity ?? "")}`,
              minWidth: 200,
              maxWidth: 280,
            }}
          >
            <AlertTriangle size={14} style={{ color: sevColor(r.severity ?? ""), marginTop: 2 }} />
            <div className="min-w-0">
              <div className="font-bold" style={{ fontSize: 13 }}>
                {r.title}
              </div>
              {r.historical_note ? (
                <div
                  className="mt-1 italic"
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.4)",
                    lineHeight: 1.4,
                  }}
                >
                  {r.historical_note}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {extra > 0 && (
        <Link
          to="/missions/$missionId/flight-deck"
          params={{ missionId }}
          className="inline-flex items-center gap-1 mt-3"
          style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}
        >
          + {extra} more risks — view in Flight Deck <ArrowRight size={12} />
        </Link>
      )}
    </section>
  );
}

/* ─────────── Section 6: Today's Focus ─────────── */
function TodaysFocus({ missionId }: { missionId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["brief-focus", missionId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_daily_focus")
        .select("*")
        .eq("mission_id", missionId)
        .eq("focus_date", today)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const confColor =
    data?.iris_confidence === "high" ? GREEN : data?.iris_confidence === "low" ? RED : AMBER;

  return (
    <section className="md:static sticky top-0 z-10">
      <div style={sectionLabel} className="mb-3">
        Today's Focus
      </div>
      {data ? (
        <div className="rounded-xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <h3 className="font-bold" style={{ fontSize: 17, lineHeight: 1.4 }}>
            {data.focus_text}
          </h3>
          {Array.isArray(data.priority_areas) && data.priority_areas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.priority_areas.slice(0, 3).map((p: string, i: number) => {
                const c = i === 0 ? RED : i === 1 ? AMBER : GREEN;
                return (
                  <span
                    key={i}
                    className="rounded-full px-3 py-1"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: c,
                      background: `${c}1a`,
                      border: `1px solid ${c}55`,
                    }}
                  >
                    {p}
                  </span>
                );
              })}
            </div>
          )}
          {data.reason && (
            <p className="mt-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              {data.reason}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              {data.approved_at
                ? `Approved ${new Date(data.approved_at).toLocaleString()}`
                : null}
            </div>
            <span
              className="rounded px-2 py-0.5"
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: confColor,
                border: `1px solid ${confColor}55`,
              }}
            >
              {data.iris_confidence ?? "medium"} confidence
            </span>
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl p-6 animate-pulse"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.5)", fontSize: 14 }}
        >
          Today's focus is being generated by IRIS.
        </div>
      )}
    </section>
  );
}

/* ─────────── Section 7: Message Discipline ─────────── */
function MessageDiscipline({ missionId }: { missionId: string }) {
  const { data } = useQuery({
    queryKey: ["brief-signals", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("writing_signals")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  const s = (data?.writing_signals as any) ?? {};
  const care: string[] = Array.isArray(s.care_about) ? s.care_about : [];
  const avoid: string[] = Array.isArray(s.avoid) ? s.avoid : [];
  const repeat: string[] = Array.isArray(s.repeat_often) ? s.repeat_often : [];

  if (care.length === 0 && avoid.length === 0 && repeat.length === 0) return null;

  const Column = ({
    title,
    items,
    color,
    icon: Icon,
  }: {
    title: string;
    items: string[];
    color: string;
    icon: any;
  }) => (
    <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div style={{ ...sectionLabel, color }}>{title}</div>
      <ul className="mt-4 space-y-2">
        {items.slice(0, 6).map((it, i) => (
          <li key={i} className="flex items-start gap-2" style={{ fontSize: 13 }}>
            <Icon size={14} style={{ color, marginTop: 3 }} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section>
      <div style={sectionLabel} className="mb-1">
        Message Discipline
      </div>
      <p className="mb-4" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
        Your writer's compass for this mission.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column title="Evaluators Care About" items={care} color={GREEN} icon={Check} />
        <Column title="Avoid" items={avoid} color={RED} icon={X} />
        <Column title="Repeat Often" items={repeat} color={GOLD} icon={ArrowRight} />
      </div>
    </section>
  );
}

/* ─────────── Section 8: Timeline ─────────── */
function Timeline({ missionId }: { missionId: string }) {
  const { data: milestones = [] } = useQuery({
    queryKey: ["brief-timeline", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_milestones")
        .select("*")
        .eq("mission_id", missionId)
        .order("milestone_date", { ascending: true });
      return data ?? [];
    },
  });

  return (
    <section>
      <div style={sectionLabel} className="mb-4">
        Mission Timeline
      </div>
      {milestones.length === 0 ? (
        <div
          className="rounded-xl p-6 italic"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.45)" }}
        >
          Timeline not configured — add milestones in Olympus.
        </div>
      ) : (
        <TimelineViz milestones={milestones} />
      )}
    </section>
  );
}

function TimelineViz({ milestones }: { milestones: any[] }) {
  const dates = milestones.map((m) => new Date(m.milestone_date).getTime());
  const today = Date.now();
  const min = Math.min(...dates, today);
  const max = Math.max(...dates, today);
  const range = Math.max(max - min, 1);
  const pos = (t: number) => ((t - min) / range) * 100;

  const statusColor = (s: string) =>
    s === "complete" ? GREEN : s === "in_progress" ? GOLD : s === "at_risk" || s === "missed" ? RED : BLUE;

  return (
    <div
      className="rounded-xl p-6 overflow-x-auto"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}
    >
      <div className="relative" style={{ minWidth: 600, height: 120, marginTop: 16 }}>
        <div
          className="absolute left-0 right-0"
          style={{ top: 30, height: 2, background: BORDER }}
        />
        {/* TODAY marker */}
        <div
          className="absolute"
          style={{ left: `${pos(today)}%`, top: 0, bottom: 0, width: 2, background: GOLD }}
        >
          <div
            className="absolute"
            style={{
              top: -16,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 9,
              fontWeight: 700,
              color: GOLD,
              letterSpacing: "0.12em",
            }}
          >
            TODAY
          </div>
        </div>

        {milestones.map((m) => {
          const left = pos(new Date(m.milestone_date).getTime());
          const c = statusColor(m.status ?? "");
          return (
            <div
              key={m.id}
              className="absolute"
              style={{ left: `${left}%`, top: 22, transform: "translateX(-50%)", width: 110 }}
              title={[m.notes, m.owner_id && `Owner: ${m.owner_id}`].filter(Boolean).join("\n")}
            >
              <div
                className="mx-auto rounded-full"
                style={{ width: 14, height: 14, background: c, border: `2px solid ${PAGE_BG}` }}
              />
              <div
                className="mt-2 text-center font-semibold truncate"
                style={{ fontSize: 11 }}
              >
                {m.title ?? m.milestone_type.replace(/_/g, " ")}
              </div>
              <div
                className="text-center"
                style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}
              >
                {new Date(m.milestone_date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────── Section 9: Support + Launch Pad ─────────── */
function SupportAndLaunch({ missionId }: { missionId: string }) {
  const navigate = useNavigate();

  const cards = [
    {
      icon: Phone,
      title: "Phone a Friend",
      desc: "Reach a subject matter expert",
      to: "/missions/$missionId/flight-deck",
    },
    {
      icon: Users,
      title: "Mission Leadership",
      desc: "Connect with mission command",
      to: "/missions/$missionId/team",
    },
    {
      icon: Sparkles,
      title: "Ask IRIS",
      desc: "Get instant mission intelligence",
      to: "/missions/$missionId/oracle",
    },
    {
      icon: Settings,
      title: "Olympus",
      desc: "Configure mission settings",
      to: "/missions/$missionId/settings",
    },
  ];

  const checklist = [
    "Review Today's Focus",
    "Review How We Win",
    "Review Flight Risks",
    "Check Message Discipline",
  ];

  return (
    <section>
      <div style={sectionLabel} className="mb-4">
        Mission Support
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.title}
            to={c.to}
            params={{ missionId }}
            className="rounded-xl p-5 transition-all duration-150 block"
            style={{ background: CARD, border: `1px solid ${BORDER}`, textDecoration: "none", color: "white" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = GOLD;
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BORDER;
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <c.icon size={20} style={{ color: GOLD }} />
            <div className="mt-3 font-bold" style={{ fontSize: 14 }}>
              {c.title}
            </div>
            <div className="mt-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              {c.desc}
            </div>
          </Link>
        ))}
      </div>

      <div
        className="mt-8 rounded-xl p-6"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <div style={sectionLabel}>Launch Pad</div>
        <ul className="mt-4 space-y-2">
          {checklist.map((c) => (
            <li key={c} className="flex items-center gap-3" style={{ fontSize: 14 }}>
              <span
                className="inline-block rounded"
                style={{ width: 14, height: 14, border: `1.5px solid ${BORDER}` }}
              />
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{c}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => navigate({ to: "/missions/$missionId/flight-deck", params: { missionId } })}
          className="mt-6 w-full rounded-lg flex items-center justify-center gap-2 transition-all"
          style={{
            background: GOLD,
            color: "black",
            fontWeight: 700,
            fontSize: 16,
            padding: "14px 20px",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Rocket size={18} /> ENTER FLIGHT DECK
        </button>
        <p
          className="mt-3 text-center"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
        >
          Writing occurs in your client environment. Flight Deck supports execution.
        </p>
      </div>
    </section>
  );
}
