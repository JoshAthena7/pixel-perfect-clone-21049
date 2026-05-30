import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useComms, type ChatRow } from "@/hooks/use-comms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { toast } from "sonner";

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function expiryLabel(expiresAt: string): string | null {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const twoH = 2 * 60 * 60 * 1000;
  if (ms > twoH) return null;
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `Expires in ${h}h` : `Expires in ${h}h ${m}m`;
  }
  return `Expires in ${mins}m`;
}


export function QuickChatPanel() {
  const { engagement, member } = useEngagement();
  const { chatOpenWith, closeChat } = useComms();
  const [msgs, setMsgs] = useState<ChatRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const peerId = chatOpenWith?.memberId ?? null;

  async function load() {
    if (!engagement || !member || !peerId) return;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("quick_chats")
      .select("id, sender_id, sender_name, recipient_id, message, created_at, expires_at, read")
      .eq("engagement_id", engagement.id)
      .gt("expires_at", nowIso)
      .or(`and(sender_id.eq.${member.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${member.id})`)
      .order("created_at", { ascending: true });
    setMsgs((data as ChatRow[]) ?? []);
    // mark inbound as read
    await supabase
      .from("quick_chats")
      .update({ read: true })
      .eq("recipient_id", member.id)
      .eq("sender_id", peerId)
      .eq("read", false);
  }

  useEffect(() => {
    if (!peerId || !member || !engagement) return;
    load();
    const ch = supabase
      .channel(`chat:${member.id}:${peerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_chats", filter: `engagement_id=eq.${engagement.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [peerId, member?.id, engagement?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length, chatOpenWith]);

  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail as { memberId: string; message: string };
      if (detail?.memberId && peerId && detail.memberId === peerId) {
        setDraft(detail.message);
      }
    }
    window.addEventListener("quick-chat-prefill", onPrefill);
    return () => window.removeEventListener("quick-chat-prefill", onPrefill);
  }, [peerId]);

  async function send() {
    if (!engagement || !member || !peerId || !draft.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("quick_chats").insert({
      engagement_id: engagement.id,
      sender_id: member.id,
      sender_name: member.display_name,
      recipient_id: peerId,
      message: draft.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft("");
  }

  if (!chatOpenWith) return null;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[320px] flex-col border-l border-border bg-[#0a0f1c] shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Quick chat</div>
          <div className="text-sm font-semibold text-foreground">{chatOpenWith.displayName}</div>
        </div>
        <button onClick={closeChat} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-border/40 px-4 py-2 text-[11px] italic text-muted-foreground">
        Messages disappear after 24 hours. For permanent notes use the section thread.
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-3 space-y-2">
        {msgs.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center mt-8">No messages yet. Say hello.</div>
        ) : (
          msgs.map((m) => {
            const mine = m.sender_id === member?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                    mine ? "bg-[var(--gold)]/20 text-foreground" : "bg-surface-hover text-foreground"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.message}</div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground text-right">{fmt(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message…"
          className="text-xs"
        />
        <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Send</Button>
      </div>
    </div>
  );
}
