import { type ReactNode, useEffect, useRef, useState } from "react";
import { triggerClosingFrame } from "@/components/v2/ClosingFrame";
import { Link, useRouterState, useParams, useNavigate, useRouter } from "@tanstack/react-router";
import {
  LogOut, User, Shield, Settings2,
  Plane, ArrowLeft, Megaphone, Home,
  FileText, Database, Archive, Map as MapIcon, Phone as PhoneIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getUnacknowledgedBriefings } from "@/lib/brief-room.functions";
import { inboxUnreadCount } from "@/lib/expert-consult.functions";

import { useIsAdmin } from "@/hooks/useAccess";
import { toast } from "sonner";


import { NotificationBell } from "@/components/v2/NotificationBell";
import { KeyboardShortcuts } from "@/components/v2/KeyboardShortcuts";
import { IrisStatusIndicator } from "@/components/v2/effects";
import { UpdateRealityMount } from "@/components/v2/UpdateRealityModal";
import { MissionQuickActionsMount } from "@/components/v2/MissionQuickActions";
import { IrisOnboardingMount } from "@/components/onboarding/IrisOnboarding";
import { ProfileSetupWizardMount } from "@/components/onboarding/ProfileSetupWizard";
import { AtlasWelcomeMount } from "@/components/v2/AtlasWelcomeModal";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IrisDock } from "@/components/v2/IrisDock";
import { MobileBottomNav, MobileBottomNavSpacer } from "@/components/v2/MobileBottomNav";
import { SupportCenterMount } from "@/components/v2/SupportCenter";
import { BriefRoomPinned } from "@/components/brief-room/BriefRoomPinned";
import athenaSgLogo from "@/assets/athena-sg-lockup-v2.png.asset.json";
import atlasLogo from "@/assets/athena-mark-v2.png.asset.json";

// ─── Room detection (three rooms inside a mission) ─────────────────────────
type Room = "mission" | "studio" | "brief" | null;

function detectRoom(path: string, missionId?: string): Room {
  if (!missionId) return null;
  const tail = path.replace(`/missions/${missionId}`, "");
  if (tail.startsWith("/command")) return "brief";
  // Studio = writer workspace (questions list + question workspace + ask iris)
  if (tail.startsWith("/sections") || tail.startsWith("/iris")) return "studio";
  // Everything else inside a mission is Mission Room
  return "mission";
}

// ─── Shell ──────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;
  const inMission = path.startsWith("/missions/") && !!missionId;
  const room = detectRoom(path, missionId);
  const isOlympus = path.startsWith("/olympus");
  const isPlatformAdmin = path.startsWith("/admin");
  const isAtrium = path === "/home" || path === "/" || path.startsWith("/atrium");
  const isStudio = room === "studio";
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const showBetaBanner = !adminLoading && !isAdmin;


  // Room-based background. Mission Room = deep #060b14. Studio = warmer #0a0e1a.
  const mainBg = isStudio ? "#0a0e1a" : "var(--background, #060b14)";

  return (
    <div className="flex min-h-screen w-full flex-col text-foreground" style={{ background: mainBg, transition: "background-color 300ms ease" }}>
      <KeyboardShortcuts />
      <CommandPalette />

      <TopBar
        missionId={missionId}
        isOlympus={isOlympus}
        isPlatformAdmin={isPlatformAdmin}
        isAtrium={isAtrium}
      />

      {showBetaBanner && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-100 text-xs px-4 py-1.5 text-center">
          <span className="font-medium">Beta · Read-only mode.</span>{" "}
          You can view everything but cannot edit, assign, upload, or delete during the beta period. Contact an admin for changes.
        </div>
      )}

      <BriefRoomPinned />

      <main className="flex-1 min-w-0">

        <div key={path} className="route-fade min-h-full">{children}</div>
        <MobileBottomNavSpacer />
      </main>

      {inMission && missionId && !path.includes("/flight-deck") && <UpdateRealityMount missionId={missionId} />}
      {inMission && missionId && <MissionQuickActionsMount missionId={missionId} />}
      <AtlasWelcomeMount />
      <IrisOnboardingMount />
      <ProfileSetupWizardMount />
      {!path.includes("/flight-deck") && <IrisDock />}
      <MobileBottomNav />
      <SupportCenterMount />
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
function TopBar({
  missionId, isOlympus, isPlatformAdmin, isAtrium,
}: { missionId?: string; isOlympus: boolean; isPlatformAdmin: boolean; isAtrium: boolean }) {
  const inMission = !!missionId;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isProfile = path === "/profile" || path.startsWith("/profile/");
  const isFlightDeck = path.includes("/flight-deck");

  // Per the Permissions spec: Olympus is invisible in nav for non-admins.
  // No greyed-out link, no lock icon — absent entirely.
  const { isAdmin } = useIsAdmin();

  const { data: mission } = useQuery({
    queryKey: ["shell-mission-name", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions").select("id,name,client").eq("id", missionId!).maybeSingle();
      return data as { id: string; name: string; client: string } | null;
    },
  });

  return (
    <header
      className="sticky top-0 z-[1000] flex h-14 w-full items-center gap-3 border-b px-4"
      style={{
        background: "#060b14",
        borderColor: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* LEFT — back + logo + mission name */}
      <div className="flex min-w-0 items-center gap-3">
        <BackButton isAtrium={isAtrium} />

        {inMission && missionId ? (
          <Link
            to="/missions/$missionId/brief"
            params={{ missionId }}
            className="flex items-center gap-2.5 shrink-0"
            title="Mission Brief"
          >
            {isFlightDeck ? (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-[11px] font-black tracking-[0.08em] text-[color:var(--athena-gold,#f59e0b)]">
                A
              </span>
            ) : (
              <img
                src={atlasLogo.url}
                alt="Atlas"
                className="h-8 w-8 object-contain"
                style={{ filter: "drop-shadow(0 0 6px rgba(125,211,252,0.35))" }}
              />
            )}
            <span className="text-[13px] font-extrabold tracking-[0.22em] text-white">ATLAS</span>
          </Link>
        ) : (
          <Link to="/home" className="flex items-center gap-2.5 shrink-0" title="Home">
            <img
              src={atlasLogo.url}
              alt="Atlas"
              className="h-8 w-8 object-contain"
              style={{ filter: "drop-shadow(0 0 6px rgba(125,211,252,0.35))" }}
            />
            <span className="text-[13px] font-extrabold tracking-[0.22em] text-white">ATHENA HQ</span>
            <img src={athenaSgLogo.url} alt="" className="hidden md:block ml-2 h-5 w-auto object-contain opacity-30 mix-blend-luminosity" style={{ filter: "brightness(0.6) contrast(0.9)" }} />
          </Link>
        )}

        {inMission && mission && (
          <>
            <span className="hidden 2xl:block h-5 w-px bg-white/15 mx-2" />
            <Link
              to="/missions/$missionId/brief"
              params={{ missionId: missionId! }}
              className="hidden 2xl:block max-w-[220px] truncate text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={mission.name}
            >
              {mission.name}
            </Link>
          </>
        )}
        {isOlympus && (
          <>
            <span className="hidden sm:block h-5 w-px bg-white/15 mx-2" />
            <span className="hidden sm:block text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              OLYMPUS
            </span>
          </>
        )}
        {isPlatformAdmin && (
          <>
            <span className="hidden sm:block h-5 w-px bg-white/15 mx-2" />
            <span className="hidden sm:block text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              ADMIN
            </span>
          </>
        )}
      </div>

      {/* CENTER — atrium nav / mission nav (hidden on mobile; bottom nav replaces) */}
      <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
        {inMission && missionId ? (
          <MissionNav missionId={missionId} />
        ) : isOlympus || isPlatformAdmin ? null : (
          <AtriumNav />
        )}
      </div>

      {/* RIGHT */}
      <div className="ml-auto md:ml-0 flex shrink-0 items-center gap-2">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("atlas:open-search"));
          }}
          title="Search & Jump (⌘K)"
          aria-label="Open command palette"
          className="hidden xl:inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11px] text-muted-foreground hover:border-[color:var(--iris,#22d3ee)]/30 hover:bg-[color:var(--iris,#22d3ee)]/[0.05] hover:text-foreground transition-colors"
        >
          <span>Jump to…</span>
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
        </button>
        <IrisStatusIndicator />
        {/* Atrium button removed from header — admins reach it via Olympus/avatar */}
        <InboxNavButton />
        <NotificationBell />
        <UserAvatarMenu />
        <OlympusNavLink isOlympus={isOlympus} />



      </div>
    </header>
  );
}

// ─── Back button ──────────────────────────────────────────────────────────
function BackButton({ isAtrium }: { isAtrium: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  if (isAtrium) return null;
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.history.back();
        else navigate({ to: "/home" });
      }}
      title="Back"
      aria-label="Back"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
    >
      <ArrowLeft size={16} strokeWidth={1.5} />
    </button>
  );
}

// ─── Brief Room nav button with unack badge ───────────────────────────────
function BriefRoomNavButton() {
  const fn = useServerFn(getUnacknowledgedBriefings);
  const { data } = useQuery({
    queryKey: ["brief-room", "pending"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/brief-room"
      title={count > 0 ? `You have ${count} unacknowledged briefing(s).` : "Brief Room"}
      aria-label="Brief Room"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
    >
      <Megaphone size={16} strokeWidth={1.5} />
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold inline-flex items-center justify-center"
          style={{ background: "var(--athena-gold, #f59e0b)", color: "#0a0a0a" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

// ─── Inbox nav button with unread badge ───────────────────────────────────
function InboxNavButton() {
  const fn = useServerFn(inboxUnreadCount);
  const { data } = useQuery({
    queryKey: ["inbox-unread"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/inbox"
      title={count > 0 ? `${count} open Phone-a-Friend consult${count === 1 ? "" : "s"}` : "Phone-a-Friend Inbox"}
      aria-label="Phone a Friend Inbox"
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
    >
      <PhoneIcon size={16} strokeWidth={1.5} />
      {count > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold inline-flex items-center justify-center"
          style={{ background: "var(--athena-gold, #f59e0b)", color: "#0a0a0a" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}



// ─── Sign out button (always visible in header) ───────────────────────────
function SignOutButton() {
  return (
    <button
      onClick={() => triggerClosingFrame()}
      title="Sign out"
      aria-label="Sign out"
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
    >
      <LogOut size={14} strokeWidth={1.5} />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}

// ─── Atrium top-bar nav ───────────────────────────────────────────────────
function AtriumNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // V1 collapse: Athena HQ + Status Report dropped; Profile lives in the
  // avatar menu. Admins still see the Olympus / Admin entry on the right.
  const items: { to: string; label: string }[] = [];


  return (
    <nav className="flex items-center gap-1" data-tour="atrium-nav">
      {items.map((it) => {
        const active = path === it.to || path.startsWith(it.to + "/");
        return (
          <Link
            key={it.to}
            to={it.to as any}
            data-tour={`atrium-nav-${it.to.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] rounded-md transition-colors"
            style={{
              color: active ? "var(--athena-gold, #f59e0b)" : "var(--muted-foreground)",
              background: active ? "rgba(245,158,11,0.08)" : "transparent",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Mission Nav: 5-item primary nav inside a mission ─────────────────────
// PR 2b: routes have been renamed (overview→brief, library→intel) and
// /journey-map has been promoted into the mission interior.
function MissionNav({ missionId }: { missionId: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const base = `/missions/${missionId}`;

  const items: Array<{
    key: string;
    label: string;
    icon: ReactNode;
    to: string;
    search?: Record<string, string>;
    active: boolean;
  }> = [
    {
      key: "flight deck",
      label: "Flight Deck",
      icon: <Plane size={13} strokeWidth={1.75} />,
      to: `${base}/flight-deck`,
      active:
        path === base ||
        path === `${base}/` ||
        path.startsWith(`${base}/flight-deck`) ||
        path === `${base}/overview` ||
        path.startsWith(`${base}/sections`) ||
        path.startsWith(`${base}/scaffold`),
    },
    {
      key: "brief",
      label: "Mission Brief",
      icon: <FileText size={13} strokeWidth={1.75} />,
      to: `${base}/brief`,
      active: path === `${base}/brief`,
    },
    {
      key: "intel",
      label: "Mission Intel",
      icon: <Database size={13} strokeWidth={1.75} />,
      to: `${base}/intel`,
      active: path.startsWith(`${base}/intel`) || path.startsWith(`${base}/library`),
    },
    {
      key: "vault",
      label: "Mission Vault",
      icon: <Archive size={13} strokeWidth={1.75} />,
      to: `${base}/vault`,
      active: path.startsWith(`${base}/vault`),
    },
    {
      key: "journey",
      label: "Journey Map",
      icon: <MapIcon size={13} strokeWidth={1.75} />,
      to: `${base}/journey-map`,
      active: path.startsWith(`${base}/journey-map`),
    },
  ];

  return (
    <nav
      className="flex items-center gap-[2px] rounded-[10px] p-[3px]"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      aria-label="Mission navigation"
    >
      {items.map((it) => (
        <Link
          key={it.key}
          to={it.to as any}
          search={it.search as any}
          aria-current={it.active ? "page" : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-all duration-200"
          style={
            it.active
              ? {
                  background: "rgba(245,158,11,0.12)",
                  border: "1px solid rgba(245,158,11,0.35)",
                  color: "var(--athena-gold, #f59e0b)",
                }
              : {
                  background: "transparent",
                  border: "1px solid transparent",
                  color: "var(--muted-foreground)",
                }
          }
        >
          <span style={{ color: it.active ? "var(--athena-gold, #f59e0b)" : "var(--muted-foreground)" }}>
            {it.icon}
          </span>
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ─── Avatar menu ────────────────────────────────────────────────────────────
function UserAvatarMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { isAdmin } = useIsAdmin();

  const { data: profile } = useQuery({
    queryKey: ["shell-me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", user.id).maybeSingle();
      const name = data?.display_name?.trim() || data?.email?.split("@")[0] || user.email?.split("@")[0] || "?";
      return { name, email: data?.email ?? user.email ?? "" };
    },
  });

  // Phase 5 — Olympus link must NOT leak to non-execs/non-admins via the
  // avatar dropdown. Mirrors the visibility rule used by OlympusNavLink.
  const { data: isExec } = useQuery({
    queryKey: ["shell-is-exec"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "executive_sponsor")
        .limit(1);
      return (data ?? []).length > 0;
    },
    staleTime: 60_000,
  });
  const canSeeOlympus = isAdmin || !!isExec;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initials = (profile?.name ?? "?")
    .split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  function signOut() {
    setOpen(false);
    triggerClosingFrame();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary hover:bg-primary/25 transition-colors"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div className="modal-surface absolute right-0 top-10 z-50 w-56 p-1 text-sm">
          <div className="border-b border-border px-3 py-2.5">
            <div className="truncate text-sm font-medium">{profile?.name}</div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
          </div>
          <Link
            to="/profile"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" /> Profile
          </Link>
          <Link
            to="/flight-deck"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <Plane className="h-4 w-4 text-[#3b7fff]" /> Flight Deck
          </Link>
          {canSeeOlympus && (
            <Link
              to="/olympus"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <Shield className="h-4 w-4 text-[color:var(--athena-gold)]" /> Olympus
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/admin"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Olympus nav link — visible to admins and to users with `executive_sponsor` mission role (Phase 5).
function OlympusNavLink({ isOlympus }: { isOlympus: boolean }) {
  const { isAdmin } = useIsAdmin();
  const { data: isExec } = useQuery({
    queryKey: ["shell-is-exec"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "executive_sponsor")
        .limit(1);
      return (data ?? []).length > 0;
    },
    staleTime: 60_000,
  });

  if (!isAdmin && !isExec) return null;

  return (
    <Link
      to="/olympus"
      aria-label="Olympus"
      title="Olympus · Strategic Portfolio View"
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors ${
        isOlympus ? "bg-white/5 text-foreground" : ""
      }`}
    >
      <Settings2 size={14} strokeWidth={1.5} className="text-[color:var(--athena-gold)]" />
      Olympus
    </Link>
  );
}

