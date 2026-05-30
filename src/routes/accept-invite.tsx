import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite } from "@/lib/invites.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/accept-invite")({
  head: () => ({ meta: [{ title: "Accept Invitation — Athena Command™" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({
        to: "/login",
        search: { redirect: `/accept-invite?token=${encodeURIComponent(search.token)}` },
      });
    }
  },
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvite);
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing invitation token.");
      return;
    }
    accept({ data: { token } })
      .then(() => {
        setState("ok");
        setTimeout(() => navigate({ to: "/command" }), 1200);
      })
      .catch((e: Error) => {
        setState("error");
        setMessage(e.message ?? "Could not accept invitation.");
      });
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <Card className="w-full border-border bg-surface p-8 text-center">
        {state === "working" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-bold">Joining the engagement…</h1>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold">You're in.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Opening the Command Center…</p>
          </>
        )}
        {state === "error" && (
          <>
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Couldn't accept this invite</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button className="mt-6" onClick={() => navigate({ to: "/command" })}>
              Go to Command Center
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
