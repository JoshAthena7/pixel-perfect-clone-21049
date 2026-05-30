import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  Megaphone,
  Brain,
  TrendingUp,
  AlertTriangle,
  Activity,
  Settings,
  LogOut,
  Shield,
  DoorOpen,
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
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

type Item = { title: string; url: string; icon: ComponentType<LucideProps>; hint: string };

const NAV: Item[] = [
  { title: "Dashboard",       url: "/admin",               icon: LayoutDashboard, hint: "Platform overview across every Mission" },
  { title: "Engagements",     url: "/admin/engagements",   icon: Building2,       hint: "All active, closed, and archived Missions" },
  { title: "Collective™",     url: "/admin/collective",    icon: Users,           hint: "People across all engagements" },
  { title: "Global Messaging",url: "/admin/messaging",     icon: Megaphone,       hint: "Broadcast to any or all Missions" },
  { title: "Intelligence",    url: "/admin/intelligence",  icon: Brain,           hint: "Insights engine + market intel oversight" },
  { title: "Pipeline",        url: "/admin/pipeline",      icon: TrendingUp,      hint: "Procurement opportunity tracker" },
  { title: "Alerts",          url: "/admin/alerts",        icon: AlertTriangle,   hint: "SOS, risks, and stuck flags across every Mission" },
  { title: "Activity",        url: "/admin/activity",      icon: Activity,        hint: "Unified platform activity feed" },
  { title: "Settings",        url: "/admin/settings",      icon: Settings,        hint: "Platform configuration" },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (p: string) => (p === "/admin" ? pathname === "/admin" : pathname.startsWith(p));

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col items-center gap-1 px-2 py-3 border-b border-border/40">
          <Shield className="h-7 w-7 text-[var(--gold)]" />
          <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)] font-semibold text-center leading-tight">
            Athena<br />Command Operations
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={`${i.title} — ${i.hint}`}>
                    <Link to={i.url}>
                      <i.icon className="h-4 w-4" />
                      <span>{i.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open the engagement lobby">
              <Link to="/select-engagement">
                <DoorOpen className="h-4 w-4" />
                <span>Command Center</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out of your account">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
