import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, AlertTriangle, Send } from "lucide-react";
import {
  sendMissionNudge,
  getMissionMessagingConfig,
} from "@/lib/nudge.functions";

const GOLD = "#c9a84c";

export type NudgeTarget = {
  userId: string;
  name: string;
  role: string;
  questionCount: number;
  liveLabel: string;
  liveColor: string;
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function defaultNudgeMessage(opts: {
  recipientFirst: string; senderFirst: string; questionCount: number; missionName: string;
}) {
  return `Hey ${opts.recipientFirst} 👋 — ${opts.senderFirst} wanted me to check in. You have ${opts.questionCount} questions active on ${opts.missionName} and the team is counting on your section. How are you tracking? Any blockers I can flag for you? — IRIS on behalf of ${opts.senderFirst}`;
}

export function NudgeModal({
  open, onOpenChange, target, missionId, missionName, senderFirstName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: NudgeTarget | null;
  missionId: string;
  missionName: string;
  senderFirstName: string;
}) {
  const qc = useQueryClient();
  const cfgFn = useServerFn(getMissionMessagingConfig);
  const sendFn = useServerFn(sendMissionNudge);

  const cfgQ = useQuery({
    queryKey: ["nudge-config", missionId],
    queryFn: () => cfgFn({ data: { missionId } }),
    enabled: !!open,
    staleTime: 60_000,
  });

  const recipientFirst = target ? (target.name.split(/\s+/)[0] || target.name) : "";
  const defaultMessage = target
    ? defaultNudgeMessage({
        recipientFirst, senderFirst: senderFirstName,
        questionCount: target.questionCount, missionName,
      })
    : "";

  const [channel, setChannel] = useState<"slack" | "teams">("slack");
  const [customize, setCustomize] = useState(false);
  const [message, setMessage] = useState(defaultMessage);

  // Reset when target or default message changes (modal reopened)
  useEffect(() => {
    if (open && target) {
      setMessage(defaultMessage);
      setCustomize(false);
    }
  }, [open, target?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick a sane default channel based on configured webhooks
  useEffect(() => {
    if (!cfgQ.data) return;
    if (cfgQ.data.slackConfigured) setChannel("slack");
    else if (cfgQ.data.teamsConfigured) setChannel("teams");
  }, [cfgQ.data]);

  const sendMut = useMutation({
    mutationFn: () => sendFn({
      data: {
        missionId, recipientId: target!.userId,
        message: customize ? message : defaultMessage,
        channel,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Nudge sent to ${r.recipientName} via ${r.channel === "slack" ? "Slack" : "Teams"}`);
      qc.invalidateQueries({ queryKey: ["nudge-recent", missionId] });
      qc.invalidateQueries({ queryKey: ["war-room", missionId] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Send failed";
      const channelLabel = channel === "slack" ? "Slack" : "Teams";
      toast.error(`${channelLabel} send failed. ${msg}`);
      console.error("[nudge] send failed", e);
    },
  });

  if (!target) return null;

  const slackOn = cfgQ.data?.slackConfigured ?? false;
  const teamsOn = cfgQ.data?.teamsConfigured ?? false;
  const noChannels = cfgQ.data && !slackOn && !teamsOn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] p-0 gap-0 bg-[#0a0f1a] border border-white/10 text-white">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-white/5">
          <DialogTitle className="text-[14px] font-medium text-white">
            Nudge {recipientFirst}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* Writer info row */}
          <div className="flex items-center gap-3 rounded border border-white/5 bg-white/[0.02] p-3">
            <div
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[12px] font-medium shrink-0"
              style={{ color: target.liveColor }}
            >
              {initials(target.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium truncate">{target.name}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-white/55  tracking-wide">
                  {target.role}
                </span>
              </div>
              <div className="text-[12px] mt-0.5 text-white/55">
                {target.questionCount}q · <span style={{ color: target.liveColor }}>{target.liveLabel}</span>
              </div>
            </div>
          </div>

          {/* Channel selector */}
          <div>
            <div className="text-[11px]   text-white/45 mb-1.5">Channel</div>
            {noChannels ? (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>No messaging integration configured for this mission. Set up Slack or Teams in mission settings.</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <ChannelPill
                  label="Slack" active={channel === "slack"} disabled={!slackOn}
                  onClick={() => setChannel("slack")}
                />
                <ChannelPill
                  label="Teams" active={channel === "teams"} disabled={!teamsOn}
                  onClick={() => setChannel("teams")}
                />
              </div>
            )}
          </div>

          {/* Message preview */}
          <div>
            <div className="text-[11px]   text-white/45 mb-1.5">Message</div>
            {customize ? (
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="text-[14px] bg-white/[0.04] border-white/10 rounded resize-none"
              />
            ) : (
              <div
                className="text-[14px] leading-relaxed text-white/85 whitespace-pre-wrap"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 4,
                  padding: 12,
                }}
              >
                {defaultMessage}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (!customize) setMessage(defaultMessage);
                setCustomize(!customize);
              }}
              className="mt-2 text-[12px] text-white/55 hover:text-white inline-flex items-center gap-1"
            >
              {customize ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Customize message
            </button>
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || noChannels || (channel === "slack" && !slackOn) || (channel === "teams" && !teamsOn)}
            className="w-full inline-flex items-center justify-center gap-2 rounded py-2.5 text-[14px] font-medium text-black transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: GOLD }}
          >
            <Send className="w-3.5 h-3.5" />
            {sendMut.isPending ? "Sending…" : "Send Nudge"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelPill({
  label, active, disabled, onClick,
}: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-[12px] border transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active && !disabled
          ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
          : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
      }`}
    >
      {label}{disabled ? " (not set)" : ""}
    </button>
  );
}
