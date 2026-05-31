import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Grid3x3,
  Telescope,
  AlertTriangle,
  Megaphone,
  Activity,
  Vault as VaultIcon,
  Brain,
  Settings,
  LogOut,
  MessageSquare,
  Briefcase,
  ExternalLink,
  DoorOpen,
  Shield,
  UserCheck,
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
  /** Permission key from src/lib/roles.ts. Item is hidden when the role lacks any access. */
  page: import("@/lib/roles").PageKey;
};

// The 9 canonical Command Center items, in order.
const NAV: NavItem[] = [
  { title: "Command",      url: "/command",    icon: LayoutDashboard, hint: "Executive overview of this engagement", page: "missionControl" },
  { title: "Delivery Map", url: "/heatmap",    icon: Grid3x3,         hint: "Section-by-section health", page: "deliveryMap" },
  { title: "Briefing Room",url: "/intel",      icon: Telescope,       hint: "Research, intel, and source documents", page: "briefing" },
  { title: "Escalations",  url: "/issues",     icon: AlertTriangle,   hint: "Active blockers and risks", accent: "red", page: "escalations" },
  { title: "Broadcasts",   url: "/broadcasts", icon: Megaphone,       hint: "Team-wide announcements", page: "broadcasts" },
  { title: "Pulse™",       url: "/pulse",      icon: Activity,        hint: "Track how the client is feeling", page: "pulse" },
  { title: "Vault",        url: "/intel",      icon: VaultIcon,       hint: "Single source of truth for documents", page: "library" },
  { title: "Navigator™",   url: "/assistant",  icon: Brain,           hint: "Ask questions grounded in your engagement data", page: "alignmentHub" },
  { title: "Settings",     url: "/settings",   icon: Settings,        hint: "Team, sections, win themes, and configuration", page: "settings" },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived, isLeadership } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const isActive = (p: string) => pathname === p;

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
              {NAV.map(renderItem)}
              {isLeadership && engagement && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/section-assignments")}
                    tooltip="Section Assignments — Assign writers and reviewers to each Delivery Map section"
                  >
                    <Link to="/section-assignments">
                      <UserCheck className="h-4 w-4" />
                      <span>Assignments</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {engagement && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.includes("/compliance")}
                    tooltip="Compliance — Track SHALL/MUST requirements and gaps"
                  >
                    <Link to="/engagement/$id/compliance" params={{ id: engagement.id }}>
                      <Shield className="h-4 w-4" />
                      <span>Compliance</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Slack — Open Athena workspace in a new tab">
                  <a href="https://slack.com/app_redirect?app=A" target="_blank" rel="noopener noreferrer">
                    <MessageSquare className="h-4 w-4" />
                    <span className="flex-1">Slack</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Talent Desk — Open the talent platform in a new tab">
                  <a href="https://app.talentdesk.io/" target="_blank" rel="noopener noreferrer">
                    <Briefcase className="h-4 w-4" />
                    <span className="flex-1">Talent Desk</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip="Command Operations — Platform-wide control across every Mission">
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  <span>Command Ops</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/select-engagement")} tooltip="Command Center — Switch Missions or open a new one">
              <Link to="/select-engagement">
                <DoorOpen className="h-4 w-4" />
                <span>Command Center</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out of your account">
              <LogOut className="h-4 w-4" />
              <span>{member?.display_name ? `Sign out (${member.display_name})` : "Sign out"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
