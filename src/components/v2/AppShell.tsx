import { type ReactNode, useEffect, useRef, useState } from "react";
import { triggerClosingFrame } from "@/components/v2/ClosingFrame";
import { Link, useRouterState, useParams, useNavigate, useRouter } from "@tanstack/react-router";
import {
  LogOut, User, Shield, Settings2,
  Plane, HelpCircle, ArrowLeft, Megaphone,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getUnacknowledgedBriefings } from "@/lib/brief-room.functions";

import { useIsAdmin } from "@/hooks/useAccess";
import { toast } from "sonner";


import { NotificationBell } from "@/components/v2/NotificationBell";
import { KeyboardShortcuts } from "@/components/v2/KeyboardShortcuts";
import { IrisStatusIndicator } from "@/components/v2/effects";
import { UpdateRealityMount } from "@/components/v2/UpdateRealityModal";
import { MissionQuickActionsMount } from "@/components/v2/MissionQuickActions";
import { IrisOnboardingMount } from "@/components/onboarding/IrisOnboarding";
import { AtlasWelcomeMount } from "@/components/v2/AtlasWelcomeModal";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IrisDock } from "@/components/v2/IrisDock";
import { MobileBottomNav, MobileBottomNavSpacer } from "@/components/v2/MobileBottomNav";
import { SupportCenterMount } from "@/components/v2/SupportCenter";
import { BriefRoomPinned } from "@/components/brief-room/BriefRoomPinned";
import athenaSgLogo from "@/assets/athena-sg-lockup.png.asset.json";
import atlasLogo from "@/assets/atlas-logo.png.asset.json";

// ─── Room detection (three rooms inside a mission) ─────────────────────────
type Room = "mission" | "studio" | "brief" | null;

function detectRoom(path: string, missionId?: string): Room {
  if (!missionId) return null;
  const tail = path.replace(`/missions/${missionId}`, "");
  if (tail.startsWith("/command")) return "brief";
  // Studio = writer workspace (questions list + question workspace + ask iris)
  if (tail.startsWith("/questions") || tail.startsWith("/iris")) return "studio";
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
        isAtrium={isAtrium}
        room={room}
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

      {inMission && missionId && <UpdateRealityMount missionId={missionId} />}
      {inMission && missionId && <MissionQuickActionsMount missionId={missionId} />}
      <AtlasWelcomeMount />
      <IrisOnboardingMount />
      <IrisDock />
      <MobileBottomNav />
      <SupportCenterMount />
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
function TopBar({
  missionId, isOlympus, isAtrium, room,
}: { missionId?: string; isOlympus: boolean; isAtrium: boolean; room: Room }) {
  const inMission = !!missionId;

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

        <Link to="/atrium" className="flex items-center gap-2.5 shrink-0" title="Atrium">
          <img
            src={atlasLogo.url}
            alt="Atlas"
            className="h-8 w-8 object-contain"
            style={{ filter: "drop-shadow(0 0 6px rgba(125,211,252,0.35))" }}
          />
          <span className="text-[13px] font-extrabold tracking-[0.22em] text-white">ATLAS</span>
          <img src={athenaSgLogo.url} alt="" className="hidden md:block ml-2 h-5 w-auto object-contain opacity-30 mix-blend-luminosity" style={{ filter: "brightness(0.6) contrast(0.9)" }} />
        </Link>

        {inMission && mission && (
          <>
            <span className="hidden lg:block h-5 w-px bg-white/15 mx-2" />
            <Link
              to="/missions/$missionId/overview"
              params={{ missionId: missionId! }}
              className="hidden lg:block max-w-[180px] xl:max-w-[260px] truncate text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
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
      </div>

      {/* CENTER — atrium nav / room toggle (hidden on mobile; bottom nav replaces room toggle) */}
      <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
        {isAtrium ? (
          <AtriumNav />
        ) : isOlympus ? null : inMission && missionId ? (
          <RoomToggle missionId={missionId} room={room} />
        ) : null}
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
        <NotificationBell />
        <BriefRoomNavButton />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-support"))}
          title="Get Help"
          aria-label="Get Help"
          className="inline-flex h-8 items-center justify-center rounded-md px-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
        >
          <HelpCircle size={16} strokeWidth={1.5} />
        </button>


        <SignOutButton />
        <UserAvatarMenu />
        {isAdmin && (
          <Link
            to="/olympus"
            aria-label="Olympus"
            title="Olympus · Admin"
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors ${
              isOlympus ? "bg-white/5 text-foreground" : ""
            }`}
          >
            <Settings2 size={14} strokeWidth={1.5} className="text-[color:var(--athena-gold)]" />
            Olympus
          </Link>
        )}


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
  const items: { to: string; label: string }[] = [
    { to: "/home", label: "Home" },
    { to: "/iris-console", label: "IRIS" },
    { to: "/command/security", label: "Data & Privacy" },
  ];


  return (
    <nav className="flex items-center gap-1">
      {items.map((it) => {
        const active = path === it.to || path.startsWith(it.to + "/");
        return (
          <Link
            key={it.to}
            to={it.to as any}
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

// ─── Room Toggle: mission / cockpit / (brief if leader) ────────────────────
function RoomToggle({ missionId, room }: { missionId: string; room: Room }) {
  const navigate = useNavigate();

  const { data: isLeader = false } = useQuery({
    queryKey: ["shell-is-mission-leader", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("mission_id", missionId);
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      return roles.includes("admin") || roles.includes("lead");
    },
  });

  const briefSegment = {
    key: "brief" as const,
    label: "Brief",
    icon: <span className="text-[14px]">📋</span>,
    activeBg: "rgba(124,58,237,0.12)",
    activeBorder: "rgba(124,58,237,0.45)",
    activeColor: "#a78bfa",
    onGo: () => navigate({ to: "/missions/$missionId/command", params: { missionId } }),
  };
  const missionSegment = {
    key: "mission" as const,
    label: "Mission",
    icon: "🏛",
    activeBg: "rgba(245,158,11,0.12)",
    activeBorder: "rgba(245,158,11,0.35)",
    activeColor: "var(--yellow, #f59e0b)",
    onGo: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }),
  };
  const cockpitSegment = {
    key: "studio" as const,
    label: "Cockpit",
    icon: <Plane size={13} strokeWidth={2} />,
    activeBg: "rgba(59,127,255,0.12)",
    activeBorder: "rgba(59,127,255,0.35)",
    activeColor: "#3b7fff",
    onGo: () => navigate({ to: "/missions/$missionId/questions", params: { missionId } }),
  };

  const segments = isLeader
    ? [briefSegment, missionSegment, cockpitSegment]
    : [missionSegment, cockpitSegment];

  return (
    <div
      className="flex items-center gap-[2px] rounded-[10px] p-[3px]"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      role="tablist"
      aria-label="Room"
    >
      {segments.map((s) => {
        const active = room === s.key;
        return (
          <button
            key={s.key}
            onClick={s.onGo}
            role="tab"
            aria-selected={active}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap transition-all duration-200"
            style={
              active
                ? {
                    background: s.activeBg,
                    border: `1px solid ${s.activeBorder}`,
                    color: s.activeColor,
                  }
                : {
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--muted-foreground)",
                  }
            }
          >
            <span style={{ color: active ? s.activeColor : "var(--muted-foreground)" }}>
              {typeof s.icon === "string" ? <span className="text-[14px]">{s.icon}</span> : s.icon}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Avatar menu ────────────────────────────────────────────────────────────
function UserAvatarMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4" /> Profile
          </button>
          <Link
            to="/olympus"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <Shield className="h-4 w-4 text-[color:var(--athena-gold)]" /> Olympus
          </Link>
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
