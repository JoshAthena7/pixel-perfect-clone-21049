import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  AlertTriangle,
  LifeBuoy,
  CheckCircle2,
  FileText,
  Download,
  Activity,
  Radio,
  ClipboardCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AssistEvent = {
  id: string;
  event_type: string;
  mission_id: string;
  question_id: string | null;
  created_at: string;
  metadata: any;
};

type MissionMeta = { id: string; name: string | null };

const ACTIVITY: Record<string, { Icon: any; cls: string; label: (e: AssistEvent) => string }> = {
  sos_raised: { Icon: LifeBuoy, cls: "text-red-400", label: () => "SOS raised — SME assignment requested" },
  assist_acknowledged: { Icon: CheckCircle2, cls: "text-green-400", label: () => "Assist acknowledged by lead" },
  assist_ignored: { Icon: AlertTriangle, cls: "text-amber-400", label: () => "Assist dismissed" },
  brief_opened: { Icon: FileText, cls: "text-blue-400", label: () => "IRIS brief opened" },
  brief_exported: { Icon: Download, cls: "text-primary", label: () => "Brief exported" },
  check_in: { Icon: ClipboardCheck, cls: "text-blue-400", label: () => "Writer check-in submitted" },
  status_updated: { Icon: Activity, cls: "text-primary", label: (e) => `Status updated to ${(e.metadata?.new_status ?? "—").toString().replace(/_/g, " ")}` },
};

const DEFAULT_ACTIVITY = { Icon: Radio, cls: "text-muted-foreground", label: (e: AssistEvent) => e.event_type.replace(/_/g, " ") };

function getActivity(e: AssistEvent) {
  return ACTIVITY[e.event_type] ?? DEFAULT_ACTIVITY;
}

function navTarget(e: AssistEvent, currentMissionId: string | null): { to: string; params: any; search?: any } {
  if (e.question_id) {
    return { to: "/missions/$missionId/flight-deck", params: { missionId: e.mission_id } };
  }
  return { to: "/missions/$missionId/briefing", params: { missionId: e.mission_id } };
}

function lastReadKey(uid: string) {
  return `lovable.notifBell.lastRead.${uid}`;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        try {
          setLastReadAt(localStorage.getItem(lastReadKey(uid)));
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ["notif-bell", userId],
    queryFn: async () => {
      if (!userId) return [] as { events: AssistEvent[]; missions: Record<string, string> }["events"];
      // Missions where I'm a member
      const { data: members } = await supabase
        .from("mission_team_members")
        .select("mission_id")
        .eq("user_id", userId);
      const missionIds = Array.from(new Set(((members ?? []) as any[]).map((m) => m.mission_id).filter(Boolean)));
      if (missionIds.length === 0) return [];
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("mission_assist_events")
        .select("id,event_type,mission_id,question_id,created_at,metadata")
        .in("mission_id", missionIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10);
      return ((data ?? []) as AssistEvent[]);
    },
    enabled: !!userId,
    refetchInterval: 60_000,
  });

  const missionIds = useMemo(() => Array.from(new Set(events.map((e) => e.mission_id))), [events]);
  const { data: missions = [] } = useQuery({
    queryKey: ["notif-bell-missions", missionIds.join(",")],
    queryFn: async () => {
      if (missionIds.length === 0) return [] as MissionMeta[];
      const { data } = await supabase.from("missions").select("id,name").in("id", missionIds);
      return (data ?? []) as MissionMeta[];
    },
    enabled: missionIds.length > 0,
  });
  const missionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of missions) m.set(r.id, r.name ?? "Mission");
    return m;
  }, [missions]);

  const cutoff48 = useMemo(() => new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), [events.length]);
  const unreadCount = useMemo(() => {
    const since = lastReadAt && lastReadAt > cutoff48 ? lastReadAt : cutoff48;
    return events.filter((e) => e.created_at > since).length;
  }, [events, lastReadAt, cutoff48]);

  const markAllRead = () => {
    if (!userId) return;
    const now = new Date().toISOString();
    try {
      localStorage.setItem(lastReadKey(userId), now);
    } catch {
      /* ignore */
    }
    setLastReadAt(now);
    qc.invalidateQueries({ queryKey: ["notif-bell", userId] });
  };

  const handleClick = (e: AssistEvent) => {
    const target = navTarget(e, null);
    setOpen(false);
    navigate({ to: target.to as any, params: target.params } as any);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-primary hover:text-primary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-1">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
              <span className="absolute bottom-1 right-2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] max-w-[95vw] p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-semibold text-foreground">Recent Activity</div>
            <div className="text-xs text-muted-foreground">
              {events.length === 0 ? "Nothing recent" : `${events.length} event${events.length === 1 ? "" : "s"} across your missions`}
            </div>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-400 mb-2" />
              <p className="text-sm text-muted-foreground">No mission activity in the last 7 days.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => {
                const meta = getActivity(e);
                const Icon = meta.Icon;
                const missionName = missionNameById.get(e.mission_id) ?? "";
                const isUnread = e.created_at > (lastReadAt ?? cutoff48);
                return (
                  <li
                    key={e.id}
                    onClick={() => handleClick(e)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover/50 transition-colors",
                      isUnread && "bg-primary/5",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", meta.cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{meta.label(e)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {missionName && (
                          <span className="text-[10px] text-muted-foreground truncate">{missionName}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
