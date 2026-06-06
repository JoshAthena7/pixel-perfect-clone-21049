import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  getCheckinByToken,
  submitCheckin,
  type CheckinStatus,
  type CheckinSectionForWriter,
  type CheckinPagePayload,
} from "@/lib/checkin.functions";

export const Route = createFileRoute("/checkin/$token")({
  ssr: false,
  loader: async ({ params }) => {
    const payload = await getCheckinByToken({ data: { token: params.token } });
    if (payload.state === "not_found") throw notFound();
    return payload;
  },
  notFoundComponent: () => (
    <ExpiredOrInvalid title="Link not found" message="This check-in link is invalid or has already been used." />
  ),
  errorComponent: ({ error }) => (
    <ExpiredOrInvalid title="Something went wrong" message={error?.message ?? "Please try again later."} />
  ),
  component: CheckinPage,
});

function ExpiredOrInvalid({ title, message }: { title: string; message: string }) {
  return (
    <PageShell>
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" aria-hidden />
        <h1 className="mb-1 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[680px]">{children}</div>
    </div>
  );
}

function CheckinPage() {
  const payload = Route.useLoaderData() as CheckinPagePayload;

  if (payload.state === "expired") {
    return <ExpiredOrInvalid title="Link expired" message="This check-in link has expired. Ask your PM to send a new one." />;
  }
  if (payload.state === "already_submitted") {
    return <AlreadySubmitted payload={payload} />;
  }
  return <CheckinForm payload={payload} />;
}

// ============================================================
// Already submitted state
// ============================================================
function AlreadySubmitted({ payload }: { payload: Extract<CheckinPagePayload, { state: "already_submitted" }> }) {
  const submittedAt = new Date(payload.submission.submitted_at);
  return (
    <PageShell>
      <Header missionName={payload.mission.name} writerName={payload.writer.first_name} daysToSubmission={null} />
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden />
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">You're all set.</h1>
        <p className="text-sm text-slate-600">
          You already submitted your check-in for this cycle on{" "}
          {submittedAt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.
        </p>
        {payload.nextCheckin && (
          <p className="mt-4 text-sm text-slate-500">
            Next check-in: {new Date(payload.nextCheckin).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </p>
        )}
      </div>
      {payload.submission.updates.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-slate-600 hover:text-slate-900">View your submission</summary>
          <ul className="mt-3 space-y-2">
            {payload.submission.updates.map((u, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <div className="font-semibold text-slate-900">
                  {u.section.number} · {u.section.title}
                </div>
                <div className="mt-1 text-slate-600">
                  Status: <span className="font-medium">{labelFor(u.status)}</span>
                  {u.progress_pct !== null && ` · ${u.progress_pct}%`}
                </div>
                {u.notes && <div className="mt-1 italic text-slate-500">"{u.notes}"</div>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </PageShell>
  );
}

// ============================================================
// Main check-in form
// ============================================================
type LocalUpdate = {
  status: CheckinStatus | null;
  progress_pct: number | null;
  notes: string;
};

function CheckinForm({ payload }: { payload: Extract<CheckinPagePayload, { state: "ready" }> }) {
  const submit = useServerFn(submitCheckin);
  const token = Route.useParams().token;

  const [updates, setUpdates] = useState<Record<string, LocalUpdate>>(() => {
    const init: Record<string, LocalUpdate> = {};
    payload.sections.forEach((s) => {
      init[s.id] = { status: null, progress_pct: null, notes: "" };
    });
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ at: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMilestone = payload.cycle.trigger_type !== "weekly";
  const days = payload.daysToSubmission;
  const milestoneBanner = useMemo(() => {
    if (!isMilestone || days === null) return null;
    return `${days} day${days === 1 ? "" : "s"} to submission — your input is critical`;
  }, [isMilestone, days]);

  const greeting = isMilestone && days !== null
    ? `Hi ${payload.writer.first_name} — submission is in ${days} days. Quick check-in needed.`
    : `Hi ${payload.writer.first_name} — ${payload.sections.length} section${payload.sections.length === 1 ? "" : "s"} assigned to you. Takes about 30 seconds.`;

  const canSubmit = Object.values(updates).some((u) => u.status !== null);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payloadUpdates = Object.entries(updates)
        .filter(([, u]) => u.status !== null)
        .map(([section_id, u]) => ({
          section_id,
          status: u.status as CheckinStatus,
          progress_pct: u.status === "in_progress" ? u.progress_pct : null,
          notes: u.notes.trim() || null,
        }));
      await submit({ data: { token, updates: payloadUpdates } });
      setDone({ at: new Date() });
    } catch (e: any) {
      setError(e?.message ?? "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <PageShell>
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" aria-hidden />
          <h1 className="mb-1 text-2xl font-semibold text-slate-900">Check-in submitted.</h1>
          <p className="text-sm text-slate-600">Your updates have been recorded.</p>
          <p className="mt-2 text-xs text-slate-500">
            {payload.mission.name} · Submitted{" "}
            {done.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <p className="mt-6 text-sm text-slate-500">That's it — thanks for the 30 seconds.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Header
        missionName={payload.mission.name}
        writerName={payload.writer.first_name}
        daysToSubmission={days}
      />

      {milestoneBanner && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{milestoneBanner}</span>
        </div>
      )}

      <p className="mt-6 text-base text-slate-700">{greeting}</p>

      <div className="mt-6 space-y-4">
        {payload.sections.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            value={updates[s.id]}
            onChange={(next) => setUpdates((u) => ({ ...u, [s.id]: next }))}
          />
        ))}
        {payload.sections.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            No sections are assigned to you yet.
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="mt-6 w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed"
        style={{
          background: canSubmit && !submitting ? "#3B82F6" : "#cbd5e1",
          minHeight: 56,
        }}
      >
        {submitting ? "Submitting…" : "Submit Check-In →"}
      </button>

      <p className="mt-4 text-center text-xs text-slate-400">ATLAS · Check-In</p>
    </PageShell>
  );
}

function Header({
  missionName,
  writerName,
  daysToSubmission,
}: {
  missionName: string;
  writerName: string;
  daysToSubmission: number | null;
}) {
  let chip: { bg: string; fg: string; label: string } | null = null;
  if (daysToSubmission !== null) {
    const label = `${daysToSubmission} day${daysToSubmission === 1 ? "" : "s"} to submission`;
    if (daysToSubmission <= 2) chip = { bg: "#FEE2E2", fg: "#991B1B", label };
    else if (daysToSubmission <= 7) chip = { bg: "#FEF3C7", fg: "#92400E", label };
    else chip = { bg: "#E0F2FE", fg: "#075985", label };
  }

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500">ATLAS</div>
      <div className="min-w-0 flex-1 text-sm font-medium text-slate-800 truncate" title={missionName}>
        {missionName}
      </div>
      {chip && (
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: chip.bg, color: chip.fg }}
          aria-label={chip.label}
        >
          {chip.label}
        </span>
      )}
      <div className="text-xs text-slate-500">{writerName}</div>
    </header>
  );
}

function labelFor(s: CheckinStatus | null) {
  switch (s) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "draft_done":
      return "Draft Done";
    case "blocked":
      return "Blocked";
    default:
      return "—";
  }
}

const STATUS_OPTIONS: { value: CheckinStatus; label: string; bg: string; fg: string }[] = [
  { value: "not_started", label: "Not Started", bg: "#E2E8F0", fg: "#334155" },
  { value: "in_progress", label: "In Progress", bg: "#3B82F6", fg: "#ffffff" },
  { value: "draft_done", label: "Draft Done", bg: "#22C55E", fg: "#ffffff" },
  { value: "blocked", label: "Blocked", bg: "#EF4444", fg: "#ffffff" },
];

function SectionCard({
  section,
  value,
  onChange,
}: {
  section: CheckinSectionForWriter;
  value: LocalUpdate;
  onChange: (v: LocalUpdate) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-bold text-slate-900">{section.number}</span>
        <span className="flex-1 text-base text-slate-800">{section.title}</span>
        {section.rfp_page_ref && (
          <span className="text-xs text-slate-400">p. {section.rfp_page_ref}</span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={`Status for section ${section.number}`}
        className="mt-4 flex flex-wrap gap-2"
      >
        {STATUS_OPTIONS.map((opt, idx) => {
          const active = value.status === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (value.status === null && idx === 0) ? 0 : -1}
              onClick={() =>
                onChange({
                  ...value,
                  status: opt.value,
                  progress_pct: opt.value === "in_progress" ? value.progress_pct ?? 25 : null,
                })
              }
              className="rounded-full px-4 py-2.5 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              style={{
                background: active ? opt.bg : "#f1f5f9",
                color: active ? opt.fg : "#475569",
                minHeight: 44,
                border: active ? `1px solid ${opt.bg}` : "1px solid #e2e8f0",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {value.status === "in_progress" && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">How far along?</div>
          <div role="radiogroup" aria-label="Progress percentage" className="flex flex-wrap gap-2">
            {[25, 50, 75, 90].map((pct) => {
              const active = value.progress_pct === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ ...value, progress_pct: pct })}
                  className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  style={{
                    background: active ? "#3B82F6" : "#f1f5f9",
                    color: active ? "#ffffff" : "#475569",
                    minHeight: 44,
                    minWidth: 60,
                  }}
                >
                  {pct === 90 ? "Almost done" : `${pct}%`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <input
        type="text"
        value={value.notes}
        maxLength={140}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        placeholder="Any blockers, notes, or ETA changes? (optional)"
        aria-label={`Notes for section ${section.number}`}
        className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ minHeight: 44 }}
      />
    </article>
  );
}
