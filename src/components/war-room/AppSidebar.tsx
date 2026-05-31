/**
 * AppSidebar — Athena Command Architecture Reset
 *
 * 4 destinations only:
 *   ATHENA HQ      /select-engagement
 *   ADMIN          /admin  (admin-gated)
 *   MISSION        /command  (engagement-contextual, 8 tabs)
 *   COMMAND CENTER /executive-command  (leadership)
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Home, Building2, Crosshair, Radio, ChevronRight, Plus } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { EngagementSwitcher } from "@/components/EngagementSwitcher";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { useIsAdmin } from "@/hooks/use-admin";

const GOLD = "#C49A2A";
const NAVY = "#1B3B72";
const BORDER = "rgba(255,255,255,0.08)";

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { engagement, isLeadership } = useEngagement();
  const { isAdmin } = useIsAdmin();

  const isHQ      = pathname.startsWith("/select-engagement") || pathname === "/";
  const isAdmin_  = pathname.startsWith("/admin") || pathname.startsWith("/mission-control") || pathname.startsWith("/engagement/new");
  const isMission = !!engagement && !isHQ && !isAdmin_ && !pathname.startsWith("/executive-command");
  const isCommand = pathname.startsWith("/executive-command");

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const NavDest = ({
    href, label, sub, icon: Icon, active, gold = false,
  }: { href: string; label: string; sub: string; icon: any; active: boolean; gold?: boolean }) => (
    <Link to={href as any} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        borderRadius: 10, marginBottom: 4, cursor: "pointer",
        background: active ? (gold ? "rgba(196,154,42,0.1)" : "rgba(255,255,255,0.07)") : "transparent",
        border: `1px solid ${active ? (gold ? "rgba(196,154,42,0.35)" : "rgba(255,255,255,0.15)") : "transparent"}`,
        transition: "all 0.15s",
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? (gold ? "rgba(196,154,42,0.2)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.05)",
          border: `1px solid ${active ? (gold ? "rgba(196,154,42,0.4)" : "rgba(255,255,255,0.2)") : BORDER}`,
        }}>
          <Icon style={{ width: 16, height: 16, color: active ? (gold ? GOLD : "#e8edf5") : "rgba(255,255,255,0.4)" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: active ? 700 : 500,
            color: active ? (gold ? GOLD : "#e8edf5") : "rgba(255,255,255,0.5)",
            letterSpacing: active ? "-0.01em" : 0,
          }}>{label}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{sub}</div>
        </div>
        {active && <ChevronRight style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />}
      </div>
    </Link>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader style={{ padding: "16px 16px 12px" }}>
        <BrandLockup variant="lockup" tone="white" size="sm" />
      </SidebarHeader>

      <SidebarContent style={{ padding: "0 8px" }}>
        {/* ── Primary Destinations ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", padding: "4px 14px 8px" }}>
            Destinations
          </div>
          <NavDest href="/select-engagement" label="Athena HQ"      sub="Headquarters"             icon={Home}      active={isHQ} />
          {(isAdmin || isLeadership) && (
            <NavDest href="/admin"             label="Admin"          sub="Missions & governance"   icon={Building2} active={isAdmin_} />
          )}
          {engagement && (
            <NavDest href="/command"           label="Mission"        sub={engagement.name ?? "Active mission"} icon={Crosshair} active={isMission} />
          )}
          {(isAdmin || isLeadership) && (
            <NavDest href="/executive-command" label="Command Center" sub="Fleet visibility"         icon={Radio}     active={isCommand} gold />
          )}
        </div>

        {/* ── Mission Switcher ── */}
        {engagement && (
          <div style={{ padding: "0 6px", marginTop: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", padding: "4px 8px 6px" }}>
              Active Mission
            </div>
            <EngagementSwitcher />
          </div>
        )}

        {/* ── Create New Mission shortcut (admin only) ── */}
        {(isAdmin || isLeadership) && (
          <div style={{ padding: "8px 6px 0" }}>
            <a href="/engagement/new" style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                borderRadius: 8, border: `1px dashed rgba(196,154,42,0.3)`,
                color: GOLD, fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}>
                <Plus style={{ width: 13, height: 13 }} />
                New Mission
              </div>
            </a>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter style={{ padding: "12px 16px" }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sign out"
              style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
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
