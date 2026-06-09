import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildAndDownloadRosterXlsx,
  fetchFullRosterForExport,
  fetchRosterByIdsForExport,
} from "@/lib/atlas-team-export";

type Scope = "current" | "full";

export function AthenaTeamExportDialog({
  open,
  onOpenChange,
  currentViewIds,
  onExporting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentViewIds: string[];
  onExporting?: (v: boolean) => void;
}) {
  const [scope, setScope] = useState<Scope>("current");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setErr(null);
    onExporting?.(true);
    try {
      const rows =
        scope === "current"
          ? await fetchRosterByIdsForExport(currentViewIds)
          : await fetchFullRosterForExport();
      buildAndDownloadRosterXlsx(rows);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
      onExporting?.(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Roster</DialogTitle>
          <DialogDescription>
            Choose what to include in the download.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-hover">
            <input
              type="radio"
              name="export-scope"
              value="current"
              checked={scope === "current"}
              onChange={() => setScope("current")}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Current view</div>
              <div className="text-xs text-muted-foreground">
                Only the rows visible after active filters ({currentViewRows.length}{" "}
                {currentViewRows.length === 1 ? "member" : "members"})
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-surface-hover">
            <input
              type="radio"
              name="export-scope"
              value="full"
              checked={scope === "full"}
              onChange={() => setScope("full")}
              className="mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Full roster</div>
              <div className="text-xs text-muted-foreground">
                All active members regardless of filters
              </div>
            </div>
          </label>
          <p className="pt-1 text-xs text-muted-foreground">
            Admin notes and activity logs are not included in exports.
          </p>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            className="rounded-md bg-[color:var(--athena-gold,#d4af37)] px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
