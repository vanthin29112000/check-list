import type { ApprovePageVm } from './checklistFirestore'
import { netlifyFunctionUrl } from './notifyResend'

async function postJson<T>(
  functionName: string,
  body: Record<string, unknown>,
  idToken?: string | null,
): Promise<T> {
  const url = netlifyFunctionUrl(functionName)
  if (!url) throw new Error('Chưa có URL function.')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const secret = import.meta.env.VITE_NOTIFY_SHARED_SECRET?.trim()
  if (secret) headers.Authorization = `Bearer ${secret}`
  if (idToken) headers['X-Firebase-Id-Token'] = idToken
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!res.ok) throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
  return data
}

export async function requestPreviewByToken(token: string, idToken?: string | null): Promise<ApprovePageVm> {
  return postJson<ApprovePageVm>('checklist-preview-by-token', { token: token.trim() }, idToken)
}

export async function requestApproveChecklist(
  token: string,
  approver?: { email?: string | null; name?: string | null; idToken?: string | null },
): Promise<ApprovePageVm> {
  const url = netlifyFunctionUrl('approve-checklist')
  if (!url) {
    throw new Error('Chưa có URL function duyệt checklist.')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const secret = import.meta.env.VITE_NOTIFY_SHARED_SECRET?.trim()
  if (secret) headers.Authorization = `Bearer ${secret}`
  if (approver?.idToken) headers['X-Firebase-Id-Token'] = approver.idToken

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token: token.trim(),
      approverEmail: approver?.email?.trim() || null,
      approverName: approver?.name?.trim() || null,
    }),
  })

  const data = (await res.json().catch(() => ({}))) as ApprovePageVm & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`)
  }
  return data
}
