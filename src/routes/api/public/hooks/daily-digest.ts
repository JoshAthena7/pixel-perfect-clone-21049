import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { DailyDigest, type DailyDigestProps } from '@/lib/email-templates/daily-digest'

const SITE_NAME = 'Athena Command Center'
const SENDER_DOMAIN = 'notify.athenacommandcenter.com'
const FROM_DOMAIN = 'athenacommandcenter.com'
const APP_URL = 'https://athenacommandcenter.com'
const LEADERSHIP_ROLES = ['founder', 'pm', 'engagement_lead']

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

async function summarize(apiKey: string, context: any): Promise<string> {
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You are Athena, AI co-pilot for a proposal war room. Write a tight 3-5 sentence morning brief for leadership. Be direct, tactical, no fluff. Call out what changed overnight, what is on fire, and what needs a decision today. If nothing changed, say so honestly in one line.',
          },
          { role: 'user', content: `Build the morning brief from this engagement state:\n${JSON.stringify(context)}` },
        ],
      }),
    })
    if (!res.ok) return ''
    const json: any = await res.json()
    return (json?.choices?.[0]?.message?.content ?? '').trim()
  } catch (e) {
    console.error('AI summary failed', e)
    return ''
  }
}

export const Route = createFileRoute('/api/public/hooks/daily-digest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const apiKey = process.env.LOVABLE_API_KEY
        if (!supabaseUrl || !serviceKey || !apiKey) {
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }

        // Require the service-role key as a bearer token (same pattern as
        // /lovable/email/queue/process). This endpoint is only meant to be
        // triggered by an internal scheduler.
        const auth = request.headers.get('authorization') ?? ''
        const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
        if (!provided || provided !== serviceKey) {
          return new Response('Unauthorized', { status: 401 })
        }

        const supabase = createClient(supabaseUrl, serviceKey)

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data: engagements, error: engErr } = await supabase
          .from('engagements')
          .select('id, name, client, status, submission_date')
          .eq('status', 'Active')
        if (engErr) {
          console.error('engagements fetch failed', engErr)
          return Response.json({ error: 'engagements fetch failed' }, { status: 500 })
        }

        let totalQueued = 0
        const perEngagement: any[] = []

        for (const eng of engagements ?? []) {
          const [
            { data: huddles },
            { data: heatmap },
            { data: risks },
            { data: sos },
            { data: members },
          ] = await Promise.all([
            supabase.from('huddles').select('health, priority, risk, notes, submitter_name, needs_leadership, created_at').eq('engagement_id', eng.id).gte('created_at', since),
            supabase.from('heatmap_sections').select('section_name, status, notes').eq('engagement_id', eng.id),
            supabase.from('risks').select('title, severity, owner_name, created_at').eq('engagement_id', eng.id).gte('created_at', since),
            supabase.from('sos_alerts').select('category, severity, description').eq('engagement_id', eng.id).eq('status', 'Open'),
            supabase.from('engagement_members').select('user_id, role, display_name').eq('engagement_id', eng.id).in('role', LEADERSHIP_ROLES),
          ])

          const redSections = (heatmap ?? []).filter((s: any) => s.status === 'Red').map((s: any) => s.section_name)
          const yellowSections = (heatmap ?? []).filter((s: any) => s.status === 'Yellow').map((s: any) => s.section_name)

          if (!members || members.length === 0) continue

          // Resolve leadership emails via auth admin
          const recipients: Array<{ email: string; name: string }> = []
          for (const m of members) {
            const { data: u } = await supabase.auth.admin.getUserById(m.user_id)
            const email = u?.user?.email
            if (email) recipients.push({ email, name: m.display_name?.split(' ')[0] || 'Team' })
          }
          if (recipients.length === 0) continue

          const aiContext = {
            engagement: { name: eng.name, client: eng.client, days_to_submission: daysUntil(eng.submission_date) },
            overnight_huddles: huddles,
            heatmap_red: redSections,
            heatmap_yellow: yellowSections,
            new_risks_24h: risks,
            open_sos: sos,
          }
          const summary = await summarize(apiKey, aiContext)

          const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

          for (const r of recipients) {
            // Skip suppressed recipients
            const { data: suppressed } = await supabase
              .from('suppressed_emails')
              .select('email')
              .eq('email', r.email.toLowerCase())
              .maybeSingle()
            if (suppressed) {
              console.log('Skipping suppressed recipient', r.email)
              continue
            }

            const props: DailyDigestProps = {
              recipientName: r.name,
              engagementName: eng.name,
              client: eng.client,
              dateLabel,
              daysToSubmission: daysUntil(eng.submission_date),
              summary,
              overnightHuddles: huddles?.length ?? 0,
              redSections,
              yellowSections,
              newRisks: (risks ?? []).map((x: any) => ({ title: x.title, severity: x.severity, owner: x.owner_name })),
              openSos: (sos ?? []).map((x: any) => ({ category: x.category, severity: x.severity, description: x.description })),
              appUrl: APP_URL,
            }

            const element = React.createElement(DailyDigest, props)
            const html = await renderAsync(element)
            const plainText = await renderAsync(element, { plainText: true })
            const messageId = crypto.randomUUID()
            const subject = `[Athena] ${eng.name} — Daily brief, ${dateLabel}`

            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'daily-digest',
              recipient_email: r.email,
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
                text: plainText,
                purpose: 'transactional',
                label: 'daily-digest',
                idempotency_key: `digest-${eng.id}-${r.email}-${new Date().toISOString().slice(0, 10)}`,
                queued_at: new Date().toISOString(),
              },
            })
            if (enqErr) {
              console.error('Failed to enqueue digest', enqErr)
            } else {
              totalQueued++
            }
          }

          perEngagement.push({ engagement: eng.name, recipients: recipients.length })
        }

        return Response.json({ ok: true, queued: totalQueued, engagements: perEngagement })
      },
    },
  },
})
