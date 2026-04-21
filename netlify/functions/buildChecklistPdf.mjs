import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PDFDocument from 'pdfkit'

/**
 * Netlify esbuild bundle có thể làm `import.meta.url` không hợp lệ → không dùng làm nguồn duy nhất.
 * Tìm thư mục `fonts/` (Roboto Apache-2.0 trong repo, kèm `included_files` trên Netlify).
 */
function resolveFontPath(fileName) {
  const dirs = []
  try {
    const u = import.meta?.url
    if (typeof u === 'string' && u.length > 0) {
      dirs.push(path.join(path.dirname(fileURLToPath(u)), 'fonts'))
    }
  } catch {
    /* ignore */
  }
  dirs.push(
    path.join(process.cwd(), 'netlify', 'functions', 'fonts'),
    path.join(process.cwd(), 'fonts'),
    path.join('/var/task', 'netlify', 'functions', 'fonts'),
    path.join('/var/task', 'fonts'),
  )
  for (const dir of dirs) {
    const p = path.join(dir, fileName)
    if (existsSync(p)) return p
  }
  throw new Error(
    `Không tìm thấy font ${fileName}. Đặt file trong netlify/functions/fonts/ và khai included_files trong netlify.toml.`,
  )
}

let _fontReg
let _fontBold
let _fontItalic
function loadFontPaths() {
  if (!_fontReg) {
    _fontReg = resolveFontPath('Roboto-Regular.ttf')
    _fontBold = resolveFontPath('Roboto-Bold.ttf')
    _fontItalic = resolveFontPath('Roboto-Italic.ttf')
  }
  return { FONT_REG: _fontReg, FONT_BOLD: _fontBold, FONT_ITALIC: _fontItalic }
}

const MANAGER_NAME = 'Nguyễn Hoàng Bảo Trung'
const TZ = 'Asia/Ho_Chi_Minh'

function toDisplayInTz(utc) {
  const s = utc.toLocaleString('en-US', { timeZone: TZ })
  return new Date(s)
}

function toDisplayOptional(utc) {
  if (!utc) return null
  return toDisplayInTz(utc)
}

/** Firestore Timestamp | Date | plain object → Date */
export function toJsDate(x) {
  if (!x) return null
  if (x instanceof Date) return x
  if (typeof x.toDate === 'function') return x.toDate()
  if (typeof x._seconds === 'number') return new Date(x._seconds * 1000)
  if (typeof x.seconds === 'number') return new Date(x.seconds * 1000 + (x.nanoseconds || 0) / 1e6)
  const d = new Date(x)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDdMmYyyy(checkDate) {
  const [y, m, d] = String(checkDate || '').split('-').map(Number)
  if (!y) return String(checkDate || '')
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function formatDateTime(utc) {
  const t = toDisplayInTz(utc)
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

/** Chiều ngang bảng chi tiết (4 cột như mẫu TTQLKTX). */
function tableLayout(doc) {
  const tableLeft = doc.page.margins.left
  const tableRight = doc.page.width - doc.page.margins.right
  const tw = tableRight - tableLeft
  const colFrac = [0.28, 0.38, 0.14, 0.2]
  const colWs = colFrac.map((f) => tw * f)
  const colXs = [tableLeft]
  for (let i = 1; i < 4; i++) colXs.push(colXs[i - 1] + colWs[i - 1])
  return { tableLeft, tableRight, colXs, colWs }
}

function headerRowHeight(doc, headers, colWs, fs, FONT_BOLD) {
  doc.font(FONT_BOLD).fontSize(fs)
  let maxH = 0
  for (let i = 0; i < headers.length; i++) {
    const h = doc.heightOfString(String(headers[i] ?? ''), { width: colWs[i], lineGap: 1 })
    if (h > maxH) maxH = h
  }
  return maxH
}

function detailRowHeight(doc, parts, colWs, fs, FONT_REG, FONT_BOLD) {
  let maxH = 0
  for (let i = 0; i < 4; i++) {
    if (i === 2) doc.font(FONT_BOLD).fontSize(fs)
    else doc.font(FONT_REG).fontSize(fs)
    const h = doc.heightOfString(String(parts[i] ?? ''), { width: colWs[i], lineGap: 1 })
    if (h > maxH) maxH = h
  }
  return maxH
}

function drawTableHeader(doc, layout, y, FONT_BOLD) {
  const { colXs, colWs } = layout
  const headers = ['Thiết bị/hệ thống', 'Tiêu chuẩn', 'Kiểm tra', 'Ghi chú']
  const fs = 9
  doc.fillColor('#000000')
  const h = headerRowHeight(doc, headers, colWs, fs, FONT_BOLD)
  const rowTop = y
  headers.forEach((text, i) => {
    doc.font(FONT_BOLD).fontSize(fs)
    doc.text(text, colXs[i], rowTop, { width: colWs[i], lineGap: 1 })
  })
  const yLine = rowTop + h + 3
  doc.moveTo(layout.tableLeft, yLine).lineTo(layout.tableRight, yLine).stroke()
  return yLine + 8
}

function sectionRowHeight(doc, title, fullW, fs, FONT_BOLD, pad) {
  doc.font(FONT_BOLD).fontSize(fs)
  const inner = fullW - pad * 2
  const h = doc.heightOfString(String(title ?? ''), { width: inner, lineGap: 1 })
  return Math.max(h + pad * 2, 20)
}

/** Dòng tiêu đề nhóm (như hàng gộp trong Word: Thiết bị vật lý, …). */
function drawSectionRow(doc, layout, groupTitle, y, FONT_BOLD, pageBottom) {
  const { tableLeft, tableRight } = layout
  const fullW = tableRight - tableLeft
  const fs = 9
  const pad = 6
  const rowH = sectionRowHeight(doc, groupTitle, fullW, fs, FONT_BOLD, pad)
  if (y + rowH + 4 > pageBottom) {
    doc.addPage()
    y = doc.page.margins.top
    y = drawTableHeader(doc, layout, y, FONT_BOLD)
  }
  doc.save()
  doc.fillColor('#eeeeee').rect(tableLeft, y, fullW, rowH).fill()
  doc.restore()
  doc.fillColor('#000000').font(FONT_BOLD).fontSize(fs)
  doc.text(String(groupTitle ?? ''), tableLeft + pad, y + pad, { width: fullW - pad * 2, lineGap: 1 })
  return y + rowH + 4
}

function drawDetailRow(doc, layout, item, y, FONT_REG, FONT_BOLD, pageBottom, redrawHeader) {
  const { colXs, colWs } = layout
  const passed = Boolean(item.passed)
  const status = passed ? 'Đạt' : 'Không'
  const note = item.note ? String(item.note) : ''
  const fs = 8
  const parts = [String(item.label ?? ''), String(item.standard ?? ''), status, note]
  const maxH = detailRowHeight(doc, parts, colWs, fs, FONT_REG, FONT_BOLD)
  if (y + maxH + 10 > pageBottom) {
    doc.addPage()
    y = doc.page.margins.top
    y = redrawHeader(doc, layout, y)
  }
  const rowTop = y
  doc.font(FONT_REG).fontSize(fs).fillColor('#000000')
  doc.text(parts[0], colXs[0], rowTop, { width: colWs[0], lineGap: 1 })
  doc.text(parts[1], colXs[1], rowTop, { width: colWs[1], lineGap: 1 })
  doc.fillColor(passed ? '#166534' : '#b91c1c').font(FONT_BOLD).fontSize(fs)
  doc.text(parts[2], colXs[2], rowTop, { width: colWs[2], lineGap: 1 })
  doc.fillColor('#000000').font(FONT_REG).fontSize(fs)
  doc.text(parts[3], colXs[3], rowTop, { width: colWs[3], lineGap: 1 })
  return rowTop + maxH + 6
}

/**
 * @param {Record<string, unknown>} raw — document Firestore checklistResults
 * @returns {Promise<{ base64: string, fileName: string }>}
 */
export function buildChecklistPdfBase64(raw) {
  const result = {
    checklistKey: String(raw.checklistKey ?? ''),
    checklistTitle: String(raw.checklistTitle ?? ''),
    submitterName: String(raw.submitterName ?? ''),
    submitterEmail: String(raw.submitterEmail ?? ''),
    checkDate: String(raw.checkDate ?? ''),
    totalErrors: Number(raw.totalErrors ?? 0),
    createdAtUtc: toJsDate(raw.createdAtUtc) ?? new Date(),
    isApproved: Boolean(raw.isApproved),
    approvedAtUtc: raw.isApproved ? toJsDate(raw.approvedAtUtc) : null,
    details: Array.isArray(raw.details) ? raw.details : [],
  }

  const fileName = `checklist-${result.checklistKey}-${String(result.checkDate).replace(/-/g, '')}.pdf`

  return new Promise((resolve, reject) => {
    let FONT_REG
    let FONT_BOLD
    let FONT_ITALIC
    try {
      ;({ FONT_REG, FONT_BOLD, FONT_ITALIC } = loadFontPaths())
    } catch (e) {
      reject(e)
      return
    }

    const chunks = []
    const doc = new PDFDocument({ size: 'A4', margin: 36 })
    doc.on('data', (c) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => {
      const buf = Buffer.concat(chunks)
      resolve({ base64: buf.toString('base64'), fileName })
    })

    doc.fontSize(10)
    const m = doc.page.margins
    const innerW = doc.page.width - m.left - m.right
    const gap = 28
    const colW = (innerW - gap) / 2
    const xL = m.left
    const xR = m.left + colW + gap
    const y0 = doc.y

    const created = toDisplayInTz(result.createdAtUtc)
    const dateLine = `Thành phố Hồ Chí Minh, ngày ${String(created.getDate()).padStart(2, '0')} tháng ${String(created.getMonth() + 1).padStart(2, '0')} năm ${created.getFullYear()}`

    let yL = y0
    doc.font(FONT_REG).text('TRUNG TÂM QUẢN LÝ KÝ TÚC XÁ', xL, yL, { width: colW, align: 'center', lineGap: 2 })
    yL = doc.y
    doc.font(FONT_BOLD).text('PHÒNG CTSV-CĐS', xL, yL, { width: colW, align: 'center', lineGap: 2 })
    yL = doc.y
    doc.font(FONT_REG).text('Số:       /CL-CNTTDL', xL, yL, { width: colW, align: 'center', lineGap: 2 })
    yL = doc.y

    let yR = y0
    doc.font(FONT_BOLD).text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', xR, yR, { width: colW, align: 'center', lineGap: 2 })
    yR = doc.y
    doc.font(FONT_REG).text('Độc lập – Tự do – Hạnh phúc', xR, yR, { width: colW, align: 'center', lineGap: 2 })
    yR = doc.y
    doc.font(FONT_ITALIC).text(dateLine, xR, yR, { width: colW, align: 'center', lineGap: 2 })
    yR = doc.y

    doc.y = Math.max(yL, yR) + 10
    doc.font(FONT_REG)
    doc.moveDown(0.5)
    doc.moveTo(m.left, doc.y).lineTo(doc.page.width - m.right, doc.y).stroke()
    doc.moveDown(0.5)
    const contentW = doc.page.width - m.left - m.right
    doc.x = m.left
    doc.font(FONT_BOLD).fontSize(13).text(String(result.checklistTitle).toUpperCase(), m.left, doc.y, { width: contentW, align: 'center' })
    doc.font(FONT_REG).fontSize(9)
    doc.moveDown(0.35)
    doc.text(`Ngày kiểm tra: ${formatDdMmYyyy(result.checkDate)}`, m.left, doc.y, { width: contentW, align: 'center' })
    doc.font(FONT_ITALIC).fontSize(8).fillColor('#444444')
    const audit =
      result.totalErrors > 0
        ? `${result.totalErrors} mục Không · Gửi ${formatDateTime(result.createdAtUtc)} (GMT+7)`
        : `Gửi ${formatDateTime(result.createdAtUtc)} (GMT+7)`
    doc.text(audit, m.left, doc.y, { width: contentW, align: 'center' })
    doc.fillColor('#000000').font(FONT_REG).fontSize(10).moveDown(0.5)

    const layout = tableLayout(doc)
    const pageBottom = doc.page.height - doc.page.margins.bottom - 48
    const redrawHeader = (d, lay, yy) => drawTableHeader(d, lay, yy, FONT_BOLD)

    let y = doc.y
    y = drawTableHeader(doc, layout, y, FONT_BOLD)
    let prevGroup = null
    for (const item of result.details) {
      const g = String(item.groupTitle ?? '')
      if (g !== prevGroup) {
        prevGroup = g
        y = drawSectionRow(doc, layout, g, y, FONT_BOLD, pageBottom)
      }
      y = drawDetailRow(doc, layout, item, y, FONT_REG, FONT_BOLD, pageBottom, redrawHeader)
    }
    doc.y = y
    doc.moveDown(0.25)

    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke()
    doc.moveDown(1)
    const footY = doc.y
    const mid = doc.page.width / 2
    doc.font(FONT_BOLD).text('NGƯỜI KIỂM TRA', 36, footY, { width: mid - 36, align: 'center' })
    doc.text('QUẢN LÝ ĐƠN VỊ', mid, footY, { width: doc.page.width - mid - 36, align: 'center' })
    doc.font(FONT_REG)
    let y2 = footY + 16
    if (result.isApproved) {
      const approved = toDisplayOptional(result.approvedAtUtc)
      const stamp = approved
        ? `ĐÃ DUYỆT\n${String(approved.getDate()).padStart(2, '0')}/${String(approved.getMonth() + 1).padStart(2, '0')}/${approved.getFullYear()} ${String(approved.getHours()).padStart(2, '0')}:${String(approved.getMinutes()).padStart(2, '0')}`
        : 'ĐÃ DUYỆT'
      doc.fillColor('#b91c1c').font(FONT_BOLD).text(stamp, mid, y2, { width: doc.page.width - mid - 36, align: 'center' })
      doc.fillColor('#000000').font(FONT_REG)
      y2 += 40
    } else {
      y2 += 48
    }
    doc.font(FONT_BOLD).text(result.submitterName, 36, y2, { width: mid - 36, align: 'center' })
    doc.text(MANAGER_NAME, mid, y2, { width: doc.page.width - mid - 36, align: 'center' })

    doc.end()
  })
}
