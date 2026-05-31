/**
 * AppSidebar — Athena Command V1
 *
 * PRIMARY NAV:   Lobby | Executive Command | Missions
 * INSIDE MISSION: Mission Studio | Mission Control
 *
 * IRIS is embedded throughout — no standalone IRIS nav item.
 * No Admin section in V1 — configuration lives inside Mission Control.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, AlertTriangle, Activity, Settings,
  LogOut, Shield, Home, ChevronRight, FileText, Users,
  Brain, BarChart3, ClipboardList, Compass, Zap, Building2, Telescope, Plus,
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

// ── Experience detection from URL ─────────────────────────────────
type Experience = "studio" | "control" | "none";
function useExperience(pathname: string): Experience {
  if (["/mission-control","/intel","/pulse","/library","/settings",
       "/section-assignments","/mission-admin","/team"].some(p => pathname.startsWith(p)))
    return "control";
  if (["/command","/issues","/heatmap","/question-health","/broadcasts",
       "/pulse","/assistant"].some(p => pathname.startsWith(p)))
    return "studio";
  return "none";
}

// ── Top-level context ─────────────────────────────────────────────
type TopLevel = "lobby" | "exec" | "mission";
function useTopLevel(pathname: string, hasMission: boolean): TopLevel {
  if (pathname.startsWith("/select-engagement") || pathname.startsWith("/overview")) return "lobby";
  if (pathname.startsWith("/executive-command")) return "exec";
  if (hasMission) return "mission";
  return "lobby";
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, member, isArchived, isLeadership } = useEngagement();
  const { isAdmin } = useIsAdmin();
  const exp = useExperience(pathname);
  const top = useTopLevel(pathname, !!engagement);
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const canControl = isLeadership || isAdmin;

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

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

  // ── Primary nav tab ─────────────────────────────────────────────
  const PrimaryTab = ({ href, label, sub, active }: { href: string; label: string; sub: string; active: boolean }) => (
    <Link to={href as any} className="block no-underline">
      <div style={{
        padding: "8px 12px", borderRadius: 8, marginBottom: 2,
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        border: active ? "0.5px solid rgba(255,255,255,0.12)" : "0.5px solid transparent",
        transition: "all 0.15s",
      }}>
        <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--foreground)" : "var(--muted-foreground)" }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-foreground)", opacity: 0.5, marginTop: 1 }}>
          {sub}
        </div>
      </div>
    </Link>
  );

  // ── Experience card (inside mission) ────────────────────────────
  const ExpCard = ({ href, label, sub, icon: Icon, active, gold }: any) => (
    <Link to={href} className="block no-underline">
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        borderRadius: 8, marginBottom: 4, transition: "all 0.15s",
        background: active ? (gold ? "rgba(196,154,42,0.08)" : "rgba(59,127,255,0.08)") : "transparent",
        border: `0.5px solid ${active ? (gold ? "rgba(196,154,42,0.3)" : "rgba(59,127,255,0.3)") : "transparent"}`,
      }}>
        <Icon className="h-4 w-4 flex-shrink-0"
          style={{ color: active ? (gold ? "#C49A2A" : "#3b7fff") : "var(--muted-foreground)" }} />
        <div className="min-w-0">
          <div style={{ fontSize: 11, fontWeight: 700, color: active ? (gold ? "#C49A2A" : "var(--foreground)") : "var(--muted-foreground)", lineHeight: 1.3 }}>
            {label}
          </div>
          <div style={{ fontSize: 10, opacity: 0.5, lineHeight: 1.3 }}>{sub}</div>
        </div>
        {active && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0 opacity-40" />}
      </div>
    </Link>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-center px-2 py-3 border-b border-border/40">
          <BrandLockup size="md" />
        </div>

        {/* Primary navigation — always visible */}
        <div className="px-2 pt-3 pb-1">
          <PrimaryTab href="/select-engagement"  label="Lobby"             sub="Athena headquarters" active={top === "lobby"} />
          <PrimaryTab href="/executive-command"  label="Executive Command" sub="Portfolio visibility" active={top === "exec"} />
        </div>

        {/* Mission switcher */}
        {engagement && (
          <div className="px-2 pb-2 border-t border-border/30 pt-2">
            <EngagementSwitcher />
          </div>
        )}

        {engagement && member?.role && (
          <div className="mx-2 mb-1 rounded border border-border/40 bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {member.role === "lead" || member.role === "engagement_lead" || member.role === "founder"
              ? "Engagement Lead"
              : member.role === "pm" ? "Project Manager"
              : member.role === "exec" ? "Executive"
              : member.role === "writer" ? "Writer"
              : member.role === "sme" ? "SME"
              : member.role}
          </div>
        )}

        {isArchived && (
          <div className="mx-2 mb-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Archived — read only
          </div>
        )}

        {/* Mission experiences — only when inside a mission */}
        {engagement && top === "mission" && (
          <div className="px-2 pb-2 border-t border-border/30 pt-2">
            <ExpCard href="/command"        label="Mission Studio"  sub="How are we doing?"       icon={Zap}       active={exp === "studio"} />
            {canControl && <ExpCard href="/mission-control" label="Mission Admin"   sub="Configuration & setup" icon={Building2} active={exp === "control"} gold />}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* ── No mission or Lobby/Exec context ── */}
        {(!engagement || top !== "mission") && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Nothing extra — primary nav is in the header */}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── MISSION STUDIO sub-nav ── */}
        {engagement && top === "mission" && exp === "studio" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[9px] tracking-[0.18em] opacity-30">MISSION STUDIO</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/command"         label="Mission Overview" icon={LayoutDashboard} />
                <NavItem href="/question-health" label="Question Health" icon={ClipboardList} />
                <NavItem href="/issues"          label="Team Signals"    icon={AlertTriangle} />
                <NavItem href="/heatmap"         label="Delivery Map"    icon={BarChart3} />
                <NavItem href="/broadcasts"      label="Broadcasts"      icon={Activity} />
                <NavItem href="/assistant"       label="Navigator™"      icon={Sparkles} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── MISSION CONTROL sub-nav ── */}
        {engagement && top === "mission" && exp === "control" && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[9px] tracking-[0.18em] opacity-30 text-amber-400/50">MISSION CONTROL</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem href="/mission-control"     label="Mission Setup"       icon={Settings} />
                <NavItem href="/section-assignments" label="Team & Assignments"  icon={Users} />
                <NavItem href="/library"             label="Library"             icon={FileText} />
                <NavItem href="/intel"               label="Mission Brain"        icon={Brain} />
                <NavItem href="/pulse"               label="Alignment Hub"        icon={Compass} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
            <SidebarMenuButton asChild tooltip="Create a new mission">
              <a href="/engagement/new">
                <Plus className="h-4 w-4" />
                <span>New Mission</span>
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
