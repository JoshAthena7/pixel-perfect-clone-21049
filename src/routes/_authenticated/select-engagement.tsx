/**
 * LOBBY — /select-engagement
 * Athena Command's front door. Not a navigation page — a destination.
 * VIP Lounge · Mission Intelligence Center · Executive Briefing Room
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useEngagement, type Membership } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { LogOut, Plus, Siren, ChevronRight, Sparkles, Send } from "lucide-react";
import { daysUntil } from "@/lib/time";
import { generateIrisExecutiveBrief } from "@/lib/iris/iris-brief.functions";

export const Route = createFileRoute("/_authenticated/select-engagement")({
  head: () => ({ meta: [{ title: "Athena Command" }] }),
  component: LobbyPage,
});

// ── Design tokens ────────────────────────────────────────────────
const GOLD = "#C49A2A";
const GOLD_LIGHT = "#D4AE4A";
const BG = "#0D0F1A";
const SURFACE = "#111827";
const SURFACE2 = "#1a2235";
const BORDER = "rgba(255,255,255,0.06)";
const BORDER_STRONG = "rgba(255,255,255,0.12)";
const MUTED = "rgba(255,255,255,0.4)";
const TEXT = "#e8edf5";

const HEALTH_COLOR: Record<string, string> = {
  Green: "#22c55e", Yellow: "#f59e0b", Orange: "#f97316", Red: "#ef4444",
};

// ── Types ────────────────────────────────────────────────────────
type Stats = {
  openSos: number; openRisks: number; lastSignalAt: string | null;
  health: string; pendingDecisions: number;
};

const LEADERSHIP_ROLES = new Set(["founder", "pm", "engagement_lead", "lead", "exec"]);
function routeForRole(role: string) {
  return LEADERSHIP_ROLES.has(role) ? "/command" : "/writer/my-sections";
}
function relTime(ts: string | null) {
  if (!ts) return null;
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function greet() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function todayStr() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ── Main Lobby ───────────────────────────────────────────────────
function LobbyPage() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const { user } = useSession();
  const navigate = useNavigate();

  const [statsById, setStatsById] = useState<Record<string, Stats>>({});
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [recognition, setRecognition] = useState<any[]>([]);
  const [horizonItems, setHorizonItems] = useState<any[]>([]);
  const [irisBrief, setIrisBrief] = useState<string | null>(null);
  const [irisLoading, setIrisLoading] = useState(false);
  const [irisQuery, setIrisQuery] = useState("");
  const [irisAnswer, setIrisAnswer] = useState<string | null>(null);
  const [irisAnswering, setIrisAnswering] = useState(false);

  const active = useMemo(
    () => memberships.filter((m) => m.engagement.status !== "Archived"),
    [memberships]
  );

  // Auto-route single mission
  useEffect(() => {
    if (loading) return;
    const auto = new URLSearchParams(window.location.search).get("auto");
    if (auto === "1" && active.length === 1) {
      const m = active[0];
      switchEngagement(m.engagement.id);
      navigate({ to: routeForRole(m.role), replace: true });
    }
  }, [loading, active.length]);

  // Fetch all Lobby data
  useEffect(() => {
    if (loading || !active.length) return;
    const ids = active.map((m) => m.engagement.id);

    (async () => {
      const [sosRes, riskRes, signalRes, decRes, bcRes, recRes, horizonRes] = await Promise.all([
        supabase.from("sos_alerts").select("engagement_id").in("engagement_id", ids).neq("status", "Resolved"),
        supabase.from("risks").select("engagement_id").in("engagement_id", ids).in("status", ["Open","Monitoring"]),
        supabase.from("huddles").select("engagement_id,health,created_at").in("engagement_id", ids).order("created_at", { ascending: false }).limit(ids.length * 2),
        supabase.from("decisions").select("engagement_id").in("engagement_id", ids).eq("status", "Pending Confirmation"),
        supabase.from("broadcasts").select("content,author_name,created_at,engagement_id").order("created_at", { ascending: false }).limit(5),
        (supabase as any).from("recognition").select("from_name,to_name,type,message,created_at").order("created_at", { ascending: false }).limit(4),
        supabase.from("pipeline_horizon").select("id,title,iris_headline,iris_type,iris_action,horizon_category,source,urgency_score,affected_states,ingested_at").eq("status","active").order("urgency_score", { ascending: false }).order("ingested_at", { ascending: false }).limit(6),
      ]);

      const map: Record<string, Stats> = {};
      for (const id of ids) map[id] = { openSos: 0, openRisks: 0, lastSignalAt: null, health: "Green", pendingDecisions: 0 };
      for (const r of (sosRes.data ?? []) as any[]) { const b = map[r.engagement_id]; if (b) b.openSos++; }
      for (const r of (riskRes.data ?? []) as any[]) { const b = map[r.engagement_id]; if (b) b.openRisks++; }
      for (const r of (decRes.data ?? []) as any[]) { const b = map[r.engagement_id]; if (b) b.pendingDecisions++; }
      const seen = new Set<string>();
      for (const s of (signalRes.data ?? []) as any[]) {
        if (!seen.has(s.engagement_id)) {
          const b = map[s.engagement_id];
          if (b) { b.lastSignalAt = s.created_at; b.health = s.health ?? "Green"; seen.add(s.engagement_id); }
        }
      }
      setStatsById(map);
      setBroadcasts((bcRes.data ?? []) as any[]);
      setRecognition((recRes.data ?? []) as any[]);
      setHorizonItems((horizonRes.data ?? []) as any[]);
    })();
  }, [loading, active.length]);

  // IRIS brief
  useEffect(() => {
    if (!active.length || !user?.id) return;
    const key = `iris_lobby_${user.id}_${new Date().toDateString()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) ?? "null");
      if (cached) { setIrisBrief(cached); return; }
    } catch { /* ignore */ }
    setIrisLoading(true);
    const raw = user.email?.split("@")?.[0]?.split(".")?.[0] ?? "";
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    generateIrisExecutiveBrief({ data: { userName: name } })
      .then(r => { setIrisBrief(r.brief); localStorage.setItem(key, JSON.stringify(r.brief)); })
      .catch(() => setIrisBrief(null))
      .finally(() => setIrisLoading(false));
  }, [active.length, user?.id]);

  async function askIris(q: string) {
    if (!q.trim()) return;
    setIrisAnswering(true);
    setIrisAnswer(null);
    try {
      const r = await generateIrisExecutiveBrief({ data: { userName: "", query: q } as any });
      setIrisAnswer(r.brief);
    } catch { setIrisAnswer("IRIS is unavailable right now. Try again shortly."); }
    setIrisAnswering(false);
  }

  function enter(m: Membership) {
    switchEngagement(m.engagement.id);
    navigate({ to: routeForRole(m.role), replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const firstName = user?.email?.split("@")?.[0]?.split(".")?.[0] ?? "";
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const totalSOS = active.reduce((a, m) => a + (statsById[m.engagement.id]?.openSos ?? 0), 0);
  const needsAttention = active.filter(m => {
    const s = statsById[m.engagement.id];
    const d = daysUntil((m.engagement as any).submission_date);
    return s && (s.openSos > 0 || (d !== null && d <= 7));
  }).length;

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG }}>
      <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTED, animation: "pulse 2s infinite" }}>
        Preparing your briefing…
      </div>
    </div>
  );

  // No missions
  if (!active.length) return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, background: BG, padding: 24 }}>
      <BrandLockup size="lg" />
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: TEXT, marginBottom: 12 }}>Welcome to Athena Command.</h1>
        <p style={{ color: MUTED, lineHeight: 1.7, fontSize: 15 }}>
          Create your first mission to begin. Once activated, Mission Brain, IRIS, and your team workspace will come to life.
        </p>
      </div>
      <a href="/engagement/new" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 10, background: GOLD, color: "#0D0F1A", fontWeight: 800, fontSize: 14, textDecoration: "none", letterSpacing: "0.04em" }}>
        <Plus style={{ width: 16, height: 16 }} /> Create First Mission
      </a>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>

      {/* ── Top Bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 40px", borderBottom: `0.5px solid ${BORDER}` }}>
        <BrandLockup size="sm" />
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="/engagement/new" style={{ fontSize: 12, color: MUTED, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <Plus style={{ width: 13, height: 13 }} /> New Mission
          </a>
          <button onClick={signOut} style={{ fontSize: 12, color: MUTED, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <LogOut style={{ width: 13, height: 13 }} /> Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px", display: "flex", flexDirection: "column", gap: 56 }}>

        {/* ══════════════════════════════════════════════════════
            SECTION 1 — TODAY'S BRIEFING
        ══════════════════════════════════════════════════════ */}
        <section>
          <SectionLabel>Today's Briefing</SectionLabel>

          {/* Greeting + date */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>{todayStr()}</p>
            <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
              {greet()}, {displayName}.
            </h1>
          </div>

          {/* Key stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Active Missions", value: active.length, color: GOLD },
              { label: "Need Attention", value: needsAttention, color: needsAttention > 0 ? "#f59e0b" : "#22c55e" },
              { label: "Active SOS", value: totalSOS, color: totalSOS > 0 ? "#ef4444" : "#22c55e" },
              { label: "Market Signals", value: horizonItems.length, color: "#60a5fa" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: SURFACE, border: `0.5px solid ${BORDER_STRONG}`, borderRadius: 12, padding: "20px 22px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* AI Brief */}
          <div style={{ background: `linear-gradient(135deg, rgba(196,154,42,0.06), rgba(59,127,255,0.06))`, border: `0.5px solid rgba(196,154,42,0.2)`, borderRadius: 14, padding: "24px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD }}>IRIS · Daily Briefing</span>
            </div>
            {irisLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[90, 75, 85, 60].map((w, i) => (
                  <div key={i} style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.04)", width: `${w}%`, animation: "pulse 1.5s ease-in-out infinite" }} />
                ))}
              </div>
            ) : irisBrief ? (
              <p style={{ fontSize: 15, lineHeight: 1.8, color: "rgba(255,255,255,0.85)", margin: 0, whiteSpace: "pre-line" }}>{irisBrief}</p>
            ) : (
              <p style={{ fontSize: 15, lineHeight: 1.8, color: MUTED, margin: 0 }}>
                {needsAttention > 0
                  ? `${needsAttention} mission${needsAttention > 1 ? "s" : ""} require your attention today. ${totalSOS > 0 ? `${totalSOS} active SOS alert${totalSOS > 1 ? "s" : ""} — immediate review recommended.` : ""}`
                  : "Portfolio is healthy. All missions are within normal parameters."}
              </p>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION 2 — MISSIONS + IRIS CONCIERGE (side by side)
        ══════════════════════════════════════════════════════ */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>

          {/* Active Missions */}
          <div>
            <SectionLabel>Active Missions</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {active.map(m => {
                const s = statsById[m.engagement.id];
                const days = daysUntil((m.engagement as any).submission_date);
                const h = s?.health ?? "Green";
                const hColor = HEALTH_COLOR[h] ?? HEALTH_COLOR.Green;
                const urgent = s && (s.openSos > 0 || (days !== null && days <= 7));

                return (
                  <button key={m.engagement.id} onClick={() => enter(m)} style={{
                    display: "flex", alignItems: "center", gap: 18, padding: "18px 22px",
                    borderRadius: 12, background: urgent ? `color-mix(in oklab, ${hColor} 5%, ${SURFACE})` : SURFACE,
                    border: `0.5px solid ${urgent ? `color-mix(in oklab, ${hColor} 30%, transparent)` : BORDER_STRONG}`,
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s", width: "100%",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = BORDER_STRONG)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = urgent ? `color-mix(in oklab, ${hColor} 30%, transparent)` : BORDER_STRONG)}>

                    {/* Health orb */}
                    <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in oklab, ${hColor} 12%, transparent)`, border: `1.5px solid color-mix(in oklab, ${hColor} 40%, transparent)`, boxShadow: `0 0 16px color-mix(in oklab, ${hColor} 20%, transparent)` }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: hColor }}>{h[0]}</span>
                    </div>

                    {/* Mission info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{m.engagement.name}</span>
                        {s?.openSos ? <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: "#ef4444", color: "#fff", letterSpacing: "0.08em" }}>SOS</span> : null}
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 11, color: MUTED }}>
                        <span>{m.engagement.client}</span>
                        {days !== null && <span style={{ color: days <= 7 ? "#ef4444" : days <= 14 ? "#f59e0b" : MUTED }}>{days}d to submission</span>}
                        {s?.lastSignalAt && <span>Signal {relTime(s.lastSignalAt)}</span>}
                        {(s?.openRisks ?? 0) > 0 && <span style={{ color: "#f59e0b" }}>{s!.openRisks} risk{s!.openRisks > 1 ? "s" : ""}</span>}
                      </div>
                    </div>

                    <ChevronRight style={{ width: 16, height: 16, color: MUTED, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* IRIS Concierge */}
          <div>
            <SectionLabel>IRIS Concierge</SectionLabel>
            <div style={{ background: SURFACE, border: `0.5px solid rgba(196,154,42,0.2)`, borderRadius: 14, padding: "22px", height: "calc(100% - 36px)", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", items: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD, boxShadow: `0 0 10px ${GOLD}`, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Ask IRIS anything</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Your strategic intelligence co-pilot</div>
                </div>
              </div>

              {/* Suggested prompts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "What needs my attention today?",
                  "What missions are drifting?",
                  "What risks are emerging?",
                  "Who needs leadership support?",
                  "What changed this week?",
                ].map(q => (
                  <button key={q} onClick={() => { setIrisQuery(q); askIris(q); }}
                    style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${BORDER_STRONG}`, background: "transparent", color: MUTED, fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `rgba(196,154,42,0.3)`; (e.currentTarget as HTMLButtonElement).style.color = TEXT; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER_STRONG; (e.currentTarget as HTMLButtonElement).style.color = MUTED; }}>
                    <span style={{ color: GOLD, marginRight: 6 }}>→</span>{q}
                  </button>
                ))}
              </div>

              {/* Custom input */}
              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <input value={irisQuery} onChange={e => setIrisQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && askIris(irisQuery)}
                  placeholder="Ask IRIS…"
                  style={{ flex: 1, background: SURFACE2, border: `0.5px solid ${BORDER_STRONG}`, borderRadius: 8, padding: "8px 12px", color: TEXT, fontSize: 12, outline: "none" }} />
                <button onClick={() => askIris(irisQuery)} disabled={irisAnswering || !irisQuery.trim()}
                  style={{ padding: "8px 12px", borderRadius: 8, background: GOLD, border: "none", cursor: "pointer", color: "#0D0F1A", display: "flex", alignItems: "center" }}>
                  <Send style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* IRIS Response */}
              {(irisAnswering || irisAnswer) && (
                <div style={{ background: `rgba(196,154,42,0.06)`, border: `0.5px solid rgba(196,154,42,0.2)`, borderRadius: 8, padding: "12px 14px" }}>
                  {irisAnswering ? (
                    <div style={{ fontSize: 11, color: MUTED, animation: "pulse 1.5s ease-in-out infinite" }}>IRIS is thinking…</div>
                  ) : (
                    <p style={{ fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: 0 }}>{irisAnswer}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION 3 — QUICK ACTIONS
        ══════════════════════════════════════════════════════ */}
        <section>
          <SectionLabel>Quick Actions</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              { label: "Ask IRIS", icon: "🔮", action: () => document.querySelector<HTMLInputElement>('input[placeholder="Ask IRIS…"]')?.focus(), primary: true },
              { label: "Submit Signal", icon: "📡", action: () => { if (active[0]) enter(active[0]); } },
              { label: "Raise SOS", icon: "🚨", action: () => { if (active[0]) enter(active[0]); }, danger: true },
              { label: "Mission Control", icon: "🎯", action: () => navigate({ to: "/intel" }) },
              { label: "View All Missions", icon: "🗂️", action: () => {} },
            ].map(({ label, icon, action, primary, danger }) => (
              <button key={label} onClick={action} style={{
                padding: "18px 12px", borderRadius: 12, border: `0.5px solid ${danger ? "rgba(239,68,68,0.3)" : primary ? "rgba(196,154,42,0.3)" : BORDER_STRONG}`,
                background: danger ? "rgba(239,68,68,0.06)" : primary ? `rgba(196,154,42,0.08)` : SURFACE,
                cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 24 }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: danger ? "#ef4444" : primary ? GOLD_LIGHT : TEXT, letterSpacing: "0.03em" }}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            SECTION 4 — MARKET SIGNALS + LOUNGE (side by side)
        ══════════════════════════════════════════════════════ */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

          {/* Market Signals */}
          <div>
            <SectionLabel>Market Signals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {horizonItems.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: MUTED, fontSize: 13, border: `0.5px dashed ${BORDER_STRONG}`, borderRadius: 12 }}>
                  No market signals yet. IRIS is monitoring.
                </div>
              ) : horizonItems.map(item => {
                const CAT_COLOR: Record<string, string> = {
                  "Federal Signal": "#60a5fa", "Market Signal": "#a78bfa",
                  "Procurement Signal": GOLD, "State Signal": "#34d399", "Athena Signal": GOLD,
                };
                const color = CAT_COLOR[item.horizon_category] ?? "#60a5fa";
                return (
                  <div key={item.id} style={{ background: SURFACE, border: `0.5px solid ${BORDER_STRONG}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color }}>{item.horizon_category}</span>
                      {item.iris_type && <span style={{ fontSize: 9, color: MUTED }}>· IRIS {item.iris_type}</span>}
                    </div>
                    <p style={{ fontSize: 13, color: TEXT, margin: 0, lineHeight: 1.5 }}>{item.iris_headline ?? item.title}</p>
                    {item.iris_action && <p style={{ fontSize: 11, color, marginTop: 6, margin: "6px 0 0", fontStyle: "italic" }}>→ {item.iris_action}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Athena Collective Lounge */}
          <div>
            <SectionLabel>Athena Collective</SectionLabel>
            <div style={{ background: SURFACE, border: `0.5px solid ${BORDER_STRONG}`, borderRadius: 14, padding: "22px", display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>

              {/* Broadcasts */}
              {broadcasts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>Leadership</div>
                  {broadcasts.slice(0, 2).map((b, i) => (
                    <div key={i} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < 1 ? `0.5px solid ${BORDER}` : "none" }}>
                      <div style={{ fontSize: 11, color: GOLD, fontWeight: 600, marginBottom: 3 }}>{b.author_name}</div>
                      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: 0, lineHeight: 1.6 }}>{b.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Recognition */}
              {recognition.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>Recognition</div>
                  {recognition.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, paddingBottom: 12, borderBottom: i < recognition.length - 1 ? `0.5px solid ${BORDER}` : "none" }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>
                        {r.type?.includes("Beyond") ? "⭐" : r.type?.includes("Clutch") ? "🛡️" : "🤝"}
                      </span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{r.to_name} <span style={{ color: MUTED, fontWeight: 400 }}>recognized by {r.from_name}</span></div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>{r.message?.slice(0, 80)}{r.message?.length > 80 ? "…" : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {broadcasts.length === 0 && recognition.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: MUTED, fontSize: 13 }}>
                  The Collective is quiet. Be the first to broadcast or recognize a teammate.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.15)", paddingBottom: 24 }}>
          Athena Command™ · Mission Intelligence · {new Date().getFullYear()}
        </div>

      </div>
    </div>
  );
}

// ── Section label component ───────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD, opacity: 0.7 }}>
        {children}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: `linear-gradient(to right, rgba(196,154,42,0.3), transparent)` }} />
    </div>
  );
}
