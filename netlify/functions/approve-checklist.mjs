import { corsHeaders, checkSharedSecret, findResultByToken, getAdminDb, mapResultToVm, verifyManagerIdToken, writeServerAudit } from './firebase-admin-shared.mjs'
import { FieldValue } from 'firebase-admin/firestore'

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
    return { statusCode: 403, headers, body: JSON.stringify({ error: auth.error }) }
  }

  try {
    const db = getAdminDb()
    const found = await findResultByToken(db, token)
    if (!found) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Không tìm thấy checklist cần duyệt.' }),
      }
    }

    const { id, ref, data } = found
    const mapped = mapResultToVm(id, data)
    const approverName = (body.approverName || auth.name || auth.email || 'Người duyệt').trim()
    const approverEmail = body.approverEmail?.trim() || auth.email || null

    if (data.status === 'rejected') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: data.rejectionReason ? `Checklist đã bị từ chối: ${data.rejectionReason}` : 'Checklist đã bị từ chối.',
          checklistTitle: mapped.checklistTitle,
          submitterName: mapped.submitterName,
          approverName: data.approvedByName ?? '',
          approvedAtText: '',
          totalItems: mapped.details.length,
          failedItems: mapped.totalErrors,
          resultId: id,
          alreadyApproved: false,
        }),
      }
    }

    if (data.isApproved) {
      const t = data.approvedAtUtc?.toDate?.() ?? null
      const approvedAtText = t
        ? t.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })
        : ''
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Checklist đã được duyệt lúc ${approvedAtText}.`,
          checklistTitle: mapped.checklistTitle,
          submitterName: mapped.submitterName,
          approverName: data.approvedByName ?? approverName,
          approvedAtText,
          totalItems: mapped.details.length,
          failedItems: mapped.totalErrors,
          resultId: id,
          alreadyApproved: true,
        }),
      }
    }

    await ref.update({
      isApproved: true,
      status: 'approved',
      approvedAtUtc: FieldValue.serverTimestamp(),
      approvedByEmail: approverEmail,
      approvedByName: approverName,
    })

    await writeServerAudit(db, 'approve', { resultId: id, token, approverEmail })

    const approvedAt = new Date()
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Đã duyệt checklist ${mapped.checklistTitle} của ${mapped.submitterName}.`,
        checklistTitle: mapped.checklistTitle,
        submitterName: mapped.submitterName,
        approverName,
        approvedAtText: approvedAt.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
        totalItems: mapped.details.length,
        failedItems: mapped.totalErrors,
        resultId: id,
        alreadyApproved: true,
      }),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) }
  }
}
