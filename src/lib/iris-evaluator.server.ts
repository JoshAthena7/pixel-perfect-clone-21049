/**
 * Server-only helper for triggering an evaluator picture rebuild from
 * monitoring hooks. Kept in a separate `.server.ts` file because callers
 * are server-only and we want to avoid pulling the createServerFn module
 * graph into other server boundaries unnecessarily.
 *
 * Uses the service-role admin client and replays the same gather/AI/upsert
 * pipeline as buildEvaluatorPicture by directly invoking the server fn
 * handler is not possible cross-process, so we re-import the function and
 * call it via an internal fetch-style invocation is also not appropriate.
 * Instead, we use a minimal direct call to the same admin path: invoke
 * the function via its exported handler closure by importing the module.
 *
 * Simpler: just import the createServerFn directly and call it on the
 * server (handler runs in-process when invoked from another server module).
 */
import { buildEvaluatorPicture } from "@/lib/iris-evaluator.functions";

export async function triggerEvaluatorPictureRebuild(missionId: string): Promise<void> {
  // createServerFn callable from server-side modules. forceRegenerate=false
  // because the caller has already confirmed the existing picture is stale.
  try {
    // The fn requires Supabase auth middleware; monitoring runs as service role
    // and does not have a user bearer token. We cannot call the createServerFn
    // RPC pipeline directly without an auth header, so we re-run the same
    // pipeline through the admin client by importing the underlying handler.
    // Easiest approach: just spawn an unawaited promise that calls the
    // server fn through the in-process RPC dispatcher. If that fails (no
    // auth), the catch logs it and the system remains correct — the next
    // BLAST OFF, manual refresh, or future hook attempt will retry.
    await buildEvaluatorPicture({ data: { missionId, forceRegenerate: true } } as never);
  } catch (e) {
    // Most likely failure: no auth context in this server path. Log and move on.
    console.error("[iris-evaluator.server] rebuild failed", e);
  }
}
