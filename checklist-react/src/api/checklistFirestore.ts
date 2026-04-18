import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { CHECKLIST_ALL, findChecklist, flattenItems } from '../catalog'
import type { ChecklistDefinition } from '../catalog/types'
import { getDb } from '../lib/firebase'
import { requestChecklistEmailNotification } from './notifyResend'
import type {
  CompletionStatusResponse,
  DailyStatusResponse,
  DashboardResponse,
  DefinitionsResponse,
  HistoryDetail,
  HistoryResponse,
  HistoryRow,
  SubmitChecklistRequest,
  SubmitChecklistResponse,
} from './types'

const RESULTS = 'checklistResults'
const UNIQ = 'checklistUniqueness'

export function getPublicBaseUrl(): string {
  const v = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.trim()
  if (v) return v.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return ''
}

function buildApprovalLink(token: string): string {
  return `${getPublicBaseUrl()}/approve?token=${encodeURIComponent(token)}`
}

function uniqDocId(checklistKey: string, email: string, checkDate: string): string {
  return `${checklistKey}|${email.trim().toLowerCase()}|${checkDate}`
}

function tsToDate(t: unknown): Date {
  if (t && typeof t === 'object' && 'toDate' in t && typeof (t as { toDate: () => Date }).toDate === 'function') {
    return (t as { toDate: () => Date }).toDate()
  }
  if (t instanceof Date) return t
  return new Date(0)
}

interface ResultDetailDoc {
  itemKey: string
  groupTitle: string
  label: string
  standard: string
  passed: boolean
  note: string | null
}

interface ResultDoc {
  id: string
  checklistKey: string
  checklistTitle: string
  submitterName: string
  submitterEmail: string
  checkDate: string
  totalErrors: number
  createdAtUtc: Date
  approvalToken: string
  isApproved: boolean
  approvedAtUtc: Date | null
  details: ResultDetailDoc[]
}

function mapDoc(id: string, data: Record<string, unknown>): ResultDoc {
  const checkDate = typeof data.checkDate === 'string' ? data.checkDate : String(data.checkDate ?? '')
  return {
    id,
    checklistKey: String(data.checklistKey ?? ''),
    checklistTitle: String(data.checklistTitle ?? ''),
    submitterName: String(data.submitterName ?? ''),
    submitterEmail: String(data.submitterEmail ?? ''),
    checkDate,
    totalErrors: Number(data.totalErrors ?? 0),
    createdAtUtc: tsToDate(data.createdAtUtc),
    approvalToken: String(data.approvalToken ?? ''),
    isApproved: Boolean(data.isApproved),
    approvedAtUtc: data.approvedAtUtc ? tsToDate(data.approvedAtUtc) : null,
    details: (data.details as ResultDetailDoc[]) ?? [],
  }
}

function normalizeYmd(input: string): string {
  const s = input.trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) throw new Error('Ngày không hợp lệ.')
  return d.toISOString().slice(0, 10)
}

async function loadAllResults(): Promise<ResultDoc[]> {
  const db = getDb()
  const snap = await getDocs(collection(db, RESULTS))
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))
}

export async function fetchDefinitions(): Promise<DefinitionsResponse> {
  return {
    checklists: CHECKLIST_ALL.map((c) => ({
      key: c.key,
      title: c.title,
      groups: c.groups.map((g) => ({
        title: g.title,
        items: g.items.map((i) => ({
          key: i.key,
          label: i.label,
          standard: i.standard,
          type: i.type,
          subchecks: i.subchecks ?? null,
        })),
      })),
    })),
  }
}

export async function submitChecklist(body: SubmitChecklistRequest): Promise<SubmitChecklistResponse> {
  const def = findChecklist(body.checklistKey)
  if (!def) throw new Error(`Checklist không tồn tại: ${body.checklistKey}`)

  const checkDateStr = normalizeYmd(body.checkDate)
  const expected = flattenItems(def.key)
  const responseKeys = new Set(body.responses.map((r) => r.itemKey.toLowerCase()))
  if (responseKeys.size !== expected.size || ![...expected.keys()].every((k) => responseKeys.has(k))) {
    throw new Error('Danh sách mục không khớp định nghĩa checklist.')
  }

  const details: ResultDetailDoc[] = []
  for (const r of body.responses) {
    const itemRef = expected.get(r.itemKey.toLowerCase())
    if (!itemRef) throw new Error(`Mục không hợp lệ: ${r.itemKey}`)
    const { item, groupTitle } = itemRef
    if (item.type !== 'pass_fail') throw new Error(`Loại item không hỗ trợ: ${item.type}`)

    const defSubs = item.subchecks ?? []
    const subResponses = r.subchecks
    if (defSubs.length > 0) {
      if (!subResponses?.length) throw new Error(`Thiếu kết quả kiểm tra ổ đĩa cho mục: ${item.label}`)
      const byKey = new Map(subResponses.map((x) => [x.key.toLowerCase(), x.passed]))
      for (const sc of defSubs) {
        if (!byKey.has(sc.key.toLowerCase()))
          throw new Error(`Thiếu mục con "${sc.label}" (${sc.key}) cho: ${item.label}`)
      }
      for (const k of byKey.keys()) {
        if (!defSubs.some((d) => d.key.toLowerCase() === k))
          throw new Error(`Mục con không hợp lệ cho: ${item.label}`)
      }
    } else if (subResponses && subResponses.length > 0) {
      throw new Error(`Mục "${item.label}" không có kiểm tra ổ đĩa, bỏ trường subchecks.`)
    }

    const subFailedLabels: string[] = []
    if (defSubs.length > 0 && subResponses) {
      const map = new Map(subResponses.map((x) => [x.key.toLowerCase(), x.passed]))
      for (const sc of defSubs) {
        const ok = map.get(sc.key.toLowerCase())
        if (!ok) subFailedLabels.push(sc.label)
      }
    }

    const effectivePassed = r.passed && subFailedLabels.length === 0
    const userNote = r.note?.trim() || null
    let note: string | null = userNote
    if (subFailedLabels.length > 0) {
      const auto = 'Kiểm tra dung lượng/ổ đĩa chưa đạt: ' + subFailedLabels.join('; ')
      note = userNote ? `${userNote} | ${auto}` : auto
    }

    details.push({
      itemKey: item.key,
      groupTitle,
      label: item.label,
      standard: item.standard,
      passed: effectivePassed,
      note,
    })
  }

  const failures = details.filter((d) => !d.passed)
  const totalErrors = failures.length
  const resultId = crypto.randomUUID()
  const approvalToken = crypto.randomUUID().replace(/-/g, '')
  const createdAtUtc = new Date()

  const payload = {
    checklistKey: def.key,
    checklistTitle: def.title,
    submitterName: body.submitterName.trim(),
    submitterEmail: body.submitterEmail.trim(),
    checkDate: checkDateStr,
    totalErrors,
    createdAtUtc: Timestamp.fromDate(createdAtUtc),
    approvalToken,
    isApproved: false,
    approvedAtUtc: null,
    details,
    pdfStoragePath: null as string | null,
  }

  const uniqId = uniqDocId(def.key, body.submitterEmail, checkDateStr)
  const db = getDb()

  try {
    await runTransaction(db, async (tx) => {
      const uref = doc(db, UNIQ, uniqId)
      const usnap = await tx.get(uref)
      if (usnap.exists()) throw new Error('DUPLICATE:Đã có bản ghi cho checklist này trong ngày với cùng email.')
      tx.set(uref, {
        resultId,
        checklistKey: def.key,
        submitterEmail: body.submitterEmail.trim(),
        checkDate: checkDateStr,
      })
      tx.set(doc(db, RESULTS, resultId), payload)
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('DUPLICATE:')) throw e
    throw e
  }

  const approvalLink = buildApprovalLink(approvalToken)
  void requestChecklistEmailNotification(resultId).catch((err) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[email] Gửi thông báo thất bại (submit vẫn thành công):', err)
    }
  })
  return {
    resultId,
    totalErrors,
    failureLabels: failures.map((f) => f.label),
    approvalLink,
  }
}

function orderDetailsForHistory(def: ChecklistDefinition | undefined, details: ResultDetailDoc[]): HistoryDetail[] {
  const order = new Map<string, number>()
  if (def) {
    let idx = 0
    for (const g of def.groups) {
      for (const it of g.items) order.set(it.key.toLowerCase(), idx++)
    }
  }
  const sorted = details.slice().sort((a, b) => {
    const ia = order.get(a.itemKey.toLowerCase()) ?? 1e9
    const ib = order.get(b.itemKey.toLowerCase()) ?? 1e9
    if (ia !== ib) return ia - ib
    if (a.groupTitle !== b.groupTitle) return a.groupTitle.localeCompare(b.groupTitle)
    return a.label.localeCompare(b.label)
  })
  return sorted.map((d) => ({
    itemKey: d.itemKey,
    groupTitle: d.groupTitle,
    label: d.label,
    standard: d.standard,
    passed: d.passed,
    note: d.note,
  }))
}

function mapHistoryRow(r: ResultDoc): HistoryRow {
  const def = findChecklist(r.checklistKey)
  return {
    id: r.id,
    checklistKey: r.checklistKey,
    checklistTitle: r.checklistTitle,
    submitterName: r.submitterName,
    submitterEmail: r.submitterEmail,
    checkDate: r.checkDate,
    totalErrors: r.totalErrors,
    createdAtUtc: r.createdAtUtc.toISOString(),
    isApproved: r.isApproved,
    approvedAtUtc: r.approvedAtUtc?.toISOString() ?? null,
    approvalLink: buildApprovalLink(r.approvalToken),
    details: orderDetailsForHistory(def, r.details),
  }
}

export async function fetchHistory(params: {
  checklistKey?: string
  checkDate?: string
  page?: number
  pageSize?: number
}): Promise<HistoryResponse> {
  const page = Math.max(1, params.page ?? 1)
  const size = Math.min(100, Math.max(1, params.pageSize ?? 20))
  let all = (await loadAllResults()).sort((a, b) => b.createdAtUtc.getTime() - a.createdAtUtc.getTime())

  const filterCk = params.checklistKey?.trim()
  if (filterCk) {
    all = all.filter((r) => r.checklistKey === filterCk)
  }
  if (params.checkDate?.trim()) {
    const ymd = normalizeYmd(params.checkDate)
    all = all.filter((r) => r.checkDate === ymd)
  }

  const total = all.length
  const slice = all.slice((page - 1) * size, page * size)
  return { total, items: slice.map(mapHistoryRow) }
}

export async function fetchDashboard(params: {
  checklistKey?: string
  fromDate?: string
  toDate?: string
}): Promise<DashboardResponse> {
  let rows = await loadAllResults()
  const filterKey = params.checklistKey?.trim()
  if (filterKey) rows = rows.filter((r) => r.checklistKey === filterKey)
  if (params.fromDate?.trim()) {
    const from = normalizeYmd(params.fromDate)
    rows = rows.filter((r) => r.checkDate >= from)
  }
  if (params.toDate?.trim()) {
    const to = normalizeYmd(params.toDate)
    rows = rows.filter((r) => r.checkDate <= to)
  }

  const overview = {
    totalSubmissions: rows.length,
    passSubmissions: rows.filter((x) => x.totalErrors === 0).length,
    failedSubmissions: rows.filter((x) => x.totalErrors > 0).length,
    totalErrors: rows.reduce((s, x) => s + x.totalErrors, 0),
    approvedCount: rows.filter((x) => x.isApproved).length,
    pendingApprovalCount: rows.filter((x) => !x.isApproved).length,
  }

  const byChecklistMap = new Map<
    string,
    {
      checklistKey: string
      checklistTitle: string
      submissions: number
      totalErrors: number
      passSubmissions: number
      approvedCount: number
    }
  >()
  for (const x of rows) {
    const cur =
      byChecklistMap.get(x.checklistKey) ??
      {
        checklistKey: x.checklistKey,
        checklistTitle: x.checklistTitle,
        submissions: 0,
        totalErrors: 0,
        passSubmissions: 0,
        approvedCount: 0,
      }
    cur.submissions += 1
    cur.totalErrors += x.totalErrors
    if (x.totalErrors === 0) cur.passSubmissions += 1
    if (x.isApproved) cur.approvedCount += 1
    byChecklistMap.set(x.checklistKey, cur)
  }
  const byChecklist = [...byChecklistMap.values()].sort((a, b) => b.submissions - a.submissions)

  const byDateMap = new Map<string, { date: string; submissions: number; totalErrors: number }>()
  for (const x of rows) {
    const cur = byDateMap.get(x.checkDate) ?? { date: x.checkDate, submissions: 0, totalErrors: 0 }
    cur.submissions += 1
    cur.totalErrors += x.totalErrors
    byDateMap.set(x.checkDate, cur)
  }
  const errorsByDate = [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date))

  const failMap = new Map<string, { itemKey: string; groupTitle: string; label: string; failedCount: number }>()
  for (const x of rows) {
    for (const d of x.details.filter((d) => !d.passed)) {
      const k = `${d.itemKey}|${d.groupTitle}|${d.label}`
      const cur = failMap.get(k) ?? {
        itemKey: d.itemKey,
        groupTitle: d.groupTitle,
        label: d.label,
        failedCount: 0,
      }
      cur.failedCount += 1
      failMap.set(k, cur)
    }
  }
  const topFailedItems = [...failMap.values()].sort((a, b) => b.failedCount - a.failedCount).slice(0, 20)

  const subMap = new Map<
    string,
    { submitterName: string; submitterEmail: string; submissions: number; totalErrors: number; passSubmissions: number }
  >()
  for (const x of rows) {
    const k = `${x.submitterEmail}|${x.submitterName}`
    const cur =
      subMap.get(k) ??
      {
        submitterName: x.submitterName,
        submitterEmail: x.submitterEmail,
        submissions: 0,
        totalErrors: 0,
        passSubmissions: 0,
      }
    cur.submissions += 1
    cur.totalErrors += x.totalErrors
    if (x.totalErrors === 0) cur.passSubmissions += 1
    subMap.set(k, cur)
  }
  const bySubmitter = [...subMap.values()].sort((a, b) => b.submissions - a.submissions)

  const pendingApprovals = rows
    .filter((x) => !x.isApproved)
    .sort((a, b) => b.createdAtUtc.getTime() - a.createdAtUtc.getTime())
    .slice(0, 20)
    .map((x) => ({
      id: x.id,
      checklistTitle: x.checklistTitle,
      submitterName: x.submitterName,
      checkDate: x.checkDate,
      totalErrors: x.totalErrors,
      approvalLink: buildApprovalLink(x.approvalToken),
    }))

  return {
    overview,
    byChecklist,
    errorsByDate,
    topFailedItems,
    bySubmitter,
    pendingApprovals,
  }
}

export async function fetchCompletionStatus(params: { date: string }): Promise<CompletionStatusResponse> {
  const target = params.date?.trim()
    ? normalizeYmd(params.date)
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  const rows = await loadAllResults()
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.checkDate !== target) continue
    counts.set(r.checklistKey.toLowerCase(), (counts.get(r.checklistKey.toLowerCase()) ?? 0) + 1)
  }
  const items = CHECKLIST_ALL.map((c) => {
    const cc = counts.get(c.key.toLowerCase()) ?? 0
    return {
      checklistKey: c.key,
      isCompletedToday: cc > 0,
      completedCount: cc,
    }
  })
  return { date: target, items }
}

function startOfWeekMonday(day: Date): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const dow = d.getDay()
  const delta = (dow + 6) % 7
  d.setDate(d.getDate() - delta)
  return d
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDaysYmdLocal(ymdStr: string, days: number): string {
  const d = parseYmdLocal(ymdStr)
  d.setDate(d.getDate() + days)
  return ymdLocal(d)
}

function resolveDailyStatus(
  checklistKey: string,
  day: Date,
  completedCountForDay: number,
  weeklyCountMap: Map<string, number>,
): 'checked' | 'missing_required' | 'not_required' | 'weekly_pending' | 'weekly_done' {
  if (completedCountForDay > 0) return 'checked'
  if (checklistKey.toLowerCase() === 'cong-khu-a') {
    const weekKey = `${ymdLocal(startOfWeekMonday(day))}|${checklistKey}`
    const weekCount = weeklyCountMap.get(weekKey) ?? 0
    return weekCount > 0 ? 'weekly_done' : 'weekly_pending'
  }
  if (checklistKey.toLowerCase() === 'cong-khu-b') {
    const dow = day.getDay()
    return dow === 2 || dow === 4 ? 'missing_required' : 'not_required'
  }
  return 'missing_required'
}

export async function fetchDailyStatus(params: { fromDate: string; toDate: string }): Promise<DailyStatusResponse> {
  const from = normalizeYmd(params.fromDate)
  const to = normalizeYmd(params.toDate)
  if (to < from) throw new Error('Khoảng ngày không hợp lệ.')

  const rows = (await loadAllResults()).filter((r) => r.checkDate >= from && r.checkDate <= to)
  const map = new Map<string, number>()
  const weeklyMap = new Map<string, number>()
  for (const r of rows) {
    const k = `${r.checkDate}|${r.checklistKey}`
    map.set(k, (map.get(k) ?? 0) + 1)
    const wk = `${ymdLocal(startOfWeekMonday(parseYmdLocal(r.checkDate)))}|${r.checklistKey}`
    weeklyMap.set(wk, (weeklyMap.get(wk) ?? 0) + 1)
  }

  const items: DailyStatusResponse['items'] = []
  for (let cur = from; cur <= to; ) {
    const day = parseYmdLocal(cur)
    const checklistRows = CHECKLIST_ALL.map((c) => {
      const key = `${cur}|${c.key}`
      const count = map.get(key) ?? 0
      const status = resolveDailyStatus(c.key, day, count, weeklyMap)
      return {
        checklistKey: c.key,
        checklistTitle: c.title,
        isChecked: count > 0,
        completedCount: count,
        status,
      }
    })
    items.push({ checkDate: cur, checklists: checklistRows })
    cur = addDaysYmdLocal(cur, 1)
  }
  return { items }
}

export async function resendChecklistEmail(resultId: string): Promise<{ message: string; skipped?: boolean }> {
  try {
    await requestChecklistEmailNotification(resultId)
    return { message: 'Đã gửi lại email (Resend).' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      message: msg,
      skipped: true,
    }
  }
}

export interface ApprovePageVm {
  success: boolean
  message: string
  checklistTitle: string
  submitterName: string
  approverName: string
  approvedAtText: string
  totalItems: number
  failedItems: number
}

export async function approveChecklistByToken(token: string | null | undefined): Promise<ApprovePageVm> {
  const nowText = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })
  const base = (msg: string, rest: Partial<ApprovePageVm> = {}): ApprovePageVm => ({
    success: false,
    message: msg,
    checklistTitle: '',
    submitterName: '',
    approverName: 'Nguyễn Hoàng Bảo Trung',
    approvedAtText: nowText,
    totalItems: 0,
    failedItems: 0,
    ...rest,
  })

  if (!token?.trim()) return base('Token duyệt không hợp lệ.')

  const db = getDb()
  const q = query(collection(db, RESULTS), where('approvalToken', '==', token.trim()), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return base('Không tìm thấy checklist cần duyệt.')

  const dref = snap.docs[0].ref
  const r = mapDoc(snap.docs[0].id, snap.docs[0].data() as Record<string, unknown>)

  if (r.isApproved) {
    const t = r.approvedAtUtc ? r.approvedAtUtc.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''
    return {
      success: true,
      message: `Checklist đã được duyệt lúc ${t}.`,
      checklistTitle: r.checklistTitle,
      submitterName: r.submitterName,
      approverName: 'Nguyễn Hoàng Bảo Trung',
      approvedAtText: t,
      totalItems: r.details.length,
      failedItems: r.totalErrors,
    }
  }

  await updateDoc(dref, { isApproved: true, approvedAtUtc: serverTimestamp() })
  const approvedAt = new Date()
  return {
    success: true,
    message: `Đã duyệt checklist ${r.checklistTitle} của ${r.submitterName}.`,
    checklistTitle: r.checklistTitle,
    submitterName: r.submitterName,
    approverName: 'Nguyễn Hoàng Bảo Trung',
    approvedAtText: approvedAt.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }),
    totalItems: r.details.length,
    failedItems: r.totalErrors,
  }
}
