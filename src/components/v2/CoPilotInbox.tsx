import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acknowledgeCoPilotMessage } from "@/lib/pilot-copilot.functions";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string;
  from_user_id: string;
  from_name: string;
  to_user_id: string | null;
  message_type: "decision" | "guidance" | "alert" | "encouragement" | "coach_note" | "broadcast";
  body: string;
  is_broadcast: boolean;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

const BADGE: Record<Msg["message_type"], { label: string; color: string; bg: string }> = {
  decision:      { label: "DECISION",       color: "#fca5a5", bg: "rgba(239,68,68,0.15)" },
  guidance:      { label: "GUIDANCE",       color: "#fcd34d", bg: "rgba(245,158,11,0.15)" },
  alert:         { label: "HEADS UP",       color: "#fcd34d", bg: "rgba(245,158,11,0.2)" },
  encouragement: { label: "FROM",           color: "#93c5fd", bg: "rgba(59,130,246,0.15)" },
  coach_note:    { label: "COACH NOTE",     color: "#c4b5fd", bg: "rgba(168,85,247,0.15)" },
  broadcast:     { label: "BROADCAST",      color: "#7dd3fc", bg: "rgba(14,165,233,0.15)" },
};

export function CoPilotInbox({
  missionId, questionId, currentUserId,
}: { missionId: string; questionId: string; currentUserId: string | null }) {
  const qc = useQueryClient();
  const ackFn = useServerFn(acknowledgeCoPilotMessage);

  const { data: msgs = [] } = useQuery({
    queryKey: ["copilot-msgs", missionId, questionId, currentUserId],
    enabled: !!currentUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("pilot_copilot_messages")
        .select("id,from_user_id,from_name,to_user_id,message_type,body,is_broadcast,acknowledged,acknowledged_at,created_at")
        .eq("mission_id", missionId)
        .or(`question_id.eq.${questionId},is_broadcast.eq.true`)
        .or(`to_user_id.eq.${currentUserId},is_broadcast.eq.true`)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Msg[];
    },
  });

  const ackMut = useMutation({
    mutationFn: async (id: string) => ackFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-msgs", missionId, questionId, currentUserId] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not acknowledge"),
  });

  const hasMsgs = msgs.length > 0;

  return (
    <div
      className="mb-4 rounded-md p-4"
      style={{
        background: "rgba(245,158,11,0.05)",
        borderLeft: "4px solid #eab308",
      }}
    >
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#eab308" }}>
        From Your Co-Pilot
      </div>
      {!hasMsgs ? (
        <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
            Nothing from your Co-Pilot yet.
          </div>
          Your Co-Pilot can send you guidance, decisions, and coaching directly to your Cockpit. You'll see it here.
        </div>
      ) : (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <CoPilotItem key={m.id} m={m} onAck={() => ackMut.mutate(m.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CoPilotItem({ m, onAck }: { m: Msg; onAck: () => void }) {
  const [open, setOpen] = useState(!m.acknowledged);
  const badge = BADGE[m.message_type];

  if (m.acknowledged && !open) {
    return (
      <li>
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-white/[0.04]"
        >
          <Check className="h-3 w-3 text-emerald-400" />
          <span className="font-medium">{m.from_name}</span>
          <span className="opacity-60">· {badge.label.toLowerCase()}</span>
          <span className="ml-auto opacity-60">{timeAgo(m.created_at)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-white/5 bg-black/20 p-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11px]">
        <span className="font-semibold text-foreground">{m.from_name}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: badge.color, background: badge.bg }}
        >
          {m.message_type === "encouragement" ? `${badge.label} ${m.from_name.toUpperCase()}` : badge.label}
        </span>
        {m.is_broadcast && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "#7dd3fc", background: "rgba(14,165,233,0.15)" }}>
            All Pilots
          </span>
        )}
        <span className="ml-auto text-muted-foreground">{timeAgo(m.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{m.body}</p>
      <div className="mt-2 flex items-center gap-2">
        {!m.acknowledged ? (
          <button
            onClick={onAck}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            <Check className="h-3 w-3" /> Acknowledge
          </button>
        ) : (
          <button
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Collapse <ChevronUp className="h-3 w-3" />
          </button>
        )}
      </div>
    </li>
  );
}
