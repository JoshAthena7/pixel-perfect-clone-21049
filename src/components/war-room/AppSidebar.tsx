import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Telescope,
  Activity,
  AlertTriangle,
  Settings,
  LogOut,
  DoorOpen,
  Shield,
  Users,
  Home,
  FileText,
  Brain,
  Compass,
  BarChart3,
  ClipboardList,
  Github,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { EngagementSwitcher } from "@/components/EngagementSwitcher";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { useIsAdmin } from "@/hooks/use-admin";

// ── Environment detection ─────────────────────────────────────────
function useEnvironment(pathname: string): "mission-control" | "mission" | "command-center" {
  if (pathname.startsWith("/select-engagement") || pathname.startsWith("/overview")) return "command-center";
  // Mission Control pages: intel, pulse (strategy), library, settings, section-assignments
  if (["/intel","/pulse","/library","/settings","/section-assignments"].some(p => pathname.startsWith(p))) return "mission-control";
  // Mission pages: command (overview), issues (signals), heatmap (section status)
  return "mission";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived, isLeadership, can, canEdit, roleLabel } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const env = useEnvironment(pathname);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // ── Environment tab bar ───────────────────────────────────────
  const EnvTab = ({ href, label, abbr, active }: { href: string; label: string; abbr: string; active: boolean }) => (
    <Link to={href as any}
      title={label}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        gap: 2, padding: "6px 4px", borderRadius: 6, textDecoration: "none",
        background: active ? "rgba(196,154,42,0.12)" : "transparent",
        border: active ? "0.5px solid rgba(196,154,42,0.3)" : "0.5px solid transparent",
        transition: "all 0.15s",
      }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
        color: active ? "var(--gold)" : "var(--muted-foreground)", opacity: active ? 1 : 0.6 }}>
        {abbr}
      </span>
    </Link>
  );

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
        <Link to={href as any}>
          <Icon className="h-4 w-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-center px-2 py-3 border-b border-border/40">
          <BrandLockup size="md" />
        </div>
        {engagement && <EngagementSwitcher />}
        {engagement && roleLabel && (
          <div className="mx-2 mt-2 rounded border border-border/40 bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Role · {roleLabel}
          </div>
        )}
        {isArchived && (
          <div className="mx-2 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Archived — read only
          </div>
        )}

        {/* Environment tabs — only show when inside a mission */}
        {engagement && (
          <div className="mx-2 mt-2 mb-1 flex gap-1">
            <EnvTab href="/intel" label="Mission Control — Manage intelligence and documents"
              abbr="Manage" active={env === "mission-control"} />
            <EnvTab href="/command" label="Mission — Execute and operate"
              abbr="Execute" active={env === "mission"} />
            <EnvTab href="/select-engagement" label="Command Center — Monitor and lead"
              abbr="Monitor" active={env === "command-center"} />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* MISSION CONTROL environment */}
        {env === "mission-control" && engagement && (
          <SidebarGroup>
            <SidebarGroupLabel style={{ fontSize: 9, letterSpacing: "0.15em", opacity: 0.5 }}>
              MISSION CONTROL
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/library"   label="Documents"     icon={FileText} />
                <NavItem href="/intel"     label="Mission Brain" icon={Brain} />
                <NavItem href="/pulse"     label="Strategy"      icon={Compass} />
                {can("settings") && isLeadership && (
                  <>
                    <NavItem href="/settings"            label="Configuration" icon={Settings} />
                    <NavItem href="/section-assignments" label="Team"          icon={Users} />
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* MISSION environment */}
        {env === "mission" && engagement && (
          <SidebarGroup>
            <SidebarGroupLabel style={{ fontSize: 9, letterSpacing: "0.15em", opacity: 0.5 }}>
              MISSION
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/command"  label="Overview"        icon={LayoutDashboard} />
                <NavItem href="/question-health" label="Question Health" icon={ClipboardList} />
                <NavItem href="/issues"   label="Signals"         icon={AlertTriangle} />
                <NavItem href="/heatmap"  label="Section Status"  icon={BarChart3} />
                <NavItem href="/broadcasts" label="Broadcasts"    icon={Activity} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* COMMAND CENTER environment — no mission sub-nav */}
        {env === "command-center" && (
          <SidebarGroup>
            <SidebarGroupLabel style={{ fontSize: 9, letterSpacing: "0.15em", opacity: 0.5 }}>
              COMMAND CENTER
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/select-engagement" label="Morning Brief"   icon={Home} />
                <NavItem href="/broadcasts"        label="Broadcasts"      icon={Activity} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* No mission selected — show top-level only */}
        {!engagement && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/select-engagement" label="Command Center" icon={Home} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip="Admin">
                <Link to="/admin"><Shield className="h-4 w-4" /><span>Admin</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open GitHub repository">
              <a
                href="https://github.com/JoshAthena7/pixel-perfect-clone-21049"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                <span>GitHub</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/select-engagement")} tooltip="Command Center — Morning Brief">
              <Link to="/select-engagement"><DoorOpen className="h-4 w-4" /><span>Command Center</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              <span>{member?.display_name ? `Sign out (${member.display_name})` : "Sign out"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
