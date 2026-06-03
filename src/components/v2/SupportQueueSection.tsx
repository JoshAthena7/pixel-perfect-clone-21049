import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LifeBuoy, Laptop, Wallet, Sparkles, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Req = {
  id: string;
  requester_id: string;
  category: "it" | "billing" | "platform" | "leanne" | "talent_desk";
  body: string;
  urgency: "right_now" | "today" | "no_rush";
  context: string | null;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  requester_name?: string | null;
};

const CAT_ICON: Record<Req["category"], React.ReactNode> = {
  it: <Laptop size={14} className="text-[#3b7fff]" />,
  billing: <Wallet size={14} className="text-[#facc15]" />,
  platform: <Sparkles size={14} className="text-[#22d3ee]" />,
  leanne: <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] text-emerald-300">L</span>,
  talent_desk: <Briefcase size={14} className="text-[#f59e0b]" />,
};

const CAT_LABEL: Record<Req["category"], string> = {
  it: "IT Support",
  billing: "Billing",
  platform: "Platform Help",
  leanne: "Ask Leanne",
  talent_desk: "Talent Desk",
};

const URGENCY_BORDER: Record<Req["urgency"], string> = {
  right_now: "border-red-500/50",
  today: "border-amber-500/40",
  no_rush: "border-white/10",
};

const URGENCY_LABEL: Record<Req["urgency"], string> = {
  right_now: "Right Now",
  today: "Today",
  no_rush: "No Rush",
};

const URGENCY_ORDER: Record<Req["urgency"], number> = { right_now: 0, today: 1, no_rush: 2 };

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SupportQueueSection() {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(true);

  const { data: requests = [] } = useQuery<Req[]>({
    queryKey: ["support_queue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_requests")
        .select("id,requester_id,category,body,urgency,context,status,created_at")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(50);
      const list = (data ?? []) as Req[];
      const ids = Array.from(new Set(list.map((r) => r.requester_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", ids);
        const byId = new Map((profs ?? []).map((p) => [p.id, p.display_name || p.email || "Unknown"]));
        for (const r of list) r.requester_name = byId.get(r.requester_id) ?? "Unknown";
      }
      list.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);
      return list;
    },
    refetchInterval: 30_000,
  });

  const openCount = requests.length;
  const isCollapsed = openCount === 0 ? true : collapsed;

  // Auto-expand on first load if items exist
  // (kept simple: user can toggle thereafter)
  return (
    <section className={`rounded-lg border ${openCount > 0 ? "border-amber-500/30 bg-amber-500/[0.03]" : "border-white/10 bg-white/[0.02]"} p-4`}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 text-left"
      >
        <LifeBuoy size={14} className={openCount > 0 ? "text-amber-300" : "text-muted-foreground"} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Support Requests
        </span>
        {openCount > 0 && (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] text-amber-200">
            {openCount}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {openCount === 0 ? "No open requests" : isCollapsed ? "Expand" : "Collapse"}
        </span>
      </button>

      {!isCollapsed && openCount > 0 && (
        <div className="mt-3 space-y-2">
          {requests.map((r) => (
            <RequestCard key={r.id} req={r} onChanged={() => qc.invalidateQueries({ queryKey: ["support_queue"] })} />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({ req, onChanged }: { req: Req; onChanged: () => void }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error: insErr } = await supabase.from("support_responses").insert({
        request_id: req.id,
        responder_id: u.user.id,
        body: reply.trim(),
      });
      if (insErr) throw insErr;
      const { error: updErr } = await supabase
        .from("support_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), assigned_to: u.user.id })
        .eq("id", req.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Response sent");
      setReply("");
      setReplyOpen(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("support_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marked resolved"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={`rounded-lg border ${URGENCY_BORDER[req.urgency]} bg-white/[0.02] p-3`}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
        {CAT_ICON[req.category]}
        <span className="text-foreground">{CAT_LABEL[req.category]}</span>
        <span>·</span>
        <span>{req.requester_name ?? "Unknown"}</span>
        <span>·</span>
        <span>{relativeTime(req.created_at)}</span>
        <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider">
          {URGENCY_LABEL[req.urgency]}
        </span>
      </div>
      <div className="text-sm text-foreground whitespace-pre-wrap">{req.body}</div>
      {req.context && (
        <div className="mt-1 text-[11px] text-muted-foreground">Context: {req.context}</div>
      )}
      {!replyOpen ? (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setReplyOpen(true)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-foreground hover:bg-white/[0.08]"
          >
            Respond →
          </button>
          <button
            onClick={() => resolve.mutate()}
            disabled={resolve.isPending}
            className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Mark Resolved
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your response…"
            className="w-full min-h-[80px] rounded-md border border-white/10 bg-white/[0.03] p-2 text-sm text-foreground focus:outline-none focus:border-white/20"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setReplyOpen(false); setReply(""); }}
              className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
            <button
              onClick={() => send.mutate()}
              disabled={!reply.trim() || send.isPending}
              className="rounded-md bg-[color:var(--accent,#3b7fff)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[color:var(--accent,#3b7fff)]/90 disabled:opacity-50"
            >
              {send.isPending ? "Sending…" : "Send Response"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
