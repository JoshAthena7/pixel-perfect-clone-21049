// Phase 3 — one-line IRIS personal alert banner. Indigo (#6366F1).
// Session-dismissible per user; reappears on next login if items still active.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPersonalAlerts, type PersonalAlert } from "@/lib/routing.functions";

function dismissKey(userId: string) {
  return `atlas.alertDismissed.${userId}`;
}

export function IrisPersonalAlert() {
  const fn = useServerFn(getPersonalAlerts);
  const [alerts, setAlerts] = useState<PersonalAlert[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      try {
        if (window.sessionStorage.getItem(dismissKey(data.user.id)) === "1") {
          setDismissed(true);
        }
      } catch { /* noop */ }
      try {
        const res = await fn();
        setAlerts(res.alerts);
      } catch { /* noop */ }
    })();
  }, [fn]);

  if (dismissed || !alerts || alerts.length === 0) return null;
  const first = alerts[0];
  const count = alerts.length;

  return (
    <div
      className="flex items-center gap-3 rounded-[10px] border px-4 py-2.5 text-sm"
      style={{
        borderColor: "rgba(99,102,241,0.45)",
        background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.03))",
      }}
    >
      <Zap className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
      <span className="text-foreground/90">
        IRIS has flagged{" "}
        <strong className="font-semibold text-foreground">
          {count} item{count === 1 ? "" : "s"}
        </strong>{" "}
        relevant to you.
      </span>
      <Link
        to={first.to as never}
        params={(first.params ?? {}) as never}
        search={(first.search ?? {}) as never}
        className="ml-auto rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-foreground/10"
      >
        View →
      </Link>
      <button
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          if (userId) {
            try { window.sessionStorage.setItem(dismissKey(userId), "1"); } catch { /* noop */ }
          }
        }}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
