import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, X, ArrowRight, ShieldCheck } from "lucide-react";
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
          <div className="modal-backdrop" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="iris-panel absolute right-0 top-0 h-full w-[380px] max-w-[90vw] border-l border-border bg-surface shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="iris-dot" />
                <h2 className="iris-label">IRIS Alerts</h2>
                {unreadCount > 0 && (
                  <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (me) {
                      await supabase.from("profiles").update({ last_seen_signals_at: new Date().toISOString() }).eq("id", me);
                      qc.invalidateQueries({ queryKey: ["me-profile-lastseen", me] });
                    }
                  }}
                  className="text-[11px] text-primary hover:underline"
                >
                  Mark all read
                </button>
                <button onClick={() => setOpen(false)} className="btn-ghost p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {signals.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
                  <ShieldCheck className="h-10 w-10 text-[color:var(--green)]" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm font-medium text-foreground">All clear.</p>
                    <p className="mt-1 text-xs text-muted-foreground">IRIS is monitoring.</p>
                  </div>
                </div>
              ) : (
                signals.map((s) => {
                  const dotClass = s.severity === "critical" ? "dot dot-red" : "dot dot-yellow";
                  return (
                    <Link
                      key={s.id}
                      to={s.related_question_id ? "/missions/$missionId/questions/$questionId" : "/missions/$missionId/questions"}
                      params={s.related_question_id ? { missionId: s.mission_id, questionId: s.related_question_id } : { missionId: s.mission_id }}
                      onClick={() => setOpen(false)}
                      className="block rounded-md border border-border bg-background/50 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <div className="flex items-start gap-2">
                        <span className={`${dotClass} mt-1.5`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground/90 truncate">{s.signal_title}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="rounded-full bg-surface-hover px-1.5 py-0.5 truncate max-w-[150px]">{missionMap[s.mission_id] ?? "Mission"}</span>
                            <span>{relativeTime(s.created_at)}</span>
                          </div>
                          {s.signal_summary && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.signal_summary}</p>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </div>
                    </Link>
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
