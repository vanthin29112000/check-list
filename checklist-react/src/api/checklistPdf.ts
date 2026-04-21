import type { HistoryRow } from './types'

const PDF_PATH = '/.netlify/functions/build-checklist-pdf'

function pdfFunctionUrl(): string | null {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  const h = window.location.hostname
  const isLocal = h === 'localhost' || h === '127.0.0.1'
  const port = window.location.port

  if (isLocal) {
    if (port === '8888' || import.meta.env.VITE_NETLIFY_DEV_PROXY === '1') {
      return `${origin}${PDF_PATH}`
    }
    const explicit = import.meta.env.VITE_NOTIFY_FUNCTION_URL?.trim()
    if (explicit) {
      try {
        const u = new URL(explicit)
        return `${u.origin}${PDF_PATH}`
      } catch {
        return `${origin}${PDF_PATH}`
      }
    }
    return null
  }
  return `${origin}${PDF_PATH}`
}

export async function downloadChecklistPdf(row: HistoryRow): Promise<void> {
  const url = pdfFunctionUrl()
  if (!url) {
    throw new Error(
      'Chưa tạo được PDF chuẩn server: hãy chạy qua Netlify (`npm run dev`), hoặc bật `VITE_NETLIFY_DEV_PROXY=1`, hoặc cấu hình `VITE_NOTIFY_FUNCTION_URL`.',
    )
  }

  const secret = import.meta.env.VITE_NOTIFY_SHARED_SECRET?.trim()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) headers.Authorization = `Bearer ${secret}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ result: row }),
  })
  if (!res.ok) {
    const raw = (await res.text().catch(() => '')).trim()
    let msg = raw || `HTTP ${res.status}`
    try {
      const j = JSON.parse(raw) as { error?: string }
      if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
    } catch {
      /* ignore */
    }
    throw new Error(`Xuất PDF thất bại: ${msg}`)
  }

  const blob = await res.blob()
  const fileName = `checklist-${row.checklistKey}-${row.checkDate.replace(/-/g, '')}.pdf`
  const a = document.createElement('a')
  const href = URL.createObjectURL(blob)
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
