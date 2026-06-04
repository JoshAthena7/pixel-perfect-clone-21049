import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyThreads,
  getThread,
  markThreadRead,
  markThreadUnread,
  setThreadArchived,
  togglePin,
  setMyAvailability,
} from "@/lib/signals.functions";
import { ComposePanel, Avatar } from "@/components/signals/ComposePanel";
import {
  Plus,
  Flag,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  CornerUpLeft,
  ArrowDown,
  HelpCircle,
  X,
  Search,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/signals")({
  component: SignalsPage,
});

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SignalsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeQuote, setComposeQuote] = useState<{ id: string; body: string } | null>(null);
  const [composePrefillThread, setComposePrefillThread] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const listFn = useServerFn(listMyThreads);
  const { data: list } = useQuery({
    queryKey: ["signals", "threads", showArchived],
    queryFn: () => listFn({ data: { archived: showArchived } }),
    refetchInterval: 30_000,
  });

  const threads = list?.threads ?? [];
  const filteredThreads = useMemo(() => {
    if (!filter.trim()) return threads;
    const q = filter.toLowerCase();
    return threads.filter((t: any) => {
      if (t.name?.toLowerCase().includes(q)) return true;
      return t.others?.some((p: any) => p?.display_name?.toLowerCase().includes(q));
    });
  }, [threads, filter]);

  // Auto-select first thread
  useEffect(() => {
    if (!activeThreadId && filteredThreads.length > 0) {
      setActiveThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, activeThreadId]);

  // Keyboard shortcuts
  useEffect(() => {
    function h(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (isInput) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setComposeQuote(null);
        setComposePrefillThread(null);
        setComposeOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "e" && activeThreadId) {
        e.preventDefault();
        archiveMut.mutate({ threadId: activeThreadId, archived: !showArchived });
      } else if (e.key === "u" && activeThreadId) {
        e.preventDefault();
        unreadMut.mutate({ threadId: activeThreadId });
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, showArchived]);

  const archiveFn = useServerFn(setThreadArchived);
  const unreadFn = useServerFn(markThreadUnread);
  const archiveMut = useMutation({
    mutationFn: (v: { threadId: string; archived: boolean }) => archiveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals"] });
      toast.success("Thread updated");
    },
  });
  const unreadMut = useMutation({
    mutationFn: (v: { threadId: string }) => unreadFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals"] });
      toast.success("Marked unread");
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full" style={{ background: "var(--background, #060b14)" }}>
      {/* Left: thread list */}
      <aside className="w-[340px] shrink-0 border-r border-white/8 flex flex-col">
        <div className="px-4 py-4 border-b border-white/8">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[12px] font-bold uppercase tracking-[0.22em] text-foreground">Signals</h1>
            <div className="flex items-center gap-1">
              <StatusSelector />
              <button
                onClick={() => setShowHelp(true)}
                title="Shortcuts (?)"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <HelpCircle size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            <Search size={13} className="text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search threads"
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
            />
            <kbd className="text-[9px] font-mono text-muted-foreground border border-white/10 rounded px-1 py-0.5">/</kbd>
          </div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            {showArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
            {showArchived ? "Showing archived" : "Show archived"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 ? (
            <EmptyThreadList onStart={() => { setComposeQuote(null); setComposePrefillThread(null); setComposeOpen(true); }} />
          ) : (
            filteredThreads.map((t: any) => (
              <ThreadListItem
                key={t.id}
                thread={t}
                active={t.id === activeThreadId}
                onClick={() => setActiveThreadId(t.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Right: active thread */}
      <section className="flex-1 min-w-0 relative">
        {activeThreadId ? (
          <ThreadView
            threadId={activeThreadId}
            onReply={(s) => {
              setComposeQuote({ id: s.id, body: s.body });
              setComposePrefillThread(activeThreadId);
              setComposeOpen(true);
            }}
            onArchive={() => archiveMut.mutate({ threadId: activeThreadId, archived: !showArchived })}
            onMarkUnread={() => unreadMut.mutate({ threadId: activeThreadId })}
            isArchivedView={showArchived}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            Select a thread to view Signals
          </div>
        )}

        {/* Floating + New Signal */}
        <button
          onClick={() => { setComposeQuote(null); setComposePrefillThread(null); setComposeOpen(true); }}
          title="New Signal (N)"
          className="absolute bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full bg-white text-[#0a0a0a] px-4 h-11 text-[12px] font-bold uppercase tracking-[0.1em] shadow-lg hover:bg-white/90"
        >
          <Plus size={15} strokeWidth={2.5} />
          New Signal
        </button>
      </section>

      <ComposePanel
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialQuote={composeQuote}
        prefillThreadId={composePrefillThread}
        onCreated={(tid) => setActiveThreadId(tid)}
      />

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function EmptyThreadList({ onStart }: { onStart: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-foreground mb-2">Signals</div>
      <p className="text-sm text-muted-foreground mb-4">
        Send a direct Signal to anyone in the Collective.
      </p>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-foreground hover:bg-white/[0.08]"
      >
        <Plus size={13} /> Start a Signal
      </button>
    </div>
  );
}

function ThreadListItem({ thread, active, onClick }: { thread: any; active: boolean; onClick: () => void }) {
  const title =
    thread.type === "group"
      ? thread.name ?? "Group thread"
      : thread.others?.[0]?.display_name ?? "Direct";
  const subtitle = thread.last_signal?.body ?? "No Signals yet";
  const unread = thread.unread_count ?? 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
        active ? "bg-white/[0.05]" : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3">
        {thread.type === "group" ? (
          <div className="h-9 w-9 shrink-0 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-bold uppercase text-muted-foreground">
            {thread.others?.length ?? 0}+
          </div>
        ) : (
          <Avatar profile={thread.others?.[0] ?? { display_name: "?" }} size={36} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {thread.has_unread_priority && <Flag size={11} className="text-amber-400 shrink-0" fill="currentColor" />}
            <div className={`text-sm truncate ${unread > 0 ? "font-semibold text-foreground" : "text-foreground/90"}`}>
              {title}
            </div>
            <div className="ml-auto text-[10px] text-muted-foreground shrink-0">
              {formatTime(thread.last_activity_at)}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className={`flex-1 truncate text-xs ${unread > 0 ? "text-foreground/70" : "text-muted-foreground"}`}>
              {subtitle}
            </div>
            {unread > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center bg-amber-400 text-[#0a0a0a]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ThreadView({
  threadId,
  onReply,
  onArchive,
  onMarkUnread,
  isArchivedView,
}: {
  threadId: string;
  onReply: (s: { id: string; body: string }) => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  isArchivedView: boolean;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getThread);
  const markReadFn = useServerFn(markThreadRead);
  const pinFn = useServerFn(togglePin);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(true);

  const { data } = useQuery({
    queryKey: ["signals", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    refetchInterval: 15_000,
  });

  const markReadMut = useMutation({
    mutationFn: () => markReadFn({ data: { threadId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals"] }),
  });

  const pinMut = useMutation({
    mutationFn: (signalId: string) => pinFn({ data: { threadId, signalId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals", "thread", threadId] }),
    onError: (e: any) => toast.error(e.message ?? "Could not pin"),
  });

  // mark read on open
  useEffect(() => {
    if (data?.thread) markReadMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, data?.signals.length]);

  // auto-scroll to bottom on first load
  useEffect(() => {
    if (!scrollRef.current || !data) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [threadId, data?.signals.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowJump(!atBottom);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  if (!data) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  const { thread, signals, pins, profiles } = data;
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
  const signalMap = new Map(signals.map((s: any) => [s.id, s]));

  const title =
    thread.type === "group"
      ? thread.name
      : (() => {
          const otherId = data.participants.find((p: any) => p.user_id !== signals?.[0]?.sender_id)?.user_id;
          return otherId ? (profileMap.get(otherId) as any)?.display_name : "Direct";
        })();

  return (
    <div className="h-full flex flex-col">
      {/* Thread header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{title}</div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {thread.type === "group" ? `${data.participants.length} members` : "Direct"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMarkUnread}
            title="Mark unread (U)"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <EyeOff size={14} />
          </button>
          <button
            onClick={onArchive}
            title={isArchivedView ? "Unarchive (E)" : "Archive (E)"}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            {isArchivedView ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
        </div>
      </div>

      {/* Pinned banner */}
      {pins.length > 0 && (
        <div className="px-6 py-2 border-b border-white/8 bg-amber-500/[0.04]">
          <button
            onClick={() => setPinsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-300/90 hover:text-amber-300"
          >
            <Pin size={11} fill="currentColor" />
            {pins.length} Pinned · {pinsOpen ? "Hide" : "Show"}
          </button>
          {pinsOpen && (
            <div className="mt-2 space-y-1.5">
              {pins.map((p: any) => {
                const s = signalMap.get(p.signal_id) as any;
                if (!s) return null;
                const sender = profileMap.get(s.sender_id) as any;
                return (
                  <div key={p.signal_id} className="text-xs text-foreground/85 flex items-start gap-2">
                    <span className="text-[10px] uppercase text-muted-foreground shrink-0 mt-0.5">
                      {sender?.display_name?.split(" ")[0] ?? "—"}:
                    </span>
                    <span className="line-clamp-2">{s.body}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Signals stream */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {signals.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">Nothing here yet.</div>
        ) : (
          signals.map((s: any) => {
            const sender = profileMap.get(s.sender_id) as any;
            const quoted = s.quote_of ? (signalMap.get(s.quote_of) as any) : null;
            const isPinned = pins.some((p: any) => p.signal_id === s.id);
            return (
              <SignalItem
                key={s.id}
                signal={s}
                sender={sender}
                quoted={quoted}
                quotedSender={quoted ? (profileMap.get(quoted.sender_id) as any) : null}
                isPinned={isPinned}
                onReply={() => onReply({ id: s.id, body: s.body })}
                onTogglePin={() => pinMut.mutate(s.id)}
              />
            );
          })
        )}
      </div>

      {/* Jump to latest */}
      {showJump && (
        <button
          onClick={jumpToLatest}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur px-3 py-1.5 text-[11px] text-foreground hover:bg-white/15"
        >
          <ArrowDown size={12} /> Jump to latest
        </button>
      )}
    </div>
  );
}

function SignalItem({
  signal,
  sender,
  quoted,
  quotedSender,
  isPinned,
  onReply,
  onTogglePin,
}: {
  signal: any;
  sender: any;
  quoted: any | null;
  quotedSender: any | null;
  isPinned: boolean;
  onReply: () => void;
  onTogglePin: () => void;
}) {
  const role = sender?.expertise_areas?.[0];
  return (
    <div className="group flex items-start gap-3">
      <Avatar profile={sender ?? { display_name: "?" }} size={34} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">{sender?.display_name ?? "—"}</span>
          {role && <span className="text-[11px] text-muted-foreground">{role}</span>}
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{formatTime(signal.sent_at)}</span>
          {signal.is_priority && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-amber-400">
              <Flag size={10} fill="currentColor" /> Priority
            </span>
          )}
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button
              onClick={onReply}
              title="Quote-reply"
              className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <CornerUpLeft size={12} />
            </button>
            <button
              onClick={onTogglePin}
              title={isPinned ? "Unpin" : "Pin"}
              className={`h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-white/5 ${
                isPinned ? "text-amber-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>
          </div>
        </div>

        {quoted && (
          <div className="mb-2 border-l-2 border-white/15 pl-3 py-1 text-xs text-muted-foreground">
            <div className="text-[10px] uppercase tracking-[0.18em] mb-0.5">
              {quotedSender?.display_name ?? "—"}
            </div>
            <div className="line-clamp-2">{quoted.body}</div>
          </div>
        )}

        <div
          className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
            signal.is_priority
              ? "border-l-2 border-amber-400 pl-3 text-foreground"
              : "text-foreground/90"
          }`}
        >
          {signal.body}
        </div>
      </div>
    </div>
  );
}

function StatusSelector() {
  const qc = useQueryClient();
  const setFn = useServerFn(setMyAvailability);
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["signals", "me-status"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("availability_status").eq("id", user.id).maybeSingle();
      return data;
    },
  });
  const status = (me?.availability_status as string) ?? "available";
  const opts: { v: "available" | "pens_down" | "unavailable"; label: string; color: string }[] = [
    { v: "available", label: "Available", color: "#10b981" },
    { v: "pens_down", label: "On Assignment", color: "#f59e0b" },
    { v: "unavailable", label: "Unavailable", color: "#6b7280" },
  ];
  const cur = opts.find((o) => o.v === status) ?? opts[0];

  const setMut = useMutation({
    mutationFn: (v: "available" | "pens_down" | "unavailable") => setFn({ data: { status: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signals", "me-status"] });
      qc.invalidateQueries({ queryKey: ["signals"] });
      setOpen(false);
      toast.success("Status updated");
    },
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Status: ${cur.label}`}
        className="h-7 inline-flex items-center gap-1.5 rounded-md px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <span className="h-2 w-2 rounded-full" style={{ background: cur.color }} />
        {cur.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 rounded-md border border-white/10 bg-[#0d141f] py-1 min-w-[160px] shadow-xl">
          {opts.map((o) => (
            <button
              key={o.v}
              onClick={() => setMut.mutate(o.v)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-white/5 text-left"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ["New Signal", "N"],
    ["Send", "⌘/Ctrl + Enter"],
    ["Search threads", "/"],
    ["Archive thread", "E"],
    ["Mark unread", "U"],
    ["Jump to latest", "Shift + G"],
  ];
  return (
    <div onClick={onClose} className="fixed inset-0 z-[1200] bg-black/60 flex items-center justify-center">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0d141f] border border-white/10 rounded-lg max-w-sm w-full p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em]">Shortcuts</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-2">
          {items.map(([label, key]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-foreground/90">{label}</span>
              <kbd className="font-mono text-[10px] border border-white/10 rounded px-1.5 py-0.5 text-muted-foreground">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
