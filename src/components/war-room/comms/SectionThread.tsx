import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Msg = {
  id: string;
  member_id: string;
  author_name: string;
  message: string;
  created_at: string;
};

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const seenKey = (sectionId: string) => `thread-seen:${sectionId}`;

export function SectionThread({ sectionId, defaultOpen = false }: { sectionId: string; defaultOpen?: boolean }) {
  const { engagement, member } = useEngagement();
  const [open, setOpen] = useState(defaultOpen);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSeenIso, setLastSeenIso] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(seenKey(sectionId)) ?? "1970-01-01" : "1970-01-01",
  );

  async function load() {
    const { data } = await supabase
      .from("section_threads")
      .select("id, member_id, author_name, message, created_at")
      .eq("section_id", sectionId)
      .order("created_at", { ascending: true });
    setMsgs((data as Msg[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`thread:${sectionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "section_threads", filter: `section_id=eq.${sectionId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sectionId]);

  useEffect(() => {
    if (open) {
      const now = new Date().toISOString();
      localStorage.setItem(seenKey(sectionId), now);
      setLastSeenIso(now);
    }
  }, [open, msgs.length, sectionId]);

  const unread = msgs.filter((m) => m.created_at > lastSeenIso && m.member_id !== member?.id).length;

  async function send() {
    if (!engagement || !member || !draft.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("section_threads").insert({
      engagement_id: engagement.id,
      section_id: sectionId,
      member_id: member.id,
      author_name: member.display_name,
      message: draft.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft("");
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <MessageSquare className="h-3.5 w-3.5" />
        <span>Thread</span>
        <span className="text-foreground/80">({msgs.length})</span>
        {!open && unread > 0 && (
          <span className="ml-auto rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
            {unread} new
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {msgs.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">No messages yet. Start the conversation.</div>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-auto pr-1">
              {msgs.map((m) => (
                <li key={m.id} className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-foreground">{m.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">{fmt(m.created_at)}</span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap text-foreground/90">{m.message}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a question or note…"
              rows={2}
              className="text-xs"
            />
            <Button size="sm" onClick={send} disabled={busy || !draft.trim()}>Post</Button>
          </div>
        </div>
      )}
    </div>
  );
}
