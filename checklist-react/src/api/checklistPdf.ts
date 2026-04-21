import { jsPDF } from 'jspdf'
import type { HistoryRow } from './types'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

async function fetchFontBase64(relativePath: string): Promise<string> {
  const res = await fetch(relativePath)
  if (!res.ok) {
    throw new Error(`Không tải được font (${relativePath}): HTTP ${res.status}`)
  }
  return arrayBufferToBase64(await res.arrayBuffer())
}

/** Helvetica mặc định của jsPDF không hỗ trợ Unicode → tiếng Việt bị lỗi; nhúng Noto Sans từ public/fonts. */
async function embedVietnameseFonts(doc: jsPDF): Promise<void> {
  const root = import.meta.env.BASE_URL || '/'
  const reg = await fetchFontBase64(`${root}fonts/NotoSans-Regular.ttf`)
  const bold = await fetchFontBase64(`${root}fonts/NotoSans-Bold.ttf`)
  doc.addFileToVFS('NotoSans-Regular.ttf', reg)
  doc.addFileToVFS('NotoSans-Bold.ttf', bold)
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal', undefined, 'Identity-H')
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold', undefined, 'Identity-H')
}

export async function downloadChecklistPdf(row: HistoryRow): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  await embedVietnameseFonts(doc)

  const margin = 40
  let y = margin
  const line = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('NotoSans', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - margin * 2)
    for (const ln of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(ln, margin, y)
      y += size + 4
    }
  }

  line('PHIẾU CHECKLIST (xuất từ ứng dụng)', 12, true)
  y += 6
  if (row.clDocSerial != null && row.clDocSerial > 0) {
    line(`Số: ${String(row.clDocSerial).padStart(3, '0')}/CL-CNTTDL`, 10, true)
    y += 4
  }
  line(`Tiêu đề: ${row.checklistTitle}`, 10, true)
  line(`Người gửi: ${row.submitterName} <${row.submitterEmail}>`, 10)
  line(`Ngày kiểm tra: ${row.checkDate}`, 10)
  line(`Ngày giờ gửi: ${row.createdAtUtc}`, 10)
  line(`Tổng mục không đạt: ${row.totalErrors}`, 10, true)
  line(`Đã duyệt: ${row.isApproved ? 'Có' : 'Chưa'}`, 10)
  y += 10
  line('Chi tiết:', 11, true)
  y += 4
  for (const d of row.details) {
    const st = d.passed ? 'Đạt' : 'Không đạt'
    line(`• [${d.groupTitle}] ${d.label} — ${st}`, 9)
    if (d.note) line(`  Ghi chú: ${d.note}`, 8)
  }

  doc.save(`checklist-${row.checklistKey}-${row.checkDate.replace(/-/g, '')}.pdf`)
}
