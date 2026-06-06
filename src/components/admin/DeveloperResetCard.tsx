import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { resetAllMissionData } from "@/lib/developer-reset.functions";
import { Trash2, AlertTriangle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DeveloperResetCard() {
  const qc = useQueryClient();

  // Check admin role — card stays hidden for everyone else.
  const { data: isAdmin } = useQuery({
    queryKey: ["dev-reset-is-admin"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id)
        .eq("role", "admin");
      return (roles?.length ?? 0) > 0;
    },
  });

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [report, setReport] = useState<{ totalDeleted: number; tables: number } | null>(null);

  const resetFn = useServerFn(resetAllMissionData);
  const mutation = useMutation({
    mutationFn: () => resetFn({ data: { confirm: "RESET" } }),
    onSuccess: (res) => {
      setReport({
        totalDeleted: res.totalDeleted,
        tables: res.results.filter((r) => typeof r.deleted === "number").length,
      });
      setTyped("");
      qc.invalidateQueries();
      toast.success("All mission data cleared. Ready for fresh setup.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast.error(msg);
    },
  });

  if (!isAdmin) return null;

  return (
    <>
      <section
        className="mt-10 rounded-[10px] border border-red-500/30 bg-red-500/[0.04] p-5"
        aria-label="Developer reset"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-300">
              Developer Reset
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground">
              Wipe all mission data
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Permanently deletes every mission, question, assignment, signal,
              risk, briefing, and IRIS artifact. Preserves user accounts,
              profiles, roles, and reference libraries. There is no undo.
            </p>
            {report && (
              <p className="mt-2 text-[12px] text-emerald-300">
                Last reset cleared {report.totalDeleted.toLocaleString()} rows across{" "}
                {report.tables} tables.
              </p>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-200 hover:bg-red-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset All Mission Data
          </button>
        </div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => !mutation.isPending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[10px] border border-red-500/40 bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h2 className="text-base font-semibold">
                  Delete everything?
                </h2>
              </div>
              <button
                onClick={() => !mutation.isPending && setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
                disabled={mutation.isPending}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              This will permanently delete all missions, questions, assignments,
              IRIS data, and team assignments. This cannot be undone.
            </p>

            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Type RESET to confirm
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={mutation.isPending}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono uppercase tracking-widest focus:border-red-500/60 focus:outline-none"
              placeholder="RESET"
            />

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={typed !== "RESET" || mutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                  </>
                ) : (
                  <>Delete Everything</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
