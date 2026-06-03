import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useRouterState, useParams, useNavigate } from "@tanstack/react-router";
import {
  LogOut, User, Shield, Settings2,
  Plane, Search, HelpCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { toast } from "sonner";

import { NotificationBell } from "@/components/v2/NotificationBell";
import { KeyboardShortcuts } from "@/components/v2/KeyboardShortcuts";
import { IrisStatusIndicator } from "@/components/v2/effects";
import { UpdateRealityMount } from "@/components/v2/UpdateRealityModal";
import { IrisOnboardingMount } from "@/components/v2/IrisOnboardingModal";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IrisDock } from "@/components/v2/IrisDock";
import { MobileBottomNav, MobileBottomNavSpacer } from "@/components/v2/MobileBottomNav";
import { SupportCenterMount } from "@/components/v2/SupportCenter";
import athenaSgLogo from "@/assets/athena-sg-lockup.png.asset.json";

// ─── Room detection (only two rooms inside a mission) ──────────────────────
type Room = "mission" | "studio" | null;

function detectRoom(path: string, missionId?: string): Room {
  if (!missionId) return null;
  const tail = path.replace(`/missions/${missionId}`, "");
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
  const isAtrium = path === "/home" || path === "/";
  const isStudio = room === "studio";

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

      <main className="flex-1 min-w-0">
        <div key={path} className="route-fade min-h-full">{children}</div>
        <MobileBottomNavSpacer />
      </main>

      {inMission && missionId && isStudio && <UpdateRealityMount missionId={missionId} />}
      <IrisOnboardingMount />
      <IrisDock />
      <MobileBottomNav />
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
function TopBar({
  missionId, isOlympus, isAtrium, room,
}: { missionId?: string; isOlympus: boolean; isAtrium: boolean; room: Room }) {
  const inMission = !!missionId;

  const { data: isPrivileged = false } = useQuery({
    queryKey: ["shell-is-privileged"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.from("mission_members").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r: { role: string }) => r.role);
      return roles.includes("admin") || roles.includes("lead") || roles.length === 0;
    },
  });

  const attentionFn = useServerFn(irisLeadershipAttention);
  useQuery({ queryKey: ["leadership-attention"], queryFn: () => attentionFn(), refetchInterval: 60_000 });

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
      {/* LEFT — logo + mission name */}
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/home" className="flex items-center gap-2 shrink-0" title="Atrium">
          <img src={athenaSgLogo.url} alt="" className="h-6 w-6 object-contain" />
          <span className="text-[color:var(--athena-gold)] text-sm leading-none">⚡</span>
          <span className="text-[13px] font-extrabold tracking-[0.2em] text-white">ATLAS</span>
        </Link>

        {inMission && mission && (
          <>
            <span className="hidden sm:block h-5 w-px bg-white/15 mx-2" />
            <Link
              to="/missions/$missionId/overview"
              params={{ missionId: missionId! }}
              className="hidden sm:block max-w-[260px] truncate text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          className="hidden md:inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-[11px] text-muted-foreground hover:border-[color:var(--iris,#22d3ee)]/30 hover:bg-[color:var(--iris,#22d3ee)]/[0.05] hover:text-foreground transition-colors"
        >
          <span>Jump to…</span>
          <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[9px]">⌘K</kbd>
        </button>
        <IrisStatusIndicator />
        <NotificationBell />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-search"))}
          title="Search Atlas (⌘K)"
          aria-label="Search Atlas"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <Search size={16} strokeWidth={1.5} />
        </button>
        <UserAvatarMenu />
        {isPrivileged && (
          <Link
            to="/olympus"
            aria-label="Olympus"
            title="Olympus · Admin"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors ${
              isOlympus ? "bg-white/5 text-foreground" : ""
            }`}
          >
            <Settings2 size={16} strokeWidth={1.5} className="text-[color:var(--athena-gold)]" />
          </Link>
        )}
      </div>
    </header>
  );
}

// ─── Atrium top-bar nav ───────────────────────────────────────────────────
function AtriumNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items: { to: string; label: string }[] = [
    { to: "/home", label: "Home" },
    { to: "/intelligence", label: "Intelligence" },
    { to: "/pipeline-horizon", label: "Pipeline" },
    { to: "/pathfinder", label: "Pathfinder" },
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

// ─── Room Toggle: two segments only ────────────────────────────────────────
function RoomToggle({ missionId, room }: { missionId: string; room: Room }) {
  const navigate = useNavigate();

  const segments = [
    {
      key: "mission" as const,
      label: "Mission Room",
      icon: "🏛",
      activeBg: "rgba(245,158,11,0.12)",
      activeBorder: "rgba(245,158,11,0.35)",
      activeColor: "var(--yellow, #f59e0b)",
      onGo: () => navigate({ to: "/missions/$missionId/overview", params: { missionId } }),
    },
    {
      key: "studio" as const,
      label: "Cockpit",
      icon: <Plane size={13} strokeWidth={2} />,
      activeBg: "rgba(59,127,255,0.12)",
      activeBorder: "rgba(59,127,255,0.35)",
      activeColor: "#3b7fff",
      onGo: () => navigate({ to: "/missions/$missionId/questions", params: { missionId } }),
    },
  ];

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
            className="inline-flex items-center gap-2 rounded-lg px-6 py-2 text-[12px] font-bold uppercase tracking-[0.1em] whitespace-nowrap transition-all duration-200"
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

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
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
