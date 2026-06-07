import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface EmailChangeEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  newEmail?: string
}

export const EmailChangeEmail = ({
  confirmationUrl,
  newEmail,
}: EmailChangeEmailProps) => (
  <AthenaShell
    preview="Confirm your new email for Athena Strategy Command"
    heading="Confirm your new email"
    subhead="Athena Strategy Command"
    intro="A request was made to change the email on your Athena account."
    bodyText={
      newEmail
        ? `Confirm the change to ${newEmail} by clicking below.`
        : 'Confirm the new email address by clicking below.'
    }
    ctaLabel="CONFIRM NEW EMAIL"
    ctaUrl={confirmationUrl}
    fineprint="If you did not request this change, contact your Engagement Lead immediately."
  />
)

export default EmailChangeEmail
