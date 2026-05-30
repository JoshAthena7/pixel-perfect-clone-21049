import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import * as React from 'react'
import type { TemplateEntry } from './registry'

export interface WeeklyBriefProps {
  recipientName?: string
  weekLabel?: string
  summary?: string
  portfolioPatterns?: string[]
  competitorSignals?: Array<{ title: string; summary?: string | null }>
  recommendedActions?: string[]
  insightAccuracy?: number | null
  appUrl?: string
}

const COLORS = {
  bg: '#ffffff',
  header: '#1B3B72',
  gold: '#C49A2A',
  text: '#0b1220',
  muted: '#475569',
  border: '#e2e8f0',
  accent: '#1B3B72',
}

export function WeeklyBrief({
  recipientName = 'Team',
  weekLabel = 'this week',
  summary = '',
  portfolioPatterns = [],
  competitorSignals = [],
  recommendedActions = [],
  insightAccuracy = null,
  appUrl = 'https://athenacommandcenter.com',
}: WeeklyBriefProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Athena weekly intelligence brief — ${weekLabel}`}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', color: COLORS.text, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Dark header with gold accent */}
          <Section style={{ backgroundColor: COLORS.header, padding: '28px 24px', borderTop: `3px solid ${COLORS.gold}` }}>
            <Text style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.gold, margin: 0 }}>
              Athena Command™ · Weekly Briefing
            </Text>
            <Heading style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '6px 0 0' }}>
              {weekLabel}
            </Heading>
          </Section>

          <Container style={{ padding: '24px' }}>
            <Section>
              <Text style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
                {recipientName},
              </Text>
              {summary ? (
                <Text style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {summary}
                </Text>
              ) : (
                <Text style={{ fontSize: 14, color: COLORS.muted, margin: 0 }}>
                  Quiet week. No notable portfolio movement.
                </Text>
              )}
            </Section>

            {portfolioPatterns.length > 0 && (
              <>
                <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
                <Section>
                  <Heading as="h2" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: COLORS.gold, margin: '0 0 10px' }}>
                    Portfolio patterns
                  </Heading>
                  {portfolioPatterns.map((p, i) => (
                    <Text key={i} style={{ fontSize: 13, margin: '0 0 6px', lineHeight: '20px' }}>
                      • {p}
                    </Text>
                  ))}
                </Section>
              </>
            )}

            {competitorSignals.length > 0 && (
              <>
                <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
                <Section>
                  <Heading as="h2" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: COLORS.gold, margin: '0 0 10px' }}>
                    Competitor signals
                  </Heading>
                  {competitorSignals.map((c, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{c.title}</Text>
                      {c.summary && (
                        <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>{c.summary}</Text>
                      )}
                    </div>
                  ))}
                </Section>
              </>
            )}

            {recommendedActions.length > 0 && (
              <>
                <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
                <Section>
                  <Heading as="h2" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: COLORS.gold, margin: '0 0 10px' }}>
                    Recommended actions
                  </Heading>
                  {recommendedActions.map((a, i) => (
                    <Text key={i} style={{ fontSize: 13, margin: '0 0 6px', lineHeight: '20px' }}>
                      {i + 1}. {a}
                    </Text>
                  ))}
                </Section>
              </>
            )}

            {typeof insightAccuracy === 'number' && (
              <>
                <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
                <Section>
                  <Text style={{ fontSize: 12, color: COLORS.muted, margin: 0 }}>
                    Athena insight accuracy (rolling 30 days): <strong style={{ color: COLORS.text }}>{Math.round(insightAccuracy * 100)}%</strong>
                  </Text>
                </Section>
              </>
            )}

            <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
            <Section>
              <Text style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>
                Open the Mission: <a href={appUrl} style={{ color: COLORS.accent }}>{appUrl}</a>
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.muted, margin: '12px 0 0', letterSpacing: 1 }}>
                Athena Strategy Group · Powered by Athena Command™
              </Text>
            </Section>
          </Container>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: WeeklyBrief,
  subject: (data: Record<string, any>) =>
    `[Athena] Weekly intelligence brief — ${data.weekLabel || 'this week'}`,
  displayName: 'Weekly Brief',
  previewData: {
    recipientName: 'Drew',
    weekLabel: 'Week of May 26',
    summary: 'Three engagements crossed into yellow. Two new SAM.gov solicitations match active pursuits. Win-rate trend stable at 41% over rolling 90 days.',
    portfolioPatterns: [
      'LTSS appears as a red section in 3 of 5 active engagements.',
      'Average response time on escalations dropped from 4h to 1.5h.',
    ],
    competitorSignals: [
      { title: 'Maximus awarded $42M Indiana managed care extension', summary: 'Renewed incumbent — slow displacement window.' },
    ],
    recommendedActions: [
      'Standardize LTSS staffing narrative across active pursuits.',
      'Brief team on Maximus extension and how it shapes Indiana strategy.',
      'Backfill content library with last week\'s 3 approved sections.',
    ],
    insightAccuracy: 0.74,
  },
}
