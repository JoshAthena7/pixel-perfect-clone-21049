import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: searchSchema,
  component: UnsubscribePage,
});

type State =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "already" }
  | { status: "invalid" }
  | { status: "success" };

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ status: "invalid" });
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.valid) setState({ status: "ready" });
        else if (res?.reason === "already_unsubscribed") setState({ status: "already" });
        else setState({ status: "invalid" });
      })
      .catch(() => setState({ status: "invalid" }));
  }, [token]);

  async function confirm() {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`/email/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json());
      if (res?.success) setState({ status: "success" });
      else if (res?.reason === "already_unsubscribed") setState({ status: "already" });
      else setState({ status: "invalid" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-svh w-full flex items-center justify-center px-4 py-12 text-foreground"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(201,146,42,0.10), transparent 55%), linear-gradient(180deg, #0B0F14 0%, #050708 100%)",
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center">
        <div className="text-[10px] font-bold tracking-[0.42em]" style={{ color: "#C9922A" }}>
          ATHENA STRATEGY COMMAND
        </div>
        <h1 className="mt-4 text-xl font-semibold">Email Preferences</h1>
        {state.status === "loading" && (
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying…
          </p>
        )}
        {state.status === "ready" && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Confirm you want to unsubscribe from all non-essential emails.
            </p>
            <button
              onClick={confirm}
              disabled={busy}
              className="mt-5 inline-flex items-center gap-2 rounded-md px-5 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white disabled:opacity-60"
              style={{ background: "#C9922A" }}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Confirm Unsubscribe
            </button>
          </>
        )}
        {state.status === "already" && (
          <p className="mt-6 text-sm text-muted-foreground">
            You're already unsubscribed.
          </p>
        )}
        {state.status === "success" && (
          <p className="mt-6 text-sm text-emerald-300">You've been unsubscribed.</p>
        )}
        {state.status === "invalid" && (
          <p className="mt-6 text-sm text-destructive">
            This unsubscribe link is invalid or expired.
          </p>
        )}
      </div>
    </div>
  );
}
