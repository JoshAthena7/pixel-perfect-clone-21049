/**
 * AppSidebar — Athena Command Navigation
 *
 * ARCHITECTURE:
 *   Top level:     Lobby | Missions list
 *   Inside mission: Mission Studio | Mission Control
 *
 * Mission Studio  = "How are we doing?" (monitoring, signals, intelligence)
 * Mission Control = "How is it operated?" (setup, team, library, workflow)
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, AlertTriangle, Activity, Settings,
  LogOut, Shield, Home, ChevronRight, BookOpen, Users,
  FileText, BarChart3, ClipboardList, Compass, Brain,
  Zap, Building2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { EngagementSwitcher } from "@/components/EngagementSwitcher";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { useIsAdmin } from "@/hooks/use-admin";

// ── Which experience is active ────────────────────────────────────
type Experience = "studio" | "control" | "none";

function useExperience(pathname: string): Experience {
  // Mission Control paths
  if (["/mission-control","/intel","/pulse","/library","/settings","/section-assignments","/mission-admin","/team"].some(p => pathname.startsWith(p)))
    return "control";
  // Mission Studio paths (everything else inside a mission)
  if (["/command","/issues","/heatmap","/question-health","/broadcasts"].some(p => pathname.startsWith(p)))
    return "studio";
  return "none";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { engagement, member, isArchived, isLeadership, can } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const exp = useExperience(pathname);
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const canControl = isLeadership || isAdmin;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const NavItem = ({ href, label, icon: Icon, accent }: { href: string; label: string; icon: any; accent?: string }) => (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(href)} tooltip={label}>
        <Link to={href as any} style={accent && isActive(href) ? { color: accent } : undefined}>
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
        {engagement && member?.role && (
          <div className="mx-2 mt-2 rounded border border-border/40 bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {member.role === "lead" || member.role === "engagement_lead" || member.role === "founder" ? "Engagement Lead"
              : member.role === "pm" ? "Project Manager"
              : member.role === "exec" ? "Executive"
              : member.role === "writer" ? "Writer"
              : member.role === "sme" ? "SME"
              : member.role}
          </div>
        )}
        {isArchived && (
          <div className="mx-2 mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Archived — read only
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* ── No mission: Lobby + Mission list ── */}
        {!engagement && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/select-engagement" label="Lobby" icon={Home} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Inside a mission: 2 primary experiences ── */}
        {engagement && (
          <>
            {/* Experience switcher */}
            <div className="mx-3 mt-1 mb-2 space-y-1">
              {/* Mission Studio */}
              <Link to="/command" className="block no-underline">
                <div className={`rounded-lg px-3 py-2.5 transition-all cursor-pointer border ${exp === "studio"
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">Mission Studio</div>
                      <div className="text-[10px] opacity-60 leading-tight">How are we doing?</div>
                    </div>
                    {exp === "studio" && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0" />}
                  </div>
                </div>
              </Link>

              {/* Mission Control — lead/PM/admin only */}
              {canControl && (
                <Link to="/mission-control" className="block no-underline">
                  <div className={`rounded-lg px-3 py-2.5 transition-all cursor-pointer border ${exp === "control"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight">Mission Control</div>
                        <div className="text-[10px] opacity-60 leading-tight">How is it operated?</div>
                      </div>
                      {exp === "control" && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0" />}
                    </div>
                  </div>
                </Link>
              )}
            </div>

            <div className="mx-3 border-t border-border/30 mb-2" />

            {/* ── MISSION STUDIO sub-nav ── */}
            {exp === "studio" && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[9px] tracking-[0.2em] opacity-40">MISSION STUDIO</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem href="/command"        label="Overview"         icon={LayoutDashboard} />
                    <NavItem href="/question-health" label="Question Health" icon={ClipboardList} />
                    <NavItem href="/issues"         label="Signals"          icon={AlertTriangle} />
                    <NavItem href="/heatmap"        label="Section Status"   icon={BarChart3} />
                    <NavItem href="/broadcasts"     label="Broadcasts"       icon={Activity} />
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* ── MISSION CONTROL sub-nav ── */}
            {exp === "control" && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[9px] tracking-[0.2em] opacity-40 text-amber-400/60">MISSION CONTROL</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <NavItem href="/mission-control"    label="Mission Setup"      icon={Settings} />
                    <NavItem href="/section-assignments" label="Team & Assignments" icon={Users} />
                    <NavItem href="/library"            label="Library"            icon={FileText} />
                    <NavItem href="/intel"              label="Mission Brain"       icon={Brain} />
                    <NavItem href="/pulse"              label="Strategy"            icon={Compass} />
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")} tooltip="Admin Panel">
                <Link to="/admin"><Shield className="h-4 w-4" /><span>Admin</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/select-engagement")} tooltip="Lobby — Return to headquarters">
              <Link to="/select-engagement"><Home className="h-4 w-4" /><span>Lobby</span></Link>
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
