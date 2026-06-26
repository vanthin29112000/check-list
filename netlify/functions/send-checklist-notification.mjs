import nodemailer from 'nodemailer'
import { buildChecklistPdfBase64 } from './buildChecklistPdf.mjs'
import { getAdminDb, loadApprovalRecipientEmails } from './firebase-admin-shared.mjs'

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

/** Danh sách email chuẩn hoá từ mảng JSON (tab Cấu hình). */
function parseEmailListFromBody(body, key) {
  if (!body || typeof body !== 'object') return []
  const raw = /** @type {Record<string, unknown>} */ (body)[key]
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const e = x.trim()
    if (!e || !e.includes('@')) continue
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

/** Email lãnh đạo — có link duyệt (bắt buộc ít nhất một). */
function parseRecipientEmailsFromBody(body) {
  return parseEmailListFromBody(body, 'recipientEmails')
}

/** Email nhân sự trùng tên người nộp — chỉ thông báo, không link duyệt. */
function parseStaffNotifyEmailsFromBody(body) {
  return parseEmailListFromBody(body, 'staffNotifyEmails')
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
  return [buildResultSummaryText(data), '', 'Lưu ý: Email này có đính kèm file PDF kết quả checklist.'].join('\n')
}

function buildLeaderEmailText(data, approveUrl, dashboardUrl) {
  return [
    buildResultSummaryText(data),
    '',
    'Lưu ý: Email này có đính kèm file PDF kết quả checklist.',
    '',
    'Link duyệt checklist:',
    approveUrl,
    '',
    'Xem tổng quan (dashboard):',
    dashboardUrl,
  ].join('\n')
}

/** Nhân sự / CC: tóm tắt + dashboard, không gửi link duyệt. */
function buildStaffNotifyEmailText(data, dashboardUrl) {
  return [
    buildResultSummaryText(data),
    '',
    'Lưu ý: Email này có đính kèm file PDF kết quả checklist.',
    '',
    'Xem tổng quan (dashboard):',
    dashboardUrl,
  ].join('\n')
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFailureRowsHtml(failures) {
  if (!failures.length) {
    return `
      <tr>
        <td style="padding:12px 14px;font-size:14px;line-height:22px;color:#6b7280;font-family:Arial,sans-serif;">
          Không có
        </td>
      </tr>
    `
  }
  const rows = failures
    .map((f) => {
      const note = f.note ? escapeHtml(f.note) : ''
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:20px;color:#374151;font-family:Arial,sans-serif;vertical-align:top;">${escapeHtml(f.groupTitle)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:20px;color:#374151;font-family:Arial,sans-serif;vertical-align:top;">${escapeHtml(f.label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;line-height:20px;color:#374151;font-family:Arial,sans-serif;vertical-align:top;">${note || '-'}</td>
        </tr>
      `
    })
    .join('')
  return `
    <tr style="background-color:#f9fafb;">
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;line-height:20px;color:#111827;font-weight:700;font-family:Arial,sans-serif;">Nhóm</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;line-height:20px;color:#111827;font-weight:700;font-family:Arial,sans-serif;">Hạng mục</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;line-height:20px;color:#111827;font-weight:700;font-family:Arial,sans-serif;">Ghi chú</td>
    </tr>
    ${rows}
  `
}

function buildChecklistEmailHtml(data, options) {
  const totalErrors = Number(data.totalErrors ?? 0)
  const isOk = totalErrors === 0
  const summaryBg = isOk ? '#ecfdf5' : '#fef2f2'
  const summaryBorder = isOk ? '#a7f3d0' : '#fecaca'
  const summaryColor = isOk ? '#065f46' : '#991b1b'
  const summaryText = isOk ? 'Không có lỗi (0)' : `Có ${totalErrors} lỗi cần xử lý`
  const failures = Array.isArray(data.details) ? data.details.filter((x) => !x.passed) : []
  const alertHtml = options.alertText
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:12px;background-color:#fff7ed;border:1px solid #fed7aa;border-radius:6px;"><tr><td style="padding:12px 14px;font-size:14px;line-height:22px;color:#9a3412;font-family:Arial,sans-serif;"><strong>Cảnh báo:</strong> ${escapeHtml(options.alertText)}</td></tr></table>`
    : ''
  const approveButtonHtml = options.approveUrl
    ? `
      <tr>
        <td align="center" style="padding:22px 20px 8px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                <a href="${escapeHtml(options.approveUrl)}" target="_blank" style="display:inline-block;padding:12px 18px;font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">
                  Xem và duyệt checklist
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
    : ''
  const attachmentNoteHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;">
      <tr>
        <td style="padding:12px 14px;font-size:14px;line-height:22px;color:#1e3a8a;font-family:Arial,sans-serif;">
          <strong>Lưu ý:</strong> Email này có đính kèm file <strong>PDF kết quả checklist</strong> ở cuối thư.
          Bạn có thể bấm nút bên dưới để xem checklist online ngay, không cần mở file PDF.
        </td>
      </tr>
    </table>
  `

  return `
<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f6f8;">
      <tr>
        <td align="center" style="padding:20px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
            <tr>
              <td style="padding:20px 20px 8px 20px;">
                <div style="font-size:22px;line-height:30px;font-weight:700;color:#111827;font-family:Arial,sans-serif;">
                  ${escapeHtml(data.checklistTitle)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 20px 0 20px;">
                ${alertHtml}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
                  <tr>
                    <td style="padding:12px 14px;font-size:14px;line-height:22px;color:#374151;font-family:Arial,sans-serif;">
                      <strong style="color:#111827;">Người kiểm tra:</strong> ${escapeHtml(data.submitterName)}${data.submitterEmail ? ` &lt;${escapeHtml(data.submitterEmail)}&gt;` : ''}<br />
                      <strong style="color:#111827;">Ngày kiểm tra:</strong> ${escapeHtml(formatDdMmYyyy(String(data.checkDate || '')))}
                    </td>
                  </tr>
                </table>
                ${attachmentNoteHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px 0 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${summaryBg};border:1px solid ${summaryBorder};border-radius:6px;">
                  <tr>
                    <td style="padding:14px;font-size:16px;line-height:24px;color:${summaryColor};font-family:Arial,sans-serif;">
                      <strong>Tổng kết:</strong> ${escapeHtml(summaryText)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px 8px 20px;font-size:16px;line-height:24px;font-weight:700;color:#111827;font-family:Arial,sans-serif;">
                Danh sách lỗi (Không đạt)
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-radius:6px;background-color:#ffffff;">
                  ${renderFailureRowsHtml(failures)}
                </table>
              </td>
            </tr>
            ${approveButtonHtml}
            <tr>
              <td align="center" style="padding:${options.approveUrl ? '8px' : '22px'} 20px 20px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#111827" style="border-radius:6px;">
                      <a href="${escapeHtml(options.dashboardUrl)}" target="_blank" style="display:inline-block;padding:11px 18px;font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;">
                        Xem dashboard
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 20px 20px;font-size:12px;line-height:18px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif;">
                Email tự động từ hệ thống Checklist. Vui lòng không trả lời email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `
}

function hasSmtpConfig(cfg) {
  return Boolean(cfg?.host?.trim() && cfg?.user?.trim() && cfg?.pass?.trim())
}

function hasResendConfig(cfg) {
  return Boolean(cfg?.apiKey?.trim())
}

/** @param {{ host: string, port: number, secure: boolean, user: string, pass: string }} cfg */
function createSmtpTransport(cfg) {
  const host = cfg.host?.trim()
  const user = cfg.user?.trim()
  const pass = cfg.pass?.trim()
  if (!host || !user || !pass) {
    throw new Error('Thiếu cấu hình SMTP: Host, User hoặc Mật khẩu.')
  }
  const port = Number(cfg.port || 587)
  const secure = Boolean(cfg.secure) || port === 465
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })
}

function parseEmailListFromEnv(raw) {
  if (!raw?.trim()) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(',')) {
    const e = part.trim().replace(/^["']|["']$/g, '')
    if (!e.includes('@')) continue
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

function leaderEmailsFromEnv() {
  return parseEmailListFromEnv(process.env.LEADER_EMAILS)
}

/** Thông báo lỗi SMTP/Resend dễ hiểu hơn message thô từ server mail. */
function friendlyMailError(msg) {
  const s = String(msg ?? '')
  if (s.includes('SmtpClientAuthentication is disabled') || s.includes('smtp_auth_disabled')) {
    return (
      'Office 365 chưa bật SMTP AUTH cho hộp thư này. ' +
      'Admin Microsoft 365 → Users → chọn user → Mail → Manage email apps → bật Authenticated SMTP. ' +
      'Hoặc dùng RESEND_API_KEY trong .env thay SMTP.'
    )
  }
  if (/Invalid login|535\s+5\.7/i.test(s)) {
    return `SMTP từ chối đăng nhập — kiểm tra SMTP_USER/SMTP_PASS trong .env hoặc bật SMTP AUTH (Office 365). Chi tiết: ${s}`
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(s)) {
    return `Không kết nối được máy chủ SMTP (${process.env.SMTP_HOST || 'SMTP_HOST'}). Kiểm tra mạng và SMTP_HOST/SMTP_PORT.`
  }
  return s
}

function smtpFromEnv() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!host || !user || !pass) return null
  const port = Number(process.env.SMTP_PORT || '587')
  const secure =
    process.env.SMTP_SECURE === 'true' ||
    process.env.SMTP_SECURE === '1' ||
    port === 465
  return {
    host,
    port,
    secure,
    user,
    pass,
    from: process.env.SMTP_FROM?.trim() || (user ? `Checklist <${user}>` : 'Checklist'),
  }
}

function resendFromEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    from: process.env.RESEND_FROM?.trim() || 'Checklist <onboarding@resend.dev>',
  }
}

/** Cấu hình gửi mail chỉ từ biến môi trường (.env). */
async function resolveMailRuntime() {
  let publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  let useSmtp = false
  let useResend = false
  /** @type {{ host: string, port: number, secure: boolean, user: string, pass: string, from: string } | null} */
  let smtp = null
  /** @type {{ apiKey: string, from: string } | null} */
  let resend = null

  const envSmtp = smtpFromEnv()
  if (envSmtp) {
    useSmtp = true
    smtp = envSmtp
  } else {
    const envResend = resendFromEnv()
    if (envResend) {
      useResend = true
      resend = envResend
    }
  }

  return { useSmtp, useResend, smtp, resend, publicBaseUrl }
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} html
 * @param {{ filename: string, content: string }[] | null} attachments — content đã là base64
 */
async function sendViaResend(from, to, subject, text, html, attachments, apiKey) {
  const key = apiKey?.trim()
  if (!key) throw new Error('Thiếu Resend API key')
  /** @type {Record<string, unknown>} */
  const payload = {
    from,
    to: [to],
    subject,
    text,
    html,
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

/**
 * Gửi email thông báo kết quả duyệt tới người đã checklist.
 * @param {{ submitterEmail: string, submitterName: string, checklistTitle: string, approverName: string, approvedAtText: string, totalErrors: number, resultId: string, checkDate?: string }} params
 */
export async function sendApprovalResultEmail(params) {
  const to = String(params.submitterEmail || '').trim()
  if (!to) return { ok: false, error: 'Không có email người kiểm tra.' }

  const mailRuntime = await resolveMailRuntime()
  const { useSmtp, useResend, smtp, resend, publicBaseUrl } = mailRuntime
  if (!useSmtp && !useResend) {
    return { ok: false, error: 'Chưa cấu hình gửi mail.' }
  }

  const publicBase = publicBaseUrl || 'http://localhost:8888'
  const detailUrl = `${publicBase.replace(/\/$/, '')}/submission/${encodeURIComponent(params.resultId)}`
  const subject = `[ĐÃ DUYỆT] ${params.checklistTitle} — ${params.submitterName}`
  const checkDateFmt = params.checkDate ? formatDdMmYyyy(String(params.checkDate)) : ''
  const text = [
    `Checklist "${params.checklistTitle}" đã được duyệt.`,
    '',
    `Người duyệt: ${params.approverName}`,
    `Thời gian duyệt: ${params.approvedAtText}`,
    checkDateFmt ? `Ngày kiểm tra: ${checkDateFmt}` : '',
    `Tổng lỗi: ${Number(params.totalErrors ?? 0)}`,
    '',
    'Xem chi tiết kết quả:',
    detailUrl,
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#065f46;margin:0 0 16px;">Checklist đã được duyệt</h2>
      <p style="color:#374151;line-height:22px;">
        Checklist <strong>${escapeHtml(params.checklistTitle)}</strong> của bạn đã được lãnh đạo duyệt thành công.
      </p>
      <table style="width:100%;background:#f0fdf4;border:1px solid #a7f3d0;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:14px;font-size:14px;color:#374151;">
          <strong>Người duyệt:</strong> ${escapeHtml(params.approverName)}<br/>
          <strong>Thời gian:</strong> ${escapeHtml(params.approvedAtText)}<br/>
          ${checkDateFmt ? `<strong>Ngày kiểm tra:</strong> ${escapeHtml(checkDateFmt)}<br/>` : ''}
          <strong>Tổng lỗi:</strong> ${Number(params.totalErrors ?? 0)}
        </td></tr>
      </table>
      <p style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;">
          Xem chi tiết kết quả
        </a>
      </p>
    </div>
  `

  const fromHeader = useSmtp && smtp ? smtp.from : resend?.from || 'Checklist <onboarding@resend.dev>'

  /** @type {import('nodemailer').Transporter | null} */
  let transporter = null
  if (useSmtp && smtp) {
    transporter = createSmtpTransport(smtp)
    await transporter.sendMail({ from: fromHeader, to, subject, text, html })
  } else if (useResend && resend) {
    await sendViaResend(fromHeader, to, subject, text, html, null, resend.apiKey)
  }

  return { ok: true }
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

    const mailRuntime = await resolveMailRuntime()
    const { useSmtp, useResend, smtp, resend, publicBaseUrl } = mailRuntime

    if (!useSmtp && !useResend) {
      const hasPartialSmtp =
        process.env.SMTP_HOST?.trim() &&
        process.env.SMTP_USER?.trim() &&
        !process.env.SMTP_PASS?.trim()
      let error =
        'Chưa cấu hình gửi mail. Đặt SMTP_HOST, SMTP_USER, SMTP_PASS (hoặc RESEND_API_KEY) trong file .env gốc repo, rồi restart npm run dev.'
      if (hasPartialSmtp) {
        error = 'Thiếu SMTP_PASS trong file .env gốc repo.'
      }
      return {
        statusCode: 501,
        headers,
        body: JSON.stringify({ error }),
      }
    }

    /** @type {import('nodemailer').Transporter | null} */
    let transporter = null
    if (useSmtp && smtp) {
      try {
        transporter = createSmtpTransport(smtp)
      } catch (cfgErr) {
        const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr)
        return { statusCode: 501, headers, body: JSON.stringify({ error: msg }) }
      }
    }

    const publicBase = publicBaseUrl
    if (!publicBase) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error:
            'Thiếu PUBLIC_BASE_URL trong file .env gốc repo (vd. http://localhost:8888 hoặc https://site.netlify.app).',
        }),
      }
    }

    const fromHeader = useSmtp && smtp ? smtp.from : resend?.from || 'Checklist <onboarding@resend.dev>'
    const resendApiKey = resend?.apiKey || ''

    const approveUrl = `${publicBase}/approve?token=${encodeURIComponent(data.approvalToken)}`
    const dashboardUrl = `${publicBase}/dashboard`
    const textSubmitter = buildSubmitterEmailText(data)
    const textLeader = buildLeaderEmailText(data, approveUrl, dashboardUrl)
    const textStaffNotify = buildStaffNotifyEmailText(data, dashboardUrl)
    const htmlSubmitter = buildChecklistEmailHtml(data, { approveUrl: null, dashboardUrl, alertText: '' })
    const htmlLeader = buildChecklistEmailHtml(data, { approveUrl, dashboardUrl, alertText: '' })
    const htmlStaffNotify = buildChecklistEmailHtml(data, { approveUrl: null, dashboardUrl, alertText: '' })
    const subjectSubmitter = `[Checklist] Kết quả — ${data.checklistTitle} — ${data.submitterName}`

    const toSubmitter = String(data.submitterEmail || '').trim()
    let managers = parseRecipientEmailsFromBody(body)
    if (managers.length === 0) {
      managers = leaderEmailsFromEnv()
    }
    if (managers.length === 0 && body.useManagerRecipients === true) {
      try {
        const db = getAdminDb()
        managers = await loadApprovalRecipientEmails(db)
      } catch (adminErr) {
        // eslint-disable-next-line no-console
        console.error('loadApprovalRecipientEmails', adminErr)
      }
    }
    if (managers.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error:
            'Chưa có người nhận mail duyệt. Điền LEADER_EMAILS trong .env hoặc tab Lãnh đạo trên Cấu hình email.',
        }),
      }
    }
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
    const staffNotifyMailText = textStaffNotify + pdfErrorNote
    const submitterMailHtml = htmlSubmitter
    const leaderMailHtml = htmlLeader
    const staffNotifyMailHtml = htmlStaffNotify

    const sendOne = async (to, subj, txt, html, attachments = pdfAttachments) => {
      if (useResend) {
        await sendViaResend(fromHeader, to, subj, txt, html, attachments, resendApiKey)
        return
      }
      /** @type {import('nodemailer/lib/mailer').Options} */
      const mail = {
        from: fromHeader,
        to,
        subject: subj,
        text: txt,
        html,
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
      await sendOne(toSubmitter, subjectSubmitter, submitterMailText, submitterMailHtml)
    }

    const managerLower = new Set(managers.map((m) => m.toLowerCase()))

    for (const mgr of managers) {
      if (toSubmitter && mgr.toLowerCase() === submitterLower) continue
      const alert = totalErrors > threshold
      const subj = alert
        ? `[CẢNH BÁO] ${data.checklistTitle} — ${totalErrors} lỗi`
        : `[DUYỆT] ${data.checklistTitle} — ${data.submitterName}`
      const bodyWithAlert = alert
        ? `Cảnh báo: checklist vượt ngưỡng lỗi (${threshold}).\n\n${leaderMailText}`
        : leaderMailText
      const htmlWithAlert = alert
        ? buildChecklistEmailHtml(data, {
            approveUrl,
            dashboardUrl,
            alertText: `Checklist vượt ngưỡng lỗi (${threshold}).`,
          })
        : leaderMailHtml
      try {
        await sendOne(mgr, subj, bodyWithAlert, htmlWithAlert)
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
    const msg = friendlyMailError(e instanceof Error ? e.message : String(e))
    // eslint-disable-next-line no-console
    console.error('send-checklist-notification', e)
    const isMailErr = /SMTP|Resend|login|535|mail/i.test(msg)
    return {
      statusCode: isMailErr ? 502 : 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ error: msg }),
    }
  }
}
