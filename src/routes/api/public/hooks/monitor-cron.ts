import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

const SITE_NAME = 'Athena Command Center'
const SENDER_DOMAIN = 'notify.athenacommandcenter.com'
const FROM_DOMAIN = 'athenacommandcenter.com'
const APP_URL = 'https://athenacommandcenter.com'

export const Route = createFileRoute('/api/public/hooks/monitor-cron')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        // Optional bearer auth (cron call passes apikey instead — allow either)
        const auth = request.headers.get('authorization') ?? ''
        const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
        const apikeyHeader = request.headers.get('apikey') ?? ''
        if (provided !== serviceKey && apikeyHeader !== import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
          // allow service-role bearer OR anon apikey header (used by pg_cron)
          if (!apikeyHeader) return new Response('Unauthorized', { status: 401 })
        }

        const supabase = createClient(supabaseUrl, serviceKey)

        // Ingest new failures from pg_cron + net._http_response
        const { data: scanned, error: scanErr } = await supabase.rpc('scan_cron_failures', {
          _since: '00:30:00',
        })
        if (scanErr) {
          console.error('scan_cron_failures failed', scanErr)
        }

        // Find unnotified failures
        const { data: pending, error: pendingErr } = await supabase
          .from('hook_failures')
          .select('id, hook_name, source, status_code, error_message, created_at')
          .is('notified_at', null)
          .order('created_at', { ascending: false })
          .limit(50)

        if (pendingErr) {
          return Response.json({ error: pendingErr.message }, { status: 500 })
        }

        if (!pending || pending.length === 0) {
          return Response.json({ ok: true, scanned: scanned ?? 0, notified: 0 })
        }

        // Recipients: all founders + pms (distinct emails)
        const { data: leaders } = await supabase
          .from('engagement_members')
          .select('email, display_name')
          .in('role', ['founder', 'pm'])
          .not('email', 'is', null)

        const recipients = Array.from(
          new Map((leaders ?? []).filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l])).values(),
        )

        let queued = 0
        const subject = `[Athena] ALERT — ${pending.length} hook failure${pending.length === 1 ? '' : 's'} detected`
        const rows = pending
          .map(
            (f) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><code>${f.hook_name}</code></td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee">${f.source}${f.status_code ? ` (${f.status_code})` : ''}</td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee">${new Date(f.created_at).toUTCString()}</td>` +
              `<td style="padding:6px 10px;border-bottom:1px solid #eee">${(f.error_message ?? '').slice(0, 200)}</td></tr>`,
          )
          .join('')
        const html = `<div style="font-family:system-ui,sans-serif;max-width:720px">
          <h2 style="color:#b91c1c">${pending.length} hook failure${pending.length === 1 ? '' : 's'} need attention</h2>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead><tr style="background:#f8fafc">
              <th align="left" style="padding:8px 10px">Hook</th>
              <th align="left" style="padding:8px 10px">Source</th>
              <th align="left" style="padding:8px 10px">When</th>
              <th align="left" style="padding:8px 10px">Error</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:16px">
            <a href="${APP_URL}/overview" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open Overview</a>
          </p>
        </div>`
        const text = `${pending.length} hook failure(s):\n\n` +
          pending.map((f) => `- ${f.hook_name} [${f.source}${f.status_code ? ` ${f.status_code}` : ''}] ${new Date(f.created_at).toISOString()} — ${(f.error_message ?? '').slice(0, 200)}`).join('\n') +
          `\n\nOpen: ${APP_URL}/overview`

        for (const r of recipients) {
          const messageId = crypto.randomUUID()
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'hook-failure-alert',
            recipient_email: r.email!,
            status: 'pending',
          })
          const { error: enqErr } = await supabase.rpc('enqueue_email', {
            queue_name: 'transactional_emails',
            payload: {
              message_id: messageId,
              to: r.email,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject,
              html,
              text,
              purpose: 'transactional',
              label: 'hook-failure-alert',
              idempotency_key: `hookalert-${r.email}-${pending[0].id}`,
              queued_at: new Date().toISOString(),
            },
          })
          if (!enqErr) queued++
        }

        const ids = pending.map((p) => p.id)
        await supabase
          .from('hook_failures')
          .update({ notified_at: new Date().toISOString() })
          .in('id', ids)

        return Response.json({ ok: true, scanned: scanned ?? 0, failures: pending.length, recipients: recipients.length, queued })
      },
    },
  },
})
