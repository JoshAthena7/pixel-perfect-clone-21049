import * as React from 'react'
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

interface AthenaShellProps {
  preview: string
  heading: string
  subhead?: string
  intro?: React.ReactNode
  bodyText?: React.ReactNode
  ctaLabel?: string
  ctaUrl?: string
  codeValue?: string
  fineprint?: string
  footer?: string
}

export const AthenaShell = ({
  preview,
  heading,
  subhead,
  intro,
  bodyText,
  ctaLabel,
  ctaUrl,
  codeValue,
  fineprint = 'If you did not request this, you can safely disregard this email.',
  footer = 'This message was sent by Athena Strategy Command.',
}: AthenaShellProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>ATHENA STRATEGY COMMAND</Text>
        </Section>

        <Heading style={h1}>{heading}</Heading>
        {subhead ? <Text style={subheadStyle}>{subhead}</Text> : null}

        {intro ? <Text style={greeting}>{intro}</Text> : null}
        {bodyText ? <Text style={paragraph}>{bodyText}</Text> : null}

        {codeValue ? (
          <Section style={codeWrap}>
            <Text style={codeText}>{codeValue}</Text>
          </Section>
        ) : null}

        {ctaLabel && ctaUrl ? (
          <Section style={ctaWrap}>
            <Button href={ctaUrl} style={ctaButton}>
              {ctaLabel} →
            </Button>
          </Section>
        ) : null}

        <Text style={fineprintStyle}>{fineprint}</Text>

        <Hr style={divider} />
        <Text style={signoff}>— Athena Strategy Command</Text>
        <Text style={footerStyle}>{footer}</Text>
      </Container>
    </Body>
  </Html>
)

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
const brandBar = {
  padding: '0 0 24px',
  borderBottom: '1px solid rgba(201,146,42,0.25)',
}
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
  fontSize: '26px',
  lineHeight: '1.2',
  color: '#FFFFFF',
  fontWeight: 600,
}
const subheadStyle = {
  marginTop: 0,
  marginBottom: '24px',
  fontSize: '14px',
  color: '#C9922A',
  letterSpacing: '0.04em',
}
const greeting = { fontSize: '15px', color: '#E6E9EE', marginBottom: '16px' }
const paragraph = { fontSize: '14px', lineHeight: '1.65', color: '#C3C8D1' }
const codeWrap = {
  margin: '24px 0',
  padding: '20px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(201,146,42,0.25)',
  borderRadius: '4px',
  textAlign: 'center' as const,
}
const codeText = {
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '28px',
  letterSpacing: '0.4em',
  color: '#C9922A',
  fontWeight: 700,
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
const fineprintStyle = {
  fontSize: '12px',
  color: '#9CA3AF',
  textAlign: 'center' as const,
  marginTop: '8px',
}
const divider = { borderColor: 'rgba(255,255,255,0.1)', margin: '32px 0 20px' }
const signoff = {
  fontSize: '13px',
  color: '#C3C8D1',
  fontStyle: 'italic' as const,
}
const footerStyle = {
  fontSize: '11px',
  color: '#6B7280',
  marginTop: '20px',
  lineHeight: '1.55',
}
