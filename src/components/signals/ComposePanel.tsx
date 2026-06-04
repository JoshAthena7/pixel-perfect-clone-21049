import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Flag, Search, Check } from "lucide-react";
import { toast } from "sonner";
import {
  searchRecipients,
  createThread,
  sendSignal,
} from "@/lib/signals.functions";

type Recipient = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_color?: string | null;
  availability_status?: string;
  expertise_areas?: string[] | null;
  email?: string | null;
};

export function ComposePanel({
  open,
  onClose,
  onCreated,
  initialQuote,
  prefillThreadId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (threadId: string) => void;
  initialQuote?: { id: string; body: string; sender_name?: string } | null;
  prefillThreadId?: string | null;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [threadName, setThreadName] = useState("");
  const [body, setBody] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const searchFn = useServerFn(searchRecipients);
  const createFn = useServerFn(createThread);
  const sendFn = useServerFn(sendSignal);

  const { data: searchData } = useQuery({
    queryKey: ["signals", "recipients", query],
    queryFn: () => searchFn({ data: { q: query } }),
    enabled: open && !prefillThreadId,
    staleTime: 5_000,
  });

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected([]);
      setThreadName("");
      setBody(initialQuote ? `> ${initialQuote.body.slice(0, 280)}\n\n` : "");
      setIsPriority(false);
      setTimeout(() => textareaRef.current?.focus(), 220);
    }
  }, [open, initialQuote]);

  // Send-on-Cmd/Ctrl+Enter
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
    if (e.key === "Escape") onClose();
  }

  // Escape closes panel
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const sendMut = useMutation({
    mutationFn: async () => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Signal body required");
      if (trimmed.length > 2000) throw new Error("Signal exceeds 2,000 characters");

      let threadId = prefillThreadId ?? null;
      if (!threadId) {
        if (selected.length === 0) throw new Error("Select at least one recipient");
        const isGroup = selected.length > 1;
        if (isGroup && !threadName.trim()) throw new Error("Name this thread before sending");
        const res = await createFn({
          data: {
            recipientIds: selected.map((r) => r.id),
            name: isGroup ? threadName.trim() : undefined,
          },
        });
        threadId = res.thread_id;
      }
      await sendFn({
        data: {
          threadId,
          body: trimmed,
          isPriority,
          quoteOf: initialQuote?.id ?? null,
        },
      });
      return threadId!;
    },
    onSuccess: (threadId) => {
      qc.invalidateQueries({ queryKey: ["signals"] });
      onCreated?.(threadId);
      onClose();
      toast.success("Signal sent");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send"),
  });

  function onSend() {
    if (sendMut.isPending) return;
    sendMut.mutate();
  }

  function toggleRecipient(r: Recipient) {
    setSelected((cur) =>
      cur.some((x) => x.id === r.id) ? cur.filter((x) => x.id !== r.id) : [...cur, r]
    );
  }

  const remaining = 2000 - body.length;
  const isGroup = selected.length > 1;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[1100] bg-black/50 transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      {/* Panel */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 bottom-0 z-[1101] w-full max-w-2xl rounded-t-2xl border border-white/10 bg-[#0d141f] shadow-2xl transition-transform duration-200 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ borderBottom: "none" }}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            New Signal
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Recipients */}
        {!prefillThreadId && (
          <div className="px-5 pt-4 pb-2 border-b border-white/8">
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selected.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-2.5 py-1 text-xs text-foreground"
                  >
                    <span className="font-medium">{r.display_name}</span>
                    <button
                      onClick={() => toggleRecipient(r)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove recipient"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or role…"
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none py-1"
              />
            </div>
            {searchData?.results && searchData.results.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto -mx-2">
                {searchData.results.map((r: any) => {
                  const isSel = selected.some((x) => x.id === r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRecipient(r)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/[0.04] text-left"
                    >
                      <Avatar profile={r} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{r.display_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {(r.expertise_areas?.[0] as string) || r.email || "Member"}
                        </div>
                      </div>
                      {isSel && <Check size={14} className="text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}
            {searchData?.results && searchData.results.length === 0 && query && (
              <div className="mt-3 px-1 text-xs text-muted-foreground">
                No one found. Check the spelling or try a role.
              </div>
            )}
            {isGroup && (
              <input
                value={threadName}
                onChange={(e) => setThreadName(e.target.value.slice(0, 100))}
                placeholder="Name this thread…"
                className="mt-3 w-full bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:border-white/20"
              />
            )}
          </div>
        )}

        {/* Quoted */}
        {initialQuote && (
          <div className="px-5 pt-3">
            <div className="border-l-2 border-amber-400/40 pl-3 py-1.5 text-xs text-muted-foreground">
              <div className="text-[10px] uppercase tracking-[0.18em] mb-0.5">Quoting</div>
              <div className="line-clamp-2">{initialQuote.body}</div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-4">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            placeholder="Write your Signal…"
            rows={6}
            className="w-full bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none resize-none font-mono"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPriority((v) => !v)}
              title={isPriority ? "Remove Priority flag" : "Mark as Priority"}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                isPriority
                  ? "bg-amber-400/15 text-amber-400"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
              aria-label="Toggle Priority"
            >
              <Flag size={14} strokeWidth={isPriority ? 2.5 : 1.75} />
            </button>
            <span
              className={`text-[10px] tabular-nums ${
                remaining < 0 ? "text-red-400" : remaining < 200 ? "text-amber-400" : "text-muted-foreground"
              }`}
            >
              {remaining}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] text-muted-foreground">
              <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[9px]">⌘</kbd>{" "}
              <kbd className="rounded border border-white/10 px-1 py-0.5 font-mono text-[9px]">Enter</kbd>{" "}
              to send
            </span>
            <button
              onClick={onSend}
              disabled={sendMut.isPending || !body.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#0a0a0a] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendMut.isPending ? "Sending…" : "Send Signal"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Avatar({
  profile,
  size = 32,
  withStatus = true,
}: {
  profile: { display_name?: string; avatar_url?: string | null; avatar_color?: string | null; availability_status?: string };
  size?: number;
  withStatus?: boolean;
}) {
  const initials = (profile.display_name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const statusColor =
    profile.availability_status === "available"
      ? "#10b981"
      : profile.availability_status === "pens_down"
      ? "#f59e0b"
      : "#6b7280";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt=""
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-semibold"
          style={{
            width: size,
            height: size,
            background: profile.avatar_color ?? "#3b7fff",
            fontSize: size * 0.4,
          }}
        >
          {initials}
        </div>
      )}
      {withStatus && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2"
          style={{
            width: Math.max(8, size * 0.3),
            height: Math.max(8, size * 0.3),
            background: statusColor,
            borderColor: "#0d141f",
          }}
        />
      )}
    </div>
  );
}
