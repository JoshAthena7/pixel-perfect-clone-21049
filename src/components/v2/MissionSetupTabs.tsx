import { Link, useParams, useRouterState, useSearch } from "@tanstack/react-router";
import {
  ClipboardList,
  HelpCircle,
  ShieldCheck,
  Users,
  Trophy,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

/**
 * Unified Mission Setup tab strip. Renders at the top of the Setup-related
 * mission routes (settings, questions, vault) so they feel like one page
 * even though they remain distinct URLs.
 */
export function MissionSetupTabs() {
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;
  const path = useRouterState({ select: (s) => s.location.pathname });
  // settings.tsx reads ?tab= — match it here for active highlighting.
  const search = useSearch({ strict: false }) as { tab?: string };

  if (!missionId) return null;

  const onSettings = path.endsWith("/settings");
  const onSections = path.includes("/sections");
  const onVault = path.endsWith("/vault");

  const settingsTab = onSettings ? (search.tab ?? "details") : null;

  const items = [
    {
      key: "details",
      label: "Mission",
      icon: ClipboardList,
      to: "/missions/$missionId/settings",
      search: { tab: "details" },
      active: settingsTab === "details",
    },
    {
      key: "sections",
      label: "Sections",
      icon: HelpCircle,
      to: "/missions/$missionId/sections",
      search: undefined as undefined,
      active: onSections,
    },
    {
      key: "gates",
      label: "Gates",
      icon: ShieldCheck,
      to: "/missions/$missionId/settings",
      search: { tab: "gates" },
      active: settingsTab === "gates",
    },
    {
      key: "team",
      label: "Team",
      icon: Users,
      to: "/missions/$missionId/settings",
      search: { tab: "team" },
      active: settingsTab === "team",
    },
    {
      key: "themes",
      label: "Win Themes",
      icon: Trophy,
      to: "/missions/$missionId/settings",
      search: { tab: "themes" },
      active: settingsTab === "themes",
    },
    {
      key: "sensitivities",
      label: "Sensitivities",
      icon: AlertTriangle,
      to: "/missions/$missionId/settings",
      search: { tab: "sensitivities" },
      active: settingsTab === "sensitivities",
    },
    {
      key: "vault",
      label: "Vault",
      icon: BookOpen,
      to: "/missions/$missionId/vault",
      search: undefined as undefined,
      active: onVault,
    },
  ];

  return (
    <div className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="px-8 pt-5 pb-0">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Mission Setup
          </span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                params={{ missionId }}
                search={item.search as any}
                className={`group relative inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm transition ${
                  item.active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {item.active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
