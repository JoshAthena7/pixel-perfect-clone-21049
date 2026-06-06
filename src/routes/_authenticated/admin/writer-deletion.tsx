// H6: Right-to-deletion processing UI. Search for a writer, review what will
// be anonymised, confirm with a reason. Soft-delete + anonymise + audit log.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, UserMinus, Check } from "lucide-react";
import { toast } from "sonner";
import {
  searchWritersForDeletion,
  requestWriterDeletion,
  listDeletionRequests,
} from "@/lib/writer-deletion.functions";

export const Route = createFileRoute("/_authenticated/admin/writer-deletion")({
  component: WriterDeletionPage,
});

type Writer = {
  id: string;
  display_name: string;
  primary_email: string | null;
  deleted_at: string | null;
  is_active: boolean;
};

function WriterDeletionPage() {
  const searchFn = useServerFn(searchWritersForDeletion);
  const deleteFn = useServerFn(requestWriterDeletion);
  const listFn = useServerFn(listDeletionRequests);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Writer[]>([]);
  const [selected, setSelected] = useState<Writer | null>(null);
  const [reason, setReason] = useState("");

  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["deletion-requests"],
    queryFn: () => listFn(),
  });

  const searchMut = useMutation({
    mutationFn: async () => {
      if (q.trim().length < 1) return [];
      return await searchFn({ data: { query: q.trim() } });
    },
    onSuccess: (rows) => setResults(rows as Writer[]),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No writer selected");
      return await deleteFn({
        data: { writerId: selected.id, reason: reason.trim() },
      });
    },
    onSuccess: () => {
      toast.success(`Writer anonymised. Audit entry written.`);
      setSelected(null);
      setReason("");
      setResults([]);
      setQ("");
      refetchRequests();
    },
    onError: (e: any) => toast.error(e?.message ?? "Deletion failed"),
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Security</div>
        <h1 className="h1-display mt-1">Right-to-deletion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Process GDPR Art. 17 / CCPA §1798.105 requests. Soft delete with anonymisation — engagement records retained, personal identifiers scrubbed.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step 1 — Find writer</div>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") searchMut.mutate(); }}
              placeholder="Search by name or email…"
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={() => searchMut.mutate()}
            disabled={searchMut.isPending || q.trim().length < 1}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50"
          >
            Search
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {results.map((w) => (
              <li key={w.id} className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-medium">{w.display_name}</div>
                  <div className="text-[11px] text-muted-foreground">{w.primary_email ?? "—"}</div>
                  {w.deleted_at && <div className="text-[11px] text-red-400">Already anonymised on {new Date(w.deleted_at).toLocaleDateString()}</div>}
                </div>
                <button
                  disabled={!!w.deleted_at}
                  onClick={() => setSelected(w)}
                  className="rounded-md bg-red-500/15 border border-red-500/30 px-3 py-1 text-xs text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section className="mt-5 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-red-300">Step 2 — Confirm anonymisation</div>
          <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
            <div className="text-sm font-medium">{selected.display_name}</div>
            <div className="text-muted-foreground">{selected.primary_email ?? "—"}</div>
          </div>
          <div className="mt-3 text-xs text-zinc-300 space-y-1">
            <div className="font-medium text-zinc-200">The following will be anonymised:</div>
            <ul className="ml-4 list-disc space-y-0.5 text-zinc-300/90">
              <li>Display name → <code>Former contributor</code></li>
              <li>Email, avatar, phone, bio, all metadata → <code>NULL</code></li>
              <li>Account deactivated (<code>is_active = false</code>)</li>
              <li>Linked profiles for any auth user aliases also updated</li>
            </ul>
            <div className="mt-2 font-medium text-zinc-200">The following will be retained:</div>
            <ul className="ml-4 list-disc space-y-0.5 text-zinc-300/90">
              <li>Contribution counts, question IDs answered, engagement IDs, timestamps</li>
              <li>The <code>writer_identities</code> row itself (for referential integrity)</li>
            </ul>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. 'GDPR Art. 17 request received via legal@athena.com on 2026-06-04')"
            rows={3}
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => { setSelected(null); setReason(""); }}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              disabled={reason.trim().length < 10 || deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50"
            >
              <UserMinus className="h-3 w-3" />
              {deleteMut.isPending ? "Processing…" : "Anonymise & log"}
            </button>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Inbound requests</h2>
        <p className="mt-1 text-xs text-muted-foreground">Tracking record for each external deletion request received.</p>
        <div className="mt-3 rounded-lg border border-border bg-surface overflow-hidden">
          {requests.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No requests recorded.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Received</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(requests as any[]).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 tabular-nums">{new Date(r.request_received_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.writer_email}</td>
                    <td className="px-3 py-2 font-mono">{r.request_source ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.processed_at ? (
                        <span className="inline-flex items-center gap-1 text-green-400"><Check className="h-3 w-3" /> {new Date(r.processed_at).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-amber-400">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
