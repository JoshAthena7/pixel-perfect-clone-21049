import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  surface: string;
  missionId?: string | null;
  section?: string | null;
  snippet?: string | null;
  /** Visual style: "chip" (default subtle pill) or "icon" (just the flag). */
  variant?: "chip" | "icon";
  label?: string;
};

/**
 * Lets any signed-in user flag a piece of read-only IRIS content for an admin
 * to correct/add/remove in Olympus. Free-text message + auto-captured context.
 */
export function RequestChangeButton({
  surface,
  missionId = null,
  section = null,
  snippet = null,
  variant = "chip",
  label = "Request change",
}: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      toast.error("Add a short note describing what should change.");
      return;
    }
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        toast.error("Sign in to submit a change request.");
        setBusy(false);
        return;
      }
      const context = {
        section: section ?? null,
        snippet: snippet ? snippet.slice(0, 800) : null,
        url: typeof window !== "undefined" ? window.location.href : null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      const { error } = await supabase.from("change_requests").insert({
        user_id: uid,
        mission_id: missionId,
        surface,
        context,
        message: trimmed,
      });
      if (error) throw error;
      toast.success("Sent to Olympus. Thanks for flagging it.");
      setMessage("");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Request change"
          title="Request a change"
          className="inline-flex items-center justify-center rounded-full hover:opacity-100 transition-opacity"
          style={{
            width: 22,
            height: 22,
            color: "rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.08)",
          }}
        >
          <Flag className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full hover:opacity-100 transition-opacity"
          style={{
            padding: "2px 8px",
            fontSize: 10,
            color: "rgba(255,255,255,0.55)",
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.1)",
          }}
        >
          <Flag className="h-3 w-3" />
          {label}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request a change</DialogTitle>
            <DialogDescription>
              Notice something wrong, missing, or out of date? Send a note to the Olympus admins.
              They'll review and update the source in Olympus.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div
              className="rounded-md text-xs"
              style={{
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Surface:</span> {surface}</div>
              {section && (
                <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Section:</span> {section}</div>
              )}
              {snippet && (
                <div className="mt-1 line-clamp-2 italic" style={{ color: "rgba(255,255,255,0.5)" }}>
                  "{snippet.slice(0, 160)}{snippet.length > 160 ? "…" : ""}"
                </div>
              )}
            </div>

            <Textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should change? e.g. 'Win theme #2 should reference Wraparound 2.0, not 1.0' or 'Add Maria Vasquez as evaluator contact'"
              rows={5}
              maxLength={4000}
            />
            <div className="text-[10px] text-right" style={{ color: "rgba(255,255,255,0.35)" }}>
              {message.length}/4000
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || message.trim().length < 3}>
              {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Send to admin
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
