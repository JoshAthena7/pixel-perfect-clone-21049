import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { refreshIris } from "@/lib/iris-refresh.functions";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function RefreshIrisCard() {
  const qc = useQueryClient();

  const { data: isAdmin } = useQuery({
    queryKey: ["refresh-iris-is-admin"],
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

  const [lastResult, setLastResult] = useState<{ cleared: number; circuit: string } | null>(null);
  const refreshFn = useServerFn(refreshIris);
  const mutation = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (res) => {
      setLastResult({
        cleared: res.cleared_cache_rows,
        circuit: typeof res.circuit === "string" ? res.circuit : JSON.stringify(res.circuit),
      });
      qc.invalidateQueries();
      toast.success(`IRIS refreshed — cleared ${res.cleared_cache_rows} cached briefs`);
    },
    onError: (err: Error) => toast.error(`Refresh failed: ${err.message}`),
  });

  if (!isAdmin) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-sky-500/10 p-2">
          <RefreshCw className="h-5 w-5 text-sky-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Refresh IRIS</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear cached briefs and reset the AI circuit breaker. Use after seeding new
            intelligence sources or when IRIS answers feel stale.
          </p>

          {lastResult && (
            <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/[0.04] px-3 py-2 text-xs text-sky-200">
              Cleared <span className="font-mono">{lastResult.cleared}</span> cached briefs ·
              circuit: <span className="font-mono">{lastResult.circuit}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Refreshing…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Refresh IRIS
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
