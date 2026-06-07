import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface RecoveryEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  recoveryUrl: string
}

export const RecoveryEmail = ({ recoveryUrl }: RecoveryEmailProps) => (
  <AthenaShell
    preview="Reset your password for Athena Strategy Command"
    heading="Reset your password"
    subhead="Athena Strategy Command"
    intro="We received a request to reset the password on your Athena account."
    bodyText="Click the button below to choose a new password. This link expires shortly for your security."
    ctaLabel="RESET PASSWORD"
    ctaUrl={recoveryUrl}
    fineprint="If you did not request a password reset, you can safely disregard this email."
  />
)

export default RecoveryEmail
