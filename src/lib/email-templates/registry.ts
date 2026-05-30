import type { ComponentType } from 'react'
import { template as dailyDigestTemplate } from './daily-digest'
import { template as engagementInviteTemplate } from './engagement-invite'
import { template as weeklyBriefTemplate } from './weekly-brief'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'daily-digest': dailyDigestTemplate,
  'engagement-invite': engagementInviteTemplate,
  'weekly-brief': weeklyBriefTemplate,
}
