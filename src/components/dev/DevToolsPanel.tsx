/**
 * ATLAS Developer Tools — admin-only floating panel.
 *
 * Admin-only (gated by has_role 'admin'). Sections:
 *   1. Screen Previewer — categorized, filterable, status-dotted cards.
 *      PREVIEW cards load in an iframe drawer. SET_FLAG/OPEN/PLAY cards
 *      show a toast with a "Go there now →" action instead of silently
 *      navigating away.
 *   2. Quick Actions.
 *   3. Role Simulator.
 */
import { useEffect, useMemo, useState } from "react";
import { Code, X, ChevronDown, ChevronRight } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/splash/SplashScreen";
import { triggerIrisBolt } from "@/lib/iris-bolt";
import { notifyDevSimChange } from "@/hooks/useDevSim";

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? "https://hqtmulghixcirvamdcol.supabase.co";

/** Fallback mission ID used by PREVIEW iframe cards when the admin isn't
 * currently inside a mission context. Real mission pages still use the
 * mission ID from the URL when available. */
const FALLBACK_MID = "128da20f-9479-4108-b6b9-0017595509b1";

type ScreenKind = "iframe" | "splash" | "simulate" | "modal" | "anim";
type StatusDot = "green" | "amber" | "red";

type ScreenCard = {
  id: string;
  name: string;
  description: string;
  kind: ScreenKind;
  /** iframe: explicit URL (use {MID} placeholder for mission-scoped) */
  href?: string;
  /** modal: button-text matcher to click after navigation */
  modal?: string;
  /** anim: which animation to trigger */
  anim?: "splash" | "bolt" | "whisper" | "scan" | "iris_loading";
  /** simulate: sessionStorage flag to set */
  flag?: string;
  /** simulate/modal/anim: where to send the user when they click "Go there now →" */
  destinationUrl?: string;
  /** simulate destination label, e.g. "Flight Deck" */
  destinationLabel?: string;
  /** static status dot — set per the audit */
  status: StatusDot;
  /** When true, route doesn't exist — render as disabled "Not built" card */
  notBuilt?: boolean;
};

type Category = { id: string; label: string; cards: ScreenCard[] };

const SAMPLE_DRAFT =
  "PerformCare will develop a process within the Call Center to identify Youth involved with DCP&P and refer calls to appropriate staff. We will obtain CSOC approval prior to implementation and maintain documentation of all referrals.";

const SAMPLE_WHISPER =
  "⚡ New waiver guidance published June 19 — may affect Section 4 compliance requirements.";

// {MID} is replaced at click time with the current mission ID (or FALLBACK_MID).
const M = "{MID}";

const CATEGORIES: Category[] = [
  {
    id: "auth",
    label: "Auth & Onboarding",
    cards: [
      { id: "login",      name: "Login Screen",   description: "First screen new users see",        kind: "iframe", href: "/login?preview=1",                                 status: "green" },
      { id: "welcome",    name: "Welcome Screen", description: "Post-auth landing (forces replay)", kind: "iframe", href: "/welcome?preview=1&iris-demo=1",                   status: "green" },
      { id: "onboarding", name: "Onboarding",     description: "New user setup",                    kind: "iframe", href: "/onboarding?preview=1",                            status: "green" },
      { id: "new-user",   name: "New User Experience", description: "Writer with no assignments, first visit", kind: "iframe", href: `/missions/${M}/flight-deck?preview=1&sim=new_user`, status: "green" },
    ],
  },
  {
    id: "roles",
    label: "Role Views",
    cards: [
      { id: "role-writer",   name: "Writer (5 questions)", description: "Flight Deck as a writer",         kind: "simulate", flag: "atlas_preview_role:Writer",          destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Writer View",          status: "green" },
      { id: "role-sme",      name: "SME View",             description: "SME review queue",                kind: "simulate", flag: "atlas_preview_role:SME",             destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "SME View",             status: "green" },
      { id: "role-lead",     name: "Engagement Lead",      description: "ATC with full team data",         kind: "simulate", flag: "atlas_preview_role:Engagement Lead", destinationUrl: `/missions/${M}/war-room`,    destinationLabel: "Engagement Lead View", status: "green" },
      { id: "role-reviewer", name: "Reviewer",             description: "Red team review mode",            kind: "simulate", flag: "atlas_preview_role:Reviewer",        destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Reviewer View",        status: "green" },
      { id: "role-readonly", name: "Read-Only (Closed)",   description: "Mission after submission deadline", kind: "simulate", flag: "atlas_sim_readonly",                destinationUrl: `/missions/${M}/briefing`,    destinationLabel: "Read-Only Mission",    status: "green" },
    ],
  },
  {
    id: "empty",
    label: "Empty States",
    cards: [
      { id: "empty-mission",      name: "Empty Mission",       description: "New mission, nothing set up",     kind: "simulate", flag: "atlas_sim_empty_mission",     destinationUrl: `/missions/${M}/briefing`,     destinationLabel: "Empty Mission",       status: "green" },
      { id: "empty-oracle",       name: "Empty ORACLE",        description: "ORACLE with zero intel",          kind: "iframe",   href: `/missions/${M}/olympus?preview=1&sim=empty_oracle`,                                                                  status: "green" },
      { id: "empty-flight-deck",  name: "Empty Flight Deck",   description: "Writer with no assigned questions", kind: "simulate", flag: "atlas_sim_empty_flightdeck",  destinationUrl: `/missions/${M}/flight-deck`,  destinationLabel: "Empty Flight Deck",   status: "green" },
      { id: "empty-atc",          name: "Empty ATC",           description: "No team activity",                kind: "iframe",   href: `/missions/${M}/war-room?preview=1&sim=empty_atc`,                                                                    status: "green" },
      { id: "empty-briefing",     name: "Empty Briefing Room", description: "No north star or win themes",     kind: "simulate", flag: "atlas_sim_empty_briefing",    destinationUrl: `/missions/${M}/briefing`,     destinationLabel: "Empty Briefing Room", status: "green" },
      { id: "empty-intel",        name: "Empty Intelligence",  description: "Zero items in feed",              kind: "iframe",   href: `/missions/${M}/intelligence?preview=1&sim=empty_intelligence`,                                                       status: "green" },
    ],
  },
  {
    id: "admin",
    label: "Admin Pages",
    cards: [
      { id: "admin-home",            name: "Admin Home",        description: "Cross-mission dashboard",         kind: "iframe", href: "/admin?preview=1",                                                                                       status: "green" },
      { id: "admin-mission",         name: "Mission Setup",     description: "Admin mission setup tab",         kind: "simulate", flag: "atlas_sim_mission_setup",       destinationUrl: `/admin/missions/${M}`,    destinationLabel: "Mission Setup", status: "green" },
      { id: "admin-state-intel",     name: "State Intel",       description: "State intelligence packs",        kind: "iframe", href: "/admin/state-intel?preview=1",                                                                            status: "green" },
      { id: "admin-iris-control",    name: "IRIS Control",      description: "Pipeline health dashboard",       kind: "iframe", href: "/admin/iris-control?preview=1",                                                                           status: "green" },
      { id: "admin-iris-writer",     name: "IRIS Writer View",  description: "IRIS writer surface",             kind: "iframe", href: "/admin/iris-writer-view?preview=1",                                                                       status: "green" },
      { id: "admin-iris-studio",     name: "IRIS Studio",       description: "Per-mission voice, language & evaluator persona", kind: "iframe", href: "/admin/iris-studio?preview=1",                                                              status: "green" },
      { id: "admin-language-audit",  name: "Language Audit →",  description: "Open IRIS Studio and auto-run the person-first audit", kind: "iframe", href: "/admin/iris-studio?tab=language&preview=1",                                            status: "green" },
      { id: "admin-staff",           name: "Staff Management",  description: "Team management",                 kind: "iframe", href: "/admin/team?preview=1",                                                                                   status: "green" },
      { id: "admin-messaging",       name: "Messaging",         description: "Platform messaging",              kind: "iframe", href: "/admin/messaging?preview=1",                                                                              status: "green" },
      { id: "admin-email-templates", name: "Email Templates",   description: "Customize the IRIS mission-invite email body", kind: "iframe", href: "/admin/email-templates?preview=1",                                                            status: "green" },
      { id: "olympus",               name: "ORACLE Command",    description: "Cross-mission ORACLE",            kind: "iframe", href: "/olympus?preview=1",                                                                                      status: "green" },
    ],
  },
  {
    id: "wizard",
    label: "Wizard Steps",
    cards: [
      { id: "wiz-1-empty", name: "Wizard Step 1 (Empty)", description: "Fuel IRIS — no docs uploaded",       kind: "simulate", flag: "atlas_sim_wizard:1:empty", destinationUrl: `/olympus/wizard/${M}`, destinationLabel: "Wizard Step 1 (Empty)", status: "green" },
      { id: "wiz-1-ready", name: "Wizard Step 1 (Ready)", description: "Docs tagged, ready to analyze",      kind: "simulate", flag: "atlas_sim_wizard:1:ready", destinationUrl: `/olympus/wizard/${M}`, destinationLabel: "Wizard Step 1 (Ready)", status: "green" },
      { id: "wiz-2",       name: "Wizard Step 2",         description: "State intelligence step",            kind: "simulate", flag: "atlas_sim_wizard:2",       destinationUrl: `/olympus/wizard/${M}`, destinationLabel: "Wizard Step 2",         status: "green" },
      { id: "wiz-9",       name: "Wizard Step 9",         description: "Review & Launch final step",         kind: "simulate", flag: "atlas_sim_wizard:9",       destinationUrl: `/olympus/wizard/${M}`, destinationLabel: "Wizard Step 9",         status: "green" },
    ],
  },
  {
    id: "errors",
    label: "Error & Edge States",
    cards: [
      { id: "err-404",         name: "404 Page",           description: "Page not found",                    kind: "iframe",   href: "/this-page-does-not-exist-404-test",                                                                       status: "green" },
      { id: "err-access",      name: "Access Denied",      description: "Non-admin tries admin page",        kind: "simulate", flag: "atlas_sim_access_denied",  destinationUrl: `/missions/${M}/briefing`, destinationLabel: "Access Denied", status: "green" },
      { id: "err-mission-404", name: "Mission Not Found",  description: "Invalid mission ID",                kind: "iframe",   href: "/missions/00000000-0000-0000-0000-000000000000/briefing?preview=1",                                       status: "green" },
      { id: "err-pipeline",    name: "Pipeline Error",     description: "IRIS Control with a cron failure",  kind: "simulate", flag: "atlas_sim_pipeline_error", destinationUrl: "/admin/iris-control",     destinationLabel: "Pipeline Error", status: "green" },
    ],
  },
  {
    id: "modals",
    label: "Modals & Panels",
    cards: [
      { id: "m-checkin-ontrack", name: "Check-In: On Track",    description: "Check-in submitted as On Track",    kind: "modal", modal: "checkin_ontrack", destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Check-In: On Track", status: "amber" },
      { id: "m-checkin-blocked", name: "Check-In: Blocked",     description: "Check-in submitted as Blocked",     kind: "modal", modal: "checkin_blocked", destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Check-In: Blocked", status: "green" },
      { id: "m-checkin-sme",     name: "Check-In: Need SME",    description: "Check-in requesting SME help",      kind: "modal", modal: "checkin_sme",     destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Check-In: Need SME", status: "green" },
      { id: "m-score-empty",     name: "Score Me: Empty",       description: "Score Me before pasting draft",     kind: "modal", modal: "score_me",        destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Score Me", status: "amber" },
      { id: "m-score-results",   name: "Score Me: Results",     description: "Score Me with rubric + authenticity", kind: "modal", modal: "score_me_results", destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Score Me: Results", status: "green" },
      { id: "m-evaluator",       name: "Evaluator Simulation",  description: "Evaluator voice feedback mode",     kind: "modal", modal: "evaluator_sim",   destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Evaluator Sim", status: "green" },
      { id: "m-sticky-empty",    name: "Sticky Notes: Empty",   description: "No notes pinned yet",               kind: "modal", modal: "sticky_empty",    destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Sticky Notes", status: "amber" },
      { id: "m-sticky-notes",    name: "Sticky Notes: With Notes", description: "Sticky notes with sample cards", kind: "modal", modal: "sticky_notes",    destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Sticky Notes", status: "amber" },
      { id: "m-nudge",           name: "Nudge: With Team",      description: "Nudge modal with team members",     kind: "modal", modal: "nudge",           destinationUrl: `/missions/${M}/war-room`,    destinationLabel: "Nudge", status: "amber" },
      { id: "m-iris-chat",       name: "IRIS Chat",             description: "Ask IRIS chat panel open",          kind: "modal", modal: "iris_chat",       destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "IRIS Chat", status: "amber" },
      { id: "m-search-empty",    name: "Global Search: Empty",  description: "Cmd+K with no query",               kind: "modal", modal: "search_empty",    destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Global Search", status: "amber" },
      { id: "m-search-intent",   name: "Global Search: Intent", description: "Typing 'check in' — intent match",  kind: "modal", modal: "search_intent",   destinationUrl: `/missions/${M}/flight-deck`, destinationLabel: "Global Search", status: "amber" },
      { id: "m-writer-drawer",   name: "WriterDrawer: Questions", description: "ATC writer drawer with questions", kind: "modal", modal: "writer_drawer",  destinationUrl: `/missions/${M}/war-room`,    destinationLabel: "Writer Drawer", status: "amber" },
    ],
  },
  {
    id: "anims",
    label: "Animations",
    cards: [
      { id: "a-splash",       name: "Splash Screen",     description: "Constellation load animation",   kind: "anim", anim: "splash",       destinationUrl: "/admin",                          destinationLabel: "Splash",       status: "green" },
      { id: "a-iris-loading", name: "IRIS Brief Loading", description: "Particle field thinking state", kind: "anim", anim: "iris_loading", destinationUrl: `/missions/${M}/flight-deck`,      destinationLabel: "IRIS Loading", status: "green" },
      { id: "a-whisper",      name: "Whisper Arrival",   description: "Whisper drop animation",         kind: "anim", anim: "whisper",      destinationUrl: `/missions/${M}/flight-deck`,      destinationLabel: "Whisper",      status: "green" },
      { id: "a-scan",         name: "Score Me Scan",     description: "Evaluator reading scan line",    kind: "anim", anim: "scan",         destinationUrl: `/missions/${M}/flight-deck`,      destinationLabel: "Score Scan",   status: "green" },
      { id: "a-bolt",         name: "Bolt Flash",        description: "Lightning bolt IRIS activation", kind: "anim", anim: "bolt",                                                                                              status: "green" },
    ],
  },
];

const ROLE_KEY = "atlas_preview_role";
const SPLASH_KEY = "atlas_splash_shown";
const MODAL_STATE_KEY = "atlas_dev_modal_state";
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

function resolveUrl(template: string | undefined, missionId: string | null): string {
  if (!template) return "";
  return template.replaceAll("{MID}", missionId ?? FALLBACK_MID);
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

function dotColor(s: StatusDot): string {
  if (s === "green") return "rgba(74,222,128,0.85)";
  if (s === "amber") return "rgba(251,191,36,0.85)";
  return "rgba(248,113,113,0.85)";
}

export function DevToolsPanel() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [playSplash, setPlaySplash] = useState(false);
  const [overlay, setOverlay] = useState<string | null>(null);
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
    if (!open && !previewUrl && !playSplash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playSplash) setPlaySplash(false);
      else if (previewUrl) setPreviewUrl(null);
      else if (open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, previewUrl, playSplash]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("atlas-devtools-open", onOpen);
    return () => window.removeEventListener("atlas-devtools-open", onOpen);
  }, []);

  if (!isAdmin) return null;

  const showOverlay = (text: string, ms = 2000) => {
    setOverlay(text);
    setTimeout(() => setOverlay((v) => (v === text ? null : v)), ms);
  };

  const goThereToast = (label: string, url: string) => {
    toast.success(`${label} flag set ✓`, {
      description: `Navigate to ${label.toLowerCase()} to see it.`,
      duration: 5000,
      action: {
        label: "Go there now →",
        onClick: () => window.location.assign(url),
      },
    });
  };

  const setFlag = (flag?: string) => {
    if (!flag) return;
    try {
      if (flag.startsWith("atlas_preview_role:")) {
        const role = flag.split(":")[1] as Role;
        if (role === "Admin") sessionStorage.removeItem(ROLE_KEY);
        else sessionStorage.setItem(ROLE_KEY, role);
        setActiveRole(role);
      } else if (flag.startsWith("atlas_sim_wizard:")) {
        // value carries step + optional variant: "1:empty" | "1:ready" | "2" | "9"
        sessionStorage.setItem("atlas_sim_wizard", flag.slice("atlas_sim_wizard:".length));
      } else {
        sessionStorage.setItem(flag, "1");
      }
    } catch {}
    notifyDevSimChange();
  };

  const runModal = async (s: ScreenCard) => {
    const modal = s.modal!;
    setOpen(false);
    showOverlay(`Dev Tools: Opening ${s.name}…`, 2500);

    const onFlightDeck = pathname.includes("/flight-deck");
    const onWarRoom = pathname.includes("/war-room");
    const needFlightDeck = ["checkin_ontrack","checkin_blocked","checkin_sme","score_me","score_me_results","evaluator_sim","sticky_empty","sticky_notes","iris_chat","search_empty","search_intent"].includes(modal);
    const needWarRoom = modal === "writer_drawer" || modal === "nudge";

    // Set pre-fill state for modals that need it
    try {
      if (modal === "checkin_blocked") sessionStorage.setItem(MODAL_STATE_KEY, "blocked");
      else if (modal === "checkin_sme") sessionStorage.setItem(MODAL_STATE_KEY, "sme");
      else if (modal === "score_me_results") sessionStorage.setItem(MODAL_STATE_KEY, "results");
      else if (modal === "evaluator_sim") sessionStorage.setItem(MODAL_STATE_KEY, "evaluator");
      else sessionStorage.removeItem(MODAL_STATE_KEY);
    } catch {}

    if ((needFlightDeck && !onFlightDeck) || (needWarRoom && !onWarRoom)) {
      const url = resolveUrl(s.destinationUrl, missionId);
      if (!url) { toast.error("No destination configured."); return; }
      window.location.assign(url);
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

  const runAnim = (s: ScreenCard) => {
    const anim = s.anim!;
    setOpen(false);
    showOverlay(`Dev Tools: Playing ${s.name}…`, 2000);

    if (anim === "bolt") {
      triggerIrisBolt("iris");
      triggerIrisBolt("brief");
      triggerIrisBolt("score");
      triggerIrisBolt("whisper");
      triggerIrisBolt("alert");
      return;
    }

    if (anim === "splash") {
      try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
      // If we're on /admin already, just replay in place; otherwise navigate so splash fires on load.
      if (pathname.startsWith("/admin")) {
        setPlaySplash(true);
      } else {
        window.location.assign(resolveUrl(s.destinationUrl, missionId) || "/admin");
      }
      return;
    }

    // whisper / scan / iris_loading — need Flight Deck context
    const onFlightDeck = pathname.includes("/flight-deck");
    if (!onFlightDeck && s.destinationUrl) {
      window.location.assign(resolveUrl(s.destinationUrl, missionId));
      return;
    }

    if (anim === "whisper") {
      window.dispatchEvent(new CustomEvent("atlas-dev-whisper", { detail: { text: SAMPLE_WHISPER } }));
      toast.success("Whisper dispatched.");
    } else if (anim === "scan") {
      window.dispatchEvent(new CustomEvent("atlas-dev-scan", { detail: { text: SAMPLE_DRAFT } }));
      toast.success("Scan animation dispatched.");
    } else if (anim === "iris_loading") {
      window.dispatchEvent(new CustomEvent("atlas-dev-iris-loading", { detail: { ms: 5000 } }));
      toast.success("IRIS loading state dispatched (5s).");
    }
  };

  const handleScreen = (s: ScreenCard) => {
    if (s.notBuilt) return;

    if (s.kind === "splash") {
      try { sessionStorage.removeItem(SPLASH_KEY); } catch {}
      setPlaySplash(true);
      return;
    }
    if (s.kind === "anim") { runAnim(s); return; }
    if (s.kind === "modal") { void runModal(s); return; }
    if (s.kind === "iframe") {
      const url = resolveUrl(s.href, missionId);
      setPreviewUrl(url);
      setPreviewName(s.name);
      return;
    }
    if (s.kind === "simulate") {
      setFlag(s.flag);
      const destUrl = resolveUrl(s.destinationUrl, missionId);
      const destLabel = s.destinationLabel ?? s.name;
      if (destUrl) goThereToast(destLabel, destUrl);
      else toast.success(`${s.name}: flag set.`);
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
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
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

      {/* Drawer — full viewport width, slides up from the bottom */}
      <div
        role="dialog"
        aria-hidden={!open}
        {...(!open ? { inert: "" as any } : {})}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          width: "100vw",
          height: 540,
          background: "#050d18",
          borderTop: "1px solid rgba(196,154,43,0.3)",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 250ms ease-out",
          zIndex: 9990,
          color: "rgba(255,255,255,0.85)",
          display: "flex",
          flexDirection: "column",
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
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
              placeholder="🔍 Filter screens..."
              style={{
                width: "100%",
                height: 28,
                padding: "0 10px",
                marginBottom: 10,
                fontSize: 11,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                color: "white",
                outline: "none",
              }}
            />
            <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
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
                        textTransform: "",
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
                        {visible.map((s) => {
                          const cta = s.notBuilt
                            ? "Not built"
                            : s.kind === "anim" ? "Play →"
                            : s.kind === "modal" ? "Open →"
                            : s.kind === "simulate" ? "Set flag →"
                            : "Preview →";
                          const ctaColor = s.notBuilt ? "rgba(255,255,255,0.35)" : "#c9a84c";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleScreen(s)}
                              disabled={s.notBuilt}
                              className="text-left"
                              style={{
                                position: "relative",
                                width: "100%",
                                minHeight: 72,
                                padding: 10,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 6,
                                cursor: s.notBuilt ? "not-allowed" : "pointer",
                                opacity: s.notBuilt ? 0.4 : 1,
                              }}
                              onMouseEnter={(e) => { if (!s.notBuilt) e.currentTarget.style.borderColor = "rgba(196,154,43,0.6)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                            >
                              <span
                                aria-hidden
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  width: 4,
                                  height: 4,
                                  borderRadius: 999,
                                  background: dotColor(s.status),
                                }}
                              />
                              <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>{s.name}</div>
                              <div
                                style={{
                                  color: "rgba(255,255,255,0.5)",
                                  fontSize: 9,
                                  marginTop: 2,
                                  fontStyle: s.notBuilt ? "italic" : "normal",
                                }}
                              >
                                {s.notBuilt ? "(Not yet built)" : s.description}
                              </div>
                              <div style={{ color: ctaColor, fontSize: 9, marginTop: 4 }}>{cta}</div>
                            </button>
                          );
                        })}
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

      {/* Iframe preview overlay (full screen, above drawer) */}
      {previewUrl && (
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
            <div style={{ color: "white", fontSize: 13 }}>{previewName}</div>
            <div
              style={{
                color: "rgba(255,255,255,0.45)",
                fontSize: 9,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {previewUrl}
            </div>
            <div className="flex items-center gap-3">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#c9a84c", fontSize: 11 }}
              >
                Open in new tab →
              </a>
              <button onClick={() => setPreviewUrl(null)} style={{ color: "white", fontSize: 11 }}>
                × Close Preview
              </button>
            </div>
          </div>
          <iframe
            src={previewUrl}
            title={previewName}
            data-preview-mode="true"
            style={{ flex: 1, width: "100%", height: 360, border: 0, background: "#000" }}
          />
        </div>
      )}

      {/* Action overlay indicator */}
      {overlay && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 64,
            zIndex: 9999,
            padding: "6px 10px",
            background: "rgba(5,13,24,0.95)",
            border: "1px solid rgba(196,154,43,0.4)",
            borderRadius: 6,
            color: "#c9a84c",
            fontSize: 10,
            letterSpacing: "0.04em",
          }}
        >
          {overlay}
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
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,255,255,0.5)", textTransform: "" }}>
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
