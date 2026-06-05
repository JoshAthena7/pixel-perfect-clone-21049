import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getUnacknowledgedBriefings,
  acknowledgeBriefing,
} from "@/lib/brief-room.functions";
import { Megaphone, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Renders a pinned banner at the top of every page when the current user has
 * unacknowledged Briefings. Opens the formal Acknowledgment modal on click.
 */
export function BriefRoomPinned() {
  const fn = useServerFn(getUnacknowledgedBriefings);
  const { data } = useQuery({
    queryKey: ["brief-room", "pending"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState(false);

  const pending = data?.pending ?? [];
  if (!pending.length) return null;

  const top = pending[0];
  const more = pending.length - 1;

  return (
    <>
      <div
        className="w-full border-b px-4 py-2 flex items-center gap-3 text-sm"
        style={{
          background:
            "linear-gradient(90deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04))",
          borderColor: "rgba(245,158,11,0.30)",
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: "var(--athena-gold, #f59e0b)" }}
        >
          {top.type === "global" ? (
            <Megaphone size={12} strokeWidth={2} />
          ) : (
            <Mail size={12} strokeWidth={2} />
          )}
          Briefing
        </span>
        <span className="truncate text-foreground/90 flex-1 min-w-0">
          {top.subject}
        </span>
        {more > 0 && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            +{more} more
          </span>
        )}
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 inline-flex h-7 items-center rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{
            background: "var(--athena-gold, #f59e0b)",
            color: "#0a0a0a",
          }}
        >
          Read briefing
        </button>
      </div>

      <BriefingAckModal
        briefing={top}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function BriefingAckModal({
  briefing,
  open,
  onClose,
}: {
  briefing: {
    id: string;
    type: "global" | "direct";
    sender_name: string;
    subject: string;
    body: string;
    sent_at: string;
  } | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ackFn = useServerFn(acknowledgeBriefing);
  const ack = useMutation({
    mutationFn: () => ackFn({ data: { briefingId: briefing!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief-room"] });
      toast.success("Acknowledged");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!briefing) return null;
  const isGlobal = briefing.type === "global";
  const dateStr = new Date(briefing.sent_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[640px] border-0 p-0 overflow-hidden"
        style={{
          background: "#0d1320",
          borderTop: "3px solid var(--athena-gold, #f59e0b)",
          boxShadow:
            "0 30px 80px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.10)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 h-7 w-7 rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground inline-flex items-center justify-center"
        >
          <X size={14} />
        </button>

        {/* Document letterhead */}
        <div className="px-10 pt-10 pb-5">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.32em]"
            style={{ color: "var(--athena-gold, #f59e0b)" }}
          >
            {isGlobal ? "Briefing · Athena Leadership" : "Briefing · Direct"}
          </div>
          <h2
            className="mt-4 text-[26px] leading-[1.2] tracking-tight text-foreground"
            style={{
              fontFamily:
                "'Cormorant Garamond', 'Instrument Serif', Georgia, serif",
              fontWeight: 500,
            }}
          >
            {briefing.subject}
          </h2>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              From <span className="text-foreground font-medium">{briefing.sender_name}</span>
            </span>
            <span>·</span>
            <span>{dateStr}</span>
          </div>
        </div>

        <div
          className="mx-10 border-t"
          style={{ borderColor: "rgba(245,158,11,0.18)" }}
        />

        {/* Document body */}
        <div className="px-10 py-6">
          <p
            className="text-[14.5px] whitespace-pre-wrap text-foreground/90"
            style={{ lineHeight: 1.75 }}
          >
            {briefing.body}
          </p>
        </div>

        {/* Signature block */}
        <div className="px-10 pb-2">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.28em] mb-1"
            style={{ color: "rgba(245,158,11,0.7)" }}
          >
            Signed
          </div>
          <div
            className="text-[15px]"
            style={{
              fontFamily:
                "'Cormorant Garamond', 'Instrument Serif', Georgia, serif",
              fontStyle: "italic",
              color: "#e5e7eb",
            }}
          >
            {briefing.sender_name}
          </div>
        </div>

        <div className="mx-10 mt-5 border-t border-white/10" />

        <div className="px-10 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {isGlobal
            ? "This is an official communication from Athena Strategy Group. By selecting Acknowledged, you confirm you have read this Briefing. It will remain accessible in your Brief Room inbox."
            : "This message is intended solely for you. It is private and may not be forwarded or shared. By selecting Acknowledged, you confirm receipt."}
        </div>

        <DialogFooter className="px-10 py-6">
          <Button
            onClick={() => ack.mutate()}
            disabled={ack.isPending}
            className="h-10 px-6 text-[12px] font-bold uppercase tracking-[0.18em]"
            style={{
              background: "var(--athena-gold, #f59e0b)",
              color: "#0a0a0a",
            }}
          >
            {ack.isPending ? "Acknowledging…" : "Acknowledged"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
