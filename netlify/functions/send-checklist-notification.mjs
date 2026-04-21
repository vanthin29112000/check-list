import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import nodemailer from 'nodemailer'
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

/** Hợp nhất LEADER_EMAILS + HR_EMAILS + MANAGER_EMAILS (legacy), bỏ trùng (không phân biệt hoa thường). */
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

/** Chuẩn hóa dữ liệu Firestore → object thuần cho PDF (Timestamp / plain seconds). */
function normalizeDocForPdf(data) {
  const toDate = (v) => {
    if (v == null) return v
    if (v instanceof Date) return v
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

/** Nội dung kết quả checklist (dùng cho cả người check và lãnh đạo). */
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

/** Email người nộp: chỉ kết quả (không kèm link duyệt / dashboard). */
function buildSubmitterEmailText(data) {
  return buildResultSummaryText(data)
}

/** Email lãnh đạo: kết quả + link duyệt + link dashboard. */
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

    let transporter
    try {
      transporter = createSmtpTransport()
    } catch (cfgErr) {
      const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr)
      return { statusCode: 501, headers, body: JSON.stringify({ error: msg }) }
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
    const fromHeader =
      process.env.SMTP_FROM?.trim() || (smtpUser ? `Checklist <${smtpUser}>` : 'Checklist')

    const approvalToken = String(data.approvalToken || '')
    const approveUrl = `${publicBase}/approve?token=${encodeURIComponent(approvalToken)}`
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
      /** @type {import('nodemailer/lib/mailer').Options} */
      const mail = {
        from: fromHeader,
        to,
        subject: subj,
        text: txt,
      }
      if (attachments?.length) {
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
        console.error('SMTP manager mail failed', mgr, e)
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, pdfAttached: Boolean(pdfAttachments?.length), transport: 'smtp' }),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('send-checklist-notification', e)
    let detail = msg
    if (/insufficient permissions|permission.?denied|PERMISSION_DENIED/i.test(msg)) {
      detail = `${msg} — Thường do Firestore (Admin SDK): (1) FIREBASE_SERVICE_ACCOUNT_JSON phải là private key của đúng Firebase project mà app đang dùng (cùng project_id với VITE_FIREBASE_PROJECT_ID). (2) Google Cloud Console → IAM → tài khoản firebase-adminsdk-… cần quyền truy cập Firestore (thường có sẵn; nếu thiếu thêm vai trò "Cloud Datastore User" hoặc "Firebase Admin"). (3) Tạo lại private key mới nếu key cũ đã thu hồi.`
    }
    return { statusCode: 500, headers: corsHeaders(origin), body: JSON.stringify({ error: detail }) }
  }
}
