import { jsPDF } from 'jspdf'
import type { HistoryRow } from './types'

export function downloadChecklistPdf(row: HistoryRow): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin
  const line = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
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
