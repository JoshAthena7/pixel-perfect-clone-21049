import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  inviteUrl: string
}

export const InviteEmail = ({ inviteUrl }: InviteEmailProps) => (
  <AthenaShell
    preview="You have been invited to Athena Strategy Command"
    heading="You've been invited"
    subhead="Athena Strategy Command"
    intro="You have been invited to join Athena Strategy Command."
    bodyText="Accept the invitation to create your account and begin onboarding into Atlas, the operational platform where your mission team coordinates and executes."
    ctaLabel="ACCEPT INVITATION"
    ctaUrl={inviteUrl}
    fineprint="This invitation expires in 72 hours. If you were not expecting it, you may disregard this email."
  />
)

export default InviteEmail
