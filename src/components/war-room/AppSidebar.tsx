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
import athenaLogo from "@/assets/athena-logo.png";

const ops = [
  { title: "Command Center", url: "/command", icon: LayoutDashboard },
  { title: "Daily Huddle", url: "/huddle", icon: Users },
  { title: "SOS Alerts", url: "/sos", icon: Siren },
];
const intel = [
  { title: "Risks", url: "/risks", icon: ShieldAlert },
  { title: "Heat Map", url: "/heatmap", icon: Grid3x3 },
  { title: "Intel Library", url: "/intel", icon: FolderOpen },
];
const leadership = [
  { title: "Decisions", url: "/decisions", icon: GitBranch },
  { title: "Client Pulse", url: "/pulse", icon: Activity },
  { title: "Broadcasts", url: "/broadcasts", icon: Megaphone },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member } = useEngagement();
  const isActive = (p: string) => pathname === p;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <img src={athenaLogo} alt="Athena Strategy Group" className="h-10 w-auto object-contain" />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--gold)] font-semibold">War Room</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Command</div>
          </div>
        </div>
        {engagement && (
          <div className="mx-2 mt-2 rounded-md border border-border bg-surface-hover/50 px-2 py-1.5">
            <div className="truncate text-xs font-semibold">{engagement.name}</div>
            <div className="truncate text-[10px] text-muted-foreground">{engagement.client}</div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ops.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)}>
                    <Link to={i.url}><i.icon className="h-4 w-4" /><span>{i.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Intel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {intel.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)}>
                    <Link to={i.url}><i.icon className="h-4 w-4" /><span>{i.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Leadership</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {leadership.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)}>
                    <Link to={i.url}><i.icon className="h-4 w-4" /><span>{i.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>AI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/assistant")}>
                  <Link to="/assistant"><Bot className="h-4 w-4" /><span>Assistant</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings")}>
              <Link to="/settings"><Settings className="h-4 w-4" /><span>Settings</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="h-4 w-4" />
              <span>{member?.display_name ? `Sign out (${member.display_name})` : "Sign out"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
