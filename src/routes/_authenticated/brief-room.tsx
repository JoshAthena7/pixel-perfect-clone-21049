import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyBriefings,
  listAllBriefingsAdmin,
  listBriefingRecipients,
  getBriefingDeliveryReport,
  sendBriefing,
  type BriefingRow,
} from "@/lib/brief-room.functions";
import { useIsAdmin } from "@/hooks/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BriefingAckModal } from "@/components/brief-room/BriefRoomPinned";
import { Megaphone, Mail, CheckCircle2, Clock, Inbox } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/brief-room")({
  component: BriefRoomPage,
});

function BriefRoomPage() {
  const { isAdmin } = useIsAdmin();
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-6">
        <div
          className="text-[10px] font-bold uppercase tracking-[0.28em]"
          style={{ color: "var(--athena-gold, #f59e0b)" }}
        >
          The Brief Room
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Leadership Communications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Official messages from Athena Strategy Group leadership. Read-only.
        </p>
      </header>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          {isAdmin && <TabsTrigger value="compose">Compose</TabsTrigger>}
          {isAdmin && <TabsTrigger value="admin">Delivery</TabsTrigger>}
        </TabsList>

        <TabsContent value="inbox" className="mt-6">
          <InboxView />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="compose" className="mt-6">
            <ComposeView />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="admin" className="mt-6">
            <AdminView />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ───────── Inbox ─────────
function InboxView() {
  const fn = useServerFn(listMyBriefings);
  const { data = [], isLoading } = useQuery({
    queryKey: ["brief-room", "mine"],
    queryFn: () => fn(),
  });
  const [active, setActive] = useState<BriefingRow | null>(null);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-surface px-6 py-16 text-center">
        <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <div className="text-sm font-medium">You're current.</div>
        <div className="text-xs text-muted-foreground mt-1">
          No pending briefings at this time.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {data.map((b) => (
          <button
            key={b.id}
            onClick={() => setActive(b)}
            className="w-full text-left rounded-md border border-border bg-surface hover:bg-surface-hover px-4 py-3 transition-colors flex items-center gap-3"
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0"
              style={{
                background: b.acknowledged_at
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(245,158,11,0.12)",
                color: b.acknowledged_at
                  ? "var(--muted-foreground)"
                  : "var(--athena-gold, #f59e0b)",
              }}
            >
              {b.type === "global" ? (
                <Megaphone size={14} strokeWidth={1.75} />
              ) : (
                <Mail size={14} strokeWidth={1.75} />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                  {b.type === "global" ? "Global" : "Direct"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  · {b.sender_name}
                </span>
              </div>
              <div className="text-[14px] font-medium text-foreground truncate mt-0.5">
                {b.subject}
              </div>
            </div>
            <div className="shrink-0 text-[11px] flex items-center gap-1.5">
              {b.acknowledged_at ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 size={12} /> Acknowledged
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ color: "var(--athena-gold, #f59e0b)" }}
                >
                  <Clock size={12} /> Pending
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <BriefingAckModal
        briefing={active}
        open={!!active}
        onClose={() => setActive(null)}
      />
    </>
  );
}

// ───────── Compose ─────────
function ComposeView() {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendBriefing);
  const recipFn = useServerFn(listBriefingRecipients);
  const { data: recipients = [] } = useQuery({
    queryKey: ["brief-room", "recipients"],
    queryFn: () => recipFn(),
  });

  const [type, setType] = useState<"global" | "direct">("global");
  const [recipientId, setRecipientId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          type,
          subject,
          body,
          recipientId: type === "direct" ? recipientId : null,
        },
      }),
    onSuccess: () => {
      toast.success("Briefing sent");
      setSubject("");
      setBody("");
      setRecipientId("");
      qc.invalidateQueries({ queryKey: ["brief-room"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled =
    !subject.trim() ||
    !body.trim() ||
    (type === "direct" && !recipientId) ||
    send.isPending;

  return (
    <div className="max-w-2xl space-y-5 rounded-lg border border-border bg-surface p-6">
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global — all active users</SelectItem>
            <SelectItem value="direct">Direct — one named recipient</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === "direct" && (
        <div className="space-y-1.5">
          <Label>Recipient</Label>
          <Select value={recipientId} onValueChange={setRecipientId}>
            <SelectTrigger><SelectValue placeholder="Select a user…" /></SelectTrigger>
            <SelectContent>
              {recipients.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} {r.email ? `· ${r.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="One-line subject"
          maxLength={255}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="The body of the briefing. Plain prose. No replies, no edits."
        />
        <div className="text-[11px] text-muted-foreground">
          Once sent, this briefing cannot be edited or recalled.
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => send.mutate()}
          disabled={disabled}
          className="h-10 px-6 text-[12px] font-bold uppercase tracking-[0.18em]"
          style={{
            background: "var(--athena-gold, #f59e0b)",
            color: "#0a0a0a",
          }}
        >
          {send.isPending ? "Sending…" : "Send Briefing"}
        </Button>
      </div>
    </div>
  );
}

// ───────── Admin / Delivery ─────────
function AdminView() {
  const fn = useServerFn(listAllBriefingsAdmin);
  const { data = [], isLoading } = useQuery({
    queryKey: ["brief-room", "admin-all"],
    queryFn: () => fn(),
  });
  const [reportId, setReportId] = useState<string | null>(null);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data.length) {
    return (
      <div className="text-sm text-muted-foreground">No briefings sent yet.</div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Subject</th>
              <th className="text-left px-4 py-3 font-semibold">Recipient</th>
              <th className="text-left px-4 py-3 font-semibold">Sent</th>
              <th className="text-left px-4 py-3 font-semibold">Acknowledged</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.map((b: any) => (
              <tr key={b.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {b.type === "global" ? <Megaphone size={12} /> : <Mail size={12} />}
                    {b.type}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{b.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {b.type === "global" ? "All users" : b.recipient_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[12px]">
                  {new Date(b.sent_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-[12px]">
                  <span className="font-mono">
                    {b.ack_count} / {b.audience_size}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReportId(b.id)}
                  >
                    Report
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeliveryReportDialog
        briefingId={reportId}
        open={!!reportId}
        onClose={() => setReportId(null)}
      />
    </>
  );
}

function DeliveryReportDialog({
  briefingId,
  open,
  onClose,
}: {
  briefingId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const fn = useServerFn(getBriefingDeliveryReport);
  const { data } = useQuery({
    queryKey: ["brief-room", "report", briefingId],
    enabled: !!briefingId,
    queryFn: () => fn({ data: { briefingId: briefingId! } }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Delivery Report{data?.briefing?.subject ? ` · ${data.briefing.subject}` : ""}
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-semibold">User</th>
                  <th className="text-left py-2 font-semibold">Status</th>
                  <th className="text-left py-2 font-semibold">Acknowledged at</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.user_id} className="border-b border-border last:border-0">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2">
                      {r.acknowledged_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[12px]">
                          <CheckCircle2 size={12} /> Acknowledged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-[12px]">
                          <Clock size={12} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-[12px] text-muted-foreground">
                      {r.acknowledged_at
                        ? new Date(r.acknowledged_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
