import { Link, useRouterState } from "@tanstack/react-router";
import {
  Megaphone,
  GitBranch,
  FolderOpen,
  ShieldAlert,
  Siren,
  Contact,
  LogOut,
  ExternalLink,
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

const WORK = [
  { title: "Broadcasts", url: "/writer/broadcasts", icon: Megaphone },
  { title: "Decisions", url: "/writer/decisions", icon: GitBranch },
  { title: "Intel Library", url: "/writer/intel-library", icon: FolderOpen },
] as const;
const FLAG = [
  { title: "Submit a Risk", url: "/writer/submit-risk", icon: ShieldAlert },
  { title: "Submit an SOS", url: "/writer/submit-sos", icon: Siren },
] as const;
const TEAM = [
  { title: "Team Directory", url: "/writer/team", icon: Contact },
] as const;

export function WriterSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member } = useEngagement();
  const isActive = (p: string) => pathname === p;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const renderItem = (i: { title: string; url: string; icon: any }) => (
    <SidebarMenuItem key={i.url}>
      <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={i.title}>
        <Link to={i.url}>
          <i.icon className="h-4 w-4" />
          <span>{i.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" style={{ ["--sidebar-width" as any]: "180px" }}>
      <SidebarHeader>
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-border/40">
          <img src={athenaLogo} alt="Athena Strategy Group" className="h-12 w-auto object-contain" />
          <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)] font-semibold">
            Writer Portal
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
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{WORK.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Flag</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{FLAG.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Team</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{TEAM.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="mx-2 mb-1 border-t border-border/40" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open Talent Desk">
              <a
                href="https://app.talentdesk.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="flex-1">Go to Talent Desk</span>
              </a>
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
