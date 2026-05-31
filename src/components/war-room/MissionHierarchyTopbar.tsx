import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Check, ArrowLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { useEngagement, type Membership } from "@/hooks/use-engagement";
import { supabase } from "@/integrations/supabase/client";

const LEADERSHIP_ROLES = new Set(["founder", "pm", "engagement_lead"]);
const MISSION_CONTROL_ROLES = new Set(["founder", "pm"]);

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  pm: "PM",
  engagement_lead: "Lead",
  writer: "Writer",
  viewer: "Viewer",
};

const ROLE_BADGE: Record<string, string> = {
  founder: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  pm: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  engagement_lead: "bg-blue-500/20 text-blue-200 border-blue-500/40",
  writer: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  viewer: "bg-zinc-500/20 text-zinc-200 border-zinc-500/40",
};

type HealthLevel = "Green" | "Yellow" | "Orange" | "Red" | "Unknown";

const HEALTH_DOT: Record<HealthLevel, string> = {
  Green: "bg-emerald-400",
  Yellow: "bg-yellow-400",
  Orange: "bg-orange-400",
  Red: "bg-red-500",
  Unknown: "bg-zinc-500",
};

function routeForRole(role: string): string {
  return LEADERSHIP_ROLES.has(role) ? "/command" : "/writer/my-sections";
}

function worseHealth(a: HealthLevel, b: HealthLevel): HealthLevel {
  const order: HealthLevel[] = ["Unknown", "Green", "Yellow", "Orange", "Red"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

type EngMeta = {
  health: HealthLevel;
  openAlerts: number;
  daysToSubmit: number | null;
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function MissionHierarchyTopbar() {
  const { engagement, memberships, role, switchEngagement } = useEngagement();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [metaById, setMetaById] = useState<Record<string, EngMeta>>({});

  // Determine highest-tier role across memberships (for breadcrumb visibility when no current engagement)
  const hasFounderPm = useMemo(
    () => memberships.some((m) => MISSION_CONTROL_ROLES.has(m.role)),
    [memberships],
  );
  const hasLeadership = useMemo(
    () => memberships.some((m) => LEADERSHIP_ROLES.has(m.role)),
    [memberships],
  );

  const currentRole = role ?? (hasFounderPm ? "founder" : hasLeadership ? "engagement_lead" : "writer");
  const showMissionControl = MISSION_CONTROL_ROLES.has(currentRole);
  const showCommandCenter = LEADERSHIP_ROLES.has(currentRole);

  // Hydrate per-mission health for the switcher
  useEffect(() => {
    if (memberships.length === 0) return;
    const ids = memberships.map((m) => m.engagement.id);
    let cancelled = false;
    (async () => {
      const [heatRes, sosRes] = await Promise.all([
        supabase.from("heatmap_sections").select("engagement_id,status").in("engagement_id", ids),
        supabase.from("sos_alerts").select("engagement_id,status").in("engagement_id", ids).neq("status", "Resolved"),
      ]);
      if (cancelled) return;
      const map: Record<string, EngMeta> = {};
      for (const m of memberships) {
        map[m.engagement.id] = {
          health: "Unknown",
          openAlerts: 0,
          daysToSubmit: daysUntil(m.engagement.submission_date),
        };
      }
      for (const r of (heatRes.data as { engagement_id: string; status: string }[] | null) ?? []) {
        const bucket = map[r.engagement_id];
        if (!bucket) continue;
        const s = r.status as HealthLevel;
        if (s === "Green" || s === "Yellow" || s === "Orange" || s === "Red") {
          bucket.health = worseHealth(bucket.health, s);
        }
      }
      for (const r of (sosRes.data as { engagement_id: string }[] | null) ?? []) {
        const bucket = map[r.engagement_id];
        if (bucket) bucket.openAlerts++;
      }
      setMetaById(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberships]);

  const currentMeta = engagement ? metaById[engagement.id] : undefined;
  const currentHealth: HealthLevel = currentMeta?.health ?? "Unknown";

  function pick(m: Membership) {
    setOpen(false);
    if (engagement && m.engagement.id === engagement.id) return;
    switchEngagement(m.engagement.id);
    navigate({ to: routeForRole(m.role), replace: true });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
      {/* Left: Athena mark + breadcrumb */}
      <BrandLockup size="sm" markOnly className="shrink-0" />
      <nav className="ml-1 flex min-w-0 items-center gap-1 truncate" aria-label="Hierarchy">
        {showMissionControl && (
          <>
            <Link
              to="/command"
              className="rounded px-1.5 py-0.5 font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              Mission Control
            </Link>
            {(showCommandCenter || engagement) && (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            )}
          </>
        )}
        {showCommandCenter && (
          <>
            <Link
              to="/select-engagement"
              className="rounded px-1.5 py-0.5 font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              Morning Brief
            </Link>
            {engagement && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          </>
        )}
        {engagement && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate rounded px-1.5 py-0.5 text-sm font-bold text-foreground">
              Mission: {engagement.name}
            </span>
            {!showCommandCenter && role && (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_BADGE[role] ?? ""}`}
              >
                {ROLE_LABEL[role] ?? role}
              </span>
            )}
          </span>
        )}
      </nav>

      {/* Right: mission switcher pill */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {memberships.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-border bg-surface-hover/40 px-3 py-1.5 text-xs transition hover:bg-surface-hover"
              >
                <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[currentHealth]}`} aria-hidden />
                <span className="max-w-[16vw] truncate font-semibold">
                  {engagement ? engagement.name : "Select Mission"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-1">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your Missions
              </div>
              <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
                {memberships
                  .filter((m) => m.engagement.status !== "Archived")
                  .map((m) => {
                    const meta = metaById[m.engagement.id];
                    const health: HealthLevel = meta?.health ?? "Unknown";
                    const isCurrent = engagement?.id === m.engagement.id;
                    const days = meta?.daysToSubmit ?? null;
                    return (
                      <button
                        key={m.engagement.id}
                        type="button"
                        onClick={() => pick(m)}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition hover:bg-accent"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[health]}`}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">
                              Mission: {m.engagement.name}
                            </span>
                            {isCurrent && <Check className="h-3 w-3 shrink-0 text-[var(--gold)]" />}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {m.engagement.state && <span>{m.engagement.state}</span>}
                            {days !== null && (
                              <span>
                                {days >= 0 ? `T-${days}d` : `${Math.abs(days)}d past`}
                              </span>
                            )}
                            {meta && meta.openAlerts > 0 && (
                              <span className="font-semibold text-red-400">
                                {meta.openAlerts} alert{meta.openAlerts === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ROLE_BADGE[m.role] ?? ""}`}
                        >
                          {ROLE_LABEL[m.role] ?? m.role}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <div className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate({ to: "/select-engagement" });
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Command Center
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
