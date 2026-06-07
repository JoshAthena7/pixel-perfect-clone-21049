import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  MessageSquare,
  Calendar,
  Target,
  User as UserIcon,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { IrisMentionTooltip, COMMENT_PLACEHOLDER } from "@/components/v2/CommentPanelChrome";
import {
  getOrCreateThread,
  listComments,
  listMissionThreads,
  postComment,
  resolveThread,
  reopenThread,
  searchUsers,
  toggleDecisionStar,
} from "@/lib/threads.functions";

type ThreadStatus = "open" | "needs_decision" | "resolved";

type ThreadRow = {
  threadId: string;
  objectType: string;
  objectId: string;
  questionNumber: string;
  questionTitle: string;
  pointValue: number | null;
  pensDownDate: string | null;
  assignedOwner: string | null;
  status: ThreadStatus;
  lastActivityAt: string;
  lastMessagePreview: string;
  commentCount: number;
};

export function MissionThreadsPanel({
  open,
  onClose,
  missionId,
  initialQuestionId,
}: {
  open: boolean;
  onClose: () => void;
  missionId: string;
  initialQuestionId?: string | null;
}) {
  const listFn = useServerFn(listMissionThreads);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    initialQuestionId ?? null,
  );
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (open) setActiveQuestionId(initialQuestionId ?? null);
  }, [open, initialQuestionId]);

  const threadsQ = useQuery({
    queryKey: ["mission-threads", missionId],
    queryFn: () => listFn({ data: { missionId } }),
    enabled: open,
    refetchInterval: 20_000,
  });

  const activeRow = useMemo(
    () =>
      threadsQ.data?.threads.find((t: ThreadRow) => t.objectId === activeQuestionId) ??
      null,
    [threadsQ.data, activeQuestionId],
  );

  const filtered = useMemo(() => {
    const rows = (threadsQ.data?.threads ?? []) as ThreadRow[];
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.questionNumber.toLowerCase().includes(q) ||
        r.questionTitle.toLowerCase().includes(q) ||
        r.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [threadsQ.data, filter]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 flex flex-col"
        style={{ background: "#0a0f1a", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <SheetHeader
          className="px-4 py-3 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            {activeQuestionId && (
              <button
                onClick={() => setActiveQuestionId(null)}
                className="p-1 rounded hover:bg-white/5"
                style={{ color: "#9ca3af" }}
                aria-label="Back to threads"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <SheetTitle className="text-sm font-medium" style={{ color: "#e5e7eb" }}>
              {activeQuestionId ? "Thread" : "Mission Threads"}
            </SheetTitle>
            {!activeQuestionId && (
              <span
                className="ml-auto text-[10px] uppercase tracking-[0.18em]"
                style={{ color: "#5eead4" }}
              >
                {threadsQ.data?.threads.length ?? 0} active
              </span>
            )}
          </div>
          {!activeQuestionId && (
            <div className="relative mt-2">
              <Search
                className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: "#6b7280" }}
              />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter threads…"
                className="w-full text-[12px] rounded-md pl-7 pr-2 py-1.5 outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#e5e7eb",
                }}
              />
            </div>
          )}
        </SheetHeader>

        {activeQuestionId ? (
          <ThreadDetail
            missionId={missionId}
            questionId={activeQuestionId}
            row={activeRow}
          />
        ) : (
          <ThreadList
            loading={threadsQ.isLoading}
            rows={filtered}
            onOpen={(qid) => setActiveQuestionId(qid)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ─── List view ─── */

function ThreadList({
  loading,
  rows,
  onOpen,
}: {
  loading: boolean;
  rows: ThreadRow[];
  onOpen: (questionId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: "#6b7280" }}>
        Loading threads…
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-[12px] px-8 text-center"
        style={{ color: "#6b7280" }}
      >
        No active threads on this mission yet. Open a question and start a conversation — every thread anchors to one assignment.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      {rows.map((r) => (
        <button
          key={r.threadId}
          onClick={() => onOpen(r.objectId)}
          className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(94,234,212,0.10)", color: "#5eead4" }}
                >
                  Q{r.questionNumber}
                </span>
                <StatusPill status={r.status} />
                {typeof r.commentCount === "number" && r.commentCount > 0 && (
                  <span className="text-[10px]" style={{ color: "#6b7280" }}>
                    <MessageSquare className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                    {r.commentCount}
                  </span>
                )}
              </div>
              <div
                className="text-[12.5px] font-medium truncate mb-1"
                style={{ color: "#e5e7eb" }}
              >
                {r.questionTitle}
              </div>
              <div
                className="text-[11.5px] line-clamp-2"
                style={{ color: "rgba(229,231,235,0.55)" }}
              >
                {r.lastMessagePreview}
              </div>
              <div
                className="text-[10px] mt-1.5"
                style={{ color: "#6b7280" }}
              >
                {formatTime(r.lastActivityAt)}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: ThreadStatus }) {
  const map: Record<ThreadStatus, { label: string; fg: string; bg: string }> = {
    open: { label: "Open", fg: "#9ca3af", bg: "rgba(156,163,175,0.12)" },
    needs_decision: {
      label: "Needs Decision",
      fg: "#fbbf24",
      bg: "rgba(251,191,36,0.12)",
    },
    resolved: { label: "Resolved", fg: "#5eead4", bg: "rgba(94,234,212,0.10)" },
  };
  const s = map[status];
  return (
    <span
      className="text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
      style={{ color: s.fg, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

/* ─── Detail view: locked question context + messages + composer ─── */

function ThreadDetail({
  missionId,
  questionId,
  row,
}: {
  missionId: string;
  questionId: string;
  row: ThreadRow | null;
}) {
  const qc = useQueryClient();
  const getOrCreate = useServerFn(getOrCreateThread);
  const listFn = useServerFn(listComments);
  const postFn = useServerFn(postComment);
  const resolveFn = useServerFn(resolveThread);
  const reopenFn = useServerFn(reopenThread);
  const searchFn = useServerFn(searchUsers);
  const starFn = useServerFn(toggleDecisionStar);

  const threadQ = useQuery({
    queryKey: ["thread", "question_record", questionId],
    queryFn: () =>
      getOrCreate({ data: { objectType: "question_record", objectId: questionId } }),
  });
  const threadId = threadQ.data?.thread?.id;
  const isResolved = threadQ.data?.isResolved ?? false;

  const commentsQ = useQuery({
    queryKey: ["thread-comments", threadId],
    queryFn: () => listFn({ data: { threadId: threadId! } }),
    enabled: !!threadId,
    refetchInterval: 15_000,
  });

  const postMut = useMutation({
    mutationFn: (args: { body: string; mentionUserIds: string[]; mentionsIris: boolean }) =>
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
      qc.invalidateQueries({ queryKey: ["mission-threads", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't post comment"),
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveFn({ data: { threadId: threadId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread", "question_record", questionId] });
      qc.invalidateQueries({ queryKey: ["mission-threads", missionId] });
      toast.success("Thread resolved");
    },
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenFn({ data: { threadId: threadId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thread", "question_record", questionId] });
      qc.invalidateQueries({ queryKey: ["mission-threads", missionId] });
      toast.success("Thread reopened");
    },
  });

  const starMut = useMutation({
    mutationFn: (args: { commentId: string; star: boolean }) =>
      starFn({ data: args }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["thread-comments", threadId] });
      qc.invalidateQueries({ queryKey: ["mission-decisions", missionId] });
      toast.success(vars.star ? "Starred as Decision" : "Removed from Decisions");
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update Decision"),
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {row && <QuestionContextHeader row={row} />}

      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#6b7280" }}>
          Messages
        </span>
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

      <CommentList
        loading={commentsQ.isLoading}
        comments={commentsQ.data?.comments ?? []}
        onToggleStar={(commentId, star) => starMut.mutate({ commentId, star })}
      />

      {threadId && !isResolved && (
        <Composer
          onSubmit={(args) => postMut.mutate(args)}
          isSubmitting={postMut.isPending}
          searchUsers={async (q) => (await searchFn({ data: { q } })).users}
        />
      )}
    </div>
  );
}

function QuestionContextHeader({ row }: { row: ThreadRow }) {
  const due = row.pensDownDate ? new Date(row.pensDownDate) : null;
  const daysOut = due
    ? Math.ceil((due.getTime() - Date.now()) / 86_400_000)
    : null;
  const urgent = daysOut !== null && daysOut <= 5;

  return (
    <div
      className="px-4 py-3 border-b"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background:
          "linear-gradient(180deg, rgba(94,234,212,0.06), rgba(94,234,212,0))",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="font-mono text-[11px] px-1.5 py-0.5 rounded"
          style={{ background: "rgba(94,234,212,0.12)", color: "#5eead4" }}
        >
          Q{row.questionNumber}
        </span>
        <StatusPill status={row.status} />
      </div>
      <div className="text-[13px] font-medium leading-snug mb-2" style={{ color: "#e5e7eb" }}>
        {row.questionTitle}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: "rgba(229,231,235,0.65)" }}>
        {row.pointValue !== null && (
          <span className="inline-flex items-center gap-1">
            <Target className="h-3 w-3" /> {row.pointValue} pts
          </span>
        )}
        {row.pensDownDate && (
          <span className="inline-flex items-center gap-1" style={{ color: urgent ? "#fbbf24" : undefined }}>
            <Calendar className="h-3 w-3" />
            Due {row.pensDownDate}
            {daysOut !== null && ` · ${daysOut}d`}
          </span>
        )}
        {row.assignedOwner && (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-3 w-3" /> {row.assignedOwner}
          </span>
        )}
      </div>
      <div className="text-[10px] mt-2 uppercase tracking-[0.16em]" style={{ color: "#5eead4" }}>
        ● Locked context — never repeated in messages
      </div>
    </div>
  );
}

/* ─── Comment list with Decision starring ─── */

type Comment = {
  id: string;
  body: string;
  isIrisReply: boolean;
  isDeleted: boolean;
  createdAt: string;
  versionTag: string | null;
  isDecision?: boolean;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    avatarColor: string;
  };
};

function CommentList({
  loading,
  comments,
  onToggleStar,
}: {
  loading: boolean;
  comments: Comment[];
  onToggleStar: (commentId: string, star: boolean) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [comments.length]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: "#6b7280" }}>
        Loading…
      </div>
    );
  }
  if (!comments.length) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-[12px] px-6 text-center"
        style={{ color: "#6b7280" }}
      >
        No comments yet. Type @ to mention a teammate or @IRIS to ask intelligence.
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {comments.map((c) => (
        <CommentItem key={c.id} c={c} onToggleStar={onToggleStar} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function CommentItem({
  c,
  onToggleStar,
}: {
  c: Comment;
  onToggleStar: (commentId: string, star: boolean) => void;
}) {
  const initials = c.author.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex gap-2.5 group">
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
          {c.isDecision && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
              style={{
                color: "#fbbf24",
                background: "rgba(251,191,36,0.10)",
                border: "1px solid rgba(251,191,36,0.30)",
              }}
            >
              <Star className="h-2.5 w-2.5 fill-current" /> Decision
            </span>
          )}
          <button
            onClick={() => onToggleStar(c.id, !c.isDecision)}
            className={
              "ml-auto p-0.5 rounded transition " +
              (c.isDecision
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 hover:bg-white/5")
            }
            title={c.isDecision ? "Remove from Decisions log" : "Star as Decision"}
            style={{ color: c.isDecision ? "#fbbf24" : "#6b7280" }}
          >
            <Star className={"h-3.5 w-3.5 " + (c.isDecision ? "fill-current" : "")} />
          </button>
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

type MentionUser = { id: string; display_name: string; avatar_color: string | null };

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
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const stillMentioned: string[] = [];
    for (const [id, name] of picked) {
      if (body.includes(`@${name}`)) stillMentioned.push(id);
    }
    onSubmit({ body: body.trim(), mentionUserIds: stillMentioned, mentionsIris });
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
          {mentionsIris ? "IRIS will reply inline" : "⌘↵ to send · @ to mention · @IRIS for intel"}
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
