import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  missionName?: string
  role?: string
  engagementLeadName?: string
  expectedStartDate?: string
  acceptUrl?: string
}

const MissionInviteEmail = ({
  recipientName = 'there',
  missionName = 'your pursuit',
  role = 'Team Member',
  engagementLeadName = 'Your Engagement Lead',
  expectedStartDate = 'TBD',
  acceptUrl = 'https://athenacommandcenter.com/onboarding',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Mission Awaits — {missionName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>ATHENA STRATEGY COMMAND</Text>
        </Section>

        <Heading style={h1}>Your Mission Awaits</Heading>
        <Text style={subhead}>{missionName}</Text>

        <Text style={greeting}>Hi {recipientName},</Text>

        <Text style={paragraph}>
          You've been selected to join the <strong>{missionName}</strong> pursuit
          team at Athena Strategy Command.
        </Text>

        <Section style={detailBox}>
          <Text style={detailRow}>
            <span style={detailLabel}>Your Role:</span> {role}
          </Text>
          <Text style={detailRow}>
            <span style={detailLabel}>Engagement Lead:</span> {engagementLeadName}
          </Text>
          <Text style={detailRow}>
            <span style={detailLabel}>Expected Start:</span> {expectedStartDate}
          </Text>
        </Section>

        <Text style={paragraph}>
          <strong>Atlas</strong> is the operational command platform where your
          team coordinates, strategizes, and executes this pursuit.{' '}
          <strong>IRIS</strong> — Athena's intelligence engine — will brief you,
          flag what matters, and keep the mission moving.
        </Text>

        <Section style={ctaWrap}>
          <Button href={acceptUrl} style={ctaButton}>
            CREATE YOUR ACCOUNT →
          </Button>
        </Section>

        <Text style={fineprint}>
          This link expires in 72 hours. If you have questions, contact your
          Engagement Lead directly.
        </Text>

        <Hr style={divider} />

        <Text style={signoff}>— Athena Strategy Command</Text>

        <Text style={footer}>
          This invitation was sent by Athena Strategy Command. If you were not
          expecting this email, you may disregard it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: MissionInviteEmail,
  subject: (data: Record<string, any>) =>
    `Your Mission Awaits — ${data?.missionName ?? 'Athena Strategy Command'}`,
  displayName: 'Mission Invitation',
  previewData: {
    recipientName: 'Alex Carter',
    missionName: 'NJ CSOC Cyber Defense Modernization',
    role: 'Lead Writer',
    engagementLeadName: 'Jordan Reyes',
    expectedStartDate: 'June 15, 2026',
    acceptUrl: 'https://athenacommandcenter.com/onboarding?token=preview',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px 48px',
  backgroundColor: '#0B0F14',
  color: '#E6E9EE',
  borderRadius: '4px',
}
const brandBar = { padding: '0 0 24px', borderBottom: '1px solid rgba(201,146,42,0.25)' }
const brandText = {
  margin: 0,
  color: '#C9922A',
  letterSpacing: '0.28em',
  fontSize: '11px',
  fontWeight: 700,
}
const h1 = {
  marginTop: '32px',
  marginBottom: '6px',
  fontSize: '28px',
  lineHeight: '1.2',
  color: '#FFFFFF',
  fontWeight: 600,
}
const subhead = {
  marginTop: 0,
  marginBottom: '24px',
  fontSize: '15px',
  color: '#C9922A',
  letterSpacing: '0.04em',
}
const greeting = { fontSize: '15px', color: '#E6E9EE', marginBottom: '16px' }
const paragraph = { fontSize: '14px', lineHeight: '1.65', color: '#C3C8D1' }
const detailBox = {
  margin: '24px 0',
  padding: '18px 20px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '4px',
}
const detailRow = { margin: '6px 0', fontSize: '14px', color: '#E6E9EE' }
const detailLabel = {
  display: 'inline-block',
  minWidth: '140px',
  color: '#9CA3AF',
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
}
const ctaWrap = { textAlign: 'center' as const, margin: '32px 0 16px' }
const ctaButton = {
  backgroundColor: '#C9922A',
  color: '#0B0F14',
  padding: '14px 32px',
  borderRadius: '3px',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.22em',
  textDecoration: 'none',
  display: 'inline-block',
}
const fineprint = {
  fontSize: '12px',
  color: '#9CA3AF',
  textAlign: 'center' as const,
  marginTop: '8px',
}
const divider = { borderColor: 'rgba(255,255,255,0.1)', margin: '32px 0 20px' }
const signoff = { fontSize: '13px', color: '#C3C8D1', fontStyle: 'italic' as const }
const footer = {
  fontSize: '11px',
  color: '#6B7280',
  marginTop: '20px',
  lineHeight: '1.55',
}
