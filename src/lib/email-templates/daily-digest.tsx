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

export interface DailyDigestProps {
  recipientName?: string
  engagementName?: string
  client?: string
  dateLabel?: string
  daysToSubmission?: number | null
  summary?: string
  overnightHuddles?: number
  redSections?: string[]
  yellowSections?: string[]
  newRisks?: Array<{ title: string; severity: string; owner?: string | null }>
  openSos?: Array<{ category: string; severity: string; description: string }>
  appUrl?: string
}

const COLORS = {
  bg: '#ffffff',
  card: '#0b1220',
  text: '#0b1220',
  muted: '#475569',
  border: '#e2e8f0',
  red: '#dc2626',
  amber: '#d97706',
  accent: '#1e3a8a',
}

export function DailyDigest({
  recipientName = 'Team',
  engagementName = 'Engagement',
  client = '',
  dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  daysToSubmission = null,
  summary = '',
  overnightHuddles = 0,
  redSections = [],
  yellowSections = [],
  newRisks = [],
  openSos = [],
  appUrl = 'https://athenacommandcenter.com',
}: DailyDigestProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${engagementName} — Athena daily brief for ${dateLabel}`}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', color: COLORS.text, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
          <Section>
            <Text style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: COLORS.muted, margin: 0 }}>
              Athena Command Center
            </Text>
            <Heading style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0' }}>
              Daily Brief — {dateLabel}
            </Heading>
            <Text style={{ fontSize: 14, color: COLORS.muted, margin: '4px 0 0' }}>
              {engagementName}{client ? ` · ${client}` : ''}
              {typeof daysToSubmission === 'number' ? ` · T-${daysToSubmission} days to submission` : ''}
            </Text>
          </Section>

          <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />

          <Section>
            <Text style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
              Good morning, {recipientName}.
            </Text>
            {summary ? (
              <Text style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-wrap', margin: 0 }}>
                {summary}
              </Text>
            ) : (
              <Text style={{ fontSize: 14, color: COLORS.muted, margin: 0 }}>
                Nothing material overnight. War room is quiet.
              </Text>
            )}
          </Section>

          <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />

          <Section>
            <Heading as="h2" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.muted, margin: '0 0 12px' }}>
              At a glance
            </Heading>
            <Text style={{ fontSize: 14, margin: '0 0 6px' }}>
              <strong>{overnightHuddles}</strong> overnight huddle{overnightHuddles === 1 ? '' : 's'}
            </Text>
            <Text style={{ fontSize: 14, margin: '0 0 6px', color: redSections.length ? COLORS.red : COLORS.text }}>
              <strong>{redSections.length}</strong> red section{redSections.length === 1 ? '' : 's'}{redSections.length ? `: ${redSections.join(', ')}` : ''}
            </Text>
            <Text style={{ fontSize: 14, margin: '0 0 6px', color: yellowSections.length ? COLORS.amber : COLORS.text }}>
              <strong>{yellowSections.length}</strong> yellow section{yellowSections.length === 1 ? '' : 's'}{yellowSections.length ? `: ${yellowSections.join(', ')}` : ''}
            </Text>
            <Text style={{ fontSize: 14, margin: '0 0 6px' }}>
              <strong>{newRisks.length}</strong> new risk{newRisks.length === 1 ? '' : 's'} in last 24h
            </Text>
            <Text style={{ fontSize: 14, margin: 0, color: openSos.length ? COLORS.red : COLORS.text }}>
              <strong>{openSos.length}</strong> open escalation{openSos.length === 1 ? '' : 's'}
            </Text>
          </Section>

          {openSos.length > 0 && (
            <>
              <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
              <Section>
                <Heading as="h2" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.red, margin: '0 0 12px' }}>
                  SOS — needs leadership
                </Heading>
                {openSos.map((s, i) => (
                  <Text key={i} style={{ fontSize: 13, margin: '0 0 8px', lineHeight: '20px' }}>
                    <strong>[{s.severity}] {s.category}</strong> — {s.description}
                  </Text>
                ))}
              </Section>
            </>
          )}

          {newRisks.length > 0 && (
            <>
              <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />
              <Section>
                <Heading as="h2" style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: COLORS.muted, margin: '0 0 12px' }}>
                  New risks
                </Heading>
                {newRisks.map((r, i) => (
                  <Text key={i} style={{ fontSize: 13, margin: '0 0 6px' }}>
                    <strong>[{r.severity}]</strong> {r.title}{r.owner ? ` — ${r.owner}` : ''}
                  </Text>
                ))}
              </Section>
            </>
          )}

          <Hr style={{ borderColor: COLORS.border, margin: '24px 0' }} />

          <Section>
            <Text style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>
              Open the war room: <a href={appUrl} style={{ color: COLORS.accent }}>{appUrl}</a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: DailyDigest,
  subject: (data: Record<string, any>) =>
    `[Athena] ${data.engagementName || 'Daily brief'} — ${data.dateLabel || 'Daily brief'}`,
  displayName: 'Daily Digest',
  previewData: {
    recipientName: 'Drew',
    engagementName: 'Indiana Medicaid Pursuit',
    client: 'Indiana FSSA',
    dateLabel: 'Friday, May 29',
    daysToSubmission: 14,
    summary:
      'Two huddles overnight. LTSS slipped to red — staffing gap flagged by Maria. Quality remains yellow. One new severe risk on care management. No open escalations.',
    overnightHuddles: 2,
    redSections: ['LTSS'],
    yellowSections: ['Quality', 'Operations'],
    newRisks: [{ title: 'Care management ratio below target', severity: 'High', owner: 'Maria' }],
    openSos: [],
  },
}
