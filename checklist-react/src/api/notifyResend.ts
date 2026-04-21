import type { ChecklistEmailNotificationPayload } from './types'

const NOTIFY_PATH = '/.netlify/functions/send-checklist-notification'

/** Cùng origin + Vite proxy tới deploy — tránh CORS "Failed to fetch" khi gọi thẳng URL Netlify từ :5173 */
function sameOriginNotifyUrl(): string {
  return `${window.location.origin}${NOTIFY_PATH}`
}

function notifyUrl(): string | null {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  const h = window.location.hostname
  const isLocal = h === 'localhost' || h === '127.0.0.1'
  const port = window.location.port

  if (isLocal) {
    if (port === '8888') {
      return `${origin}${NOTIFY_PATH}`
    }
    if (import.meta.env.VITE_NETLIFY_DEV_PROXY === '1') {
      return `${origin}${NOTIFY_PATH}`
    }
    const explicit5173 = import.meta.env.VITE_NOTIFY_FUNCTION_URL?.trim()
    if (explicit5173) {
      try {
        if (new URL(explicit5173).origin !== origin) {
          return sameOriginNotifyUrl()
        }
        return explicit5173
      } catch {
        return explicit5173
      }
    }
    return null
  }

  const explicit = import.meta.env.VITE_NOTIFY_FUNCTION_URL?.trim()
  if (explicit) {
    try {
      if (new URL(explicit).origin !== origin) {
        return sameOriginNotifyUrl()
      }
    } catch {
      return explicit
    }
    return explicit
  }
  return `${origin}${NOTIFY_PATH}`
}

const SKIP_NOTIFY_HELP =
  'Local: (1) `netlify dev` → http://localhost:8888; (2) `VITE_NETLIFY_DEV_PROXY=1` + chạy functions; (3) `VITE_NOTIFY_FUNCTION_URL`. Function cần SMTP_* trong `.env` gốc repo hoặc Netlify. Tuỳ chọn: NOTIFY_SHARED_SECRET (cùng giá trị với VITE_NOTIFY_SHARED_SECRET).'

/** Gọi Netlify Function gửi mail (SMTP). Server không dùng Firebase — payload do app gửi kèm. */
export async function requestChecklistEmailNotification(
  notification: ChecklistEmailNotificationPayload,
): Promise<void> {
  const url = notifyUrl()
  if (!url) {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h === 'localhost' || h === '127.0.0.1') {
        // eslint-disable-next-line no-console
        console.warn('[email]', SKIP_NOTIFY_HELP)
      }
    }
    throw new Error(`Chưa gửi được mail: chưa có URL function. ${SKIP_NOTIFY_HELP}`)
  }

  const secret = import.meta.env.VITE_NOTIFY_SHARED_SECRET?.trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) {
    headers.Authorization = `Bearer ${secret}`
  }

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notification }),
    })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    const proxyOn = import.meta.env.VITE_NETLIFY_DEV_PROXY === '1'
    const hint = proxyOn
      ? ' Nếu VITE_NETLIFY_DEV_PROXY=1: ở gốc repo chạy song song `npm run dev:functions` hoặc `npm run dev` (netlify dev).'
      : ' Kiểm tra `VITE_NOTIFY_FUNCTION_URL` trong checklist-react/.env và restart Vite (proxy tránh CORS chỉ bật khi URL khác origin).'
    throw new Error(`Không gọi được function (${m}).${hint}`)
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    const raw = text.trim()
    let msg = raw
    if (raw) {
      try {
        const j = JSON.parse(raw) as { error?: string }
        if (typeof j.error === 'string' && j.error.length > 0) msg = j.error
      } catch {
        /* giữ body thô (HTML / text từ proxy) */
      }
    }
    if (!msg) {
      const proxyOn = import.meta.env.VITE_NETLIFY_DEV_PROXY === '1'
      const onVite =
        typeof window !== 'undefined' &&
        (window.location.port === '5173' || window.location.port === '') &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      const hitLocalFnPath = url.includes('/.netlify/functions/')
      if (proxyOn && onVite && hitLocalFnPath) {
        msg = `HTTP ${res.status} (thường do proxy tới 127.0.0.1:8888 lỗi — chưa chạy Netlify Functions). Từ gốc repo chạy \`npm run dev:functions\` hoặc tắt VITE_NETLIFY_DEV_PROXY và đặt VITE_NOTIFY_FUNCTION_URL trỏ function đã deploy.`
      } else {
        msg = `Gửi email thất bại (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`
      }
    }
    throw new Error(msg)
  }
}
