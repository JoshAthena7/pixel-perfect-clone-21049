import { Link, useRouterState } from "@tanstack/react-router";
import {
  ListChecks,
  Megaphone,
  Vault as VaultIcon,
  Antenna,
  HelpCircle,
  LogOut,
  ExternalLink,
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
import { openFlagIssue } from "@/components/war-room/FlagIssueButton";
import { AthenaMark } from "@/components/ui/AthenaMark";

const NAV = [
  { title: "My Sections", url: "/writer/my-sections", icon: ListChecks },
  { title: "Broadcasts",  url: "/broadcasts",         icon: Megaphone },
  { title: "Vault",       url: "/intel",              icon: VaultIcon },
] as const;

export function WriterSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived } = useEngagement();
  const isActive = (p: string) => pathname === p;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Sidebar collapsible="icon" style={{ ["--sidebar-width" as any]: "180px" }}>
      <SidebarHeader>
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-border/40">
          <AthenaMark size="md" tone="white" />
          <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)] font-semibold">
            Writer Portal
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
            <SidebarMenu>
              {NAV.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={isActive(i.url)}
                    tooltip={i.title}
                    className="py-1.5 text-[12px]"
                  >
                    <Link to={i.url}>
                      <i.icon className="h-4 w-4" />
                      <span>{i.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  tooltip="Raise a Signal™ — Flag a blocker or risk"
                  className="py-1.5 text-[12px] text-[var(--red)]/90"
                  onClick={() => openFlagIssue()}
                >
                  <Antenna className="h-4 w-4" />
                  <span>Raise a Signal™</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  isActive={isActive("/faq")}
                  tooltip="Help — FAQ for writers"
                  className="py-1.5 text-[12px]"
                >
                  <Link to="/faq">
                    <HelpCircle className="h-4 w-4" />
                    <span>Help</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="mx-2 mb-1 border-t border-border/40" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open Slack">
              <a href="https://slack.com/app_redirect?app=A" target="_blank" rel="noopener noreferrer" className="text-muted-foreground">
                <ExternalLink className="h-4 w-4" />
                <span className="flex-1">→ Go to Slack</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open Talent Desk">
              <a href="https://app.talentdesk.io/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground">
                <ExternalLink className="h-4 w-4" />
                <span className="flex-1">→ Go to Talent Desk</span>
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
