import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  LayoutDashboard,
  Telescope,
  AlertTriangle,
  Activity,
  Vault as VaultIcon,
  Settings,
  LogOut,
  DoorOpen,
  Shield,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

type NavItem = {
  title: string;
  url: string;
  icon: ComponentType<LucideProps>;
  hint: string;
  accent?: "red";
  page: import("@/lib/roles").PageKey;
};

const NAV: NavItem[] = [
  { title: "Mission Control",  url: "/command",  icon: LayoutDashboard, hint: "Mission dashboard and situational awareness",                          page: "missionControl" },
  { title: "Intelligence",    url: "/intel",    icon: Telescope,       hint: "Everything you know about this engagement",     page: "briefing"       },
  { title: "Strategy",        url: "/pulse",    icon: Activity,        hint: "Win themes, decisions, and assumptions",      page: "pulse"          },
  { title: "Signals",         url: "/issues",   icon: AlertTriangle,   hint: "Daily check-ins, escalations, and team health", accent: "red",      page: "escalations"    },
  { title: "Library",         url: "/library", icon: VaultIcon,       hint: "Research, reference, and intelligence documents",                       page: "library"        },
  { title: "Settings",         url: "/settings", icon: Settings,        hint: "Mission settings and configuration",                                    page: "settings"       },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived, isLeadership, can, roleLabel } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const isActive = (p: string) => pathname === p;
  const visibleNav = NAV.filter((i) => can(i.page));

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const renderItem = (i: NavItem) => (
    <SidebarMenuItem key={i.title}>
      <SidebarMenuButton
        asChild
        isActive={isActive(i.url)}
        tooltip={`${i.title} — ${i.hint}`}
        className={i.accent === "red" ? "text-[var(--red)]/90 data-[active=true]:text-[var(--red)]" : undefined}
      >
        <Link to={i.url}>
          <i.icon className="h-4 w-4" />
          <span>{i.title}</span>
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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Always-visible home navigation */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/select-engagement")}
                  tooltip="Morning Brief — Return to your daily command brief"
                  className="font-semibold"
                >
                  <Link to="/select-engagement">
                    <Home className="h-4 w-4" />
                    <span>Morning Brief</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <div className="my-1 mx-3 border-t border-border/30" />
              {visibleNav.map(renderItem)}
              {isLeadership && engagement && can("settings") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/section-assignments")}
                    tooltip="Team — Manage mission members and assignments"
                  >
                    <Link to="/section-assignments">
                      <Users className="h-4 w-4" />
                      <span>Team</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/admin")}
                tooltip="Admin — Platform-wide control"
              >
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/select-engagement")}
              tooltip="Morning Brief — Return to your daily command brief"
            >
              <Link to="/select-engagement">
                <Home className="h-4 w-4" />
                <span>Morning Brief</span>
              </Link>
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
