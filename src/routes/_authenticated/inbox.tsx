import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, ArrowRight, Clock, AlertTriangle, CheckCircle2, MessageSquare, UserPlus, X } from "lucide-react";
import {
  listMyInbox,
  ackConsult,
  requestMoreInfo,
  reassignConsult,
  respondToConsult,
  type ExpertConsultRow,
} from "@/lib/expert-consult.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">Couldn't load your inbox</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            reset();
            router.invalidate();
          }}
          className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/40"
        >
          Try again
        </button>
      </div>
    );
  },
  notFoundComponent: () => <div className="px-6 py-12 text-sm text-muted-foreground">Inbox not found.</div>,
});

function InboxPage() {
  const fn = useServerFn(listMyInbox);
  const qc = useQueryClient();
  const { data: rows = [], isLoading, refetch } = useQuery<ExpertConsultRow[]>({
    queryKey: ["inbox-mine"],
    queryFn: () => fn(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const buckets = {
    sent: rows.filter((r) => r.status === "sent"),
    acknowledged: rows.filter((r) => r.status === "acknowledged"),
    needs_info: rows.filter((r) => r.status === "needs_info"),
    responded: rows.filter((r) => r.status === "responded"),
    closed: rows.filter((r) => r.status === "closed" || r.status === "reassigned"),
  };

  return (
    <div className="min-h-screen" style={{ background: "#060b14" }}>
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-4 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">My Phone-a-Friend Inbox</h1>
          {rows.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              · {rows.length} total
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading inbox…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-surface px-6 py-16 text-center">
            <Phone className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-foreground">No consults assigned to you yet.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Teammates will send Phone-a-Friend requests here when they need your read.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-4">
              {(["sent", "acknowledged", "needs_info", "responded", "closed"] as const).map((k) =>
                buckets[k].length > 0 ? (
                  <Bucket
                    key={k}
                    title={k.replace("_", " ").toUpperCase()}
                    rows={buckets[k]}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                ) : null,
              )}
            </div>
            <div className="lg:col-span-7">
              {selected ? (
                <ConsultDetail
                  consult={selected}
                  onChange={() => {
                    refetch();
                    qc.invalidateQueries({ queryKey: ["mission-consults", selected.mission_id] });
                  }}
                />
              ) : (
                <div className="rounded-[12px] border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
                  Pick a consult on the left to see the full ask.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Bucket({
  title,
  rows,
  selectedId,
  onSelect,
}: {
  title: string;
  rows: ExpertConsultRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title} · {rows.length}
      </div>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => {
          const active = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id)}
                className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-[12px] transition ${
                  active ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/30" : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-medium text-foreground line-clamp-1">{r.ask_subject}</span>
                  <UrgencyChip u={r.urgency} />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function UrgencyChip({ u }: { u: ExpertConsultRow["urgency"] }) {
  const tone =
    u === "urgent"
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : u === "fyi"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-primary/15 text-primary border-primary/30";
  return (
    <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
      {u}
    </span>
  );
}

function ConsultDetail({
  consult,
  onChange,
}: {
  consult: ExpertConsultRow;
  onChange: () => void;
}) {
  const ackFn = useServerFn(ackConsult);
  const moreInfoFn = useServerFn(requestMoreInfo);
  const reassignFn = useServerFn(reassignConsult);
  const respondFn = useServerFn(respondToConsult);

  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [moreInfoNote, setMoreInfoNote] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [reassignNote, setReassignNote] = useState("");

  // Load teammates on the same mission for reassign picker
  const { data: candidates = [] } = useQuery({
    queryKey: ["reassign-cands", consult.mission_id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("mission_members")
        .select("user_id")
        .eq("mission_id", consult.mission_id);
      const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ids);
      return profs ?? [];
    },
    enabled: reassignOpen,
  });

  async function doAck() {
    setBusy(true);
    try {
      await ackFn({ data: { consultId: consult.id } });
      toast.success("Acknowledged.");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function doRespond() {
    if (!response.trim()) return toast.error("Add your response first.");
    setBusy(true);
    try {
      await respondFn({ data: { consultId: consult.id, body: response.trim() } });
      toast.success("Response sent.");
      setResponse("");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function doMoreInfo() {
    setBusy(true);
    try {
      await moreInfoFn({ data: { consultId: consult.id, note: moreInfoNote.trim() || undefined } });
      toast.success("Requester pinged for more info.");
      setMoreInfoOpen(false);
      setMoreInfoNote("");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function doReassign() {
    if (!reassignTo) return toast.error("Pick someone first.");
    setBusy(true);
    try {
      await reassignFn({
        data: {
          consultId: consult.id,
          newExpertUserId: reassignTo,
          note: reassignNote.trim() || undefined,
        },
      });
      toast.success("Reassigned.");
      setReassignOpen(false);
      setReassignTo("");
      setReassignNote("");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  const ctx = (consult.context_snapshot ?? {}) as any;
  const responded = consult.status === "responded" || consult.status === "closed";

  return (
    <section className="rounded-[12px] border border-border bg-surface">
      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {ctx.mission_name ?? "Mission"} · {ctx.question_number ? `Q${ctx.question_number}` : "General"}
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">{consult.ask_subject}</div>
          </div>
          <UrgencyChip u={consult.urgency} />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {ctx.point_value != null && (
            <span className="rounded-full border border-transparent bg-white/[0.06] px-2 py-0.5 text-foreground">
              {ctx.point_value} pts
            </span>
          )}
          {ctx.pens_down_date && (
            <span className="rounded-full border border-transparent bg-white/[0.06] px-2 py-0.5 text-foreground">
              <Clock className="mr-1 inline h-3 w-3" />
              {ctx.pens_down_date}
            </span>
          )}
          {ctx.iris_risk_flag && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-300">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {ctx.iris_risk_flag}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="rounded-md border border-border bg-background/30 p-4 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
          {consult.ask_body}
        </div>

        {ctx.draft_so_far && (
          <details className="rounded-md border border-border bg-background/30 p-3 text-[12px]">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Draft so far (attached)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-foreground/85">{ctx.draft_so_far}</pre>
          </details>
        )}

        {responded ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-[12px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <CheckCircle2 className="mr-1 inline h-3 w-3" />
              Your response
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-foreground/90">
              {consult.response_body ?? "—"}
            </pre>
            {consult.response_at && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Sent {new Date(consult.response_at).toLocaleString()}
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Your response
              </label>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={8}
                placeholder="Direct guidance, references, suggested language…"
                className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={doRespond}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                Send response
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              {consult.status === "sent" && (
                <button
                  onClick={doAck}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-surface-hover"
                >
                  Acknowledge
                </button>
              )}
              <button
                onClick={() => setMoreInfoOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-surface-hover"
              >
                <MessageSquare className="h-3 w-3" />
                Need more info
              </button>
              <button
                onClick={() => setReassignOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-surface-hover"
              >
                <UserPlus className="h-3 w-3" />
                Suggest a different expert
              </button>
            </div>
          </>
        )}
      </div>

      {/* More-info modal */}
      {moreInfoOpen && (
        <MiniModal title="Need more info" onClose={() => setMoreInfoOpen(false)}>
          <textarea
            value={moreInfoNote}
            onChange={(e) => setMoreInfoNote(e.target.value)}
            rows={5}
            placeholder="What do you need from the requester to give a useful answer?"
            className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setMoreInfoOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-[11px]">
              Cancel
            </button>
            <button
              onClick={doMoreInfo}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </MiniModal>
      )}

      {/* Reassign modal */}
      {reassignOpen && (
        <MiniModal title="Suggest a different expert" onClose={() => setReassignOpen(false)}>
          <select
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
            className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
          >
            <option value="">Pick a teammate…</option>
            {(candidates as any[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name ?? c.email ?? c.id}
              </option>
            ))}
          </select>
          <textarea
            value={reassignNote}
            onChange={(e) => setReassignNote(e.target.value)}
            rows={3}
            placeholder="Why is this person a better fit? (optional)"
            className="mt-2 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setReassignOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-[11px]">
              Cancel
            </button>
            <button
              onClick={doReassign}
              disabled={busy}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              Reassign
            </button>
          </div>
        </MiniModal>
      )}
    </section>
  );
}

function MiniModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[12px] border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-hover">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
