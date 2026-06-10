import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Rocket,
  AlertTriangle,
  ClipboardCheck,
  XCircle,
  UserPlus,
  Star,
  CheckCircle2,
  MessageCircle,
  GraduationCap,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  recipient_id: string | null;
  recipient_role: string;
  type: string;
  message: string;
  metadata: any;
  is_read: boolean;
  created_at: string;
};

const ICONS: Record<string, { Icon: any; cls: string }> = {
  mission_launched: { Icon: Rocket, cls: "text-primary" },
  amendment_impact: { Icon: AlertTriangle, cls: "text-amber-400" },
  assignment_acceptance_required: { Icon: ClipboardCheck, cls: "text-primary" },
  assignment_removed: { Icon: XCircle, cls: "text-red-400" },
  sme_needed: { Icon: UserPlus, cls: "text-blue-400" },
  capacity_concern: { Icon: AlertTriangle, cls: "text-red-400" },
  win_strategy_updated: { Icon: Star, cls: "text-primary" },
  gate_cleared: { Icon: CheckCircle2, cls: "text-green-400" },
  qa_communicated: { Icon: MessageCircle, cls: "text-blue-400" },
  onboarding_complete: { Icon: GraduationCap, cls: "text-green-400" },
  iris_alert: { Icon: Eye, cls: "text-amber-400 animate-pulse" },
};

function navTarget(n: Notification): { to: string; search?: Record<string, string> } | null {
  const missionId = n.metadata?.mission_id;
  switch (n.type) {
    case "mission_launched":
      return missionId ? { to: `/olympus/missions/${missionId}` } : null;
    case "amendment_impact":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "rfp-documents" } }
        : null;
    case "assignment_acceptance_required":
    case "assignment_removed":
      return { to: "/olympus/flight-deck" };
    case "sme_needed":
    case "capacity_concern":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "team" } }
        : null;
    case "win_strategy_updated":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "win-strategy" } }
        : null;
    case "gate_cleared":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "journey" } }
        : null;
    case "qa_communicated":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "qa-log" } }
        : null;
    case "onboarding_complete":
      return { to: "/olympus/team" };
    case "iris_alert":
      return missionId
        ? { to: `/olympus/missions/${missionId}`, search: { tab: "question-health" } }
        : null;
    default:
      return null;
  }
}

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      const { data: m } = await supabase.rpc("current_atlas_member_id");
      if (!cancelled) setMemberId((m as string) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", userId, memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from("atlas_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Notification[];
    },
    enabled: !!userId,
  });

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${memberId ?? "nil"}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "atlas_notifications" },
        (payload) => {
          const n = payload.new as Notification;
          // Filter to my notifications
          if (n.recipient_id && n.recipient_id !== userId && n.recipient_id !== memberId) return;
          qc.invalidateQueries({ queryKey: ["notifications"] });
          toast(n.message, { duration: 4000 });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, memberId, qc]);

  const unread = useMemo(() => notifications.filter((n) => !n.is_read), [notifications]);
  const unreadCount = unread.length;

  const markRead = async (id: string) => {
    await supabase.from("atlas_notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllRead = async () => {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    await supabase.from("atlas_notifications").update({ is_read: true }).in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markRead(n.id);
    const target = navTarget(n);
    if (target) {
      setOpen(false);
      navigate({ to: target.to, search: target.search ?? {} } as any);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent
        align="end"
        className="w-[420px] max-w-[95vw] p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-semibold text-foreground">Notifications</div>
            <div className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-green-400 mb-2" />
              <p className="text-sm text-muted-foreground">You are all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const meta = ICONS[n.type] ?? { Icon: Bell, cls: "text-muted-foreground" };
                const Icon = meta.Icon;
                return (
                  <li
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover/50 transition-colors",
                      !n.is_read && "bg-primary/5",
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", meta.cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-center">
          <button
            onClick={() => toast("Full notifications page coming soon.")}
            className="text-xs text-primary hover:underline"
          >
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
