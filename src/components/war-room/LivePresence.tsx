import { usePresence } from "@/hooks/use-presence";
import { useRouterState } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Lead",
  writer: "Writer",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

const PATH_LABEL: Record<string, string> = {
  "/command": "Command Center",
  "/huddle": "Daily Huddle",
  "/sos": "SOS Alerts",
  "/team": "Team Roster",
  "/risks": "Risks",
  "/heatmap": "Heat Map",
  "/intel": "Intel",
  "/decisions": "Decisions",
  "/pulse": "Client Pulse",
  "/broadcasts": "Broadcasts",
  "/snapshots": "Snapshots",
  "/assistant": "Assistant",
  "/settings": "Settings",
};

type Variant = "compact" | "full";

export function LivePresence({ variant = "compact" }: { variant?: Variant }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const users = usePresence(pathname);

  if (users.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground hidden sm:inline">
        Just you
      </span>
    );
  }

  const sorted = [...users].sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (variant === "full") {
    return (
      <div className="rounded-lg border border-[var(--gold)]/25 bg-surface-hover/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">
            Live in War Room
          </div>
          <div className="text-xs text-muted-foreground">
            {users.length} {users.length === 1 ? "operator" : "operators"} online
          </div>
        </div>
        <ul className="space-y-2">
          {sorted.map((u) => (
            <li key={u.user_id} className="flex items-center gap-3 text-sm">
              <span className="relative inline-flex">
                <span className="h-8 w-8 rounded-full bg-[var(--gold)]/15 border border-[var(--gold)]/40 flex items-center justify-center text-[11px] font-bold text-[var(--gold)]">
                  {initials(u.display_name)}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{u.display_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {ROLE_LABEL[u.role] ?? u.role} · {PATH_LABEL[u.path] ?? u.path}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const shown = sorted.slice(0, 5);
  const extra = sorted.length - shown.length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)] font-semibold hidden md:inline">
          Live
        </span>
        <div className="flex -space-x-2">
          {shown.map((u) => (
            <Tooltip key={u.user_id}>
              <TooltipTrigger asChild>
                <span className="relative inline-flex">
                  <span className="h-7 w-7 rounded-full bg-[var(--gold)]/15 border border-[var(--gold)]/50 flex items-center justify-center text-[10px] font-bold text-[var(--gold)] ring-2 ring-background">
                    {initials(u.display_name)}
                  </span>
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-background" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-semibold">{u.display_name}</div>
                  <div className="text-muted-foreground">
                    {ROLE_LABEL[u.role] ?? u.role} · {PATH_LABEL[u.path] ?? u.path}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          {extra > 0 && (
            <span className="h-7 w-7 rounded-full bg-surface-hover border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground ring-2 ring-background">
              +{extra}
            </span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
