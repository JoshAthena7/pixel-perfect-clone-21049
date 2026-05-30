import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Check } from "lucide-react";
import { useEngagement, type Membership } from "@/hooks/use-engagement";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const ROLE_BADGE: Record<string, string> = {
  founder: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  pm: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  engagement_lead: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  writer: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  viewer: "bg-zinc-500/20 text-zinc-200 border-zinc-500/40",
};

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Lead",
  writer: "Writer",
  viewer: "Viewer",
};

function routeForRole(role: string): string {
  if (role === "writer") return "/writer/my-sections";
  return "/command";
}

export function EngagementSwitcher() {
  const { engagement, memberships, switchEngagement, role } = useEngagement();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const multi = memberships.length > 1;

  if (!engagement) return null;

  function pick(m: Membership) {
    switchEngagement(m.engagement.id);
    setOpen(false);
    navigate({ to: routeForRole(m.role), replace: true });
  }

  return (
    <div className="mx-2 mt-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!multi}
            className="flex w-full items-center gap-2 rounded-md border border-[var(--gold)]/20 bg-surface-hover/50 px-2 py-1.5 text-left transition hover:bg-surface-hover disabled:cursor-default disabled:opacity-90"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{engagement.name}</div>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[10px] text-muted-foreground">{engagement.client}</span>
                {role && (
                  <span className={`shrink-0 rounded border px-1 py-px text-[9px] uppercase tracking-wider ${ROLE_BADGE[role] ?? ""}`}>
                    {ROLE_LABEL[role] ?? role}
                  </span>
                )}
              </div>
            </div>
            {multi && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </button>
        </PopoverTrigger>
        {multi && (
          <PopoverContent align="start" className="w-72 p-1">
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Switch engagement
            </div>
            {memberships.map((m) => {
              const isCurrent = m.engagement.id === engagement.id;
              return (
                <button
                  key={m.engagement.id}
                  type="button"
                  onClick={() => pick(m)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.engagement.name}</span>
                      {isCurrent && <Check className="h-3 w-3 text-[var(--gold)]" />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{m.engagement.client}</div>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${ROLE_BADGE[m.role] ?? ""}`}>
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
