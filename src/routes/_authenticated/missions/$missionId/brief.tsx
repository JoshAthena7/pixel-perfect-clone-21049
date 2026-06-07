import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plane,
  Clock, Activity, DollarSign, Users, Target, Trophy, ShieldCheck, AlertTriangle,
  FileText, Building2, Megaphone, Swords, ArrowRight, Maximize2,
  Zap, CheckCircle2, Bell, Gavel, Calendar, XCircle,
  Check, Circle, Link2,
} from "lucide-react";
import { useMissionBrief, useCurrentProfile, type MissionBrief } from "@/lib/mission-brief-data";


export const Route = createFileRoute("/_authenticated/missions/$missionId/brief")({
  ssr: false,
  component: MissionBriefingRoomPage,
});

/* ════════════════ DESIGN TOKENS — DARK ════════════════ */
const C = {
  bg: "#060b14",
  bgSoft: "#0a121d",
  card: "#0f1722",
  navy: "#13233d",
  navyDeep: "#0a1322",
  gold: "#E0B341",
  goldLight: "#F0C95A",
  goldTint: "rgba(224,179,65,0.10)",
  iris: "#818CF8",
  green: "#34D399",
  orange: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.05)",
  textPrimary: "#E6EDF7",
  textBody: "#C0CAD8",
  textMuted: "#8B95A5",
  textFaint: "#64748B",
};

const card: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
  color: C.textPrimary, textTransform: "uppercase",
};

const subLabel: React.CSSProperties = {
  fontSize: 12, color: C.textMuted, marginTop: 2,
};

const linkBlue: React.CSSProperties = {
  color: C.blue, fontSize: 12, fontWeight: 500,
  display: "inline-flex", alignItems: "center", gap: 4,
};

const empty: React.CSSProperties = {
  fontSize: 12, color: C.textMuted, fontStyle: "italic", lineHeight: 1.5,
};

const AVATAR_FALLBACK = ["#F8B595", "#A29BFE", "#FAB1A0", "#74B9FF", "#FFEAA7", "#81ECEC", "#FAB7E0"];

/* ════════════════ PAGE ════════════════ */
function MissionBriefingRoomPage() {
  const { missionId } = Route.useParams();
  const { data: brief, isLoading, error } = useMissionBrief(missionId);
  const { data: profile } = useCurrentProfile();

  useEffect(() => {
    try { localStorage.setItem(`atlas.lastRoom.${missionId}`, "briefing"); } catch {}
    let userId: string | null = null;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { markBriefSeen } = await import("@/lib/brief-seen");
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          userId = data.user.id;
          markBriefSeen(data.user.id, missionId);
        }
      } catch { /* noop */ }
    })();

    const onScroll = async () => {
      const scrolled = window.scrollY + window.innerHeight;
      const full = document.documentElement.scrollHeight;
      if (full - scrolled > 200) return;
      window.removeEventListener("scroll", onScroll);
      try {
        const { markBriefCompleted } = await import("@/lib/brief-seen");
        if (userId) markBriefCompleted(userId, missionId);
      } catch { /* noop */ }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [missionId]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName =
    (profile?.display_name ?? "").trim().split(/\s+/)[0] || "Team";

  if (isLoading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.textPrimary, padding: 40, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ color: C.textMuted, fontSize: 13 }}>Loading mission brief…</div>
      </div>
    );
  }
  if (error || !brief) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.textPrimary, padding: 40, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ color: C.red, fontSize: 14, fontWeight: 600 }}>Couldn't load mission brief.</div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>{(error as Error | undefined)?.message ?? "Mission not found."}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", color: C.textPrimary,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    }}>
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px", overflowX: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(280px,1fr)", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Hero missionId={missionId} brief={brief} />
            <MissionLeaders brief={brief} />
            <MissionObjective brief={brief} />
            <StrategicBrief brief={brief} />
            <ThreeColumnRow missionId={missionId} brief={brief} />
            <MissionMap missionId={missionId} brief={brief} />
            <BottomPanels missionId={missionId} brief={brief} />
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 20 }}>
            <IrisMissionBrief greeting={greeting} firstName={firstName} missionId={missionId} brief={brief} />
            <MissionHealthCard missionId={missionId} brief={brief} />
            <YoureBriefedCard missionId={missionId} />
          </aside>
        </div>
      </main>
    </div>
  );
}


/* ════════════════ HERO ════════════════ */
function Hero({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const m = brief.mission;
  const subtitle = [m.state, m.state_agency].filter(Boolean).join(" · ");
  const days = brief.daysToSubmission;
  const daysValue = days == null ? "—" : days < 0 ? "Past due" : String(days);
  const daysSub = m.submission_date
    ? new Date(m.submission_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "No date set";
  const statusText = (m.status ?? "Active").toUpperCase();
  const healthColor =
    m.health === "Green" ? C.green : m.health === "Red" ? C.red : C.orange;

  return (
    <div style={{ ...card, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, display: "flex", gap: 16, alignItems: "center" }}>
          <ClientLogoSlot missionId={missionId} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.iris, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
              Mission Briefing Room
            </div>
            <h1 style={{
              fontSize: 24, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2,
              margin: 0, letterSpacing: "-0.01em",
            }}>
              {m.name}
            </h1>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
              {[m.client, subtitle].filter(Boolean).join(" · ") || "Unknown client"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, alignItems: "center", flexShrink: 0 }}>
          <HeaderStat label="Days to Submission" value={daysValue} sub={daysSub} />
          <HeaderStat label="Status" valueNode={<StatusPill text={statusText} color={healthColor} />} sub={`Health: ${m.health ?? "Unknown"}`} />
          <HeaderStat label="Team" value={String(brief.team.length)} sub={brief.team.length === 0 ? "No team yet" : `${brief.team.length} assigned`} />
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value, valueNode, sub }: { label: string; value?: string; valueNode?: React.ReactNode; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1 }}>
        {valueNode ?? value}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{sub}</div>
    </div>
  );
}

function ClientLogoSlot({ missionId }: { missionId: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("missions")
        .select("client_logo_url")
        .eq("id", missionId)
        .maybeSingle();
      if (cancelled) return;
      const path = (data?.client_logo_url as string | null) ?? null;
      if (path) {
        const { data: signed } = await supabase
          .storage.from("mission-logos")
          .createSignedUrl(path, 60 * 60);
        if (!cancelled) setSignedUrl(signed?.signedUrl ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [missionId]);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${missionId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage.from("mission-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("missions")
        .update({ client_logo_url: path })
        .eq("id", missionId);
      if (dbErr) throw dbErr;
      const { data: signed } = await supabase
        .storage.from("mission-logos")
        .createSignedUrl(path, 60 * 60);
      setSignedUrl(signed?.signedUrl ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const box: React.CSSProperties = {
    width: 88, height: 88, borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: `1px dashed ${C.border}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, overflow: "hidden", position: "relative",
  };

  if (signedUrl) {
    return (
      <label style={{ ...box, borderStyle: "solid", background: "#fff", cursor: "pointer" }} title="Replace client logo">
        <img src={signedUrl} alt="Client logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 8 }} />
        <input type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      </label>
    );
  }

  return (
    <label style={{ ...box, cursor: uploading ? "wait" : "pointer" }} title="Upload client logo">
      <div style={{ textAlign: "center", padding: 6 }}>
        <div style={{ fontSize: 18, color: C.textMuted, lineHeight: 1 }}>+</div>
        <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {uploading ? "Uploading…" : "Client logo"}
        </div>
        {error && <div style={{ fontSize: 9, color: C.red, marginTop: 4 }}>{error}</div>}
      </div>
      <input type="file" accept="image/*" disabled={uploading} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
    </label>
  );
}


function MetricChip({ icon, label, value, valueNode, sub }: { icon: React.ReactNode; label: string; value?: string; valueNode?: React.ReactNode; sub: string }) {
  return (
    <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {icon} {label}
      </div>
      {valueNode ?? <div style={{ fontSize: 24, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1 }}>{value}</div>}
      <div style={{ fontSize: 12, color: C.textMuted }}>{sub}</div>
    </div>
  );
}
function MetricDivider() {
  return <div style={{ width: 1, background: C.border, alignSelf: "center", height: 36 }} />;
}
function StatusPill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999,
      background: `${color}1f`, color, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      marginTop: 2, width: "fit-content",
    }}>{text}</span>
  );
}

/* ════════════════ MISSION OBJECTIVE ════════════════ */
function MissionObjective({ brief }: { brief: MissionBrief }) {
  const m = brief.mission;
  // Prefer program_goals, fall back to first paragraph of description.
  const quote =
    m.program_goals?.trim() ||
    m.mission_highlights?.trim() ||
    (m.description ?? "").split(/\n\n/)[0]?.trim() ||
    "No mission objective set yet. Add one in Mission Settings.";
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
        {quote}
      </div>
    </div>
  );
}

/* ════════════════ STRATEGIC BRIEF ════════════════ */
function StrategicBrief({ brief }: { brief: MissionBrief }) {
  const m = brief.mission;
  const objective =
    m.client_win_strategy?.trim() ||
    m.mission_highlights?.trim() ||
    (m.description ?? "").split(/\n\n/)[0]?.trim() ||
    null;

  const winThemes = brief.winThemes.length
    ? brief.winThemes.map((t) => t.title)
    : m.win_themes ?? [];
  const requirements = m.key_requirements ?? [];
  const risks = brief.risks.map((r) => r.title);

  const cols: Array<{
    icon: React.ReactNode;
    heading: string;
    sub: string;
    body?: string | null;
    bullets?: string[];
    emptyHint: string;
  }> = [
    {
      icon: <Target size={22} style={{ color: C.green }} />,
      heading: "WHAT ARE WE TRYING TO WIN?", sub: "Mission Objective",
      body: objective,
      emptyHint: "Add a win strategy in Mission Settings.",
    },
    {
      icon: <Trophy size={22} style={{ color: C.gold }} />,
      heading: "WHY WILL WE WIN?", sub: "Win Themes",
      bullets: winThemes,
      emptyHint: "No win themes yet. Add in Settings → Themes.",
    },
    {
      icon: <ShieldCheck size={22} style={{ color: C.blue }} />,
      heading: "WHAT MUST BE TRUE?", sub: "Critical Requirements",
      bullets: requirements,
      emptyHint: "No key requirements captured yet.",
    },
    {
      icon: <AlertTriangle size={22} style={{ color: C.red }} />,
      heading: "WHAT COULD HURT US?", sub: "Mission Risks",
      bullets: risks,
      emptyHint: "No risks logged yet.",
    },
  ];

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={sectionLabel}>Strategic Brief</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", marginTop: 16, gap: 0 }}>
        {cols.map((c, i) => {
          const hasBody = !!c.body;
          const hasBullets = c.bullets && c.bullets.length > 0;
          return (
            <div key={c.heading} style={{
              padding: i === 0 ? "0 18px 0 0" : i === 3 ? "0 0 0 18px" : "0 18px",
              borderRight: i < 3 ? `1px solid ${C.borderLight}` : "none",
            }}>
              <div style={{ marginBottom: 10 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, letterSpacing: "0.02em", marginBottom: 2 }}>
                {c.heading}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10 }}>{c.sub}</div>
              {hasBody && (
                <p style={{ fontSize: 12, color: C.textBody, lineHeight: 1.6, margin: 0 }}>{c.body}</p>
              )}
              {hasBullets && (
                <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 16 }}>
                  {c.bullets!.slice(0, 6).map((b) => (
                    <li key={b} style={{ fontSize: 12, color: C.textBody, lineHeight: 1.6 }}>{b}</li>
                  ))}
                </ul>
              )}
              {!hasBody && !hasBullets && (
                <div style={empty}>{c.emptyHint}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════ THREE COLUMN ROW ════════════════ */
function ThreeColumnRow({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
      <WinThemesAlignment missionId={missionId} brief={brief} />
      <OracleBriefing missionId={missionId} brief={brief} />
      <ClarificationsAndWhatChanged missionId={missionId} brief={brief} />
    </div>
  );
}

function WinThemesAlignment({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const themes = brief.winThemes;
  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>WIN THEMES ALIGNMENT</div>
        <div style={subLabel}>How we will win this mission.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {themes.length === 0 ? (
          <div style={empty}>No win themes captured yet. Add them in Settings → Themes.</div>
        ) : (
          themes.slice(0, 6).map((t) => (
            <div key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.textBody }}>{t.title}</span>
                {t.key_message && (
                  <span style={{ fontSize: 11, color: C.textMuted, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.key_message}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <Link to="/missions/$missionId/settings" params={{ missionId }} search={{ tab: "themes" }} style={linkBlue}>
        View all win themes <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function OracleBriefing({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const signals = brief.signals;
  return (
    <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>ORACLE BRIEFING</div>
        <div style={subLabel}>Key intelligence and insights.</div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.iris, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          Top Insights
        </div>
        {signals.length === 0 ? (
          <div style={empty}>IRIS hasn't surfaced any signals for this mission yet.</div>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {signals.slice(0, 3).map((s, i) => (
              <li key={s.id} style={{ display: "flex", gap: 8, fontSize: 12, color: C.textBody, lineHeight: 1.6 }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: 999,
                  background: "rgba(99,102,241,0.12)", color: C.iris,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, marginTop: 1,
                }}>{i + 1}</span>
                <span>{s.signal_title || s.signal_summary || "Untitled signal"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Link to="/missions/$missionId/briefing" params={{ missionId }} style={linkBlue}>Go to Oracle <ArrowRight size={12} /></Link>
    </div>
  );
}

function ClarificationsAndWhatChanged({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const clarifications = brief.clarifications;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>CLIENT CLARIFICATIONS</div>
            <div style={subLabel}>Latest from the state.</div>
          </div>
          <Link to="/missions/$missionId/intel" params={{ missionId }} style={linkBlue}>View all <ArrowRight size={12} /></Link>
        </div>
        {clarifications.length === 0 ? (
          <div style={empty}>No clarifications submitted yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {clarifications.slice(0, 4).map((c, i) => (
              <div key={c.id} style={{
                display: "flex", gap: 10, padding: "10px 0",
                borderBottom: i < Math.min(clarifications.length, 4) - 1 ? `1px solid ${C.borderLight}` : "none",
              }}>
                <FileText size={14} style={{ color: C.iris, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: C.textPrimary }}>
                    <span style={{ fontWeight: 700 }}>#{c.number}</span>{" "}
                    <span style={{ color: C.textMuted }}>{formatRelative(c.submitted_at ?? c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textBody, lineHeight: 1.5, marginTop: 2 }}>{c.question}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>WHAT CHANGED</div>
            <div style={subLabel}>Recent mission activity.</div>
          </div>
          <Link to="/missions/$missionId/overview" params={{ missionId }} style={linkBlue}>View all <ArrowRight size={12} /></Link>
        </div>
        {brief.signals.length === 0 && brief.clarifications.length === 0 ? (
          <div style={empty}>No recent activity to show.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ...brief.signals.slice(0, 3).map((s) => ({
                key: `sig-${s.id}`,
                dot: severityColor(s.severity),
                type: s.signal_type ? s.signal_type.toUpperCase() : "IRIS INSIGHT",
                text: s.signal_title || s.signal_summary || "Signal recorded",
                time: formatRelative(s.created_at),
              })),
              ...brief.clarifications.slice(0, 2).map((c) => ({
                key: `clar-${c.id}`,
                dot: C.blue,
                type: `CLARIFICATION #${c.number}`,
                text: c.question,
                time: formatRelative(c.submitted_at ?? c.created_at),
              })),
            ].slice(0, 4).map((c) => (
              <div key={c.key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dot, marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{c.type}</div>
                  <div style={{ fontSize: 12, color: C.textBody, lineHeight: 1.5 }}>{c.text}</div>
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, marginTop: 2 }}>{c.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════ MISSION MAP ════════════════ */
type MapStatus = "completed" | "ontrack" | "atrisk" | "notstarted" | "blocked";

function deriveSectionStatus(done: number, total: number, studio?: string | null): MapStatus {
  if (total === 0) return "notstarted";
  if (done === total) return "completed";
  const studioLower = (studio ?? "").toLowerCase();
  if (studioLower.includes("risk")) return "atrisk";
  if (studioLower.includes("block")) return "blocked";
  if (done === 0) return "notstarted";
  return "ontrack";
}

function MissionMap({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const [view, setView] = useState<"sections" | "status" | "owner">("sections");

  const sections = brief.sections.map((s) => {
    const status = deriveSectionStatus(s.question_done, s.question_total, s.studio_status);
    const label =
      status === "completed" ? "Completed" :
      status === "atrisk" ? "At Risk" :
      status === "blocked" ? "Blocked" :
      status === "notstarted" ? "Not Started" : "On Track";
    return {
      num: s.number,
      name: s.title,
      status,
      count: `${s.question_done} / ${s.question_total}`,
      label,
    };
  });

  const dot = (s: MapStatus) =>
    s === "completed" || s === "ontrack" ? C.green :
    s === "atrisk" ? C.orange :
    s === "blocked" ? C.red : "rgba(255,255,255,0.18)";

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
                background: view === v ? C.gold : "transparent",
                color: view === v ? "#0a1220" : C.textMuted,
                border: "none", cursor: "pointer",
              }}>{v}</button>
            ))}
          </div>
          <Link to="/missions/$missionId/sections" params={{ missionId }} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center" }} title="Open Sections">
            <Maximize2 size={14} />
          </Link>
        </div>
      </div>

      {sections.length === 0 ? (
        <div style={{ ...empty, marginTop: 24, textAlign: "center", padding: "24px 0" }}>
          No sections defined yet. Build the section map in <Link to="/missions/$missionId/sections" params={{ missionId }} style={{ color: C.blue }}>Sections</Link>.
        </div>
      ) : (
        <div style={{ position: "relative", marginTop: 22, padding: "0 8px" }}>
          <div style={{
            position: "absolute", left: "8%", right: "8%", top: 78, height: 2,
            background: C.borderLight,
          }} />
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${sections.length},1fr)`, gap: 4 }}>
            {sections.map((s) => (
              <div key={s.num} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 4px" }}>
                <div style={{ fontSize: 11, color: C.textMuted }}>{s.num}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, lineHeight: 1.25, minHeight: 30, marginTop: 2 }}>{s.name}</div>
                <div style={{
                  marginTop: 8, width: 18, height: 18, borderRadius: 999, background: dot(s.status),
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  border: `3px solid ${C.card}`, boxShadow: `0 0 0 2px ${dot(s.status)}`,
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
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 18, fontSize: 11, color: C.textMuted, flexWrap: "wrap" }}>
          <Legend dot={C.green} label="On Track" />
          <Legend dot={C.orange} label="At Risk" tri />
          <Legend dot={C.red} label="Blocked" />
          <Legend dot="rgba(255,255,255,0.18)" label="Not Started" hollow />
          <Legend dot={C.green} label="Completed" check />
        </div>
        <Link to="/missions/$missionId/sections" params={{ missionId }} style={linkBlue}>View Full Question List <ArrowRight size={12} /></Link>
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
function BottomPanels({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const panelCard: React.CSSProperties = {
    ...card, padding: 16, display: "block", color: "inherit",
    textDecoration: "none", cursor: "pointer",
  };
  const team = brief.team;
  const shownAvatars = team.slice(0, 5);
  const overflow = Math.max(0, team.length - shownAvatars.length);

  const q = brief.questions;
  const completedPct = q.total > 0 ? Math.round((q.by_status.complete / q.total) * 100) : 0;
  const assignedPct = q.total > 0 ? Math.round((q.assigned / q.total) * 100) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
      {/* Team */}
      <Link to="/missions/$missionId/settings" params={{ missionId }} search={{ tab: "team" }} style={panelCard}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>TEAM OVERVIEW</div>
        <div style={subLabel}>People and roles.</div>
        {team.length === 0 ? (
          <div style={{ ...empty, marginTop: 14 }}>No team members yet. Invite people in Settings → Team.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
              {shownAvatars.map((m, i) => {
                const initials = (m.display_name || "?").split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
                const bg = m.avatar_color || AVATAR_FALLBACK[i % AVATAR_FALLBACK.length];
                return (
                  <div key={m.user_id} title={m.display_name || ""} style={{
                    width: 32, height: 32, borderRadius: "50%", background: bg,
                    border: `2px solid ${C.card}`, marginLeft: i === 0 ? 0 : -8,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#0a1220",
                    overflow: "hidden",
                  }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : initials}
                  </div>
                );
              })}
              {overflow > 0 && (
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.10)",
                  border: `2px solid ${C.card}`, marginLeft: -8, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: C.textBody,
                }}>+{overflow}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 10 }}>
              {team.length} member{team.length === 1 ? "" : "s"}
            </div>
          </>
        )}
      </Link>

      {/* Vault */}
      <Link to="/missions/$missionId/vault" params={{ missionId }} style={panelCard}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>VAULT</div>
        <div style={subLabel}>Mission resources.</div>
        <div style={{ marginTop: 14, fontSize: 36, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>
          {brief.vaultCount}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
          {brief.vaultCount === 0 ? "No documents uploaded" : `document${brief.vaultCount === 1 ? "" : "s"} on file`}
        </div>
      </Link>

      {/* Questions */}
      <Link to="/missions/$missionId/sections" params={{ missionId }} style={panelCard}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>QUESTIONS & SECTIONS</div>
        <div style={subLabel}>Scope and progress.</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.textBody }}>
          <Row k="Total Questions" v={String(q.total)} />
          <Row k="Total Sections" v={String(brief.sections.length)} />
          <Row k="Assigned" v={`${q.assigned} (${assignedPct}%)`} />
          <Row k="At Risk" v={String(q.by_health.red)} tone={q.by_health.red > 0 ? "red" : undefined} />
          <Row k="Unassigned" v={String(q.unassigned)} />
          <Row k="Completed" v={`${q.by_status.complete} (${completedPct}%)`} />
        </div>
      </Link>

      {/* Oracle */}
      <Link to="/missions/$missionId/briefing" params={{ missionId }} style={panelCard}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>ORACLE</div>
        <div style={subLabel}>Deep dive into intelligence.</div>
        <div style={{ marginTop: 14, fontSize: 36, fontWeight: 800, color: C.textPrimary, lineHeight: 1 }}>
          {brief.signals.length}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
          {brief.signals.length === 0 ? "No signals yet" : `signal${brief.signals.length === 1 ? "" : "s"} from IRIS`}
        </div>
      </Link>
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


/* ════════════════ RIGHT COLUMN ════════════════ */
function IrisMissionBrief({ greeting, firstName, missionId, brief }: { greeting: string; firstName: string; missionId: string; brief: MissionBrief }) {
  const alerts = useMemo(() => {
    const out: Array<{ icon: React.ReactNode; title: string; titleColor: string; text: string; to: string }> = [];
    const healthColor = brief.mission.health === "Green" ? C.green : brief.mission.health === "Red" ? C.red : C.orange;
    out.push({
      icon: brief.mission.health === "Green"
        ? <CheckCircle2 size={16} style={{ color: C.green }} />
        : <AlertTriangle size={16} style={{ color: healthColor }} />,
      title: `Mission Health: ${brief.mission.health ?? "Unknown"}`,
      titleColor: healthColor,
      text:
        brief.mission.health === "Green" ? "Progress is on track across most areas." :
        brief.mission.health === "Red" ? "Multiple sections need urgent attention." :
        "Some sections need attention.",
      to: "/missions/$missionId/overview",
    });
    if (brief.questions.by_health.red > 0) {
      out.push({
        icon: <AlertTriangle size={16} style={{ color: C.orange }} />,
        title: `${brief.questions.by_health.red} Question${brief.questions.by_health.red === 1 ? "" : "s"} at Risk`,
        titleColor: C.orange,
        text: "Open Sections to triage and reassign.",
        to: "/missions/$missionId/sections",
      });
    }
    const latestClar = brief.clarifications[0];
    if (latestClar) {
      out.push({
        icon: <FileText size={16} style={{ color: C.blue }} />,
        title: `Client Clarification #${latestClar.number}`,
        titleColor: C.blue,
        text: latestClar.question.length > 80 ? latestClar.question.slice(0, 80) + "…" : latestClar.question,
        to: "/missions/$missionId/intel",
      });
    }
    if (brief.risks.length > 0) {
      out.push({
        icon: <Link2 size={16} style={{ color: C.red }} />,
        title: `${brief.risks.length} Risk${brief.risks.length === 1 ? "" : "s"} Tracked`,
        titleColor: C.red,
        text: brief.risks[0].title,
        to: "/missions/$missionId/overview",
      });
    }
    if (brief.questions.unassigned > 0 && out.length < 4) {
      out.push({
        icon: <Users size={16} style={{ color: C.textMuted }} />,
        title: `${brief.questions.unassigned} Unassigned Question${brief.questions.unassigned === 1 ? "" : "s"}`,
        titleColor: C.textBody,
        text: "Assign owners to keep things moving.",
        to: "/missions/$missionId/sections",
      });
    }
    return out.slice(0, 4);
  }, [brief]);

  const recommended = useMemo(() => {
    if (brief.questions.by_health.red > 0) {
      return "Triage at-risk questions in Sections before they slip further.";
    }
    if (brief.questions.unassigned > 0) {
      return `Assign owners to ${brief.questions.unassigned} unassigned question${brief.questions.unassigned === 1 ? "" : "s"}.`;
    }
    if (brief.team.length <= 1) {
      return "Invite teammates so you're not flying solo.";
    }
    if (brief.winThemes.length === 0) {
      return "Capture win themes so the team writes to the same north star.";
    }
    return "Review the Mission Map below and confirm section ownership.";
  }, [brief]);

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
        {alerts.length === 0 ? (
          <div style={empty}>Nothing urgent. Nice work.</div>
        ) : alerts.map((a, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, padding: "10px 0",
            borderBottom: i < alerts.length - 1 ? `1px solid ${C.borderLight}` : "none",
          }}>
            <div style={{ marginTop: 1, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <Link to={a.to as any} params={{ missionId } as any} style={{ fontSize: 12, fontWeight: 700, color: a.titleColor, textDecoration: "none" }}>{a.title}</Link>
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
          {recommended}
        </div>
        <Link to="/missions/$missionId/sections" params={{ missionId }} style={{
          display: "inline-block", marginTop: 10, background: "transparent", color: C.textBody, fontSize: 12,
          padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, cursor: "pointer", fontWeight: 500,
          textDecoration: "none",
        }}>View Details</Link>
      </div>
    </div>
  );
}

function MissionHealthCard({ missionId, brief }: { missionId: string; brief: MissionBrief }) {
  const q = brief.questions;
  const onTrack = q.by_health.green;
  const atRisk = q.by_health.yellow;
  const blocked = q.by_health.red;
  const progressPct = q.total > 0 ? Math.round((q.by_status.complete / q.total) * 100) : 0;

  const metrics = [
    { icon: <CheckCircle2 size={14} style={{ color: C.green }} />, label: "On Track", val: onTrack, color: C.green },
    { icon: <AlertTriangle size={14} style={{ color: C.orange }} />, label: "At Risk", val: atRisk, color: C.orange },
    { icon: <XCircle size={14} style={{ color: C.red }} />, label: "Blocked", val: blocked, color: C.red },
    { icon: <Bell size={14} style={{ color: C.orange }} />, label: "Open Risks", val: brief.risks.length, color: C.orange },
    { icon: <Gavel size={14} style={{ color: C.blue }} />, label: "Clarifications", val: brief.clarifications.length, color: C.blue },
    { icon: <Calendar size={14} style={{ color: C.textMuted }} />, label: "Sections", val: brief.sections.length, color: C.textMuted },
  ];

  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>MISSION HEALTH</div>
      <div style={{ fontSize: 11, color: C.textMuted }}>Overall mission status and key indicators.</div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: C.textBody }}>Overall Progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary }}>{progressPct}%</span>
        </div>
        <div style={{ height: 7, background: C.borderLight, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${progressPct}%`, height: "100%", background: C.green, borderRadius: 999 }} />
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

      <Link to="/missions/$missionId/command" params={{ missionId }} style={{ ...linkBlue, marginTop: 14 }}>View Mission Health <ArrowRight size={12} /></Link>
    </div>
  );
}

function YoureBriefedCard({ missionId }: { missionId: string }) {
  return (
    <div style={{ ...card, padding: 16, background: "rgba(96,165,250,0.08)", borderColor: "rgba(96,165,250,0.25)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 999, background: "rgba(37,99,235,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Plane size={20} style={{ color: C.blue }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary }}>You're briefed.<br />Ready to fly?</div>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5, marginTop: 6 }}>
            Open the Flight Deck to check your status and manage your assignments.
          </div>
          <Link to="/missions/$missionId/flight-deck" params={{ missionId }} style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
            padding: "8px 14px", borderRadius: 8,
            background: C.blue, color: "#fff",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
            textDecoration: "none",
          }}>
            <Plane size={12} />
            Go to Flight Deck
          </Link>
        </div>
      </div>
    </div>
  );
}


/* ════════════════ HELPERS ════════════════ */
function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const diffMs = now - then;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function severityColor(sev: string | null): string {
  const s = (sev ?? "").toLowerCase();
  if (s === "high" || s === "critical") return C.red;
  if (s === "medium") return C.orange;
  if (s === "low") return C.iris;
  return C.iris;
}
