import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hash, MessageSquare, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listSlackChannels, getSlackMessages } from "@/lib/slack.functions";

const STORAGE_KEY = "slackFeed.channelId";

function relTime(ts: string) {
  const ms = Number(ts) * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export function SlackFeed() {
  const channelsFn = useServerFn(listSlackChannels);
  const messagesFn = useServerFn(getSlackMessages);

  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setChannelId(saved);
  }, []);

  const channelsQ = useQuery({
    queryKey: ["slack", "channels"],
    queryFn: () => channelsFn(),
    staleTime: 5 * 60_000,
  });

  // Default to indiana-* channel if nothing saved
  useEffect(() => {
    if (channelId || !channelsQ.data) return;
    const list = channelsQ.data.channels;
    const guess =
      list.find((c) => c.name.toLowerCase().includes("indiana")) ??
      list.find((c) => c.is_member) ??
      list[0];
    if (guess) {
      setChannelId(guess.id);
      localStorage.setItem(STORAGE_KEY, guess.id);
    }
  }, [channelId, channelsQ.data]);

  const messagesQ = useQuery({
    queryKey: ["slack", "messages", channelId],
    queryFn: () => messagesFn({ data: { channelId, limit: 30 } }),
    enabled: !!channelId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const messages = messagesQ.data?.messages ?? [];
  const latestTs = messages[messages.length - 1]?.ts;

  // Track if user is scrolled to bottom
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickyRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (stickyRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [latestTs]);

  const channelName = useMemo(() => {
    return channelsQ.data?.channels.find((c) => c.id === channelId)?.name;
  }, [channelsQ.data, channelId]);

  return (
    <Card className="border-border bg-surface p-5 flex flex-col h-[480px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Slack Live Feed
          {messagesQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        </div>
        <Select
          value={channelId}
          onValueChange={(v) => {
            setChannelId(v);
            localStorage.setItem(STORAGE_KEY, v);
            stickyRef.current = true;
          }}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder={channelsQ.isLoading ? "Loading…" : "Pick a channel"} />
          </SelectTrigger>
          <SelectContent>
            {channelsQ.data?.channels.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {channelName && (
        <div className="mb-2 text-[11px] text-muted-foreground">
          <Hash className="inline h-3 w-3" />
          {channelName} • updates every 10s
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1"
      >
        {messagesQ.isError && (
          <div className="text-xs text-[color:var(--red)]">
            Couldn't load messages. The bot may need to be invited to a private channel.
          </div>
        )}
        {!channelId && !channelsQ.isLoading && (
          <div className="text-sm text-muted-foreground">Pick a channel to start streaming.</div>
        )}
        {channelId && messagesQ.data?.needsInvite && (
          <div className="rounded-md border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 p-3 text-xs">
            The Lovable bot isn't in this channel yet. In Slack, run{" "}
            <code className="rounded bg-surface-hover px-1">/invite @Lovable App</code> in{" "}
            <strong>#{channelName}</strong>, then messages will appear here.
          </div>
        )}
        {channelId && messages.length === 0 && !messagesQ.isLoading && !messagesQ.isError && !messagesQ.data?.needsInvite && (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        )}
        {messages.map((m: typeof messages[number]) => (
          <div key={m.ts} className="flex gap-2.5">
            <Avatar className="h-7 w-7 shrink-0">
              {m.userAvatar && <AvatarImage src={m.userAvatar} alt={m.userName} />}
              <AvatarFallback className="text-[10px]">{initials(m.userName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold">{m.userName}</span>
                <span className="text-[10px] text-muted-foreground">{relTime(m.ts)}</span>
              </div>
              <div className="text-sm break-words whitespace-pre-wrap">{m.text}</div>
              {m.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.reactions.map((r: { name: string; count: number }) => (
                    <span
                      key={r.name}
                      className="rounded-full border border-border bg-surface-hover/60 px-1.5 py-0.5 text-[10px]"
                    >
                      :{r.name}: {r.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
