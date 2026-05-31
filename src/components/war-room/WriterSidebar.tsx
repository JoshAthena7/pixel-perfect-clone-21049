/**
 * WriterSidebar — Athena Command Architecture Reset
 * Simplified navigation for writer role: HQ + Mission tabs only
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Crosshair, LogOut } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { BrandLockup } from "@/components/ui/BrandLockup";

const GOLD = "#C49A2A", BORDER = "rgba(255,255,255,0.08)", MUTED = "rgba(255,255,255,0.4)";

const MISSION_TABS = [
  { tab: "overview",      label: "Overview" },
  { tab: "library",       label: "Library" },
  { tab: "briefing",      label: "Briefing Book" },
  { tab: "assignments",   label: "My Assignments" },
  { tab: "team-updates",  label: "Team Updates" },
  { tab: "sos",           label: "SOS" },
];

export function WriterSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => r.location.search as any });
  const { engagement } = useEngagement();
  const currentTab = search?.tab ?? "overview";

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const isHQ = pathname.startsWith("/select-engagement");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader style={{ padding: "16px 16px 12px" }}>
        <BrandLockup variant="lockup" tone="white" size="sm" />
      </SidebarHeader>

      <SidebarContent style={{ padding: "0 8px" }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", padding: "4px 14px 8px" }}>
            Navigation
          </div>

          {/* HQ */}
          <Link to="/select-engagement" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, marginBottom: 4, background: isHQ ? "rgba(255,255,255,0.07)" : "transparent", border: `1px solid ${isHQ ? "rgba(255,255,255,0.15)" : "transparent"}` }}>
              <Home style={{ width: 15, height: 15, color: isHQ ? "#e8edf5" : MUTED }} />
              <span style={{ fontSize: 13, fontWeight: isHQ ? 700 : 400, color: isHQ ? "#e8edf5" : MUTED }}>Athena HQ</span>
            </div>
          </Link>

          {/* Mission tabs */}
          {engagement && (
            <>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", padding: "8px 14px 4px" }}>
                {engagement.name}
              </div>
              {MISSION_TABS.map(({ tab, label }) => {
                const active = !isHQ && currentTab === tab;
                return (
                  <Link key={tab} to="/command" search={{ tab }} style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 24px", borderRadius: 8, marginBottom: 2, background: active ? "rgba(255,255,255,0.06)" : "transparent", borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent", color: active ? "#e8edf5" : MUTED, fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                      {label}
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter style={{ padding: "12px 16px" }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out" style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginTop: 8, letterSpacing: "0.08em" }}>
          ATHENA COMMAND™ · RESTRICTED ACCESS
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
