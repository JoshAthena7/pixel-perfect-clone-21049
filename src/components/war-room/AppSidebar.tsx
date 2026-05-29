import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Siren,
  ShieldAlert,
  Grid3x3,
  FolderOpen,
  GitBranch,
  Activity,
  Megaphone,
  Bot,
  Settings,
  LogOut,
  Contact,
  Camera,
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
import athenaLogo from "@/assets/athena-logo-dark.png";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

type NavItem = { title: string; url: string; icon: ComponentType<LucideProps>; hint: string };

const opsBase: NavItem[] = [
  { title: "Daily Huddle", url: "/huddle", icon: Users, hint: "60-second status from the front line" },
  { title: "SOS Alerts", url: "/sos", icon: Siren, hint: "Raise and track urgent issues" },
  { title: "Team Roster", url: "/team", icon: Contact, hint: "Who is on this engagement" },
];
const opsLeadership: NavItem[] = [
  { title: "Command Center", url: "/command", icon: LayoutDashboard, hint: "Executive overview of engagement health" },
  ...opsBase,
];
const intel: NavItem[] = [
  { title: "Risks", url: "/risks", icon: ShieldAlert, hint: "Track risks and mitigations" },
  { title: "Heat Map", url: "/heatmap", icon: Grid3x3, hint: "Section-by-section health" },
  { title: "Intel Library", url: "/intel", icon: FolderOpen, hint: "Single source of truth for documents" },
];
const leadership: NavItem[] = [
  { title: "Decisions", url: "/decisions", icon: GitBranch, hint: "Log key decisions to avoid re-litigation" },
  { title: "Client Pulse", url: "/pulse", icon: Activity, hint: "Track how the client is feeling" },
  { title: "Broadcasts", url: "/broadcasts", icon: Megaphone, hint: "Team-wide announcements" },
  { title: "Snapshots", url: "/snapshots", icon: Camera, hint: "Daily captures of engagement state" },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member } = useEngagement();
  const isLeadership = !!member && ["founder", "pm", "engagement_lead"].includes(member.role);
  const ops = isLeadership ? opsLeadership : opsBase;
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
        {engagement && (
          <div className="mx-2 mt-2 rounded-md border border-[var(--gold)]/20 bg-surface-hover/50 px-2 py-1.5">
            <div className="truncate text-xs font-semibold">{engagement.name}</div>
            <div className="truncate text-[10px] text-muted-foreground">{engagement.client}</div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{ops.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Intel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{intel.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isLeadership && (
          <SidebarGroup>
            <SidebarGroupLabel>Leadership</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{leadership.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>AI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/assistant")}
                  tooltip="Assistant — Ask questions grounded in your war room data"
                >
                  <Link to="/assistant">
                    <Bot className="h-4 w-4" />
                    <span>Assistant</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings — Engagement configuration and notifications">
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
