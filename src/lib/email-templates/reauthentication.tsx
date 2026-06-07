import * as React from 'react'
import { AthenaShell } from './_athena-shell'

interface ReauthenticationEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <AthenaShell
    preview="Your Athena verification code"
    heading="Your verification code"
    subhead="Confirm a sensitive action"
    intro="Use the code below to confirm your identity in Atlas."
    codeValue={token}
    bodyText="This code expires shortly. Do not share it with anyone."
    fineprint="If you did not request this code, contact your Engagement Lead immediately."
  />
)

export default ReauthenticationEmail
