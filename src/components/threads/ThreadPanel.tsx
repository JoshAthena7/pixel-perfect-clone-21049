import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, RotateCcw, Send, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  CommentPanelLabel,
  COMMENT_PLACEHOLDER,
  IrisMentionTooltip,
} from "@/components/v2/CommentPanelChrome";
import {
  getOrCreateThread,
  listComments,
  postComment,
  resolveThread,
  reopenThread,
  searchUsers,
  getThreadsInternalAckState,
  ackThreadsInternalNotice,
} from "@/lib/threads.functions";

type ObjectType = "question_record";

export function ThreadPanel({
  open,
  onClose,
  objectType,
  objectId,
}: {
  open: boolean;
  onClose: () => void;
  objectType: ObjectType;
  objectId: string;
}) {
  const qc = useQueryClient();
  const getOrCreate = useServerFn(getOrCreateThread);
  const listFn = useServerFn(listComments);
  const postFn = useServerFn(postComment);
  const resolveFn = useServerFn(resolveThread);
  const reopenFn = useServerFn(reopenThread);
  const searchFn = useServerFn(searchUsers);
  const getAck = useServerFn(getThreadsInternalAckState);
  const ackFn = useServerFn(ackThreadsInternalNotice);

  const threadQ = useQuery({
    queryKey: ["thread", objectType, objectId],
    queryFn: () => getOrCreate({ data: { objectType, objectId } }),
    enabled: open,
  });

  const threadId = threadQ.data?.thread?.id;

  const commentsQ = useQuery({
    queryKey: ["thread-comments", threadId],
    queryFn: () => listFn({ data: { threadId: threadId! } }),
    enabled: open && !!threadId,
    refetchInterval: 15_000,
  });

  const ackQ = useQuery({
    queryKey: ["threads-ack-state"],
    queryFn: () => getAck(),
    enabled: open,
  });

  const [showAckModal, setShowAckModal] = useState(false);
  useEffect(() => {
    if (open && ackQ.data && !ackQ.data.acked) setShowAckModal(true);
  }, [open, ackQ.data]);

  const ackMut = useMutation({
    mutationFn: () => ackFn(),
    onSuccess: () => {
      setShowAckModal(false);
      qc.invalidateQueries({ queryKey: ["threads-ack-state"] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveFn({ data: { threadId: threadId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread", objectType, objectId] });
      toast.success("Thread resolved");
    },
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenFn({ data: { threadId: threadId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread", objectType, objectId] });
      toast.success("Thread reopened");
    },
  });

  const postMut = useMutation({
    mutationFn: (args: {
      body: string;
      mentionUserIds: string[];
      mentionsIris: boolean;
    }) =>
      postFn({
        data: {
          threadId: threadId!,
          body: args.body,
          mentionUserIds: args.mentionUserIds,
          mentionsIris: args.mentionsIris,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread-comments", threadId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't post comment"),
  });

  const isResolved = threadQ.data?.isResolved ?? false;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[460px] p-0 flex flex-col"
          style={{ background: "#0a0f1a", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <CommentPanelLabel />
          <SheetHeader className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-medium" style={{ color: "#e5e7eb" }}>
                Threads
              </SheetTitle>
              {threadId && (
                isResolved ? (
                  <button
                    onClick={() => reopenMut.mutate()}
                    disabled={reopenMut.isPending}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md hover:bg-white/5"
                    style={{ color: "#9ca3af" }}
                  >
                    <RotateCcw className="h-3 w-3" /> Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => resolveMut.mutate()}
                    disabled={resolveMut.isPending}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md hover:bg-white/5"
                    style={{ color: "#5eead4" }}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </button>
                )
              )}
            </div>
            {isResolved && (
              <p className="text-[11px] mt-1" style={{ color: "rgba(229,231,235,0.55)" }}>
                Resolved{threadQ.data?.resolverName ? ` by ${threadQ.data.resolverName}` : ""}
              </p>
            )}
          </SheetHeader>

          <CommentList
            loading={commentsQ.isLoading}
            comments={commentsQ.data?.comments ?? []}
          />

          {threadId && !isResolved && (
            <Composer
              onSubmit={(args) => postMut.mutate(args)}
              isSubmitting={postMut.isPending}
              searchUsers={async (q) => (await searchFn({ data: { q } })).users}
            />
          )}
        </SheetContent>
      </Sheet>

      <AckModal
        open={showAckModal}
        onAck={() => ackMut.mutate()}
        isAcking={ackMut.isPending}
      />
    </>
  );
}

/* ─── Comment list ─── */

function CommentList({
  loading,
  comments,
}: {
  loading: boolean;
  comments: Array<{
    id: string;
    body: string;
    isIrisReply: boolean;
    isDeleted: boolean;
    createdAt: string;
    versionTag: string | null;
    author: {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      avatarColor: string;
    };
  }>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [comments.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: "#6b7280" }}>
        One moment…
      </div>
    );
  }
  if (!comments.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px] px-6 text-center" style={{ color: "#6b7280" }}>
        No comments yet. Start the thread — every comment here stays internal to Athena.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {comments.map((c) => (
        <CommentItem key={c.id} c={c} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function CommentItem({
  c,
}: {
  c: {
    id: string;
    body: string;
    isIrisReply: boolean;
    isDeleted: boolean;
    createdAt: string;
    versionTag: string | null;
    author: { displayName: string; avatarUrl: string | null; avatarColor: string };
  };
}) {
  const initials = c.author.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex gap-2.5">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
        style={{
          background: c.isIrisReply ? "rgba(34,211,238,0.14)" : c.author.avatarColor,
          color: c.isIrisReply ? "#22d3ee" : "#fff",
          border: c.isIrisReply ? "1px solid rgba(34,211,238,0.55)" : "none",
          boxShadow: c.isIrisReply ? "0 0 12px rgba(34,211,238,0.25)" : undefined,
        }}
      >
        {c.isIrisReply ? <Sparkles className="h-3.5 w-3.5" /> : initials || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span
            className="text-[12px] font-medium"
            style={{ color: c.isIrisReply ? "#22d3ee" : "#e5e7eb" }}
          >
            {c.author.displayName}
          </span>
          {c.isIrisReply && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.22em] px-1.5 py-0.5 rounded"
              style={{
                color: "#22d3ee",
                background: "rgba(34,211,238,0.10)",
                border: "1px solid rgba(34,211,238,0.30)",
              }}
            >
              ● IRIS · Intelligence
            </span>
          )}
          <span className="text-[10px]" style={{ color: "#6b7280" }}>
            {formatTime(c.createdAt)}
          </span>
          {c.versionTag && (
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "#6b7280" }}>
              on {c.versionTag}
            </span>
          )}
        </div>
        <div
          className={
            c.isIrisReply
              ? "text-[12.5px] whitespace-pre-wrap leading-relaxed rounded-md px-3 py-2 mt-1"
              : "text-[12.5px] whitespace-pre-wrap leading-relaxed"
          }
          style={
            c.isIrisReply
              ? {
                  color: c.isDeleted ? "#6b7280" : "#e5e7eb",
                  fontStyle: c.isDeleted ? "italic" : "normal",
                  background: "rgba(34,211,238,0.05)",
                  borderLeft: "2px solid rgba(34,211,238,0.55)",
                }
              : {
                  color: c.isDeleted ? "#6b7280" : "#e5e7eb",
                  fontStyle: c.isDeleted ? "italic" : "normal",
                }
          }
        >
          {c.body}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

/* ─── Composer with @mention ─── */

type MentionUser = {
  id: string;
  display_name: string;
  avatar_color: string | null;
};

function Composer({
  onSubmit,
  isSubmitting,
  searchUsers,
}: {
  onSubmit: (args: { body: string; mentionUserIds: string[]; mentionsIris: boolean }) => void;
  isSubmitting: boolean;
  searchUsers: (q: string) => Promise<MentionUser[]>;
}) {
  const [body, setBody] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [results, setResults] = useState<MentionUser[]>([]);
  const [picked, setPicked] = useState<Map<string, string>>(new Map()); // id -> display_name
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect @ trigger
  useEffect(() => {
    const m = body.match(/@(\w*)$/);
    if (m) {
      setPickerOpen(true);
      setPickerQuery(m[1]);
    } else {
      setPickerOpen(false);
    }
  }, [body]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(pickerQuery).then((users) => {
        if (!cancelled) setResults(users);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerOpen, pickerQuery, searchUsers]);

  const mentionsIris = useMemo(() => /@IRIS\b/i.test(body), [body]);

  const handleSelectMention = (user: { id: string; display_name: string } | "iris") => {
    if (user === "iris") {
      setBody((b) => b.replace(/@\w*$/, "@IRIS "));
    } else {
      setBody((b) => b.replace(/@\w*$/, `@${user.display_name} `));
      setPicked((m) => new Map(m).set(user.id, user.display_name));
    }
    setPickerOpen(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = () => {
    if (!body.trim() || isSubmitting) return;
    // Filter picked mentions to those still present in the body
    const stillMentioned: string[] = [];
    for (const [id, name] of picked) {
      if (body.includes(`@${name}`)) stillMentioned.push(id);
    }
    onSubmit({
      body: body.trim(),
      mentionUserIds: stillMentioned,
      mentionsIris,
    });
    setBody("");
    setPicked(new Map());
  };

  return (
    <div className="border-t p-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <div />
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-[280px] p-1"
          style={{ background: "#0b1220", borderColor: "rgba(255,255,255,0.1)" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <button
            onClick={() => handleSelectMention("iris")}
            className="w-full text-left px-2 py-1.5 rounded text-[12px] flex items-center gap-2 hover:bg-white/5"
            style={{ color: "#f59e0b" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-medium">IRIS</span>
            <span className="ml-auto text-[10px]" style={{ color: "#6b7280" }}>
              ask intelligence
            </span>
          </button>
          <div className="my-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }} />
          {results.length === 0 && (
            <div className="px-2 py-1.5 text-[11px]" style={{ color: "#6b7280" }}>
              No teammates found.
            </div>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => handleSelectMention(u)}
              className="w-full text-left px-2 py-1.5 rounded text-[12px] flex items-center gap-2 hover:bg-white/5"
              style={{ color: "#e5e7eb" }}
            >
              <span
                className="h-5 w-5 rounded-full inline-flex items-center justify-center text-[9px] font-semibold"
                style={{ background: u.avatar_color ?? "#3b7fff", color: "#fff" }}
              >
                {u.display_name.slice(0, 2).toUpperCase()}
              </span>
              {u.display_name}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <IrisMentionTooltip>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={COMMENT_PLACEHOLDER}
          rows={3}
          className="w-full resize-none rounded-md px-3 py-2 text-[12.5px] outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e5e7eb",
          }}
        />
      </IrisMentionTooltip>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: "#6b7280" }}>
          {mentionsIris ? "IRIS will reply inline" : "⌘↵ to send · Type @ to mention"}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || isSubmitting}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md disabled:opacity-40"
          style={{ background: "#5eead4", color: "#050810" }}
        >
          <Send className="h-3 w-3" />
          {isSubmitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/* ─── DB-backed first-use modal ─── */

function AckModal({
  open,
  onAck,
  isAcking,
}: {
  open: boolean;
  onAck: () => void;
  isAcking: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="max-w-md w-full rounded-lg p-6"
        style={{
          background: "#0b1220",
          border: "1px solid rgba(94,234,212,0.3)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.2em] mb-3"
          style={{ color: "#5eead4" }}
        >
          ● Threads
        </div>
        <h2 className="text-[16px] font-semibold mb-2" style={{ color: "#fff" }}>
          Comments in ATLAS are internal to Athena.
        </h2>
        <p className="text-[13px] leading-relaxed mb-5" style={{ color: "rgba(229,231,235,0.8)" }}>
          They are separate from any comments or feedback in client systems. Do
          not share thread content externally.
        </p>
        <button
          onClick={onAck}
          disabled={isAcking}
          className="w-full rounded-md text-[13px] font-medium py-2.5 disabled:opacity-50"
          style={{ background: "#5eead4", color: "#050810" }}
        >
          {isAcking ? "Saving…" : "Understood"}
        </button>
      </div>
    </div>
  );
}
