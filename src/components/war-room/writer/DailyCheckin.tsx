import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";

const OPTIONS = [
  { value: "ready", emoji: "💪", label: "Ready", sub: "let's go" },
  { value: "okay", emoji: "😐", label: "Okay", sub: "getting there" },
  { value: "struggling", emoji: "😓", label: "Struggling", sub: "could use some support" },
] as const;

function todayKey(uid: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `daily-checkin:${uid}:${ymd}`;
}

export function DailyCheckin() {
  const { engagement, member } = useEngagement();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !engagement || !member) return;
    if (member.role !== "writer") return;
    const key = todayKey(user.id);
    if (localStorage.getItem(key)) return;
    // Don't show again same day if dismissed/answered
    const t = setTimeout(() => setOpen(true), 300);
    return () => clearTimeout(t);
  }, [user?.id, engagement?.id, member?.role]);

  function dismiss() {
    if (user) localStorage.setItem(todayKey(user.id), "dismissed");
    setOpen(false);
  }

  async function answer(value: "ready" | "okay" | "struggling") {
    if (!engagement || !user || saving) return;
    setSaving(true);
    await supabase.from("daily_checkins").insert({
      engagement_id: engagement.id,
      response: value,
    });
    localStorage.setItem(todayKey(user.id), value);
    setSaving(false);
    setThanks(true);
    setTimeout(() => setOpen(false), 2000);
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-[#0f1623] p-6 shadow-2xl">
        {thanks ? (
          <div className="py-10 text-center text-lg font-semibold text-foreground">Thanks — now let's go.</div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)] font-semibold">Daily check-in</div>
              <h2 className="mt-2 text-xl font-bold">How are you feeling today?</h2>
              <p className="mt-1 text-xs text-muted-foreground">Anonymous — only the aggregate is shared with leads.</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={saving}
                  onClick={() => answer(o.value)}
                  className="rounded-lg border border-border bg-surface px-4 py-5 text-center hover:border-[var(--gold)]/60 hover:bg-surface-hover transition disabled:opacity-50"
                >
                  <div className="text-3xl">{o.emoji}</div>
                  <div className="mt-2 text-sm font-semibold">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground">{o.sub}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 text-center">
              <button type="button" onClick={dismiss} className="text-[11px] text-muted-foreground hover:text-foreground">
                Skip for today
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
