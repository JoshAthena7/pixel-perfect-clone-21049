import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ confirmationUrl }: SignupEmailProps) => (
  <AthenaShell
    preview="Confirm your email for Athena Strategy Command"
    heading="Confirm your email"
    subhead="One step from mission readiness"
    intro="Welcome to Athena Strategy Command."
    bodyText="Please confirm your email address to activate your access to Atlas — the operational command platform for your pursuit team."
    ctaLabel="CONFIRM EMAIL"
    ctaUrl={confirmationUrl}
    fineprint="If you did not create an Athena account, you can safely disregard this email."
  />
)

export default SignupEmail
