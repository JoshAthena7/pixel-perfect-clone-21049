// S-2: Right-to-Deletion admin page.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserMinus, Plus, CheckCircle2 } from "lucide-react";
import {
  listDeletionRequests,
  createDeletionRequest,
  markDeletionFulfilled,
} from "@/lib/right-to-deletion.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/right-to-deletion")({
  component: RightToDeletionPage,
});

type Row = {
  id: string;
  writer_email: string | null;
  subject_name: string | null;
  notes: string | null;
  request_received_at: string;
  processed_at: string | null;
  fulfillment_method: string | null;
};

function RightToDeletionPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDeletionRequests);
  const createFn = useServerFn(createDeletionRequest);
  const fulfillFn = useServerFn(markDeletionFulfilled);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["right-to-deletion"],
    queryFn: () => listFn() as Promise<Row[]>,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [fulfillRow, setFulfillRow] = useState<Row | null>(null);
  const [method, setMethod] = useState("");

  async function submit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      await createFn({ data: { subject_name: name, subject_email: email, notes: notes || null } });
      toast.success("Deletion request recorded");
      setOpen(false);
      setName(""); setEmail(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["right-to-deletion"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  }

  async function fulfill() {
    if (!fulfillRow) return;
    try {
      await fulfillFn({ data: { id: fulfillRow.id, method: method || null } });
      toast.success("Marked fulfilled");
      setFulfillRow(null);
      setMethod("");
      qc.invalidateQueries({ queryKey: ["right-to-deletion"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  }

  const pending = rows.filter((r) => !r.processed_at);
  const fulfilled = rows.filter((r) => r.processed_at);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Security</div>
          <h1 className="h1-display mt-1">Right-to-Deletion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and resolve privacy deletion requests submitted by users or received via legal channels.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
              <Plus className="h-3 w-3" /> New request
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record deletion request</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <Field label="Subject name">
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Subject email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Notes (optional)">
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
              </Field>
            </div>
            <DialogFooter>
              <button onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancel</button>
              <button onClick={submit} disabled={submitting} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50">
                {submitting ? "Saving…" : "Record request"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">One moment…</div>
      ) : (
        <>
          <Section title="Pending" count={pending.length}>
            {pending.length === 0
              ? <Empty>No pending deletion requests.</Empty>
              : pending.map((r) => (
                <RequestRow key={r.id} row={r} onFulfill={() => setFulfillRow(r)} />
              ))}
          </Section>
          <Section title="Fulfilled" count={fulfilled.length}>
            {fulfilled.length === 0
              ? <Empty>No fulfilled requests yet.</Empty>
              : fulfilled.map((r) => <RequestRow key={r.id} row={r} />)}
          </Section>
        </>
      )}

      <Dialog open={!!fulfillRow} onOpenChange={(o) => !o && setFulfillRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark fulfilled</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Recording fulfillment for <strong>{fulfillRow?.subject_name ?? fulfillRow?.writer_email}</strong>.
          </p>
          <Field label="Method (how was the data removed?)">
            <textarea rows={3} value={method} onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g. Writer identity anonymized; all vault uploads purged."
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
          </Field>
          <DialogFooter>
            <button onClick={() => setFulfillRow(null)} className="rounded-md border border-border px-3 py-1.5 text-xs">Cancel</button>
            <button onClick={fulfill} className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
              Mark fulfilled
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <UserMinus className="h-4 w-4" />
        {title}
        <span className="text-[10px] text-muted-foreground/70">· {count}</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-surface">{children}</div>
    </section>
  );
}

function RequestRow({ row, onFulfill }: { row: Row; onFulfill?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.subject_name ?? row.writer_email ?? "—"}</div>
        <div className="truncate text-[11px] text-muted-foreground">{row.writer_email}</div>
        {row.notes && <div className="mt-1 text-[11px] text-muted-foreground/80 line-clamp-2">{row.notes}</div>}
        {row.fulfillment_method && <div className="mt-1 text-[11px] text-emerald-500/90">Method: {row.fulfillment_method}</div>}
      </div>
      <div className="text-right text-[10px] text-muted-foreground">
        <div>Received {new Date(row.request_received_at).toLocaleDateString()}</div>
        {row.processed_at && <div className="text-emerald-500/90">Fulfilled {new Date(row.processed_at).toLocaleDateString()}</div>}
      </div>
      {onFulfill && (
        <button onClick={onFulfill} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-surface-hover">
          <CheckCircle2 className="h-3 w-3" /> Mark fulfilled
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</div>;
}
