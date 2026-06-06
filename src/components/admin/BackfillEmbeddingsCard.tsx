import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { backfillStaticEmbeddings } from "@/lib/iris-backfill-embeddings.functions";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";

type LibResult = { table: string; total: number; already: number; embedded: number; failed: number };

export function BackfillEmbeddingsCard() {
  const { data: isAdmin } = useQuery({
    queryKey: ["backfill-embeddings-is-admin"],
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

  const [results, setResults] = useState<LibResult[] | null>(null);
  const fn = useServerFn(backfillStaticEmbeddings);
  const mutation = useMutation({
    mutationFn: () => fn(),
    onSuccess: (res) => {
      setResults(res.results);
      const embedded = res.results.reduce((s, r) => s + r.embedded, 0);
      const failed = res.results.reduce((s, r) => s + r.failed, 0);
      toast.success(`Backfilled ${embedded} embeddings${failed ? ` (${failed} failed)` : ""}`);
    },
    onError: (err: Error) => toast.error(`Backfill failed: ${err.message}`),
  });

  if (!isAdmin) return null;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2">
          <Database className="h-5 w-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Backfill Static Library Embeddings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Embeds Intelligence Canon, Expertise Library, and Federal Compliance Library into the
            semantic retrieval index. Run once after seeding libraries — turns Semantic Retrieval
            green before the first mission activation. Safe to re-run (skips already-embedded rows).
          </p>

          {results && (
            <div className="mt-3 space-y-1 rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2 text-xs">
              {results.map((r) => (
                <div key={r.table} className="flex justify-between text-violet-200">
                  <span className="font-mono">{r.table}</span>
                  <span>
                    {r.embedded} embedded · {r.already} existing · {r.failed} failed ({r.total} total)
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-sm font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Backfilling… (may take ~30s)
              </>
            ) : (
              <>
                <Database className="h-4 w-4" /> Backfill Embeddings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
