import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";

type SignalRow = {
  id: string;
  mission_id: string;
  signal_title: string;
  signal_summary: string | null;
  severity: string;
  created_at: string;
  related_question_id: string | null;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["me-profile-lastseen", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,last_seen_signals_at")
        .eq("id", me!)
        .maybeSingle();
      return data as { id: string; last_seen_signals_at: string | null } | null;
    },
  });

  const { data: signals = [] } = useQuery({
    queryKey: ["bell-signals", me],
    enabled: !!me,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,mission_id,signal_title,signal_summary,severity,created_at,related_question_id")
        .in("severity", ["warning", "critical"])
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as SignalRow[];
    },
  });

  const missionIds = Array.from(new Set(signals.map((s) => s.mission_id)));
  const { data: missions = [] } = useQuery({
    queryKey: ["bell-missions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", missionIds);
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const missionMap = Object.fromEntries(missions.map((m) => [m.id, m.name]));

  const lastSeen = profile?.last_seen_signals_at
    ? new Date(profile.last_seen_signals_at).getTime()
    : Date.now() - 24 * 60 * 60 * 1000;
  const unreadCount = signals.filter((s) => new Date(s.created_at).getTime() > lastSeen).length;

  async function handleOpen() {
    setOpen(true);
    if (me) {
      await supabase.from("profiles").update({ last_seen_signals_at: new Date().toISOString() }).eq("id", me);
      qc.invalidateQueries({ queryKey: ["me-profile-lastseen", me] });
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-[420px] max-w-[90vw] border-l border-border bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">IRIS</div>
                <h2 className="text-sm font-semibold">Notifications</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {signals.length === 0 ? (
                <p className="px-3 py-10 text-center text-xs text-muted-foreground">All clear — no critical or warning signals.</p>
              ) : (
                signals.map((s) => {
                  const dot = s.severity === "critical" ? "bg-destructive" : "bg-yellow";
                  return (
                    <div key={s.id} className="rounded-md border border-border bg-background/50 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground/90 truncate">{s.signal_title}</p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="rounded-full bg-surface-hover px-1.5 py-0.5 truncate max-w-[150px]">{missionMap[s.mission_id] ?? "Mission"}</span>
                            <span>{relativeTime(s.created_at)}</span>
                          </div>
                          {s.signal_summary && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.signal_summary}</p>
                          )}
                          <Link
                            to={s.related_question_id ? "/missions/$missionId/questions/$questionId" : "/missions/$missionId/questions"}
                            params={s.related_question_id ? { missionId: s.mission_id, questionId: s.related_question_id } : { missionId: s.mission_id }}
                            onClick={() => setOpen(false)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Go <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
