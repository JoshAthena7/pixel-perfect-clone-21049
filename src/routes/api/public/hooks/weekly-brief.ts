// /api/public/hooks/weekly-brief
// Generates a strategic weekly brief, stores as firm-level insight,
// and emails it to all founder/pm leadership.

import * as React from 'react'
import { render as renderAsync } from '@react-email/components'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { WeeklyBrief, type WeeklyBriefProps } from '@/lib/email-templates/weekly-brief'

const SITE_NAME = 'Athena Command™'
const SENDER_DOMAIN = 'notify.athenacommandcenter.com'
const FROM_DOMAIN = 'athenacommandcenter.com'
const APP_URL = 'https://athenacommandcenter.com'
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const LEADERSHIP_ROLES = ['founder', 'pm']

export const Route = createFileRoute('/api/public/hooks/weekly-brief')({
  server: { handlers: { POST: handler, GET: handler } },
})

async function handler({ request }: { request: Request }) {
  const supabaseUrl = process.env.SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const lovableKey = process.env.LOVABLE_API_KEY ?? ''
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Server config error' }, { status: 500 })
  }

  // Optional bearer auth (cron sets this); allow open call if unset by scheduler
  const auth = request.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (provided && provided !== serviceKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekLabel = `Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`

  const [{ data: insights }, { data: market }, { data: outcomes }, { data: sos }, { data: risks }] = await Promise.all([
    supabase.from('intelligence_insights').select('insight_type,title,body,severity,actioned,created_at,engagement_id').gte('created_at', since),
    supabase.from('market_intelligence').select('source,title,summary,relevant_states,published_at').gte('ingested_at', since).order('ingested_at', { ascending: false }).limit(30),
    supabase.from('engagement_outcomes').select('engagement_id,outcome,recorded_at').gte('recorded_at', since),
    supabase.from('sos_alerts').select('category,severity,created_at,status').gte('created_at', since),
    supabase.from('risks').select('title,severity,status,created_at').gte('created_at', since),
  ])

  const competitorSignals = (insights ?? [])
    .filter((i: any) => i.insight_type === 'competitor_signal' || i.insight_type === 'external_signal')
    .slice(0, 5)
    .map((i: any) => ({ title: i.title, summary: i.body?.slice(0, 180) ?? null }))

  // Insight accuracy proxy: actioned / total
  const totalInsights = insights?.length ?? 0
  const actioned = (insights ?? []).filter((i: any) => i.actioned).length
  const insightAccuracy = totalInsights > 0 ? actioned / totalInsights : null

  // AI brief
  let summary = ''
  let portfolioPatterns: string[] = []
  let recommendedActions: string[] = []

  if (lovableKey) {
    const prompt = `You are Athena, AI co-pilot for a proposal war room firm.
Write a strategic weekly intelligence brief for leadership in this exact JSON shape:
{
  "summary": "2-3 tight sentences. Direct, confident, PDB style.",
  "portfolio_patterns": ["pattern 1", "pattern 2", "pattern 3"],
  "recommended_actions": ["action 1", "action 2", "action 3"]
}

This week's data:
- ${totalInsights} intelligence insights generated, ${actioned} actioned
- ${(market ?? []).length} new market intel items
- ${(outcomes ?? []).length} engagement outcomes
- ${(sos ?? []).length} escalations
- ${(risks ?? []).length} risks logged

Insights: ${JSON.stringify((insights ?? []).slice(0, 15))}
Market: ${JSON.stringify((market ?? []).slice(0, 10))}
Outcomes: ${JSON.stringify(outcomes)}

Return only the JSON. No prose around it.`

    try {
      const res = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (res.ok) {
        const j: any = await res.json()
        const content = (j?.choices?.[0]?.message?.content ?? '').trim()
        const match = content.match(/\{[\s\S]*\}/)
        if (match) {
          const parsed = JSON.parse(match[0])
          summary = parsed.summary ?? ''
          portfolioPatterns = parsed.portfolio_patterns ?? []
          recommendedActions = parsed.recommended_actions ?? []
        } else {
          summary = content
        }
      }
    } catch (e) {
      console.error('weekly brief ai err', e)
    }
  }

  // Store firm-level insight
  await supabase.from('intelligence_insights').insert({
    engagement_id: null,
    insight_type: 'systemic_issue',
    title: `Weekly brief — ${weekLabel}`,
    body: summary || 'Weekly intelligence digest',
    severity: 'info',
    confidence_score: 0.9,
    supporting_data: {
      insight_count: totalInsights,
      market_count: market?.length ?? 0,
      outcome_count: outcomes?.length ?? 0,
      portfolio_patterns: portfolioPatterns,
      recommended_actions: recommendedActions,
    },
  })

  // Fan out emails to leadership
  const { data: leaders } = await supabase
    .from('engagement_members')
    .select('user_id, display_name, role')
    .in('role', LEADERSHIP_ROLES)
    .not('user_id', 'is', null)

  const seenUsers = new Set<string>()
  const recipients: Array<{ email: string; name: string }> = []
  for (const m of leaders ?? []) {
    if (!m.user_id || seenUsers.has(m.user_id)) continue
    seenUsers.add(m.user_id)
    const { data: u } = await supabase.auth.admin.getUserById(m.user_id)
    const email = u?.user?.email
    if (email) recipients.push({ email, name: m.display_name?.split(' ')[0] || 'Team' })
  }

  let queued = 0
  for (const r of recipients) {
    const { data: suppressed } = await supabase
      .from('suppressed_emails')
      .select('email')
      .eq('email', r.email.toLowerCase())
      .maybeSingle()
    if (suppressed) continue

    const props: WeeklyBriefProps = {
      recipientName: r.name,
      weekLabel,
      summary,
      portfolioPatterns,
      competitorSignals,
      recommendedActions,
      insightAccuracy,
      appUrl: APP_URL,
    }
    const element = React.createElement(WeeklyBrief, props)
    const html = await renderAsync(element)
    const text = await renderAsync(element, { plainText: true })
    const messageId = crypto.randomUUID()
    const subject = `[Athena] Weekly brief — ${weekLabel}`

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'weekly-brief',
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
        text,
        purpose: 'transactional',
        label: 'weekly-brief',
        idempotency_key: `weekly-${r.email}-${new Date().toISOString().slice(0, 10)}`,
        queued_at: new Date().toISOString(),
      },
    })
    if (enqErr) console.error('Failed to enqueue weekly brief', enqErr)
    else queued++
  }

  return Response.json({ ok: true, queued, recipients: recipients.length })
}
