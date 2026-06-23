import type { EmailRecipientRow } from './types'
import { netlifyFunctionUrl } from './notifyResend'

export interface EmailConfigFromEnvResponse {
  leaders: EmailRecipientRow[]
  hrStaff: EmailRecipientRow[]
}

export async function fetchEmailConfigFromEnv(): Promise<EmailConfigFromEnvResponse> {
  const url = netlifyFunctionUrl('email-config-from-env')
  if (!url) throw new Error('Chưa có URL function. Chạy npm run dev từ gốc repo.')
  const res = await fetch(url, { method: 'GET' })
  const data = (await res.json().catch(() => ({}))) as EmailConfigFromEnvResponse & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return {
    leaders: data.leaders ?? [],
    hrStaff: data.hrStaff ?? [],
  }
}
