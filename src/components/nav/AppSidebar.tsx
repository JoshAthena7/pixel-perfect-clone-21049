import { Link, useParams, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import {
  FileText, Brain, Lightbulb, LayoutDashboard, MessageSquare, Target,
  Trophy, Users, Route as RouteIcon, ListChecks, BarChart3, Settings,
  ArrowLeft, LogOut, Menu, X, Icon as LucideIcon,
} from "lucide-react";
import { owl } from "@lucide/lab";

const Owl = (props: Omit<React.ComponentProps<typeof LucideIcon>, "iconNode">) => (
  <LucideIcon iconNode={owl} {...props} />
);
import { cn } from "@/lib/utils";
import { useMissionMeta, useMissionAtRiskCount } from "@/hooks/useMissionMeta";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

type IconType = typeof FileText;

type NavItem = {
  to: string;
  label: string;
  Icon: IconType;
  needsMission?: boolean;
};

const MISSION_ITEMS: NavItem[] = [
  { to: "/missions/$missionId/briefing", label: "Briefing", Icon: FileText, needsMission: true },
  { to: "/missions/$missionId/oracle", label: "Oracle", Icon: Owl as unknown as IconType, needsMission: true },
  { to: "/missions/$missionId/insights", label: "Insights", Icon: Lightbulb, needsMission: true },
];

const MY_WORK_ITEMS: NavItem[] = [
  { to: "/missions/$missionId/flight-deck", label: "Flight Deck", Icon: LayoutDashboard, needsMission: true },
  { to: "/missions/$missionId/qa", label: "Q&A Log", Icon: MessageSquare, needsMission: true },
  { to: "/missions/$missionId/scores", label: "My Scores", Icon: Target, needsMission: true },
];

const ADMIN_ITEMS: NavItem[] = [
  { to: "/missions/$missionId/win-strategy", label: "Win Strategy", Icon: Trophy, needsMission: true },
  { to: "/missions/$missionId/team", label: "Team", Icon: Users, needsMission: true },
  { to: "/missions/$missionId/journey", label: "Journey", Icon: RouteIcon, needsMission: true },
  { to: "/missions/$missionId/compliance", label: "Compliance", Icon: ListChecks, needsMission: true },
  { to: "/missions/$missionId/reports", label: "Reports", Icon: BarChart3, needsMission: true },
  { to: "/missions/$missionId/settings", label: "Settings", Icon: Settings, needsMission: true },
];

const ADMIN_AREA_ITEMS: NavItem[] = [
  { to: "/admin", label: "Overview", Icon: LayoutDashboard },
  { to: "/admin/team", label: "Team Roster", Icon: Users },
  { to: "/admin/iris-health", label: "IRIS Health", Icon: Settings },
];

export function AppSidebar({
  userName,
  userRole,
}: {
  userName?: string | null;
  userRole?: string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const isMobile = useIsMobile();
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Mission id from /missions/:id/* OR /olympus/missions/:id/*
  const missionMatch = pathname.match(/^\/(?:olympus\/)?missions\/([^/]+)/);
  const missionId = params.missionId ?? missionMatch?.[1];
  const inMission = !!missionId && missionMatch !== null;
  const inAdmin = pathname.startsWith("/admin");

  // Close overlay on navigation
  useEffect(() => {
    setOverlayOpen(false);
  }, [pathname]);

  const collapsed = isMobile && !overlayOpen;
  const width = collapsed ? 48 : 200;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      {/* Mobile hamburger trigger (in nav bar — we render here as floating fallback) */}
      {isMobile && !overlayOpen && (
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          className="fixed top-2 left-2 z-[60] p-1.5 rounded-md text-white/70"
          style={{ background: "#050d18", border: "1px solid rgba(255,255,255,0.08)" }}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {overlayOpen && isMobile && (
        <div
          className="fixed inset-0 z-[55] bg-black/50"
          onClick={() => setOverlayOpen(false)}
        />
      )}

      <aside
        className="fixed left-0 z-[58] flex flex-col"
        style={{
          top: 48,
          bottom: 0,
          width,
          background: "#050d18",
          borderRight: "0.5px solid rgba(255,255,255,0.05)",
          transition: "width 150ms ease",
        }}
      >
        {/* Mobile close button when overlay */}
        {isMobile && overlayOpen && (
          <button
            type="button"
            onClick={() => setOverlayOpen(false)}
            className="absolute top-2 right-2 text-white/50 hover:text-white p-1"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {!collapsed && (
          <MissionContextBlock missionId={inMission ? missionId : undefined} inAdmin={inAdmin} />
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {inAdmin ? (
            <Section label="ADMIN" items={ADMIN_AREA_ITEMS} missionId={undefined} pathname={pathname} collapsed={collapsed} />
          ) : (
            <>
              <Section label="MISSION" items={MISSION_ITEMS} missionId={missionId} pathname={pathname} collapsed={collapsed} disabled={!inMission} />
              <Divider />
              <Section label="MY WORK" items={MY_WORK_ITEMS} missionId={missionId} pathname={pathname} collapsed={collapsed} disabled={!inMission} />
              <Divider />
              <Section label="ADMIN" items={ADMIN_ITEMS} missionId={missionId} pathname={pathname} collapsed={collapsed} disabled={!inMission} muted />
            </>
          )}
          <Divider />
          <div className={cn("px-1.5", collapsed && "px-0")}>
            <Link
              to="/home"
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md mx-1.5 mb-0.5 transition-colors hover:bg-white/[0.05]",
                collapsed && "mx-1 px-2 justify-center",
              )}
              style={{ color: "rgba(255,255,255,0.45)" }}
              title="All Missions"
            >
              <ArrowLeft className="h-[15px] w-[15px] shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              {!collapsed && <span style={{ fontSize: 10 }}>All Missions</span>}
            </Link>
          </div>
        </div>

        {/* Footer */}
        {!collapsed && (
          <div
            className="px-3 py-3"
            style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)" }}
          >
            <div className="truncate" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
              {userName ?? "User"}
              {userRole ? ` · ${userRole}` : ""}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-1 inline-flex items-center gap-1 hover:text-white"
              style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function Divider() {
  return <div className="my-2 mx-2 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />;
}

function Section({
  label,
  items,
  missionId,
  pathname,
  collapsed,
  disabled,
  muted,
}: {
  label: string;
  items: NavItem[];
  missionId: string | undefined;
  pathname: string;
  collapsed: boolean;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      {!collapsed && (
        <div
          className="px-3 pt-2 pb-1 select-none"
          style={{
            fontSize: 8,
            fontWeight: 500,
            color: "rgba(255,255,255,0.2)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </div>
      )}
      <ul>
        {items.map((item) => (
          <NavRow
            key={item.to}
            item={item}
            missionId={missionId}
            pathname={pathname}
            collapsed={collapsed}
            disabled={disabled && item.needsMission}
            muted={muted}
          />
        ))}
      </ul>
    </div>
  );
}

function NavRow({
  item,
  missionId,
  pathname,
  collapsed,
  disabled,
  muted,
}: {
  item: NavItem;
  missionId: string | undefined;
  pathname: string;
  collapsed: boolean;
  disabled?: boolean;
  muted?: boolean;
}) {
  const { to, label, Icon } = item;
  const resolved = missionId ? to.replace("$missionId", missionId) : to;
  const active = pathname === resolved;
  const baseColor = muted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.45)";
  const iconColor = muted ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.3)";

  const content = (
    <>
      <Icon
        className="h-[15px] w-[15px] shrink-0"
        style={{ color: active ? "#C49A2B" : iconColor }}
      />
      {!collapsed && (
        <span
          className="truncate"
          style={{
            fontSize: 11,
            color: active ? "#C49A2B" : baseColor,
            fontWeight: active ? 500 : 400,
          }}
        >
          {label}
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <li className={cn("px-1.5", collapsed && "px-0")}>
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md mx-1.5 mb-0.5 opacity-40 cursor-not-allowed",
            collapsed && "mx-1 px-2 justify-center",
          )}
          title={collapsed ? `${label} (mission required)` : "Select a mission to enable"}
        >
          {content}
        </div>
      </li>
    );
  }

  return (
    <li className={cn("px-1.5", collapsed && "px-0")}>
      <Link
        to={to as never}
        params={missionId ? ({ missionId } as never) : undefined}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-md mx-1.5 mb-0.5 transition-colors hover:bg-white/[0.05]",
          collapsed && "mx-1 px-2 justify-center",
        )}
        style={
          active
            ? {
                background: "rgba(196,154,43,0.10)",
                border: "0.5px solid rgba(196,154,43,0.2)",
              }
            : undefined
        }
        title={collapsed ? label : undefined}
      >
        {content}
      </Link>
    </li>
  );
}

function MissionContextBlock({
  missionId,
  inAdmin,
}: {
  missionId: string | undefined;
  inAdmin: boolean;
}) {
  const { data: meta } = useMissionMeta(missionId);
  const { data: atRisk = 0 } = useMissionAtRiskCount(missionId);

  if (inAdmin) {
    return (
      <div
        className="px-3 py-3"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}
      >
        <div style={{ color: "#C49A2B", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em" }}>
          ADMIN · OLYMPUS
        </div>
        <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
          Platform administration
        </div>
      </div>
    );
  }

  if (!missionId || !meta) {
    return (
      <div
        className="px-3 py-3 text-center"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}
      >
        <div className="mx-auto" style={{ color: "#C49A2B", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          ATLAS
        </div>
        <div className="mt-1" style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
          Select a mission
        </div>
      </div>
    );
  }

  const days = meta.submission_deadline
    ? differenceInCalendarDays(new Date(meta.submission_deadline), new Date())
    : null;
  const phase =
    meta.status === "writers_write" ? "Writers Write" :
    meta.status === "active" ? "Active" :
    meta.status === "setup" ? "Setup" :
    meta.status ?? "—";
  const dayColor =
    days === null ? "rgba(255,255,255,0.5)" :
    days < 14 ? "#f87171" :
    days < 30 ? "#f59e0b" :
    "rgba(255,255,255,0.7)";
  const intel = Math.round(meta.intelligence_graph_completeness ?? 0);

  return (
    <div
      className="px-3 pt-3 pb-2.5"
      style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}
    >
      <div
        className="truncate"
        style={{ color: "white", fontSize: 11, fontWeight: 500 }}
        title={meta.name}
      >
        {meta.name}
      </div>
      {days !== null && (
        <div className="mt-1" style={{ color: dayColor, fontSize: 10 }}>
          {days < 0 ? `${Math.abs(days)}d past` : `${days} days`} · {phase}
        </div>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <span
          className="inline-flex items-center rounded-sm"
          style={{
            background: atRisk > 0 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.04)",
            color: atRisk > 0 ? "#f87171" : "rgba(255,255,255,0.4)",
            fontSize: 8,
            padding: "1px 5px",
          }}
        >
          {atRisk} at-risk
        </span>
        <span
          className="inline-flex items-center rounded-sm"
          style={{
            background: "rgba(196,154,43,0.12)",
            color: "#C49A2B",
            fontSize: 8,
            padding: "1px 5px",
          }}
        >
          Intel {intel}%
        </span>
      </div>
    </div>
  );
}
