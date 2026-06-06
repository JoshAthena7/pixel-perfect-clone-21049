import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plane, Briefcase, MoreHorizontal, Settings, ChevronDown, ChevronRight,
  Clock, AlertTriangle, Zap, MessageSquare, HandHelping, Lock, UserCheck,
  TrendingUp, Star, Users, Activity, Bell, Calendar, Phone, Link2,
  LayoutGrid, MoreHorizontal as Dots, FileText, ListChecks, Flag, Lightbulb,
  ExternalLink, ArrowRight, Check,
} from "lucide-react";

export const Route = createFileRoute("/flight-deck")({
  ssr: false,
  component: FlightDeckPage,
});

// ===== Tokens =====
const C = {
  bg: "#F8F9FA",
  card: "#FFFFFF",
  navy: "#1B3A6B",
  navyTint: "rgba(27,58,107,0.06)",
  gold: "#C9922A",
  goldTint: "rgba(201,146,42,0.08)",
  iris: "#6366F1",
  green: "#16A34A",
  orange: "#F59E0B",
  red: "#DC2626",
  blue: "#2563EB",
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  text: "#111827",
  muted: "#6B7280",
  sidebarMuted: "#94A3B8",
};

// ===== Sidebar =====
function Sidebar() {
  return (
    <aside
      style={{
        width: 190,
        background: C.navy,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>
          <span style={{ color: "#fff" }}>ATL</span>
          <span style={{ color: C.gold }}>A</span>
          <span style={{ color: "#fff" }}>S</span>
        </div>
      </div>

      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: C.sidebarMuted, letterSpacing: 0.5 }}>
          MISSION
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>NJ CSOC RFP</span>
          <span
            style={{
              background: C.green, color: "#fff", fontSize: 10, fontWeight: 700,
              padding: "3px 7px", borderRadius: 10, letterSpacing: 0.5,
            }}
          >
            ACTIVE
          </span>
        </div>
      </div>

      <nav style={{ marginTop: 4 }}>
        <NavRow icon={<Briefcase size={16} />} label="Mission Briefing Room" />
        <NavRow
          icon={<Plane size={16} style={{ color: C.gold }} />}
          label="Flight Deck"
          active
        />
        <div
          style={{
            padding: "12px 20px",
            display: "flex", alignItems: "center", gap: 10,
            color: C.sidebarMuted, fontSize: 14, cursor: "pointer",
          }}
        >
          <MoreHorizontal size={16} />
          <span style={{ flex: 1 }}>More</span>
          <ChevronDown size={14} />
        </div>
      </nav>

      <div style={{ flex: 1 }} />

      <div style={{ padding: "16px 20px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "linear-gradient(135deg,#fbbf24,#f97316)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 13,
              }}
            >
              SM
            </div>
            <span
              style={{
                position: "absolute", bottom: 0, right: 0,
                width: 10, height: 10, borderRadius: "50%",
                background: C.green, border: `2px solid ${C.navy}`,
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Sarah M.</div>
            <div style={{ fontSize: 12, color: C.sidebarMuted }}>Writer</div>
          </div>
        </div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 14,
            color: C.sidebarMuted, fontSize: 13, cursor: "pointer",
          }}
        >
          <Settings size={14} /> Settings
        </div>
      </div>
    </aside>
  );
}

function NavRow({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div
      style={{
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 10,
        background: active ? C.goldTint : "transparent",
        borderLeft: active ? `3px solid ${C.gold}` : "3px solid transparent",
        color: active ? C.gold : "#fff",
        fontSize: 14, fontWeight: active ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

// ===== Top header / Assists Bar =====
function TopHeader({ selectedQ }: { selectedQ: string | null }) {
  const tools = [
    { icon: <TrendingUp size={18} />, name: "Update Reality", sub: "Post a status update" },
    { icon: <Star size={18} />, name: "Score Me", sub: "AI scorecard" },
    { icon: <Users size={18} />, name: "Phone a Friend", sub: "Find an SME" },
    { icon: <Activity size={18} />, name: "Daily Pulse", sub: "Quick check-in" },
    { icon: <MessageSquare size={18} />, name: "Thread", sub: "Question thread" },
  ];
  return (
    <header
      style={{
        background: "#fff", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", minHeight: 80,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: 0.5 }}>
            FLIGHT DECK
          </span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          <Plane size={12} style={{ color: C.navy }} /> You fly the mission.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        <div style={{ padding: "4px 16px 4px 0", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", color: "#9CA3AF", fontWeight: 700, letterSpacing: 0.6 }}>
            ASSISTS BAR
          </div>
          <div style={{ fontSize: 10, color: "#9CA3AF" }}>
            {selectedQ ? `Q${selectedQ}` : "Always visible"}
          </div>
        </div>
        {tools.map((t, i) => (
          <ToolTile key={i} icon={t.icon} name={t.name} sub={t.sub} dim={!selectedQ} />
        ))}
        <ToolTile
          icon={<Bell size={18} style={{ color: C.red }} />}
          name="SOS"
          sub="Get help now"
          danger
          dim={!selectedQ}
        />
      </div>
    </header>
  );
}

function ToolTile({
  icon, name, sub, danger, dim,
}: { icon: React.ReactNode; name: string; sub: string; danger?: boolean; dim?: boolean }) {
  const color = danger ? C.red : C.navy;
  return (
    <button
      title={dim ? "Select a question to activate" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 16px", borderRight: `1px solid ${C.border}`,
        background: danger ? "rgba(220,38,38,0.05)" : "transparent",
        border: "none", borderLeft: "none", cursor: "pointer",
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 12, fontWeight: danger ? 700 : 600, color }}>{name}</div>
        <div style={{ fontSize: 10, color: danger ? C.red : C.muted }}>{sub}</div>
      </div>
    </button>
  );
}

// ===== Card primitive =====
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ===== Flight Status =====
function FlightStatus() {
  const rows = [
    { icon: <Clock size={20} />, color: C.red, label: "Due in 72h", count: 2 },
    { icon: <AlertTriangle size={20} />, color: C.orange, label: "At Risk", count: 1 },
    { icon: <Zap size={20} fill="currentColor" />, color: C.iris, label: "IRIS Alerts", count: 3 },
    { icon: <MessageSquare size={20} />, color: C.blue, label: "Mentions", count: 2 },
    { icon: <HandHelping size={20} />, color: C.green, label: "Help Requests", count: 1 },
    { icon: <Lock size={20} />, color: C.muted, label: "Compliance Issues", count: 1 },
    { icon: <UserCheck size={20} />, color: C.muted, label: "Reassigned to You", count: 1 },
  ];
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>FLIGHT STATUS</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>What needs my attention?</div>
      <div style={{ marginTop: 12 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 12, height: 44,
              borderBottom: i < rows.length - 1 ? `1px solid ${C.borderLight}` : "none",
              cursor: "pointer",
            }}
          >
            <span style={{ color: r.color }}>{r.icon}</span>
            <span style={{ flex: 1, fontSize: 14, color: C.text }}>{r.label}</span>
            <span
              style={{
                background: r.color, color: "#fff", fontSize: 11, fontWeight: 700,
                width: 22, height: 22, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {r.count}
            </span>
            <ChevronRight size={14} style={{ color: "#9CA3AF" }} />
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 12, fontSize: 13, color: C.blue, cursor: "pointer" }}>View all</div>
    </Card>
  );
}

// ===== Mission Radar =====
function MissionRadar() {
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>MISSION RADAR</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Where am I relative to the mission?</div>
        </div>
        <a style={{ fontSize: 12, color: C.blue, cursor: "pointer" }}>View Full Radar</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.3fr 0.9fr", gap: 24, marginTop: 16 }}>
        {/* My Questions */}
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#9CA3AF" }}>MY QUESTIONS</div>
          <div style={{ marginTop: 8, fontSize: 13, color: C.navy }}>
            Total <span style={{ fontWeight: 700 }}>5</span>
          </div>
          <div style={{
            display: "flex", height: 10, borderRadius: 5, overflow: "hidden",
            marginTop: 10, background: C.border,
          }}>
            <div style={{ width: "60%", background: C.green }} />
            <div style={{ width: "20%", background: C.orange }} />
            <div style={{ width: "20%", background: C.red }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 11 }}>
            <Legend dot={C.green} label="On Track 3" />
            <Legend dot={C.orange} label="At Risk 1" />
            <Legend dot={C.red} label="Blocked 1" />
            <Legend dot="#D1D5DB" label="Not Started 0" outline />
          </div>
        </div>

        {/* Section Health */}
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#9CA3AF" }}>SECTION HEALTH</div>
          <div style={{ marginTop: 10 }}>
            <Bar label="1.0 Program Approach" pct={78} color={C.green} />
            <Bar label="2.0 Care Coordination" pct={61} color={C.orange} warn />
            <Bar label="3.0 Quality & Performance" pct={88} color={C.green} />
            <Bar label="4.0 Data & Reporting" pct={72} color={C.green} />
            <Bar label="5.0 Implementation" pct={45} color={C.orange} warn />
          </div>
        </div>

        {/* Mission Health */}
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 600, color: "#9CA3AF" }}>MISSION HEALTH</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Overall Progress</div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <Donut pct={67} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>Days to Due Date</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Calendar size={14} style={{ color: C.navy }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>58 Days</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Legend({ dot, label, outline }: { dot: string; label: string; outline?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: "50%",
          background: outline ? "transparent" : dot,
          border: outline ? `1.5px solid ${dot}` : "none",
        }}
      />
      <span style={{ color: C.text }}>{label}</span>
    </div>
  );
}

function Bar({ label, pct, color, warn }: { label: string; pct: number; color: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, height: 24 }}>
      <span style={{ flex: "0 0 160px", fontSize: 12, color: C.text }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 32, textAlign: "right" }}>{pct}%</span>
      {warn ? <AlertTriangle size={12} style={{ color: C.orange }} /> : <span style={{ width: 12 }} />}
    </div>
  );
}

function Donut({ pct }: { pct: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div style={{ position: "relative", width: 80, height: 80 }}>
      <svg width={80} height={80}>
        <circle cx={40} cy={40} r={r} fill="none" stroke={C.border} strokeWidth={10} />
        <circle
          cx={40} cy={40} r={r} fill="none" stroke={C.green} strokeWidth={10}
          strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 40 40)" strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.navy, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>On Track</div>
      </div>
    </div>
  );
}

// ===== Question Workspace =====
type QRow = { num: string; title: string; priority: "HIGH" | "MEDIUM" | "LOW" };
const QUESTIONS: QRow[] = [
  { num: "3.2.1", title: "Care Coordination Approach", priority: "HIGH" },
  { num: "3.4.2", title: "Provider Network Adequacy", priority: "MEDIUM" },
  { num: "4.1.1", title: "Quality Strategy", priority: "HIGH" },
  { num: "2.3.1", title: "Population Health", priority: "MEDIUM" },
  { num: "5.1.2", title: "Implementation Plan", priority: "LOW" },
];

const PRI: Record<QRow["priority"], { bg: string; fg: string }> = {
  HIGH: { bg: "#FEE2E2", fg: "#DC2626" },
  MEDIUM: { bg: "#FEF3C7", fg: "#D97706" },
  LOW: { bg: "#D1FAE5", fg: "#059669" },
};

function QuestionWorkspace({
  selected, setSelected,
}: { selected: string; setSelected: (n: string) => void }) {
  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>QUESTION WORKSPACE</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Your mission operations hub. You do the writing in the client environment.
          </div>
        </div>
        <a style={{ fontSize: 12, color: C.blue, cursor: "pointer" }}>View My Questions</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr", gap: 16, padding: "16px 20px" }}>
        {/* My Questions */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            textTransform: "uppercase", marginBottom: 8,
          }}>
            MY QUESTIONS <ChevronDown size={12} />
          </div>
          {QUESTIONS.map((q) => {
            const sel = q.num === selected;
            const pri = PRI[q.priority];
            return (
              <div
                key={q.num}
                onClick={() => setSelected(q.num)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: 48, padding: "10px 12px", borderRadius: 6,
                  background: sel ? C.navy : "transparent", marginBottom: 4,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: sel ? "#fff" : C.text }}>{q.num}</span>
                <span style={{ flex: 1, fontSize: 12, color: sel ? "#fff" : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {q.title}
                </span>
                <span
                  style={{
                    background: pri.bg, color: pri.fg, fontSize: 10, fontWeight: 700,
                    padding: "3px 6px", borderRadius: 4, textTransform: "uppercase",
                  }}
                >
                  {q.priority === "HIGH" ? "High" : q.priority === "MEDIUM" ? "Medium" : "Low"}
                </span>
              </div>
            );
          })}
          <a style={{ display: "block", paddingTop: 8, fontSize: 12, color: C.blue, cursor: "pointer" }}>View all questions</a>
        </div>

        {/* Assignment Snapshot */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <Users size={16} style={{ color: C.muted }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>
              ASSIGNMENT SNAPSHOT
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted }}>Question</div>
              <a style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.blue, marginTop: 4, cursor: "pointer" }}>
                3.2.1 Care Coordination Approach
              </a>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>Owner</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Avatar initial="M" size={20} />
                <span style={{ fontSize: 12, color: C.navy }}>M.</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>Supporting SMEs</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <Avatar initial="A" size={24} bg="#fb923c" />
                <Avatar initial="B" size={24} bg="#a78bfa" overlap />
                <Avatar initial="C" size={24} bg="#34d399" overlap />
                <span style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: C.borderLight, color: C.muted,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, marginLeft: -6, border: "2px solid #fff",
                }}>+2</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted }}>Due Date</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Calendar size={14} style={{ color: C.orange }} />
                <span style={{ fontSize: 13, color: C.navy }}>May 22, 2025</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>In Progress</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>Confidence</div>
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4,
                  background: "#FEF3C7", color: "#D97706", fontSize: 12,
                  padding: "3px 10px", borderRadius: 12, cursor: "pointer",
                }}
              >
                Uncertain <ChevronDown size={12} />
              </div>
            </div>
          </div>
        </div>

        {/* Line of Sight */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Phone size={16} style={{ color: C.muted }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>
              LINE OF SIGHT
            </span>
          </div>
          <LosRow icon={<Link2 size={16} />} label="Dependencies" value="2 questions" link />
          <LosRow icon={<LayoutGrid size={16} />} label="Related Section" value="3.2 Care Coordination" link />
          <LosRow icon={<Dots size={16} />} label="Neighbors" value="3.2.2, 3.2.3" link />
          <LosRow icon={<MessageSquare size={16} />} label="Recent Activity" value="2 updates today" />
        </div>
      </div>

      {/* Mission Intelligence */}
      <div style={{
        background: C.bg, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        padding: "14px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lightbulb size={16} style={{ color: C.iris }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>MISSION INTELLIGENCE</span>
          <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginLeft: 6 }}>
            Live intelligence for this question. Data is generated for Q3.2.1 using buildMissionContext(missionId, questionId).
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", marginTop: 10 }}>
          <IntelTile icon={<FileText size={16} style={{ color: C.muted }} />} title="Question Brief" sub="What this question is really asking" />
          <IntelTile icon={<ListChecks size={16} style={{ color: C.muted }} />} title="Key Requirements" sub="Must-haves and constraints" />
          <IntelTile icon={<Zap size={16} style={{ color: C.iris }} fill="currentColor" />} title="IRIS Insights" sub="Relevant intelligence and patterns" />
          <IntelTile icon={<Flag size={16} style={{ color: C.muted }} />} title="Win Themes" sub="How we will win this" />
          <IntelTile icon={<AlertTriangle size={16} style={{ color: C.orange }} />} title="Risks & Considerations" sub="What to watch for" last />
        </div>
      </div>

      {/* External Workspace */}
      <div style={{
        background: "#fff", borderTop: `1px solid ${C.border}`,
        padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
            EXTERNAL WORKSPACE
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>(Where writing happens)</span>
            <ExternalLink size={12} style={{ color: C.muted }} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Open your client environment to create or update your response.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ExtBtn glyph="S" bg="#107C41" label="SharePoint" />
          <ExtBtn glyph="O" bg="#0EA5E9" label="Loopio" round />
          <ExtBtn glyph="Q" bg="#7C3AED" label="Qvidian" />
          <ExtBtn glyph="W" bg="#2563EB" label="Word" />
          <ExtBtn glyph="···" bg="#9CA3AF" label="Other" />
        </div>
      </div>
    </Card>
  );
}

function Avatar({ initial, size, bg = "#94a3b8", overlap }: { initial: string; size: number; bg?: string; overlap?: boolean }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%",
        background: bg, color: "#fff", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        fontSize: size < 22 ? 10 : 11, fontWeight: 700,
        marginLeft: overlap ? -6 : 0, border: "2px solid #fff",
      }}
    >
      {initial}
    </span>
  );
}

function LosRow({ icon, label, value, link }: { icon: React.ReactNode; label: string; value: string; link?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <span style={{ color: C.muted }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
        <div style={{ fontSize: 12, color: link ? C.blue : C.muted, marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function IntelTile({ icon, title, sub, last }: { icon: React.ReactNode; title: string; sub: string; last?: boolean }) {
  return (
    <div style={{
      padding: "4px 16px",
      borderRight: last ? "none" : `1px solid ${C.border}`,
      cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</span>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4, marginLeft: 24 }}>{sub}</div>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, marginLeft: 24 }}>Last updated: 9:41 AM</div>
    </div>
  );
}

function ExtBtn({ glyph, bg, label, round }: { glyph: string; bg: string; label: string; round?: boolean }) {
  return (
    <button style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6,
      padding: "10px 16px", fontSize: 13, fontWeight: 500, color: C.text, cursor: "pointer",
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: round ? "50%" : 4,
        background: bg, color: "#fff", fontSize: 11, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>{glyph}</span>
      {label}
    </button>
  );
}

// ===== Air Traffic Control =====
function AirTrafficControl() {
  return (
    <Card style={{ marginTop: 16, padding: "20px 0 0" }}>
      <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>AIR TRAFFIC CONTROL</span>
        <span style={{ fontSize: 12, color: C.muted }}>Leadership has you on their screen.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderTop: `1px solid ${C.borderLight}` }}>
        <AtcCol label="SOS STATUS" badge="1 Open" badgeBg="#FEE2E2" badgeFg={C.red}
          line1="Direction Needed" line2="Submitted 45m ago" arrow />
        <AtcCol label="LEADERSHIP DECISIONS" badge="2 New" badgeBg="#DBEAFE" badgeFg={C.blue}
          line1="Decision on 3.4.2" line2="Approved · 1h ago" check arrow />
        <AtcCol label="MISSION UPDATES" badge="1 New" badgeBg="#DBEAFE" badgeFg={C.blue}
          line1="RFP Clarification Posted" line2="2h ago" arrow />
        <AtcCol label="NEW INTELLIGENCE" badge="3 New" badgeBg="#EDE9FE" badgeFg={C.iris}
          line1="NJ CSOC Policy Update" line2="1h ago" arrow />
        <AtcCol label="ESCALATIONS" badge="0 Open" badgeBg="#D1FAE5" badgeFg="#059669"
          line1="All clear" line2="Good to go" check checkGreen last />
      </div>
    </Card>
  );
}

function AtcCol({
  label, badge, badgeBg, badgeFg, line1, line2, check, checkGreen, arrow, last,
}: {
  label: string; badge: string; badgeBg: string; badgeFg: string;
  line1: string; line2: string; check?: boolean; checkGreen?: boolean; arrow?: boolean; last?: boolean;
}) {
  return (
    <div style={{ padding: 16, borderRight: last ? "none" : `1px solid ${C.borderLight}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        display: "inline-block", marginTop: 8,
        background: badgeBg, color: badgeFg, fontSize: 10, fontWeight: 700,
        padding: "3px 8px", borderRadius: 10,
      }}>{badge}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{line1}</div>
        {arrow && <ChevronRight size={16} style={{ color: "#9CA3AF" }} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: checkGreen ? "#059669" : C.muted, marginTop: 4 }}>
        {check && <Check size={12} style={{ color: C.green }} />}
        {line2}
      </div>
    </div>
  );
}

// ===== IRIS Dock =====
function IrisDock() {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      background: "#0F172A", borderRadius: 12, padding: "12px 16px",
      width: 200, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      cursor: "pointer", zIndex: 50,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, boxShadow: "0 0 8px rgba(22,163,74,0.6)" }} />
        </span>
        <Settings size={14} style={{ color: C.sidebarMuted }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <span style={{
          fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#fff",
          background: "rgba(255,255,255,0.08)", padding: "3px 8px", borderRadius: 4,
        }}>⌘J</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>IRIS DOCK</div>
          <div style={{ fontSize: 11, color: C.sidebarMuted }}>Ask anything, anywhere</div>
        </div>
      </div>
    </div>
  );
}

// ===== Page =====
function FlightDeckPage() {
  const [selected, setSelected] = useState<string>("3.2.1");

  return (
    <div style={{ display: "flex", background: C.bg, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: C.text }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopHeader selectedQ={selected} />
        <main style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "32fr 68fr", gap: 16 }}>
            <FlightStatus />
            <MissionRadar />
          </div>
          <QuestionWorkspace selected={selected} setSelected={setSelected} />
          <AirTrafficControl />
          <div style={{ height: 80 }} />
        </main>
      </div>
      <IrisDock />
    </div>
  );
}
