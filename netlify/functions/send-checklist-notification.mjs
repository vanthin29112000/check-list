import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { buildChecklistPdfBase64 } from './buildChecklistPdf.mjs'

function initAdmin() {
  if (getApps().length > 0) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) {
    throw new Error(
      'Thiếu FIREBASE_SERVICE_ACCOUNT_JSON. Dán JSON service account (một dòng) vào file .env ở gốc repo (local) hoặc Netlify → Environment variables (production). Firebase Console → Project settings → Service accounts → Generate new private key.',
    )
  }
  try {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON không hợp lệ (JSON lỗi): ${m}`)
  }
}

function parseOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** @param {string | undefined} requestOrigin */
function corsHeaders(requestOrigin) {
  const allowed = parseOrigins()
  const o = (requestOrigin || '').trim()
  const allow = allowed.includes(o) ? o : o || allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function splitEmails(raw) {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatDdMmYyyy(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y) return ymd
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function buildEmailBody(data, approveUrl) {
  const details = Array.isArray(data.details) ? data.details : []
  const failures = details.filter((x) => !x.passed)
  const lines = [
    `Người check: ${data.submitterName} <${data.submitterEmail}>`,
    `Checklist: ${data.checklistTitle} (${data.checklistKey})`,
    `Ngày kiểm tra: ${formatDdMmYyyy(String(data.checkDate || ''))}`,
    `Tổng lỗi: ${Number(data.totalErrors ?? 0)}`,
    '',
    'Danh sách lỗi (Không đạt):',
  ]
  if (failures.length === 0) lines.push('(Không có)')
  else {
    for (const f of failures) {
      const note = f.note ? ` — Ghi chú: ${f.note}` : ''
      lines.push(`- [${f.groupTitle}] ${f.label}: ${f.standard}${note}`)
    }
  }
  lines.push('', `Link duyệt checklist:`, approveUrl)
  return lines.join('\n')
}

export const handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || ''
  const headers = corsHeaders(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    initAdmin()

    const authHeader = event.headers.authorization || event.headers.Authorization
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : ''
    if (!bearer) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Thiếu Authorization Bearer (Firebase ID token).' }) }
    }

    await getAuth().verifyIdToken(bearer)

    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON không hợp lệ' }) }
    }

    const resultId = typeof body.resultId === 'string' ? body.resultId.trim() : ''
    if (!resultId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Thiếu resultId' }) }
    }

    const snap = await getFirestore().collection('checklistResults').doc(resultId).get()
    if (!snap.exists) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Không tìm thấy checklist' }) }
    }

    const data = snap.data()
    if (!data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Không tìm thấy checklist' }) }
    }
    const resendKey = process.env.RESEND_API_KEY?.trim()
    if (!resendKey) {
      return { statusCode: 501, headers, body: JSON.stringify({ error: 'Chưa cấu hình RESEND_API_KEY trên Netlify' }) }
    }

    const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
    if (!publicBase) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            'Thiếu PUBLIC_BASE_URL (ví dụ http://localhost:8888 khi netlify dev, hoặc https://<site>.netlify.app trên production).',
        }),
      }
    }

    const approvalToken = String(data.approvalToken || '')
    const approveUrl = `${publicBase}/approve?token=${encodeURIComponent(approvalToken)}`
    const textBody = buildEmailBody(data, approveUrl)
    const subject = `[Checklist] ${data.checklistTitle} — ${Number(data.totalErrors ?? 0)} lỗi — ${data.submitterName}`

    const from = process.env.RESEND_FROM?.trim() || 'onboarding@resend.dev'
    const toSubmitter = String(data.submitterEmail || '').trim()
    const managers = splitEmails(process.env.MANAGER_EMAILS)
    const threshold = Number(process.env.ERROR_THRESHOLD ?? '5')
    const totalErrors = Number(data.totalErrors ?? 0)
    const submitterLower = toSubmitter.toLowerCase()

    if (!toSubmitter && managers.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Không có địa chỉ email người gửi hoặc quản lý' }) }
    }

    /** Chưa verify domain trên Resend: API chỉ cho gửi tới inbox tài khoản. Đặt RESEND_SANDBOX_FORWARD_TO = email đó → mọi thư gửi tới đây, nội dung ghi người nhận thật. */
    const sandboxForward = process.env.RESEND_SANDBOX_FORWARD_TO?.trim()

    /** PDF checklist (cùng layout Firebase Functions cũ); lỗi tạo PDF → vẫn gửi mail text. */
    let pdfAttachments = null
    try {
      const { base64, fileName } = await buildChecklistPdfBase64(data)
      pdfAttachments = [{ filename: fileName, content: base64 }]
    } catch (pdfErr) {
      // eslint-disable-next-line no-console
      console.error('buildChecklistPdfBase64', pdfErr)
    }

    const sendOne = async (intendedTo, subj, txt, attachments = pdfAttachments) => {
      const forward = sandboxForward && sandboxForward.toLowerCase() !== intendedTo.toLowerCase()
      const to = forward ? sandboxForward : intendedTo
      const subjectOut = forward ? `[Gửi hộ → ${intendedTo}] ${subj}` : subj
      const textOut = forward
        ? [
            '— Chế độ sandbox Resend (chưa có domain): thư chỉ tới inbox được phép.',
            `Người nhận dự kiến: ${intendedTo}`,
            '─'.repeat(48),
            '',
            txt,
          ].join('\n')
        : txt
      const payload = { from, to: [to], subject: subjectOut, text: textOut }
      if (attachments?.length) {
        payload.attachments = attachments
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const raw = await res.text()
      if (!res.ok) {
        throw new Error(`Resend ${res.status}: ${raw}`)
      }
    }

    if (toSubmitter) {
      await sendOne(toSubmitter, subject, textBody)
    }

    for (const mgr of managers) {
      if (toSubmitter && mgr.toLowerCase() === submitterLower) continue
      const alert = totalErrors > threshold
      const subj = alert
        ? `[CẢNH BÁO] ${data.checklistTitle} — ${totalErrors} lỗi`
        : `[DUYỆT] ${data.checklistTitle} — ${data.submitterName}`
      const bodyWithAlert = alert
        ? `Cảnh báo: checklist vượt ngưỡng lỗi (${threshold}).\n\n${textBody}`
        : textBody
      try {
        await sendOne(mgr, subj, bodyWithAlert)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Resend manager mail failed', mgr, e)
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('send-checklist-notification', e)
    return { statusCode: 500, headers: corsHeaders(origin), body: JSON.stringify({ error: msg }) }
  }
}
