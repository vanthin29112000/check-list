import { corsHeaders, checkSharedSecret, findResultByToken, getAdminDb, mapResultToVm, verifyManagerIdToken } from './firebase-admin-shared.mjs'

function buildApprovalLink(token) {
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:8888').replace(/\/$/, '')
  return `${base}/approve?token=${encodeURIComponent(token)}`
}

function mapSubmissionRow(id, data, token) {
  const mapped = mapResultToVm(id, data)
  return {
    id,
    checklistKey: mapped.checklistKey,
    checklistTitle: mapped.checklistTitle,
    submitterName: mapped.submitterName,
    submitterEmail: mapped.submitterEmail,
    checkDate: mapped.checkDate,
    totalErrors: mapped.totalErrors,
    createdAtUtc: data.createdAtUtc?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    isApproved: mapped.isApproved,
    approvedAtUtc: data.approvedAtUtc?.toDate?.()?.toISOString?.() ?? null,
    approvalLink: buildApprovalLink(token),
    approvalToken: token,
    status: mapped.status,
    rejectionReason: mapped.rejectionReason,
    approvedByEmail: mapped.approvedByEmail,
    approvedByName: mapped.approvedByName,
    clDocSerial: data.clDocSerial,
    details: mapped.details,
  }
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin
  const headers = corsHeaders(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!checkSharedSecret(event.headers)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Thiếu token' }) }
  }

  const auth = await verifyManagerIdToken(event.headers)
  if (!auth.ok) {
    return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: auth.error }) }
  }

  try {
    const db = getAdminDb()
    const found = await findResultByToken(db, token)
    if (!found) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Không tìm thấy checklist.' }),
      }
    }

    const submission = mapSubmissionRow(found.id, found.data, token)
    const approvedAtText = submission.approvedAtUtc
      ? new Date(submission.approvedAtUtc).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })
      : ''

    if (submission.status === 'rejected') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: submission.rejectionReason
            ? `Checklist đã bị từ chối: ${submission.rejectionReason}`
            : 'Checklist đã bị từ chối.',
          checklistTitle: submission.checklistTitle,
          submitterName: submission.submitterName,
          approverName: submission.approvedByName ?? '',
          approvedAtText,
          totalItems: submission.details.length,
          failedItems: submission.totalErrors,
          resultId: submission.id,
          alreadyApproved: false,
          submission,
        }),
      }
    }

    if (submission.isApproved) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Checklist đã được duyệt lúc ${approvedAtText}.`,
          checklistTitle: submission.checklistTitle,
          submitterName: submission.submitterName,
          approverName: submission.approvedByName ?? '—',
          approvedAtText,
          totalItems: submission.details.length,
          failedItems: submission.totalErrors,
          resultId: submission.id,
          alreadyApproved: true,
          submission,
        }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Xem trước checklist trước khi duyệt.',
        checklistTitle: submission.checklistTitle,
        submitterName: submission.submitterName,
        approverName: '',
        approvedAtText: '',
        totalItems: submission.details.length,
        failedItems: submission.totalErrors,
        resultId: submission.id,
        alreadyApproved: false,
        submission,
      }),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) }
  }
}
