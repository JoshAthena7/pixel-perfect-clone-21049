import { createClient } from '@supabase/supabase-js'

/**
 * Record a hook failure to the alerting table. Safe to call from any hook
 * handler. Swallows its own errors so it never masks the original failure.
 */
export async function recordHookFailure(
  hookName: string,
  error: unknown,
  payload?: Record<string, unknown>,
  status?: number,
): Promise<void> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return
    const supabase = createClient(supabaseUrl, serviceKey)
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : typeof error === 'string'
          ? error
          : JSON.stringify(error)
    await supabase.rpc('record_hook_failure', {
      _hook_name: hookName,
      _source: 'handler',
      _status: status ?? null,
      _error: message.slice(0, 2000),
      _payload: payload ?? null,
    })
  } catch (e) {
    console.error('recordHookFailure failed', e)
  }
}

/**
 * Wraps a TanStack server route handler with try/catch that records failures.
 */
export function withFailureAlert<TArgs extends unknown[]>(
  hookName: string,
  fn: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      const res = await fn(...args)
      if (res.status >= 500) {
        await recordHookFailure(hookName, `HTTP ${res.status}`, undefined, res.status)
      }
      return res
    } catch (e) {
      await recordHookFailure(hookName, e)
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : 'Hook failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
  }
}
