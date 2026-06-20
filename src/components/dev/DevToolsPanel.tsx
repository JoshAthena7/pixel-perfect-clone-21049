/**
 * ATLAS Developer Tools — admin-only floating panel.
 *
 * Admin-only (gated by has_role 'admin'). Three sections:
 *   1. Screen Previewer (categorized, collapsible, filterable, scrolls
 *      independently inside the drawer).
 *   2. Quick Actions.
 *   3. Role Simulator.
 *
 * Screen Previewer cards have a `kind`:
 *   - iframe   : open a route in a full-screen iframe overlay
 *   - navigate : window.location.assign to a route
 *   - splash   : replay the constellation splash
 *   - simulate : navigate to the closest existing route + toast a hint
 *   - modal    : navigate (if needed) then programmatically click a button
 *                in the page to open the relevant modal/panel
 *   - anim     : dispatch the relevant animation event (bolt, whisper,
 *                scan, iris-loading) or replay splash
 */
import { useEffect, useMemo, useState } from "react";
import { Code, X, ChevronDown, ChevronRight } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/splash/SplashScreen";
import { triggerIrisBolt } from "@/lib/iris-bolt";

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? "https://hqtmulghixcirvamdcol.supabase.co";

type ScreenKind = "iframe" | "navigate" | "splash" | "simulate" | "modal" | "anim";

type ScreenCard = {
  id: string;
  name: string;
  description: string;
  kind: ScreenKind;
  href?: string;
  /** modal: button-text matcher to click after navigation */
  modal?: string;
  /** anim: which animation to trigger */
  anim?: "splash" | "bolt" | "whisper" | "scan" | "iris_loading";
  /** simulate: optional sessionStorage flag to set so the target page renders an empty/special state */
  flag?: string;
};

type Category = { id: string; label: string; cards: ScreenCard[] };

const SAMPLE_DRAFT =
  "PerformCare will develop a process within the Call Center to identify Youth involved with DCP&P and refer calls to appropriate staff. We will obtain CSOC approval prior to implementation and maintain documentation of all referrals.";

const SAMPLE_WHISPER =
  "⚡ New waiver guidance published June 19 — may affect Section 4 compliance requirements.";

const CATEGORIES: Category[] = [
  {
    id: "auth",
    label: "Auth & Onboarding",
    cards: [
      { id: "login", name: "Login Screen", description: "First screen new users see", kind: "iframe", href: "/login?preview=1" },
      { id: "welcome", name: "Welcome Screen", description: "Post-auth landing", kind: "navigate", href: "/welcome" },
      { id: "onboarding", name: "Onboarding", description: "New user setup", kind: "navigate", href: "/onboarding" },
      { id: "new-user", name: "New User Experience", description: "Writer with no assignments, first visit", kind: "simulate", flag: "atlas_sim_new_user" },
    ],
  },
  {
    id: "roles",
    label: "Role Views",
    cards: [
      { id: "role-writer", name: "Writer (5 questions)", description: "Flight Deck as a writer", kind: "simulate", flag: "atlas_preview_role:Writer" },
      { id: "role-sme", name: "SME View", description: "SME review queue", kind: "simulate", flag: "atlas_preview_role:SME" },
      { id: "role-lead", name: "Engagement Lead", description: "ATC with full team data", kind: "simulate", flag: "atlas_preview_role:Engagement Lead" },
      { id: "role-reviewer", name: "Reviewer", description: "Red team review mode", kind: "simulate", flag: "atlas_preview_role:Reviewer" },
      { id: "role-readonly", name: "Read-Only (Closed)", description: "Mission after submission deadline", kind: "simulate", flag: "atlas_sim_readonly" },
    ],
  },
  {
    id: "empty",
    label: "Empty States",
    cards: [
      { id: "empty-mission", name: "Empty Mission", description: "New mission, nothing set up", kind: "simulate", flag: "atlas_sim_empty_mission" },
      { id: "empty-oracle", name: "Empty ORACLE", description: "ORACLE with zero intel", kind: "navigate", flag: "atlas_sim_empty_oracle" },
      { id: "empty-flight-deck", name: "Empty Flight Deck", description: "Writer with no assigned questions", kind: "simulate", flag: "atlas_sim_empty_flightdeck" },
      { id: "empty-atc", name: "Empty ATC", description: "No team activity", kind: "navigate", flag: "atlas_sim_empty_atc" },
      { id: "empty-briefing", name: "Empty Briefing Room", description: "No north star or win themes", kind: "simulate", flag: "atlas_sim_empty_briefing" },
      { id: "empty-intel", name: "Empty Intelligence", description: "Zero items in feed", kind: "navigate", flag: "atlas_sim_empty_intel" },
    ],
  },
  {
    id: "admin",
    label: "Admin Pages",
    cards: [
      { id: "admin-home", name: "Admin Home", description: "Cross-mission dashboard", kind: "navigate", href: "/admin" },
      { id: "admin-mission", name: "Mission Setup", description: "Admin mission setup tab", kind: "simulate" },
      { id: "admin-state-intel", name: "State Intel", description: "State intelligence packs", kind: "navigate", href: "/admin/state-intel" },
      { id: "admin-iris-control", name: "IRIS Control", description: "Pipeline health dashboard", kind: "navigate", href: "/admin/iris-control" },
      { id: "admin-iris-writer", name: "IRIS Writer View", description: "IRIS writer surface", kind: "navigate", href: "/admin/iris-writer-view" },
      { id: "admin-staff", name: "Staff Management", description: "Team management", kind: "navigate", href: "/admin/staff" },
      { id: "admin-messaging", name: "Messaging", description: "Platform messaging", kind: "navigate", href: "/admin/messaging" },
      { id: "olympus", name: "ORACLE Command", description: "Cross-mission ORACLE", kind: "navigate", href: "/olympus" },
    ],
  },
  {
    id: "wizard",
    label: "Wizard Steps",
    cards: [
      { id: "wiz-1-empty", name: "Wizard Step 1 (Empty)", description: "Fuel IRIS — no docs uploaded", kind: "simulate", flag: "atlas_sim_wizard:1:empty" },
      { id: "wiz-1-ready", name: "Wizard Step 1 (Ready)", description: "Docs tagged, ready to analyze", kind: "simulate", flag: "atlas_sim_wizard:1:ready" },
      { id: "wiz-2", name: "Wizard Step 2", description: "State intelligence step", kind: "simulate", flag: "atlas_sim_wizard:2" },
      { id: "wiz-9", name: "Wizard Step 9", description: "Review & Launch final step", kind: "simulate", flag: "atlas_sim_wizard:9" },
    ],
  },
  {
    id: "errors",
    label: "Error & Edge States",
    cards: [
      { id: "err-404", name: "404 Page", description: "Page not found", kind: "navigate", href: "/this-does-not-exist" },
      { id: "err-access", name: "Access Denied", description: "Non-admin tries admin page", kind: "simulate", flag: "atlas_sim_access_denied" },
      { id: "err-mission-404", name: "Mission Not Found", description: "Invalid mission ID", kind: "navigate", href: "/missions/00000000-0000-0000-0000-000000000000/briefing" },
      { id: "err-pipeline", name: "Pipeline Error", description: "IRIS Control with a cron failure", kind: "simulate", flag: "atlas_sim_pipeline_error" },
    ],
  },
  {
    id: "modals",
    label: "Modals & Panels",
    cards: [
      { id: "m-checkin-ontrack", name: "Check-In: On Track", description: "Check-in submitted as On Track", kind: "modal", modal: "checkin_ontrack" },
      { id: "m-checkin-blocked", name: "Check-In: Blocked", description: "Check-in submitted as Blocked", kind: "modal", modal: "checkin_blocked" },
      { id: "m-checkin-sme", name: "Check-In: Need SME", description: "Check-in requesting SME help", kind: "modal", modal: "checkin_sme" },
      { id: "m-score-empty", name: "Score Me: Empty", description: "Score Me before pasting draft", kind: "modal", modal: "score_me" },
      { id: "m-score-results", name: "Score Me: Results", description: "Score Me with rubric + authenticity", kind: "modal", modal: "score_me_results" },
      { id: "m-evaluator", name: "Evaluator Simulation", description: "Evaluator voice feedback mode", kind: "modal", modal: "evaluator_sim" },
      { id: "m-sticky-empty", name: "Sticky Notes: Empty", description: "No notes pinned yet", kind: "modal", modal: "sticky_empty" },
      { id: "m-sticky-notes", name: "Sticky Notes: With Notes", description: "Sticky notes with sample cards", kind: "modal", modal: "sticky_notes" },
      { id: "m-nudge", name: "Nudge: With Team", description: "Nudge modal with team members", kind: "modal", modal: "nudge" },
      { id: "m-iris-chat", name: "IRIS Chat", description: "Ask IRIS chat panel open", kind: "modal", modal: "iris_chat" },
      { id: "m-search-empty", name: "Global Search: Empty", description: "Cmd+K with no query", kind: "modal", modal: "search_empty" },
      { id: "m-search-intent", name: "Global Search: Intent", description: "Typing 'check in' — intent match", kind: "modal", modal: "search_intent" },
      { id: "m-writer-drawer", name: "WriterDrawer: Questions", description: "ATC writer drawer with questions", kind: "modal", modal: "writer_drawer" },
    ],
  },
  {
    id: "anims",
    label: "Animations",
    cards: [
      { id: "a-splash", name: "Splash Screen", description: "Constellation load animation", kind: "anim", anim: "splash" },
      { id: "a-iris-loading", name: "IRIS Brief Loading", description: "Particle field thinking state", kind: "anim", anim: "iris_loading" },
      { id: "a-whisper", name: "Whisper Arrival", description: "Whisper drop animation", kind: "anim", anim: "whisper" },
      { id: "a-scan", name: "Score Me Scan", description: "Evaluator reading scan line", kind: "anim", anim: "scan" },
      { id: "a-bolt", name: "Bolt Flash", description: "Lightning bolt IRIS activation", kind: "anim", anim: "bolt" },
    ],
  },
];

const ROLE_KEY = "atlas_preview_role";
const SPLASH_KEY = "atlas_splash_shown";
const ROLES = ["Admin", "Engagement Lead", "Project Manager", "Writer", "SME", "Reviewer"] as const;
type Role = (typeof ROLES)[number];

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.rpc("has_role" as any, {
        _user_id: u.user.id,
        _role: "admin" as any,
      });
      if (alive) setIsAdmin(Boolean(data));
    })();
    return () => { alive = false; };
  }, []);
  return isAdmin;
}

function currentMissionId(pathname: string): string | null {
  const m = pathname.match(/\/missions\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

/** Find a visible button whose text matches any of the given needles (case-insensitive substring). */
function findButton(needles: string[]): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"));
  const lower = needles.map((n) => n.toLowerCase());
  for (const b of buttons) {
    const txt = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
    if (!txt) continue;
    if (lower.some((n) => txt.includes(n))) {
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return b;
    }
  }
  return null;
}

function setReactInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function DevToolsPanel() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ScreenCard | null>(null);
  const [playSplash, setPlaySplash] = useState(false);
  const { pathname } = useLocation();
  const missionId = useMemo(() => currentMissionId(pathname), [pathname]);
  const [activeRole, setActiveRole] = useState<Role>("Admin");
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const r = sessionStorage.getItem(ROLE_KEY) as Role | null;
      if (r && ROLES.includes(r)) setActiveRole(r);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open && !preview && !playSplash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playSplash) setPlaySplash(false);
      else if (preview) setPreview(null);
      else if (open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, preview, playSplash]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atlas-devtools-open", onOpen);
    return () => window.removeEventListener("atlas-devtools-open", onOpen);
  }, []);

  if (!isAdmin) return null;

  const resolveRoute = (s: ScreenCard): string | null => {
    if (s.href) {
      // Substitute [id] / dynamic mission segment if href requires it (currently none do).
      return s.href;
    }
    // Mission-context fallbacks
    if (s.id === "empty-oracle" || s.id === "empty-intel" || s.id === "empty-atc") {
      if (!missionId) return null;
      if (s.id === "empty-oracle") return `/missions/${missionId}/olympus`;
      if (s.id === "empty-intel") return `/missions/${missionId}/intelligence`;
      if (s.id === "empty-atc") return `/missions/${missionId}/war-room`;
    }
    return null;
  };

  const setFlag = (flag?: string) => {
    if (!flag) return;
    try {
      if (flag.startsWith("atlas_preview_role:")) {
        const role = flag.split(":")[1] as Role;
        if (role === "Admin") sessionStorage.removeItem(ROLE_KEY);
        else sessionStorage.setItem(ROLE_KEY, role);
        setActiveRole(role);
      } else {
        sessionStorage.setItem(flag, "1");
      }
    } catch {}
  };

  const runModal = async (modal: string) => {
    setOpen(false); // close drawer so modal isn't obscured
    const onFlightDeck = pathname.includes("/flight-deck");
    const onWarRoom = pathname.includes("/war-room");

    const needFlightDeck = ["checkin_ontrack","checkin_blocked","checkin_sme","score_me","score_me_results","evaluator_sim","sticky_empty","sticky_notes","nudge","iris_chat"].includes(modal);
    const needWarRoom = modal === "writer_drawer";

    if (needFlightDeck && !onFlightDeck) {
      if (!missionId) { toast.error("Open a mission's Flight Deck first."); return; }
      window.location.assign(`/missions/${missionId}/flight-deck`);
      return;
    }
    if (needWarRoom && !onWarRoom) {
      if (!missionId) { toast.error("Open a mission's ATC first."); return; }
      window.location.assign(`/missions/${missionId}/war-room`);
      return;
    }

    await new Promise((r) => setTimeout(r, 500));

    const click = (needles: string[], label: string) => {
      const btn = findButton(needles);
      if (!btn) { toast.error(`Couldn't find "${label}" on this page.`); return false; }
      btn.click();
      return true;
    };

    switch (modal) {
      case "checkin_ontrack":
      case "checkin_blocked":
      case "checkin_sme": {
        if (!click(["check-in", "check in"], "Check-In")) return;
        await new Promise((r) => setTimeout(r, 250));
        const label = modal === "checkin_ontrack" ? "on track" : modal === "checkin_blocked" ? "blocked" : "sme";
        findButton([label])?.click();
        return;
      }
      case "score_me":
        click(["score me"], "Score Me");
        return;
      case "score_me_results":
      case "evaluator_sim": {
        if (!click(["score me"], "Score Me")) return;
        await new Promise((r) => setTimeout(r, 350));
        if (modal === "evaluator_sim") findButton(["evaluator", "simulation"])?.click();
        const ta = document.querySelector<HTMLTextAreaElement>("textarea");
        if (ta) setReactInputValue(ta, SAMPLE_DRAFT);
        await new Promise((r) => setTimeout(r, 150));
        findButton(["score", "evaluate", "run"])?.click();
        return;
      }
      case "sticky_empty":
      case "sticky_notes":
        click(["sticky", "pinned", "notes"], "Sticky Notes");
        return;
      case "nudge":
        click(["nudge"], "Nudge");
        return;
      case "iris_chat":
        click(["ask iris"], "Ask IRIS");
        return;
      case "search_empty":
      case "search_intent": {
        const ev = new KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: true, ctrlKey: true, bubbles: true });
        window.dispatchEvent(ev);
        document.dispatchEvent(ev);
        if (modal === "search_intent") {
          await new Promise((r) => setTimeout(r, 300));
          const input = document.querySelector<HTMLInputElement>("input[type='search'], [cmdk-input], input[placeholder*='earch' i]");
          if (input) setReactInputValue(input, "check in");
        }
        return;
      }
      case "writer_drawer": {
        const row = document.querySelector<HTMLElement>("[data-writer-row], [data-testid='writer-row']");
        if (row) { row.click(); return; }
        const fallback = document.querySelector<HTMLElement>("[role='row'], button[aria-label*='writer' i]");
        if (fallback) fallback.click();
        else toast.error("No writer rows visible on this page.");
        return;
      }
    }
  };

  const runAnim = (anim: NonNullable<ScreenCard["anim"]>) => {
    setOpen(false);
    switch (anim) {
      case "splash":
        try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
        setPlaySplash(true);
        return;
      case "bolt":
        triggerIrisBolt("iris");
        triggerIrisBolt("brief");
        triggerIrisBolt("score");
        triggerIrisBolt("whisper");
        triggerIrisBolt("alert");
        return;
      case "whisper":
        window.dispatchEvent(new CustomEvent("atlas-dev-whisper", { detail: { text: SAMPLE_WHISPER } }));
        toast.success("Whisper dispatched.");
        return;
      case "scan":
        window.dispatchEvent(new CustomEvent("atlas-dev-scan", { detail: { text: SAMPLE_DRAFT } }));
        toast.success("Scan animation dispatched.");
        return;
      case "iris_loading":
        window.dispatchEvent(new CustomEvent("atlas-dev-iris-loading", { detail: { ms: 5000 } }));
        toast.success("IRIS loading state dispatched (5s).");
        return;
    }
  };

  const handleScreen = (s: ScreenCard) => {
    if (s.kind === "splash") {
      try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
      setPlaySplash(true);
      return;
    }
    if (s.kind === "anim" && s.anim) { runAnim(s.anim); return; }
    if (s.kind === "modal" && s.modal) { void runModal(s.modal); return; }
    if (s.kind === "iframe") { setPreview(s); return; }
    if (s.kind === "navigate") {
      const href = resolveRoute(s);
      if (!href) { toast.error("Open a mission first — that preview needs a mission context."); return; }
      setFlag(s.flag);
      window.location.assign(href);
      return;
    }
    if (s.kind === "simulate") {
      setFlag(s.flag);
      toast.success(`${s.name}: flag set. Refresh the target page to see it.`);
      return;
    }
  };

  const clearSplash = () => {
    try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
    toast.success("Splash will play on next page load.");
  };

  const resetSessionFlags = () => {
    try {
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith("atlas_"));
      keys.forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    toast.success("All session flags cleared.");
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied.`),
      () => toast.error("Clipboard unavailable."),
    );
  };

  const setRole = (role: Role) => {
    try {
      if (role === "Admin") sessionStorage.removeItem(ROLE_KEY);
      else sessionStorage.setItem(ROLE_KEY, role);
    } catch {}
    setActiveRole(role);
    if (role === "Admin") {
      toast.success("Reset to Admin. Reloading…");
      setTimeout(() => window.location.reload(), 400);
    } else {
      toast.success(`Now previewing as ${role}. Refresh to see role-specific UI.`);
    }
  };

  const filterLower = filter.trim().toLowerCase();
  const filterMatch = (c: ScreenCard) =>
    !filterLower ||
    c.name.toLowerCase().includes(filterLower) ||
    c.description.toLowerCase().includes(filterLower);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        aria-label="Developer Tools (Admin only)"
        title="Developer Tools (Admin only)"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9998,
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(196,154,43,0.15)",
          border: "1px solid rgba(196,154,43,0.4)",
          borderRadius: 6,
          cursor: "pointer",
          color: "#c9a84c",
        }}
      >
        <Code size={16} />
      </button>

      {/* Drawer */}
      <div
        role="dialog"
        aria-hidden={!open}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 540,
          background: "#050d18",
          borderTop: "1px solid rgba(196,154,43,0.3)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 200ms ease-out",
          zIndex: 9998,
          color: "rgba(255,255,255,0.85)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <span style={{ color: "#c9a84c", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>
              ⚙ ATLAS Developer Tools
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
              Admin only · Not visible to writers
            </span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: "rgba(255,255,255,0.7)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5" style={{ overflowY: "auto", flex: 1 }}>
          <Section label="Screen Previewer" hint="Preview screens, modals, and animations you can't normally see while logged in.">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter screens..."
              style={{
                width: "100%",
                padding: "6px 10px",
                marginBottom: 10,
                fontSize: 11,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                color: "white",
                outline: "none",
              }}
            />
            <div style={{ maxHeight: 280, overflowY: "auto", paddingRight: 4 }}>
              {CATEGORIES.map((cat) => {
                const visible = cat.cards.filter(filterMatch);
                if (visible.length === 0) return null;
                const isCollapsed = collapsed[cat.id] === true;
                return (
                  <div key={cat.id} style={{ marginBottom: 14 }}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [cat.id]: !isCollapsed }))}
                      className="w-full flex items-center gap-1.5"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.22em",
                        color: "rgba(255,255,255,0.55)",
                        textTransform: "uppercase",
                        background: "transparent",
                        border: 0,
                        padding: "4px 0",
                        cursor: "pointer",
                        marginBottom: 6,
                      }}
                    >
                      {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                      <span>{cat.label}</span>
                      <span style={{ color: "rgba(255,255,255,0.3)" }}>· {visible.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-3 gap-2">
                        {visible.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleScreen(s)}
                            className="text-left"
                            style={{
                              width: "100%",
                              minHeight: 72,
                              padding: 10,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(196,154,43,0.6)")}
                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                          >
                            <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>{s.name}</div>
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, marginTop: 2 }}>{s.description}</div>
                            <div style={{ color: "#c9a84c", fontSize: 9, marginTop: 4 }}>
                              {s.kind === "anim" ? "Play →" : s.kind === "modal" ? "Open →" : s.kind === "simulate" ? "Set flag →" : "Preview →"}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section label="Quick Actions">
            <div className="flex flex-wrap gap-2">
              <Pill onClick={clearSplash}>Clear splash seen</Pill>
              <Pill onClick={resetSessionFlags}>Reset all dev flags</Pill>
              <Pill onClick={() => missionId ? copy(missionId, "Mission ID") : toast.error("Open a mission first.")}>
                Copy mission ID
              </Pill>
              <Pill onClick={() => copy(SUPABASE_URL, "Supabase URL")}>Copy Supabase URL</Pill>
              <Pill onClick={() => window.open("/ATLAS-ARCHITECTURE.md", "_blank")}>View ATLAS Architecture</Pill>
            </div>
          </Section>

          <Section label="Role Simulator" hint="Sets a sessionStorage flag. Components that consume it will render in that role. Resets on reload to Admin.">
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => {
                const active = activeRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    style={{
                      fontSize: 11,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: active ? "rgba(196,154,43,0.18)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? "rgba(196,154,43,0.6)" : "rgba(255,255,255,0.12)"}`,
                      color: active ? "#c9a84c" : "rgba(255,255,255,0.7)",
                      cursor: "pointer",
                    }}
                  >
                    {r}
                  </button>
                );
              })}
              <Pill onClick={() => setRole("Admin")}>Reset to Admin</Pill>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
              Note: only components wired to read <code>sessionStorage.atlas_preview_role</code> will respond. Real RLS is unchanged.
            </div>
          </Section>
        </div>
      </div>

      {/* Iframe preview overlay */}
      {preview && preview.kind === "iframe" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9997,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="flex items-center justify-between px-4"
            style={{ height: 48, background: "#0a0e1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div style={{ color: "white", fontSize: 13 }}>{preview.name}</div>
            <div className="flex items-center gap-3">
              <a
                href={preview.href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#c9a84c", fontSize: 11 }}
              >
                Open in new tab →
              </a>
              <button onClick={() => setPreview(null)} style={{ color: "white", fontSize: 11 }}>
                Close Preview
              </button>
            </div>
          </div>
          <iframe
            src={preview.href}
            title={preview.name}
            data-preview-mode="true"
            style={{ flex: 1, width: "100%", border: 0, background: "#000" }}
          />
        </div>
      )}

      {/* Splash playback */}
      {playSplash && <SplashScreen onDone={() => setPlaySplash(false)} />}
    </>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 4, marginBottom: 8 }}>{hint}</div>}
      {!hint && <div style={{ height: 8 }} />}
      {children}
    </div>
  );
}

function Pill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "5px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.85)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
