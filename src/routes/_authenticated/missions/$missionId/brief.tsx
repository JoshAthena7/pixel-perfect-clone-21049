import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ClipboardList, Plane, Settings as SettingsIcon, HelpCircle, MoreHorizontal,
  Clock, Activity, DollarSign, Users, Target, Trophy, ShieldCheck, AlertTriangle,
  FileText, Building2, Megaphone, Swords, ArrowRight, ExternalLink, Maximize2,
  Zap, CheckCircle2, AlertCircle, Bell, Gavel, Calendar, XCircle, Sparkles,
  Check, Circle, Link2,
} from "lucide-react";
import lighthouse from "@/assets/briefing-lighthouse.jpg";

export const Route = createFileRoute("/_authenticated/missions/$missionId/brief")({
  ssr: false,
  component: MissionBriefingRoomPage,
});

/* ════════════════ DESIGN TOKENS ════════════════ */
const C = {
  bg: "#F8F9FA",
  card: "#FFFFFF",
  navy: "#1B3A6B",
  navyDeep: "#0F2347",
  gold: "#C9922A",
  goldLight: "#E8B84B",
  goldTint: "rgba(201,146,42,0.08)",
  iris: "#6366F1",
  green: "#16A34A",
  orange: "#F59E0B",
  red: "#DC2626",
  blue: "#2563EB",
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  textPrimary: "#111827",
  textBody: "#374151",
  textMuted: "#6B7280",
  textFaint: "#94A3B8",
  sidebarText: "#CBD5E1",
  sidebarMuted: "#64748B",
};

const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: C.textPrimary,
  textTransform: "uppercase",
};

const subLabel: React.CSSProperties = {
  fontSize: 12,
  color: C.textMuted,
  marginTop: 2,
};

const linkBlue: React.CSSProperties = {
  color: C.blue,
  fontSize: 12,
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

/* ════════════════ PAGE ════════════════ */
function MissionBriefingRoomPage() {
  const { missionId } = Route.useParams();

  useEffect(() => {
    try { localStorage.setItem(`atlas.lastRoom.${missionId}`, "briefing"); } catch {}
  }, [missionId]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = "Sarah";

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", color: C.textPrimary,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      display: "flex",
    }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "20px 24px", overflowX: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(280px,1fr)", gap: 20, alignItems: "start" }}>
          {/* ── LEFT (main) column ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Hero />
            <MissionObjective />
            <StrategicBrief />
            <ThreeColumnRow />
            <MissionMap missionId={missionId} />
            <BottomPanels missionId={missionId} />
            <FinalCTA missionId={missionId} />
          </div>

          {/* ── RIGHT column ── */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 20 }}>
            <IrisMissionBrief greeting={greeting} firstName={firstName} />
            <MissionHealthCard />
            <YoureBriefedCard missionId={missionId} />
          </aside>
        </div>
      </main>
    </div>
  );
}

/* ════════════════ SIDEBAR ════════════════ */
function Sidebar() {
  const { missionId } = Route.useParams();
  return (
    <aside style={{
      width: 190, minWidth: 190, background: C.navy, color: "#fff",
      minHeight: "100vh", display: "flex", flexDirection: "column", padding: "20px 0",
      position: "sticky", top: 0,
    }}>
      <div style={{ padding: "0 20px 24px", fontWeight: 800, fontSize: 20, letterSpacing: 2, color: "#fff" }}>
        ATLAS
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 8px" }}>
        {/* Mission Briefing Room — ACTIVE */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
          borderLeft: `3px solid ${C.gold}`,
          background: C.goldTint, borderRadius: "0 6px 6px 0",
          color: C.gold, fontWeight: 600, fontSize: 14, lineHeight: 1.25,
        }}>
          <ClipboardList size={16} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>Mission<br />Briefing Room</span>
        </div>

        {/* Flight Deck */}
        <Link
          to="/missions/$missionId/flight-deck"
          params={{ missionId }}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            color: C.sidebarText, fontSize: 14, fontWeight: 400, textDecoration: "none",
            borderRadius: 6,
          }}
        >
          <Plane size={16} strokeWidth={2} style={{ color: "#fff" }} />
          Flight Deck
        </Link>
      </nav>

      <div style={{ flex: 1 }} />

      {/* Bottom: profile + settings + help */}
      <div style={{ padding: "0 16px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #F8B595, #F67E7D)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 13, fontWeight: 700, position: "relative",
          }}>
            S
            <span style={{
              position: "absolute", bottom: -1, right: -1, width: 10, height: 10,
              borderRadius: "50%", background: "#22C55E", border: "2px solid #1B3A6B",
            }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Sarah M.</div>
            <div style={{ color: C.sidebarMuted, fontSize: 11 }}>Writer</div>
          </div>
        </div>
        <button style={navBtnBottom}><SettingsIcon size={14} /> Settings</button>
        <button style={navBtnBottom}><HelpCircle size={14} /> Help</button>
      </div>
    </aside>
  );
}
const navBtnBottom: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 4px",
  background: "transparent", border: "none", color: C.sidebarMuted, fontSize: 13,
  cursor: "pointer", textAlign: "left",
};

/* ════════════════ HERO ════════════════ */
function Hero() {
  return (
    <div style={{ ...card, position: "relative", overflow: "hidden", padding: 0 }}>
      {/* Lighthouse decorative photo right side */}
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: "55%",
        backgroundImage: `url(${lighthouse})`, backgroundSize: "cover", backgroundPosition: "center right",
      }} />
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width: "60%",
        background: "linear-gradient(to right, #FFFFFF 0%, rgba(255,255,255,0.85) 25%, rgba(255,255,255,0.3) 60%, rgba(255,255,255,0.05) 100%)",
      }} />

      <div style={{ position: "relative", padding: "24px 28px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 32 }}>
          <div style={{ minWidth: 0, maxWidth: "55%" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.iris, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Mission Briefing Room
            </div>
            <h1 style={{
              fontSize: 32, fontWeight: 800, color: C.navy, lineHeight: 1.1,
              margin: "6px 0 10px", letterSpacing: "-0.02em",
            }}>
              NJ CSOC RFP
            </h1>
            <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.5 }}>
              State of New Jersey<br />Children's System of Care
            </div>
            <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.red, fontStyle: "italic" }}>Ameri</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.blue, fontStyle: "italic" }}>Health</span>
              <span style={{ fontSize: 11, color: C.blue, fontStyle: "italic", marginLeft: 4 }}>Caritas</span>
            </div>
          </div>

          {/* Metric chips */}
          <div style={{ display: "flex", gap: 0, alignItems: "stretch", flexShrink: 0 }}>
            <MetricChip icon={<Clock size={12} />} label="Days to Submission" value="58" sub="May 22, 2025" />
            <MetricDivider />
            <MetricChip icon={<Activity size={12} />} label="Mission Status" valueNode={<StatusPill text="ON TRACK" />} sub="Updated 2h ago" />
            <MetricDivider />
            <MetricChip icon={<DollarSign size={12} />} label="Estimated Value" value="$85M+" sub="5 Year Potential" />
            <MetricDivider />
            <MetricChip icon={<Users size={12} />} label="Team Members" value="32" sub="Writers, SMEs, PMs" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ icon, label, value, valueNode, sub }: { icon: React.ReactNode; label: string; value?: string; valueNode?: React.ReactNode; sub: string }) {
  return (
    <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {icon} {label}
      </div>
      {valueNode ?? <div style={{ fontSize: 24, fontWeight: 700, color: C.navy, lineHeight: 1.1 }}>{value}</div>}
      <div style={{ fontSize: 12, color: C.textMuted }}>{sub}</div>
    </div>
  );
}
function MetricDivider() {
  return <div style={{ width: 1, background: C.border, alignSelf: "center", height: 36 }} />;
}
function StatusPill({ text }: { text: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999,
      background: "rgba(22,163,74,0.12)", color: C.green, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      marginTop: 2, width: "fit-content",
    }}>{text}</span>
  );
}

/* ════════════════ MISSION OBJECTIVE ════════════════ */
function MissionObjective() {
  return (
    <div style={{
      background: C.navy, borderRadius: 8, padding: "20px 24px", color: "#fff",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", right: 20, top: 8, fontSize: 96, lineHeight: 1,
        color: C.gold, opacity: 0.18, fontFamily: "Georgia, serif", fontWeight: 700,
      }}>"</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        Mission Objective
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.5, maxWidth: "85%" }}>
        "Deliver a response that demonstrates deep understanding of New Jersey's Children's System of Care ecosystem."
      </div>
    </div>
  );
}

/* ════════════════ STRATEGIC BRIEF ════════════════ */
function StrategicBrief() {
  const cols = [
    {
      icon: <Target size={22} style={{ color: C.green }} />,
      heading: "WHAT ARE WE TRYING TO WIN?", sub: "Mission Objective",
      body: "Partner with NJ to strengthen the Children's System of Care through integrated, whole-child solutions that drive outcomes.",
    },
    {
      icon: <Trophy size={22} style={{ color: C.gold }} />,
      heading: "WHY WILL WE WIN?", sub: "Win Themes",
      bullets: [
        "Deep NJ CSOC expertise",
        "Proven outcomes at scale",
        "Integrated, whole-child approach",
        "Local presence and partnerships",
        "Innovation and continuous improvement",
      ],
    },
    {
      icon: <ShieldCheck size={22} style={{ color: C.blue }} />,
      heading: "WHAT MUST BE TRUE?", sub: "Critical Success Factors",
      bullets: [
        "Demonstrate understanding of NJ CSOC",
        "Meet all mandatory requirements",
        "Show measurable outcomes",
        "Provide strong care coordination model",
        "Ensure cultural competency and equity",
      ],
    },
    {
      icon: <AlertTriangle size={22} style={{ color: C.red }} />,
      heading: "WHAT COULD HURT US?", sub: "Mission Risks",
      bullets: [
        "Incumbent advantage",
        "Budget constraints",
        "High technical bar",
        "Tight timeline",
        "Evolving requirements",
      ],
    },
  ];

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={sectionLabel}>Strategic Brief</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", marginTop: 16, gap: 0 }}>
        {cols.map((c, i) => (
          <div key={c.heading} style={{
            padding: i === 0 ? "0 18px 0 0" : i === 3 ? "0 0 0 18px" : "0 18px",
            borderRight: i < 3 ? `1px solid ${C.borderLight}` : "none",
          }}>
            <div style={{ marginBottom: 10 }}>{c.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, letterSpacing: "0.02em", marginBottom: 2 }}>
              {c.heading}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>{c.sub}</div>
            {c.body && (
              <p style={{ fontSize: 12, color: C.textBody, lineHeight: 1.6, margin: 0 }}>{c.body}</p>
            )}
            {c.bullets && (
              <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 16 }}>
                {c.bullets.map((b) => (
                  <li key={b} style={{ fontSize: 12, color: C.textBody, lineHeight: 1.6 }}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ THREE COLUMN ROW ════════════════ */
function ThreeColumnRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
      <WinThemesAlignment />
      <OracleBriefing />
      <ClarificationsAndWhatChanged />
    </div>
  );
}

function WinThemesAlignment() {
  const themes = [
    { name: "Deep Understanding of NJ CSOC", pct: 92, color: C.green },
    { name: "Whole-Child Integrated Approach", pct: 88, color: C.green },
    { name: "Proven Outcomes & Impact", pct: 84, color: C.green },
    { name: "Local Presence & Partnerships", pct: 76, color: C.blue },
    { name: "Innovation & Continuous Improvement", pct: 72, color: C.blue },
    { name: "Cultural Competency & Equity", pct: 68, color: C.orange },
  ];
  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>WIN THEMES ALIGNMENT</div>
        <div style={subLabel}>How we will win this mission.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {themes.map((t) => (
          <div key={t.name}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.textBody }}>{t.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{t.pct}%</span>
            </div>
            <div style={{ height: 6, background: C.borderLight, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${t.pct}%`, height: "100%", background: t.color, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
      <a href="#" style={linkBlue}>View all win themes <ArrowRight size={12} /></a>
    </div>
  );
}

function OracleBriefing() {
  const sources = [
    { icon: <FileText size={14} />, name: "Policy & Regulation", text: "NJ CSOC Waiver renewal priorities emphasize care coordination and data-driven outcomes." },
    { icon: <Building2 size={14} />, name: "State Intelligence", text: "NJ is focused on reducing ER utilization and improving community-based care access." },
    { icon: <Megaphone size={14} />, name: "Stakeholders & Advocates", text: "Strong emphasis from advocates on family voice, trauma-informed care, and equity." },
    { icon: <Swords size={14} />, name: "Competitive Intelligence", text: "Incumbent response focuses on scale. We win on differentiation and outcomes." },
  ];
  const top3 = [
    "NJ continues emphasizing care coordination outcomes and data-driven family engagement as top evaluation priorities.",
    "Recent Clarification #4 increases reporting requirements — teams must address quarterly dashboard submissions explicitly in Section 4.0.",
    "Family voice and trauma-informed care are recurring themes across advocacy stakeholder submissions — evaluators are watching for this language.",
  ];
  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>ORACLE BRIEFING</div>
        <div style={subLabel}>Key intelligence and insights.</div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.iris, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          Top 3 Things We Learned This Week
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {top3.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: C.textBody, lineHeight: 1.6 }}>
              <span style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: 999,
                background: "rgba(99,102,241,0.12)", color: C.iris,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, marginTop: 1,
              }}>{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>Last updated: 2h ago</div>
      </div>

      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {sources.map((s) => (
          <div key={s.name} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ color: C.iris, flexShrink: 0, marginTop: 2 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{s.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{s.text}</div>
            </div>
          </div>
        ))}
      </div>

      <a href="#" style={linkBlue}>Go to Oracle <ArrowRight size={12} /></a>
    </div>
  );
}

function ClarificationsAndWhatChanged() {
  const clarifications = [
    { num: 4, date: "Posted yesterday", text: "Clarification on Care Coordination metrics and reporting requirements." },
    { num: 3, date: "May 14, 2025", text: "Updated exhibit template and data fields." },
    { num: 2, date: "May 7, 2025", text: "Clinical quality measure definitions." },
    { num: 1, date: "Apr 29, 2025", text: "Budget assumptions and template update." },
  ];
  const changes = [
    { dot: C.iris, type: "IRIS Insight Added", text: "New trend analysis on ER diversion outcomes.", time: "1h ago" },
    { dot: C.orange, type: "Question Reassigned", text: "3.2.1 Care Coordination Approach reassigned to you.", time: "2h ago" },
    { dot: C.red, type: "New Risk Identified", text: "Dependency risk added for Section 3.2.", time: "3h ago" },
    { dot: C.gold, type: "Leadership Decision", text: "Approved win theme updates for Section 2.0.", time: "5h ago" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>CLIENT CLARIFICATIONS</div>
            <div style={subLabel}>Latest from the state.</div>
          </div>
          <a href="#" style={linkBlue}>View all <ArrowRight size={12} /></a>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {clarifications.map((c, i) => (
            <div key={c.num} style={{
              display: "flex", gap: 10, padding: "10px 0",
              borderBottom: i < clarifications.length - 1 ? `1px solid ${C.borderLight}` : "none",
            }}>
              <FileText size={14} style={{ color: C.iris, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: C.textPrimary }}>
                  <span style={{ fontWeight: 700 }}>#{c.num}</span>{" "}
                  <span style={{ color: C.textMuted }}>{c.date}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textBody, lineHeight: 1.5, marginTop: 2 }}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>WHAT CHANGED</div>
            <div style={subLabel}>Recent mission activity.</div>
          </div>
          <a href="#" style={linkBlue}>View all <ArrowRight size={12} /></a>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {changes.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot, marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{c.type}</div>
                <div style={{ fontSize: 12, color: C.textBody, lineHeight: 1.5 }}>{c.text}</div>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, marginTop: 2 }}>{c.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════ MISSION MAP ════════════════ */
type MapStatus = "completed" | "ontrack" | "atrisk" | "notstarted" | "blocked";
function MissionMap({ missionId: _mid }: { missionId: string }) {
  const [view, setView] = useState<"sections" | "status" | "owner">("sections");
  const sections: { num: string; name: string; status: MapStatus; count: string; label: string }[] = [
    { num: "1.0", name: "Program Overview", status: "completed", count: "12 / 12", label: "Completed" },
    { num: "2.0", name: "Service Approach", status: "atrisk", count: "8 / 18", label: "At Risk" },
    { num: "3.0", name: "Care Coordination", status: "atrisk", count: "6 / 22", label: "At Risk" },
    { num: "4.0", name: "Quality & Performance", status: "ontrack", count: "10 / 16", label: "On Track" },
    { num: "5.0", name: "Data & Reporting", status: "ontrack", count: "7 / 12", label: "On Track" },
    { num: "6.0", name: "Implementation Plan", status: "ontrack", count: "5 / 9", label: "On Track" },
    { num: "7.0", name: "Management Team", status: "notstarted", count: "0 / 8", label: "Not Started" },
    { num: "8.0", name: "Administrative Requirements", status: "notstarted", count: "0 / 7", label: "Not Started" },
  ];
  const dot = (s: MapStatus) =>
    s === "completed" || s === "ontrack" ? C.green :
    s === "atrisk" ? C.orange :
    s === "blocked" ? C.red : "#CBD5E1";

  return (
    <div style={{ ...card, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>MISSION MAP</div>
          <div style={subLabel}>Visualize the journey from start to submission.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>View by:</span>
          <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
            {(["sections", "status", "owner"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "5px 12px", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                background: view === v ? C.navy : "#fff",
                color: view === v ? "#fff" : C.textMuted,
                border: "none", cursor: "pointer",
              }}>{v}</button>
            ))}
          </div>
          <button style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}>
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Journey row */}
      <div style={{ position: "relative", marginTop: 22, padding: "0 8px" }}>
        {/* connecting line */}
        <div style={{
          position: "absolute", left: "8%", right: "8%", top: 78, height: 2,
          background: `linear-gradient(to right, ${C.green} 0%, ${C.green} 35%, ${C.orange} 35%, ${C.orange} 50%, ${C.green} 50%, ${C.green} 75%, #CBD5E1 75%, #CBD5E1 100%)`,
        }} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${sections.length},1fr)`, gap: 4 }}>
          {sections.map((s) => (
            <div key={s.num} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 4px" }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>{s.num}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, lineHeight: 1.25, minHeight: 30, marginTop: 2 }}>{s.name}</div>
              <div style={{
                marginTop: 8, width: 18, height: 18, borderRadius: 999, background: dot(s.status),
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                border: "3px solid #fff", boxShadow: `0 0 0 2px ${dot(s.status)}`,
              }}>
                {(s.status === "completed" || s.status === "ontrack") && <Check size={10} strokeWidth={3} />}
                {s.status === "atrisk" && <AlertTriangle size={10} strokeWidth={3} />}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginTop: 10 }}>{s.count}</div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: s.status === "atrisk" ? C.orange : s.status === "notstarted" ? C.textMuted : C.green,
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 18, fontSize: 11, color: C.textMuted, flexWrap: "wrap" }}>
          <Legend dot={C.green} label="On Track" />
          <Legend dot={C.orange} label="At Risk" tri />
          <Legend dot={C.red} label="Blocked" />
          <Legend dot="#CBD5E1" label="Not Started" hollow />
          <Legend dot={C.green} label="Completed" check />
        </div>
        <a href="#" style={linkBlue}>View Full Question List <ArrowRight size={12} /></a>
      </div>
    </div>
  );
}
function Legend({ dot, label, hollow, check, tri }: { dot: string; label: string; hollow?: boolean; check?: boolean; tri?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {tri ? <AlertTriangle size={10} style={{ color: dot }} /> :
        hollow ? <Circle size={10} style={{ color: dot }} /> :
        check ? <CheckCircle2 size={10} style={{ color: dot }} /> :
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot, display: "inline-block" }} />}
      {label}
    </span>
  );
}

/* ════════════════ BOTTOM PANELS ════════════════ */
function BottomPanels({ missionId }: { missionId: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
      {/* Team */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>TEAM OVERVIEW</div>
        <div style={subLabel}>People and roles.</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
          {["#F8B595", "#A29BFE", "#FAB1A0", "#74B9FF", "#FFEAA7"].map((c, i) => (
            <div key={i} style={{
              width: 32, height: 32, borderRadius: "50%", background: c,
              border: "2px solid #fff", marginLeft: i === 0 ? 0 : -8,
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            }} />
          ))}
          <div style={{
            width: 32, height: 32, borderRadius: "50%", background: "#E5E7EB",
            border: "2px solid #fff", marginLeft: -8, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.textBody,
          }}>+27</div>
        </div>
        <a href="#" style={{ ...linkBlue, marginTop: 14 }}>View Team <ArrowRight size={12} /></a>
      </div>

      {/* Vault */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>VAULT</div>
        <div style={subLabel}>Mission resources.</div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, columnGap: 12, fontSize: 12, color: C.textBody }}>
          {[
            ["RFP Docs", 12], ["Model Contract", 3],
            ["SOW & Exhibits", 7], ["Templates", 24],
            ["Templates Pkg", 156], ["Meeting Notes", 9],
          ].map(([k, v]) => (
            <div key={k as string} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <a href="#" style={{ ...linkBlue, marginTop: 12 }}>Go to Vault <ArrowRight size={12} /></a>
      </div>

      {/* Questions */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>QUESTIONS & SECTIONS</div>
        <div style={subLabel}>Scope and progress.</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.textBody }}>
          <Row k="Total Questions" v="156" />
          <Row k="Total Sections" v="12" />
          <Row k="Assigned to Team" v="48 (31%)" />
          <Row k="At Risk" v="7" tone="red" />
          <Row k="Unassigned" v="0" />
          <Row k="Completed" v="12 (8%)" />
        </div>
        <a href="#" style={{ ...linkBlue, marginTop: 12 }}>View All Questions <ArrowRight size={12} /></a>
      </div>

      {/* Oracle */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>ORACLE</div>
        <div style={subLabel}>Deep dive into intelligence.</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: C.textBody }}>
          {[
            [<FileText size={13} />, "Policy & Regulations"],
            [<Building2 size={13} />, "State Intelligence"],
            [<Megaphone size={13} />, "Stakeholders & Advocates"],
            [<Swords size={13} />, "Competitive Intelligence"],
            [<Activity size={13} />, "Research & Reports"],
          ].map(([icon, label], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.iris }}>{icon as React.ReactNode}</span>
              <span>{label as React.ReactNode}</span>
            </div>
          ))}
        </div>
        <a href="#" style={{ ...linkBlue, marginTop: 12 }}>Go to Oracle <ArrowRight size={12} /></a>
      </div>
    </div>
  );
}
function Row({ k, v, tone }: { k: string; v: string; tone?: "red" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{k}</span>
      <span style={{ fontWeight: tone === "red" ? 700 : 500, color: tone === "red" ? C.red : C.textBody }}>{v}</span>
    </div>
  );
}

/* ════════════════ FINAL CTA ════════════════ */
function FinalCTA({ missionId }: { missionId: string }) {
  const goFlightDeck = () => {
    try { localStorage.setItem(`atlas.lastRoom.${missionId}`, "flight-deck"); } catch {}
  };
  return (
    <div style={{
      background: C.navy, borderRadius: 12, padding: "32px 36px", color: "#fff",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, marginTop: 8,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
          Mission Brief Complete
        </div>
        <div style={{ fontSize: 16, fontWeight: 400, lineHeight: 2, color: "#fff" }}>
          You understand the mission.<br />
          You know the risks.<br />
          You know the strategy.
        </div>
        <div style={{ fontSize: 13, color: C.textFaint, marginTop: 8 }}>Proceed to Flight Deck.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Plane size={32} style={{ color: C.gold }} />
        <Link
          to="/missions/$missionId/flight-deck"
          params={{ missionId }}
          onClick={goFlightDeck}
          style={{
            background: C.gold, color: "#fff", fontSize: 15, fontWeight: 700,
            padding: "16px 32px", borderRadius: 8, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 10,
          }}
        >
          Enter Flight Deck <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

/* ════════════════ RIGHT COLUMN ════════════════ */
function IrisMissionBrief({ greeting, firstName }: { greeting: string; firstName: string }) {
  const alerts = [
    { icon: <CheckCircle2 size={16} style={{ color: C.green }} />, title: "Mission Health: Green", titleColor: C.green, text: "Progress is on track across most areas." },
    { icon: <AlertTriangle size={16} style={{ color: C.orange }} />, title: "2 Sections Need Attention", titleColor: C.orange, text: "Sections 2.0 and 3.0 have questions at risk." },
    { icon: <FileText size={16} style={{ color: C.blue }} />, title: "Client Clarification #4", titleColor: C.blue, text: "NJ posted clarification #4 yesterday." },
    { icon: <Link2 size={16} style={{ color: C.red }} />, title: "1 Dependency Risk Detected", titleColor: C.red, text: "Section 3.2 depends on 2.1 response." },
  ];
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Zap size={16} style={{ color: C.iris }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>IRIS MISSION BRIEF</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: C.textPrimary, fontWeight: 600 }}>
        {greeting}, {firstName}.
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Here's your mission brief.</div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
        {alerts.map((a, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, padding: "10px 0",
            borderBottom: i < alerts.length - 1 ? `1px solid ${C.borderLight}` : "none",
          }}>
            <div style={{ marginTop: 1, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <a href="#" style={{ fontSize: 12, fontWeight: 700, color: a.titleColor, textDecoration: "none" }}>{a.title}</a>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginTop: 2 }}>{a.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, background: C.bg, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Recommended Action
        </div>
        <div style={{ fontSize: 12, color: C.textBody, lineHeight: 1.5, marginTop: 6 }}>
          Review Care Coordination Approach (3.2.1) — high impact section with tight requirements.
        </div>
        <button style={{
          marginTop: 10, background: "#fff", color: C.textBody, fontSize: 12,
          padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer", fontWeight: 500,
        }}>View Details</button>
      </div>
    </div>
  );
}

function MissionHealthCard() {
  const metrics = [
    { icon: <CheckCircle2 size={14} style={{ color: C.green }} />, label: "On Track", val: 42, color: C.green },
    { icon: <AlertTriangle size={14} style={{ color: C.orange }} />, label: "At Risk", val: 7, color: C.orange },
    { icon: <XCircle size={14} style={{ color: C.red }} />, label: "Blocked", val: 1, color: C.red },
    { icon: <Bell size={14} style={{ color: C.orange }} />, label: "Open SOS", val: 2, color: C.orange },
    { icon: <Gavel size={14} style={{ color: C.blue }} />, label: "Pending Decisions", val: 3, color: C.blue },
    { icon: <Calendar size={14} style={{ color: C.textMuted }} />, label: "Upcoming Milestones", val: 5, color: C.textMuted },
  ];
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>MISSION HEALTH</div>
      <div style={{ fontSize: 11, color: C.textMuted }}>Overall mission status and key indicators.</div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.textBody }}>Overall Progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>67%</span>
        </div>
        <div style={{ height: 7, background: C.borderLight, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: "67%", height: "100%", background: C.green, borderRadius: 999 }} />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {metrics.map((m) => (
          <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textBody }}>
              {m.icon}{m.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.val}</span>
          </div>
        ))}
      </div>

      <a href="#" style={{ ...linkBlue, marginTop: 14 }}>View Mission Health <ArrowRight size={12} /></a>
    </div>
  );
}

function YoureBriefedCard({ missionId }: { missionId: string }) {
  const goFlightDeck = () => {
    try { localStorage.setItem(`atlas.lastRoom.${missionId}`, "flight-deck"); } catch {}
  };
  return (
    <div style={{ ...card, padding: 16, background: "#EFF6FF", borderColor: "#DBEAFE" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 999, background: "rgba(37,99,235,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Plane size={20} style={{ color: C.blue }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>You're briefed.<br />Ready to fly?</div>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginTop: 6 }}>
            Enter the Flight Deck to check your status and manage your assignments.
          </div>
        </div>
      </div>
      <Link
        to="/missions/$missionId/flight-deck"
        params={{ missionId }}
        onClick={goFlightDeck}
        style={{
          marginTop: 12, background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600,
          padding: "10px 14px", borderRadius: 6, textDecoration: "none",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        Enter Flight Deck <ArrowRight size={14} />
      </Link>
    </div>
  );
}
