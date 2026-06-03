import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useRouterState, useParams, useNavigate } from "@tanstack/react-router";
import {
  LogOut, User, Shield, Settings2,
  Plane, PenTool, Zap, Sparkles, ChevronRight,
} from "lucide-react";
import { StudioHealthStrip } from "@/components/v2/StudioHealthStrip";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { VaultIcon, OracleIcon } from "@/components/v2/icons/AtlasIcons";
import { toast } from "sonner";

type Mission = { id: string; name: string; client: string; health: "Green" | "Yellow" | "Red"; submission_date: string | null };

import { NotificationBell } from "@/components/v2/NotificationBell";
import { KeyboardShortcuts } from "@/components/v2/KeyboardShortcuts";
import { IrisStatusIndicator } from "@/components/v2/effects";
import { UpdateRealityMount } from "@/components/v2/UpdateRealityModal";
import { IrisOnboardingMount } from "@/components/v2/IrisOnboardingModal";
import { CommandPalette } from "@/components/v2/CommandPalette";
import { IrisDock } from "@/components/v2/IrisDock";
import { RecentStrip, RecentTracker } from "@/components/v2/RecentStrip";
import athenaSgLogo from "@/assets/athena-sg-lockup.png.asset.json";

// ─── Room detection ─────────────────────────────────────────────────────────
type Room = "flightplan" | "studio" | "command" | null;

function detectRoom(path: string, missionId?: string): Room {
  if (path.startsWith("/command")) return "command";
  if (!missionId) return null;
  const tail = path.replace(`/missions/${missionId}`, "");
  if (
    tail.startsWith("/questions") ||
    tail.startsWith("/iris") ||
    tail.startsWith("/studio")
  ) return "studio";
  if (
    tail.startsWith("/intelligence") ||
    tail.startsWith("/library") ||
    tail.startsWith("/briefing") ||
    tail.startsWith("/brief") ||
    tail.startsWith("/team") ||
    tail.startsWith("/activity") ||
    tail.startsWith("/operations")
  ) return "flightplan";
  return null;
}

// ─── Shell ──────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;
  const inMission = path.startsWith("/missions/") && !!missionId;
  const room = detectRoom(path, missionId);
  const isOlympus = path.startsWith("/olympus");
  const isLobby = path === "/home" || path === "/";
  const isQuestionWorkspace = inMission && path.includes("/questions/") && path.split("/").length > 5;
  const isStudio = room === "studio";

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
      <KeyboardShortcuts />

      {/* GLOBAL TOP BAR */}
      <TopBar
        path={path}
        missionId={missionId}
        isOlympus={isOlympus}
        isLobby={isLobby}
        room={room}
      />

      {/* SECONDARY NAV */}
      {inMission && room === "flightplan" && missionId && (
        <FlightPlanNav missionId={missionId} path={path} />
      )}
      {inMission && room === "studio" && missionId && (
        <StudioNav missionId={missionId} path={path} />
      )}
      {room === "command" && <CommandNav path={path} />}

      {/* BREADCRUMB */}
      {!isQuestionWorkspace && !isLobby && (
        <BreadcrumbStrip path={path} missionId={missionId} room={room} isOlympus={isOlympus} />
      )}

      {/* STUDIO HEALTH STRIP (kept) */}
      {inMission && isStudio && missionId && <StudioHealthStrip missionId={missionId} />}

      {/* MAIN CONTENT — full width */}
      <main className="flex-1 min-w-0">
        <div key={path} className="route-fade min-h-full">{children}</div>
      </main>

      {inMission && missionId && <UpdateRealityMount missionId={missionId} />}
      <IrisOnboardingMount />
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
function TopBar({
  path, missionId, isOlympus, isLobby, room,
}: { path: string; missionId?: string; isOlympus: boolean; isLobby: boolean; room: Room }) {
  const inMission = !!missionId;

  // Role: privileged sees Command room
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

  // Keep leadership attention warm for badges elsewhere
  const attentionFn = useServerFn(irisLeadershipAttention);
  useQuery({ queryKey: ["leadership-attention"], queryFn: () => attentionFn(), refetchInterval: 60_000 });

  // Mission name (truncated)
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
      {/* LEFT — logo + location */}
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/home" className="flex items-center gap-2 shrink-0">
          <img src={athenaSgLogo.url} alt="" className="h-6 w-6 object-contain" />
          <span className="text-[color:var(--athena-gold)] text-sm leading-none">⚡</span>
          <span className="text-[13px] font-extrabold tracking-[0.2em] text-white">ATLAS</span>
        </Link>

        <span className="hidden sm:block h-5 w-px bg-white/15 mx-2" />

        {isOlympus ? (
          <span className="hidden sm:block text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            OLYMPUS
          </span>
        ) : inMission && mission ? (
          <Link
            to="/missions/$missionId/overview"
            params={{ missionId: missionId! }}
            className="hidden sm:block max-w-[220px] truncate text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            title={mission.name}
          >
            {mission.name}
          </Link>
        ) : null}
      </div>

      {/* CENTER — room toggle */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {isLobby ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Home
          </span>
        ) : isOlympus ? null : inMission && missionId ? (
          <RoomToggle missionId={missionId} room={room} showCommand={isPrivileged} />
        ) : null}
      </div>

      {/* RIGHT — actions */}
      <div className="flex shrink-0 items-center gap-2">
        <IrisStatusIndicator />
        <NotificationBell />
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
        <UserAvatarMenu />
      </div>
    </header>
  );
}

// ─── Room Toggle ────────────────────────────────────────────────────────────
function RoomToggle({
  missionId, room, showCommand,
}: { missionId: string; room: Room; showCommand: boolean }) {
  const navigate = useNavigate();

  const segments: {
    key: Exclude<Room, null>;
    label: string;
    icon: ReactNode;
    activeBg: string;
    activeBorder: string;
    activeColor: string;
    onGo: () => void;
  }[] = [];

  if (showCommand) {
    segments.push({
      key: "command",
      label: "Command",
      icon: <Zap size={13} strokeWidth={2} />,
      activeBg: "rgba(239,68,68,0.12)",
      activeBorder: "rgba(239,68,68,0.3)",
      activeColor: "var(--red)",
      onGo: () => navigate({ to: "/command/attention" }),
    });
  }
  segments.push({
    key: "flightplan",
    label: "Flight Plan",
    icon: <Plane size={13} strokeWidth={2} />,
    activeBg: "rgba(245,158,11,0.15)",
    activeBorder: "rgba(245,158,11,0.4)",
    activeColor: "var(--yellow)",
    onGo: () => navigate({ to: "/missions/$missionId/intelligence", params: { missionId } }),
  });
  segments.push({
    key: "studio",
    label: "Studio",
    icon: <PenTool size={13} strokeWidth={2} />,
    activeBg: "rgba(59,127,255,0.15)",
    activeBorder: "rgba(59,127,255,0.4)",
    activeColor: "#3b7fff",
    onGo: () => navigate({ to: "/missions/$missionId/questions", params: { missionId } }),
  });

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
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap transition-all duration-200"
            style={
              active
                ? {
                    background: s.activeBg,
                    border: `1px solid ${s.activeBorder}`,
                    color: s.activeColor as string,
                  }
                : {
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--muted-foreground)",
                  }
            }
          >
            <span style={{ color: active ? (s.activeColor as string) : "var(--muted-foreground)" }}>
              {s.icon}
            </span>
            <span className="hidden md:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Secondary Nav: Flight Plan ─────────────────────────────────────────────
function FlightPlanNav({ missionId, path }: { missionId: string; path: string }) {
  const tail = path.replace(`/missions/${missionId}`, "");
  const items = [
    { to: "/missions/$missionId/library", label: "Vault", match: ["/library"], icon: <VaultIcon size={14} /> },
    { to: "/missions/$missionId/briefing", label: "Oracle", match: ["/briefing", "/brief"], icon: <OracleIcon size={14} active /> },
    { to: "/missions/$missionId/intelligence", label: "Intelligence", match: ["/intelligence"], icon: null },
    { to: "/missions/$missionId/team", label: "Team", match: ["/team"], icon: null },
    { to: "/missions/$missionId/activity", label: "Timeline", match: ["/activity"], icon: null },
  ] as const;

  return (
    <nav
      className="flex h-10 items-center gap-1 px-6 overflow-x-auto"
      style={{ background: "rgba(245,158,11,0.04)", borderBottom: "1px solid rgba(245,158,11,0.10)" }}
    >
      {items.map((it) => {
        const active = it.match.some((m) => tail === m || tail.startsWith(`${m}/`));
        return (
          <Link
            key={it.label}
            to={it.to as never}
            params={{ missionId } as never}
            className={`inline-flex h-10 items-center gap-1.5 border-b-2 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              active
                ? "text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/80"
            }`}
            style={active ? { borderColor: "var(--yellow)" } : undefined}
          >
            {it.icon}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Secondary Nav: Studio ──────────────────────────────────────────────────
function StudioNav({ missionId, path }: { missionId: string; path: string }) {
  const tail = path.replace(`/missions/${missionId}`, "");
  const onAssignments = tail.startsWith("/questions");
  const onAsk = tail.startsWith("/iris");

  return (
    <nav
      className="flex h-10 items-center gap-1 px-6 overflow-x-auto"
      style={{ background: "rgba(59,127,255,0.04)", borderBottom: "1px solid rgba(59,127,255,0.10)" }}
    >
      <Link
        to="/missions/$missionId/questions"
        params={{ missionId }}
        className="inline-flex h-10 items-center border-b-2 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
        style={{
          borderColor: onAssignments ? "#3b7fff" : "transparent",
          color: onAssignments ? "var(--foreground)" : "var(--muted-foreground)",
        }}
      >
        My Assignments
      </Link>
      <Link
        to="/missions/$missionId/iris"
        params={{ missionId }}
        className="inline-flex h-10 items-center gap-2 border-b-2 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
        style={{
          borderColor: onAsk ? "var(--iris)" : "transparent",
          color: onAsk ? "var(--foreground)" : "var(--iris)",
        }}
      >
        <span className="iris-pulse-dot" />
        <Sparkles size={12} strokeWidth={2} />
        Ask IRIS
      </Link>
    </nav>
  );
}

// ─── Secondary Nav: Command ─────────────────────────────────────────────────
function CommandNav({ path }: { path: string }) {
  const items = [
    { to: "/command/attention", label: "Needs Attention" },
    { to: "/command/pens-down", label: "At Risk" },
    { to: "/command/question-health", label: "Next Gate" },
    { to: "/command/broadcasts", label: "What Changed" },
  ] as const;
  return (
    <nav
      className="flex h-10 items-center gap-1 px-6 overflow-x-auto"
      style={{ background: "rgba(239,68,68,0.04)", borderBottom: "1px solid rgba(239,68,68,0.08)" }}
    >
      {items.map((it) => {
        const active = path === it.to;
        return (
          <Link
            key={it.to}
            to={it.to}
            className="inline-flex h-10 items-center border-b-2 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
            style={{
              borderColor: active ? "var(--red)" : "transparent",
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────
function BreadcrumbStrip({
  path, missionId, room, isOlympus,
}: { path: string; missionId?: string; room: Room; isOlympus: boolean }) {
  const { data: mission } = useQuery({
    queryKey: ["bc-mission", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("name").eq("id", missionId!).maybeSingle();
      return data as { name: string } | null;
    },
  });

  const tail = missionId ? path.replace(`/missions/${missionId}`, "") : "";
  const sectionLabel = (() => {
    if (isOlympus) {
      if (path === "/olympus") return null;
      const seg = path.split("/")[2];
      return seg ? seg.replace(/-/g, " ") : null;
    }
    if (!missionId) return null;
    if (tail.startsWith("/library")) return "Vault";
    if (tail.startsWith("/briefing") || tail.startsWith("/brief")) return "Oracle";
    if (tail.startsWith("/intelligence")) return "Intelligence";
    if (tail.startsWith("/team")) return "Team";
    if (tail.startsWith("/activity")) return "Timeline";
    if (tail.startsWith("/operations")) return "Operations";
    if (tail.startsWith("/questions")) return "Questions";
    if (tail.startsWith("/iris")) return "Ask IRIS";
    if (tail.startsWith("/settings")) return "Settings";
    return null;
  })();

  const roomLabel = room === "flightplan" ? "Flight Plan" : room === "studio" ? "Studio" : room === "command" ? "Command" : null;

  return (
    <div className="flex h-8 items-center gap-1.5 border-b border-border/40 bg-surface/30 px-6 text-[11px] tracking-[0.06em] text-muted-foreground">
      <Link to="/home" className="hover:text-foreground transition-colors">ATLAS</Link>
      {isOlympus && (
        <>
          <ChevronRight size={11} className="opacity-50" />
          <Link to="/olympus" className="hover:text-foreground transition-colors">Olympus</Link>
        </>
      )}
      {mission && missionId && (
        <>
          <ChevronRight size={11} className="opacity-50" />
          <Link
            to="/missions/$missionId/overview"
            params={{ missionId }}
            className="truncate max-w-[200px] hover:text-foreground transition-colors"
          >
            {mission.name}
          </Link>
        </>
      )}
      {roomLabel && (
        <>
          <ChevronRight size={11} className="opacity-50" />
          <span className="text-foreground/80">{roomLabel}</span>
        </>
      )}
      {sectionLabel && (
        <>
          <ChevronRight size={11} className="opacity-50" />
          <span className="text-foreground capitalize">{sectionLabel}</span>
        </>
      )}
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
