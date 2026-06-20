/**
 * Backfill embeddings for existing oracle_signals.
 *
 * Admin-only server function. Pulls up to `limit` signals that don't
 * have an embedding yet, generates them via Lovable AI Gateway, and
 * writes them back using the service-role client (the user-scoped
 * client cannot UPDATE arbitrary signals across missions).
 *
 * The browser button calls this in a loop until { remaining === 0 }.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ limit: z.number().int().min(1).max(100).default(50) });

export const backfillSignalEmbeddings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    // Admin gate
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    const [{ generateEmbedding, buildSignalEmbeddingText, toPgVector }, { supabaseAdmin }] =
      await Promise.all([
        import("@/lib/embeddings.server"),
        import("@/integrations/supabase/client.server"),
      ]);

    type Pending = {
      id: string;
      title: string | null;
      what_happened: string | null;
      why_it_matters: string | null;
      category: string | null;
      topic_tags: string[] | null;
    };

    const { data: signals, error } = await supabaseAdmin.rpc("get_signals_needing_embeddings", {
      p_limit: data.limit,
    });
    if (error) throw new Error(`get_signals_needing_embeddings failed: ${error.message}`);
    const pending = (signals ?? []) as Pending[];
    if (pending.length === 0) {
      return { processed: 0, failed: 0, total: 0, remaining: 0 };
    }

    let processed = 0;
    let failed = 0;
    const batchSize = 5;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sig) => {
          const vec = await generateEmbedding(buildSignalEmbeddingText(sig));
          if (!vec) {
            failed += 1;
            return;
          }
          const { error: upErr } = await supabaseAdmin
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("oracle_signals" as any)
            .update({ embedding: toPgVector(vec) } as never)
            .eq("id", sig.id);
          if (upErr) {
            failed += 1;
            console.warn("[backfill] update failed", sig.id, upErr.message);
          } else {
            processed += 1;
          }
        }),
      );
      // Light throttle between batches
      await new Promise((r) => setTimeout(r, 100));
    }

    // Recount remaining
    const { data: more } = await supabaseAdmin.rpc("get_signals_needing_embeddings", { p_limit: 1 });
    const remaining = (more ?? []).length > 0 ? 1 : 0; // boolean signal; UI loops until 0

    return { processed, failed, total: pending.length, remaining };
  });
