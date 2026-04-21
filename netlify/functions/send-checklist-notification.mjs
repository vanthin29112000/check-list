import nodemailer from 'nodemailer'
import { buildChecklistPdfBase64 } from './buildChecklistPdf.mjs'

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

function collectNotificationRecipients() {
  const raw = [
    ...splitEmails(process.env.LEADER_EMAILS),
    ...splitEmails(process.env.HR_EMAILS),
    ...splitEmails(process.env.MANAGER_EMAILS),
  ]
  const seen = new Set()
  const out = []
  for (const e of raw) {
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

function formatDdMmYyyy(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y) return ymd
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

/** Chuẩn hóa payload JSON từ client → object cho PDF (Date / Timestamp-like / ISO string). */
function normalizeDocForPdf(data) {
  const toDate = (v) => {
    if (v == null) return v
    if (v instanceof Date) return v
    if (typeof v === 'string' && v.length > 0) {
      const d = new Date(v)
      if (!Number.isNaN(d.getTime())) return d
    }
    if (typeof v.toDate === 'function') return v.toDate()
    if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6)
    return v
  }
  return {
    ...data,
    createdAtUtc: toDate(data.createdAtUtc) ?? new Date(),
    approvedAtUtc: data.approvedAtUtc != null ? toDate(data.approvedAtUtc) : null,
    details: Array.isArray(data.details) ? data.details : [],
  }
}

function buildResultSummaryText(data) {
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
  return lines.join('\n')
}

function buildSubmitterEmailText(data) {
  return buildResultSummaryText(data)
}

function buildLeaderEmailText(data, approveUrl, dashboardUrl) {
  return [
    buildResultSummaryText(data),
    '',
    'Link duyệt checklist:',
    approveUrl,
    '',
    'Xem tổng quan (dashboard):',
    dashboardUrl,
  ].join('\n')
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim(),
  )
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

function createSmtpTransport() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!host || !user || !pass) {
    throw new Error(
      'Thiếu cấu hình SMTP: đặt SMTP_HOST, SMTP_USER, SMTP_PASS trong .env (gốc repo) hoặc Netlify environment.',
    )
  }
  const port = Number(process.env.SMTP_PORT || '587')
  const secure =
    process.env.SMTP_SECURE === 'true' ||
    process.env.SMTP_SECURE === '1' ||
    port === 465
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {{ filename: string, content: string }[] | null} attachments — content đã là base64
 */
async function sendViaResend(from, to, subject, text, attachments) {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) throw new Error('Thiếu RESEND_API_KEY')
  /** @type {Record<string, unknown>} */
  const payload = {
    from,
    to: [to],
    subject,
    text,
  }
  if (attachments?.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: String(a.content),
    }))
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${raw || res.statusText}`)
  }
}

/**
 * Đọc payload do app gửi (đã lưu Firestore phía client). Không dùng Firebase Admin trên server.
 * @param {unknown} body — JSON.parse của request body
 */
function parseNotificationPayload(body) {
  const n = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body).notification : null
  if (!n || typeof n !== 'object') {
    throw new Error('Thiếu trường notification (object) trong body.')
  }
  const o = /** @type {Record<string, unknown>} */ (n)
  const checklistKey = String(o.checklistKey ?? '').trim()
  const checklistTitle = String(o.checklistTitle ?? '').trim()
  const submitterName = String(o.submitterName ?? '').trim()
  const submitterEmail = String(o.submitterEmail ?? '').trim()
  const checkDate = String(o.checkDate ?? '').trim()
  const approvalToken = String(o.approvalToken ?? '').trim()
  if (!checklistKey) throw new Error('notification.checklistKey không hợp lệ.')
  if (!checklistTitle) throw new Error('notification.checklistTitle không hợp lệ.')
  if (!submitterName) throw new Error('notification.submitterName không hợp lệ.')
  if (!approvalToken) throw new Error('notification.approvalToken không hợp lệ.')
  if (!Array.isArray(o.details)) throw new Error('notification.details phải là mảng.')
  const details = o.details.map((row, i) => {
    if (!row || typeof row !== 'object') throw new Error(`notification.details[${i}] không hợp lệ.`)
    const r = /** @type {Record<string, unknown>} */ (row)
    return {
      itemKey: String(r.itemKey ?? ''),
      groupTitle: String(r.groupTitle ?? ''),
      label: String(r.label ?? ''),
      standard: String(r.standard ?? ''),
      passed: Boolean(r.passed),
      note: r.note == null || r.note === '' ? null : String(r.note),
    }
  })
  return {
    checklistKey,
    checklistTitle,
    submitterName,
    submitterEmail,
    checkDate,
    totalErrors: Number(o.totalErrors ?? 0),
    createdAtUtc: o.createdAtUtc,
    approvalToken,
    isApproved: Boolean(o.isApproved),
    approvedAtUtc: o.approvedAtUtc ?? null,
    details,
    clDocSerial: Number(o.clDocSerial ?? 0),
  }
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
    const requiredSecret = process.env.NOTIFY_SHARED_SECRET?.trim()
    if (requiredSecret) {
      const authHeader = event.headers.authorization || event.headers.Authorization
      const bearer =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : ''
      if (bearer !== requiredSecret) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Sai hoặc thiếu NOTIFY_SHARED_SECRET (Authorization: Bearer …).' }),
        }
      }
    }

    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON không hợp lệ' }) }
    }

    let data
    try {
      data = parseNotificationPayload(body)
    } catch (parseErr) {
      const m = parseErr instanceof Error ? parseErr.message : String(parseErr)
      return { statusCode: 400, headers, body: JSON.stringify({ error: m }) }
    }

    const useSmtp = hasSmtpConfig()
    const useResend = !useSmtp && hasResendConfig()
    if (!useSmtp && !useResend) {
      return {
        statusCode: 501,
        headers,
        body: JSON.stringify({
          error:
            'Thiếu cấu hình gửi mail: đặt (1) SMTP_HOST + SMTP_USER + SMTP_PASS hoặc (2) RESEND_API_KEY và RESEND_FROM (ví dụ Checklist <onboarding@resend.dev>) trên .env gốc repo / Netlify.',
        }),
      }
    }

    /** @type {import('nodemailer').Transporter | null} */
    let transporter = null
    if (useSmtp) {
      try {
        transporter = createSmtpTransport()
      } catch (cfgErr) {
        const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr)
        return { statusCode: 501, headers, body: JSON.stringify({ error: msg }) }
      }
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

    const smtpUser = process.env.SMTP_USER?.trim() || ''
    const fromHeader = useSmtp
      ? process.env.SMTP_FROM?.trim() || (smtpUser ? `Checklist <${smtpUser}>` : 'Checklist')
      : process.env.RESEND_FROM?.trim() || 'Checklist <onboarding@resend.dev>'

    const approveUrl = `${publicBase}/approve?token=${encodeURIComponent(data.approvalToken)}`
    const dashboardUrl = `${publicBase}/dashboard`
    const textSubmitter = buildSubmitterEmailText(data)
    const textLeader = buildLeaderEmailText(data, approveUrl, dashboardUrl)
    const subjectSubmitter = `[Checklist] Kết quả — ${data.checklistTitle} — ${data.submitterName}`

    const toSubmitter = String(data.submitterEmail || '').trim()
    const managers = collectNotificationRecipients()
    const threshold = Number(process.env.ERROR_THRESHOLD ?? '5')
    const totalErrors = Number(data.totalErrors ?? 0)
    const submitterLower = toSubmitter.toLowerCase()

    if (!toSubmitter && managers.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Không có địa chỉ email người gửi hoặc quản lý' }) }
    }

    let pdfAttachments = null
    let pdfErrorNote = ''
    try {
      const pdfInput = normalizeDocForPdf(data)
      const { base64, fileName } = await buildChecklistPdfBase64(pdfInput)
      pdfAttachments = [{ filename: fileName, content: base64 }]
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
      // eslint-disable-next-line no-console
      console.error('buildChecklistPdfBase64', pdfErr)
      pdfErrorNote = `\n\n(Lưu ý: không tạo được file PDF đính kèm — ${msg}. Vui lòng tải PDF từ màn hình Lịch sử / Xuất PDF.)`
    }

    const submitterMailText = textSubmitter + pdfErrorNote
    const leaderMailText = textLeader + pdfErrorNote

    const sendOne = async (to, subj, txt, attachments = pdfAttachments) => {
      if (useResend) {
        await sendViaResend(fromHeader, to, subj, txt, attachments)
        return
      }
      /** @type {import('nodemailer/lib/mailer').Options} */
      const mail = {
        from: fromHeader,
        to,
        subject: subj,
        text: txt,
      }
      if (attachments?.length && transporter) {
        mail.attachments = attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(String(a.content), 'base64'),
        }))
      }
      await transporter.sendMail(mail)
    }

    if (toSubmitter) {
      await sendOne(toSubmitter, subjectSubmitter, submitterMailText)
    }

    for (const mgr of managers) {
      if (toSubmitter && mgr.toLowerCase() === submitterLower) continue
      const alert = totalErrors > threshold
      const subj = alert
        ? `[CẢNH BÁO] ${data.checklistTitle} — ${totalErrors} lỗi`
        : `[DUYỆT] ${data.checklistTitle} — ${data.submitterName}`
      const bodyWithAlert = alert
        ? `Cảnh báo: checklist vượt ngưỡng lỗi (${threshold}).\n\n${leaderMailText}`
        : leaderMailText
      try {
        await sendOne(mgr, subj, bodyWithAlert)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('manager mail failed', mgr, e)
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        pdfAttached: Boolean(pdfAttachments?.length),
        transport: useSmtp ? 'smtp' : 'resend',
      }),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('send-checklist-notification', e)
    return { statusCode: 500, headers: corsHeaders(origin), body: JSON.stringify({ error: msg }) }
  }
}
