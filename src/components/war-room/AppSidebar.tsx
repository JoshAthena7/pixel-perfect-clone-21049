import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Compass,
  Users,
  Siren,
  Grid3x3,
  FolderOpen,
  Activity,
  Megaphone,
  Bot,
  Settings,
  LogOut,
  MessageSquare,
  Briefcase,
  ExternalLink,
  DoorOpen,
  Shield,
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
import athenaLogo from "@/assets/athena-logo-dark.png";
import { useIsAdmin } from "@/hooks/use-admin";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

type NavItem = { title: string; url: string; icon: ComponentType<LucideProps>; hint: string };

// The 9 canonical items, in order.
const NAV: NavItem[] = [
  { title: "Command",    url: "/command",    icon: LayoutDashboard, hint: "Executive overview of engagement health" },
  { title: "Huddle",     url: "/huddle",     icon: Users,           hint: "Daily 60-second status from the front line" },
  { title: "Heatmap",    url: "/heatmap",    icon: Grid3x3,         hint: "Section-by-section health" },
  { title: "Issues",     url: "/issues",     icon: Siren,           hint: "Unified board for SOS blockers and risks" },
  { title: "Broadcasts", url: "/broadcasts", icon: Megaphone,       hint: "Team-wide announcements" },
  { title: "Pulse",      url: "/pulse",      icon: Activity,        hint: "Track how the client is feeling" },
  { title: "Intel",      url: "/intel",      icon: FolderOpen,      hint: "Single source of truth for documents" },
  { title: "Assistant",  url: "/assistant",  icon: Bot,             hint: "Ask questions grounded in your war room data" },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const isActive = (p: string) => pathname === p;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const renderItem = (i: NavItem) => (
    <SidebarMenuItem key={i.url}>
      <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={`${i.title} — ${i.hint}`}>
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
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-border/40">
          <img src={athenaLogo} alt="Athena Strategy Group" className="h-14 w-auto object-contain" />
          <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)] font-semibold">
            War Room · Command
          </div>
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
            <SidebarMenu>{NAV.map(renderItem)}</SidebarMenu>
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
              <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip="Admin Portal — Platform-wide control across every war room">
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/select-engagement")} tooltip="War Rooms — Switch engagements or open a new one">
              <Link to="/select-engagement">
                <DoorOpen className="h-4 w-4" />
                <span>War Rooms</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings — Team, sections, win themes, FAQ, activity log, and configuration">
              <Link to="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
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
