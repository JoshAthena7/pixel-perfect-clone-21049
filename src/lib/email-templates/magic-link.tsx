import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface MagicLinkEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  magicLinkUrl: string
}

export const MagicLinkEmail = ({ magicLinkUrl }: MagicLinkEmailProps) => (
  <AthenaShell
    preview="Your secure sign-in link for Athena Strategy Command"
    heading="Your sign-in link"
    subhead="Secure access to Atlas"
    intro="Use the link below to sign in to Athena Strategy Command."
    bodyText="This link is single-use and expires shortly for your security."
    ctaLabel="SIGN IN TO ATLAS"
    ctaUrl={magicLinkUrl}
    fineprint="If you did not request this sign-in link, you can safely disregard this email."
  />
)

export default MagicLinkEmail
