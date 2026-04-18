import { randomUUID } from "crypto";
import type { Firestore, Query } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { CHECKLIST_ALL, findChecklist, flattenItems } from "./catalog";
import type { ChecklistDefinition } from "./catalog/types";
import { getErrorThreshold, getManagerEmails, getPublicBaseUrl } from "./config";
import { sendEmail, type EmailAttachment } from "./email";
import { generateChecklistPdfBuffer } from "./pdfReport";
import type { ChecklistResultDetailDoc, ChecklistResultDoc } from "./models";

const RESULTS = "checklistResults";
const UNIQ = "checklistUniqueness";

function uniqDocId(checklistKey: string, email: string, checkDate: string): string {
  return `${checklistKey}|${email.trim().toLowerCase()}|${checkDate}`;
}

function buildApprovalLink(token: string): string {
  return `${getPublicBaseUrl()}/api/checklist/approve?token=${encodeURIComponent(token)}`;
}

export function getDefinitionsResponse() {
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
  };
}

function tsToDate(t: Timestamp | Date | undefined | null): Date {
  if (!t) return new Date(0);
  if (t instanceof Timestamp) return t.toDate();
  return t;
}

function mapDoc(id: string, data: Record<string, unknown>): ChecklistResultDoc {
  const checkDate = typeof data.checkDate === "string" ? data.checkDate : String(data.checkDate ?? "");
  return {
    id,
    checklistKey: String(data.checklistKey ?? ""),
    checklistTitle: String(data.checklistTitle ?? ""),
    submitterName: String(data.submitterName ?? ""),
    submitterEmail: String(data.submitterEmail ?? ""),
    checkDate,
    totalErrors: Number(data.totalErrors ?? 0),
    createdAtUtc: tsToDate(data.createdAtUtc as Timestamp | Date),
    approvalToken: String(data.approvalToken ?? ""),
    isApproved: Boolean(data.isApproved),
    approvedAtUtc: data.approvedAtUtc ? tsToDate(data.approvedAtUtc as Timestamp | Date) : null,
    details: (data.details as ChecklistResultDetailDoc[]) ?? [],
    pdfStoragePath: (data.pdfStoragePath as string | null | undefined) ?? null,
  };
}

export async function submitChecklist(
  db: Firestore,
  body: {
    checklistKey: string;
    submitterName: string;
    submitterEmail: string;
    checkDate: string;
    responses: {
      itemKey: string;
      passed: boolean;
      note?: string | null;
      subchecks?: { key: string; passed: boolean }[] | null;
    }[];
  },
): Promise<{ resultId: string; totalErrors: number; failureLabels: string[]; approvalLink: string }> {
  const def = findChecklist(body.checklistKey);
  if (!def) throw new Error(`Checklist không tồn tại: ${body.checklistKey}`);

  const checkDateStr = normalizeYmd(body.checkDate);
  const expected = flattenItems(def.key);
  const responseKeys = new Set(body.responses.map((r) => r.itemKey.toLowerCase()));
  if (responseKeys.size !== expected.size || ![...expected.keys()].every((k) => responseKeys.has(k))) {
    throw new Error("Danh sách mục không khớp định nghĩa checklist.");
  }

  const details: ChecklistResultDetailDoc[] = [];
  for (const r of body.responses) {
    const itemRef = expected.get(r.itemKey.toLowerCase());
    if (!itemRef) throw new Error(`Mục không hợp lệ: ${r.itemKey}`);
    const { item, groupTitle } = itemRef;
    if (item.type !== "pass_fail") throw new Error(`Loại item không hỗ trợ: ${item.type}`);

    const defSubs = item.subchecks ?? [];
    const subResponses = r.subchecks;
    if (defSubs.length > 0) {
      if (!subResponses?.length) throw new Error(`Thiếu kết quả kiểm tra ổ đĩa cho mục: ${item.label}`);
      const byKey = new Map(subResponses.map((x) => [x.key.toLowerCase(), x.passed]));
      for (const sc of defSubs) {
        if (!byKey.has(sc.key.toLowerCase()))
          throw new Error(`Thiếu mục con "${sc.label}" (${sc.key}) cho: ${item.label}`);
      }
      for (const k of byKey.keys()) {
        if (!defSubs.some((d) => d.key.toLowerCase() === k))
          throw new Error(`Mục con không hợp lệ cho: ${item.label}`);
      }
    } else if (subResponses && subResponses.length > 0) {
      throw new Error(`Mục "${item.label}" không có kiểm tra ổ đĩa, bỏ trường subchecks.`);
    }

    const subFailedLabels: string[] = [];
    if (defSubs.length > 0 && subResponses) {
      const map = new Map(subResponses.map((x) => [x.key.toLowerCase(), x.passed]));
      for (const sc of defSubs) {
        const ok = map.get(sc.key.toLowerCase());
        if (!ok) subFailedLabels.push(sc.label);
      }
    }

    const effectivePassed = r.passed && subFailedLabels.length === 0;
    const userNote = r.note?.trim() || null;
    let note: string | null = userNote;
    if (subFailedLabels.length > 0) {
      const auto = "Kiểm tra dung lượng/ổ đĩa chưa đạt: " + subFailedLabels.join("; ");
      note = userNote ? `${userNote} | ${auto}` : auto;
    }

    details.push({
      itemKey: item.key,
      groupTitle,
      label: item.label,
      standard: item.standard,
      passed: effectivePassed,
      note,
    });
  }

  const failures = details.filter((d) => !d.passed);
  const totalErrors = failures.length;
  const resultId = randomUUID();
  const approvalToken = randomUUID().replace(/-/g, "");
  const createdAtUtc = new Date();

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
  };

  const uniqId = uniqDocId(def.key, body.submitterEmail, checkDateStr);
  await db.runTransaction(async (tx) => {
    const uref = db.collection(UNIQ).doc(uniqId);
    const usnap = await tx.get(uref);
    if (usnap.exists) throw new Error("DUPLICATE:Đã có bản ghi cho checklist này trong ngày với cùng email.");
    tx.set(uref, { resultId, checklistKey: def.key, submitterEmail: body.submitterEmail.trim(), checkDate: checkDateStr });
    tx.set(db.collection(RESULTS).doc(resultId), payload);
  });

  const resultDoc: ChecklistResultDoc = {
    id: resultId,
    checklistKey: def.key,
    checklistTitle: def.title,
    submitterName: body.submitterName.trim(),
    submitterEmail: body.submitterEmail.trim(),
    checkDate: checkDateStr,
    totalErrors,
    createdAtUtc,
    approvalToken,
    isApproved: false,
    approvedAtUtc: null,
    details,
  };

  const pdfBuffer = await generateChecklistPdfBuffer(resultDoc);
  const approvalLink = buildApprovalLink(approvalToken);
  await sendSubmitEmails(resultDoc, failures, pdfBuffer, approvalLink);

  return {
    resultId,
    totalErrors,
    failureLabels: failures.map((f) => f.label),
    approvalLink,
  };
}

async function sendSubmitEmails(
  result: ChecklistResultDoc,
  failures: ChecklistResultDetailDoc[],
  pdfBuffer: Buffer,
  approvalLink: string,
): Promise<void> {
  const body = buildSubmitBody(result, failures);
  const bodyWithLink = `${body}\n\nLink duyệt hồ sơ checklist:\n${approvalLink}`;
  const subject = `[Checklist] ${result.checklistTitle} — ${result.totalErrors} lỗi — ${result.submitterName}`;
  const attachment: EmailAttachment = {
    fileName: `checklist-${result.checklistKey}-${result.checkDate.replace(/-/g, "")}.pdf`,
    content: pdfBuffer,
    contentType: "application/pdf",
  };

  try {
    await sendEmail(result.submitterEmail, subject, bodyWithLink, [attachment]);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Gửi email xác nhận submit thất bại", e);
  }

  const threshold = getErrorThreshold();
  const managers = getManagerEmails();
  if (result.totalErrors > threshold) {
    const alertBody = `Cảnh báo: checklist vượt ngưỡng lỗi (${threshold}).\n\n${bodyWithLink}`;
    for (const mgr of managers) {
      try {
        await sendEmail(mgr, `[CẢNH BÁO] ${result.checklistTitle} — ${result.totalErrors} lỗi`, alertBody, [attachment]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Gửi email cảnh báo quản lý thất bại", mgr, e);
      }
    }
  } else {
    for (const mgr of managers) {
      try {
        await sendEmail(mgr, `[DUYỆT] ${result.checklistTitle} — ${result.submitterName}`, bodyWithLink, [attachment]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Gửi email duyệt cho quản lý thất bại", mgr, e);
      }
    }
  }
}

function buildSubmitBody(result: ChecklistResultDoc, failures: ChecklistResultDetailDoc[]): string {
  const lines: string[] = [
    `Người check: ${result.submitterName} <${result.submitterEmail}>`,
    `Checklist: ${result.checklistTitle} (${result.checklistKey})`,
    `Ngày kiểm tra: ${formatDdMmYyyyFromYmd(result.checkDate)}`,
    `Ngày giờ gửi: ${formatDateTimeGmt7(result.createdAtUtc)} (GMT+7)`,
    `Tổng lỗi: ${result.totalErrors}`,
    "",
    "Danh sách lỗi (Không đạt):",
  ];
  if (failures.length === 0) lines.push("(Không có)");
  else {
    for (const f of failures) {
      const note = f.note ? ` — Ghi chú: ${f.note}` : "";
      lines.push(`- [${f.groupTitle}] ${f.label}: ${f.standard}${note}`);
    }
  }
  return lines.join("\n");
}

function formatDdMmYyyyFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y) return ymd;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function formatDateTimeGmt7(utc: Date): string {
  const s = utc.toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
  return s;
}

function normalizeYmd(input: string): string {
  const s = input.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Ngày không hợp lệ.");
  return d.toISOString().slice(0, 10);
}

async function loadAllResults(db: Firestore): Promise<ChecklistResultDoc[]> {
  const snap = await db.collection(RESULTS).get();
  return snap.docs.map((d) => mapDoc(d.id, d.data()));
}

function buildHistoryQuery(db: Firestore, checklistKey?: string | null, checkDate?: string | null): Query {
  let q: Query = db.collection(RESULTS).orderBy("createdAtUtc", "desc");
  if (checklistKey?.trim()) q = q.where("checklistKey", "==", checklistKey.trim());
  if (checkDate?.trim()) q = q.where("checkDate", "==", normalizeYmd(checkDate));
  return q;
}

export async function getHistory(
  db: Firestore,
  q: { checklistKey?: string | null; checkDate?: string | null; page?: number; pageSize?: number },
): Promise<{ total: number; items: unknown[] }> {
  const page = Math.max(1, q.page ?? 1);
  const size = Math.min(100, Math.max(1, q.pageSize ?? 20));

  if (q.checklistKey?.trim() && q.checkDate?.trim()) {
    const snap = await buildHistoryQuery(db, q.checklistKey, q.checkDate).get();
    const all = snap.docs.map((d) => mapDoc(d.id, d.data()));
    const total = all.length;
    const slice = all.slice((page - 1) * size, page * size);
    return { total, items: slice.map((r) => mapHistoryRow(r)) };
  }
  if (q.checklistKey?.trim()) {
    const snap = await db
      .collection(RESULTS)
      .where("checklistKey", "==", q.checklistKey.trim())
      .orderBy("createdAtUtc", "desc")
      .get();
    const all = snap.docs.map((d) => mapDoc(d.id, d.data()));
    const total = all.length;
    const slice = all.slice((page - 1) * size, page * size);
    return { total, items: slice.map((r) => mapHistoryRow(r)) };
  }
  if (q.checkDate?.trim()) {
    const snap = await db
      .collection(RESULTS)
      .where("checkDate", "==", normalizeYmd(q.checkDate))
      .orderBy("createdAtUtc", "desc")
      .get();
    const all = snap.docs.map((d) => mapDoc(d.id, d.data()));
    const total = all.length;
    const slice = all.slice((page - 1) * size, page * size);
    return { total, items: slice.map((r) => mapHistoryRow(r)) };
  }

  const all = (await loadAllResults(db)).sort((a, b) => b.createdAtUtc.getTime() - a.createdAtUtc.getTime());
  const total = all.length;
  const slice = all.slice((page - 1) * size, page * size);
  return { total, items: slice.map((r) => mapHistoryRow(r)) };
}

function orderDetailsForHistory(def: ChecklistDefinition | undefined, details: ChecklistResultDetailDoc[]) {
  const order = new Map<string, number>();
  if (def) {
    let idx = 0;
    for (const g of def.groups) {
      for (const it of g.items) order.set(it.key.toLowerCase(), idx++);
    }
  }
  return details.slice().sort((a, b) => {
    const ia = order.get(a.itemKey.toLowerCase()) ?? 1e9;
    const ib = order.get(b.itemKey.toLowerCase()) ?? 1e9;
    if (ia !== ib) return ia - ib;
    if (a.groupTitle !== b.groupTitle) return a.groupTitle.localeCompare(b.groupTitle);
    return a.label.localeCompare(b.label);
  });
}

function mapHistoryRow(r: ChecklistResultDoc) {
  const def = findChecklist(r.checklistKey);
  const details = orderDetailsForHistory(def, r.details).map((d) => ({
    itemKey: d.itemKey,
    groupTitle: d.groupTitle,
    label: d.label,
    standard: d.standard,
    passed: d.passed,
    note: d.note,
  }));
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
    details,
  };
}

export async function getDashboard(
  db: Firestore,
  q: { checklistKey?: string | null; fromDate?: string | null; toDate?: string | null },
) {
  let rows = await loadAllResults(db);
  const filterKey = q.checklistKey?.trim();
  if (filterKey) rows = rows.filter((r) => r.checklistKey === filterKey);
  if (q.fromDate?.trim()) {
    const from = normalizeYmd(q.fromDate);
    rows = rows.filter((r) => r.checkDate >= from);
  }
  if (q.toDate?.trim()) {
    const to = normalizeYmd(q.toDate);
    rows = rows.filter((r) => r.checkDate <= to);
  }

  const overview = {
    totalSubmissions: rows.length,
    passSubmissions: rows.filter((x) => x.totalErrors === 0).length,
    failedSubmissions: rows.filter((x) => x.totalErrors > 0).length,
    totalErrors: rows.reduce((s, x) => s + x.totalErrors, 0),
    approvedCount: rows.filter((x) => x.isApproved).length,
    pendingApprovalCount: rows.filter((x) => !x.isApproved).length,
  };

  const byChecklistMap = new Map<
    string,
    { checklistKey: string; checklistTitle: string; submissions: number; totalErrors: number; passSubmissions: number; approvedCount: number }
  >();
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
      };
    cur.submissions += 1;
    cur.totalErrors += x.totalErrors;
    if (x.totalErrors === 0) cur.passSubmissions += 1;
    if (x.isApproved) cur.approvedCount += 1;
    byChecklistMap.set(x.checklistKey, cur);
  }
  const byChecklist = [...byChecklistMap.values()].sort((a, b) => b.submissions - a.submissions);

  const byDateMap = new Map<string, { date: string; submissions: number; totalErrors: number }>();
  for (const x of rows) {
    const cur = byDateMap.get(x.checkDate) ?? { date: x.checkDate, submissions: 0, totalErrors: 0 };
    cur.submissions += 1;
    cur.totalErrors += x.totalErrors;
    byDateMap.set(x.checkDate, cur);
  }
  const errorsByDate = [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const failMap = new Map<string, { itemKey: string; groupTitle: string; label: string; failedCount: number }>();
  for (const x of rows) {
    for (const d of x.details.filter((d) => !d.passed)) {
      const k = `${d.itemKey}|${d.groupTitle}|${d.label}`;
      const cur = failMap.get(k) ?? {
        itemKey: d.itemKey,
        groupTitle: d.groupTitle,
        label: d.label,
        failedCount: 0,
      };
      cur.failedCount += 1;
      failMap.set(k, cur);
    }
  }
  const topFailedItems = [...failMap.values()].sort((a, b) => b.failedCount - a.failedCount).slice(0, 20);

  const subMap = new Map<
    string,
    { submitterName: string; submitterEmail: string; submissions: number; totalErrors: number; passSubmissions: number }
  >();
  for (const x of rows) {
    const k = `${x.submitterEmail}|${x.submitterName}`;
    const cur =
      subMap.get(k) ??
      {
        submitterName: x.submitterName,
        submitterEmail: x.submitterEmail,
        submissions: 0,
        totalErrors: 0,
        passSubmissions: 0,
      };
    cur.submissions += 1;
    cur.totalErrors += x.totalErrors;
    if (x.totalErrors === 0) cur.passSubmissions += 1;
    subMap.set(k, cur);
  }
  const bySubmitter = [...subMap.values()].sort((a, b) => b.submissions - a.submissions);

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
    }));

  return {
    overview,
    byChecklist,
    errorsByDate,
    topFailedItems,
    bySubmitter,
    pendingApprovals,
  };
}

export async function getCompletionStatus(db: Firestore, dateInput?: string | null) {
  const target = dateInput?.trim()
    ? normalizeYmd(dateInput)
    : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const rows = await loadAllResults(db);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.checkDate !== target) continue;
    counts.set(r.checklistKey.toLowerCase(), (counts.get(r.checklistKey.toLowerCase()) ?? 0) + 1);
  }
  const items = CHECKLIST_ALL.map((c) => {
    const cc = counts.get(c.key.toLowerCase()) ?? 0;
    return {
      checklistKey: c.key,
      isCompletedToday: cc > 0,
      completedCount: cc,
    };
  });
  return { date: target, items };
}

function startOfWeekMonday(day: Date): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dow = d.getDay();
  const delta = (dow + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDaysYmdLocal(ymdStr: string, days: number): string {
  const d = parseYmdLocal(ymdStr);
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

export async function getDailyStatus(db: Firestore, fromDate: string, toDate: string) {
  const from = normalizeYmd(fromDate);
  const to = normalizeYmd(toDate);
  if (to < from) throw new Error("Khoảng ngày không hợp lệ.");

  const rows = (await loadAllResults(db)).filter((r) => r.checkDate >= from && r.checkDate <= to);
  const map = new Map<string, number>();
  const weeklyMap = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.checkDate}|${r.checklistKey}`;
    map.set(k, (map.get(k) ?? 0) + 1);
    const wk = `${ymdLocal(startOfWeekMonday(parseYmdLocal(r.checkDate)))}|${r.checklistKey}`;
    weeklyMap.set(wk, (weeklyMap.get(wk) ?? 0) + 1);
  }

  const items: { checkDate: string; checklists: unknown[] }[] = [];
  for (let cur = from; cur <= to; ) {
    const day = parseYmdLocal(cur);
    const checklistRows = CHECKLIST_ALL.map((c) => {
      const key = `${cur}|${c.key}`;
      const count = map.get(key) ?? 0;
      const status = resolveDailyStatus(c.key, day, count, weeklyMap);
      return {
        checklistKey: c.key,
        checklistTitle: c.title,
        isChecked: count > 0,
        completedCount: count,
        status,
      };
    });
    items.push({ checkDate: cur, checklists: checklistRows });
    cur = addDaysYmdLocal(cur, 1);
  }
  return { items };
}

function resolveDailyStatus(
  checklistKey: string,
  day: Date,
  completedCountForDay: number,
  weeklyCountMap: Map<string, number>,
): string {
  if (completedCountForDay > 0) return "checked";
  if (checklistKey.toLowerCase() === "cong-khu-a") {
    const weekKey = `${ymdLocal(startOfWeekMonday(day))}|${checklistKey}`;
    const weekCount = weeklyCountMap.get(weekKey) ?? 0;
    return weekCount > 0 ? "weekly_done" : "weekly_pending";
  }
  if (checklistKey.toLowerCase() === "cong-khu-b") {
    const dow = day.getDay();
    return dow === 2 || dow === 4 ? "missing_required" : "not_required";
  }
  return "missing_required";
}

export async function getPdfBuffer(db: Firestore, resultId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const ref = db.collection(RESULTS).doc(resultId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOTFOUND:Không tìm thấy bản checklist.");
  const r = mapDoc(snap.id, snap.data()!);
  const buf = await generateChecklistPdfBuffer(r);
  return { buffer: buf, fileName: `checklist-${r.checklistKey}-${r.checkDate.replace(/-/g, "")}.pdf` };
}

export async function resendEmails(db: Firestore, resultId: string): Promise<void> {
  const ref = db.collection(RESULTS).doc(resultId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("NOTFOUND:Không tìm thấy bản checklist để gửi lại mail.");
  const r = mapDoc(snap.id, snap.data()!);
  const failures = r.details.filter((d) => !d.passed);
  const pdfBuffer = await generateChecklistPdfBuffer(r);
  await sendSubmitEmails(r, failures, pdfBuffer, buildApprovalLink(r.approvalToken));
}

export interface ApprovalVm {
  success: boolean;
  message: string;
  checklistTitle: string;
  submitterName: string;
  approverName: string;
  approvedAtText: string;
  totalItems: number;
  failedItems: number;
}

export async function approveByToken(db: Firestore, token: string | undefined | null): Promise<ApprovalVm> {
  const nowText = new Date().toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
  const base = (msg: string, rest: Partial<ApprovalVm> = {}): ApprovalVm => ({
    success: false,
    message: msg,
    checklistTitle: "",
    submitterName: "",
    approverName: "Nguyễn Hoàng Bảo Trung",
    approvedAtText: nowText,
    totalItems: 0,
    failedItems: 0,
    ...rest,
  });

  if (!token?.trim()) return base("Token duyệt không hợp lệ.");

  const snap = await db.collection(RESULTS).where("approvalToken", "==", token.trim()).limit(1).get();
  if (snap.empty) return base("Không tìm thấy checklist cần duyệt.");

  const doc = snap.docs[0];
  const data = doc.data();
  const r = mapDoc(doc.id, data);

  if (r.isApproved) {
    const t = r.approvedAtUtc ? r.approvedAtUtc.toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" }) : "";
    return {
      success: true,
      message: `Checklist đã được duyệt lúc ${t}.`,
      checklistTitle: r.checklistTitle,
      submitterName: r.submitterName,
      approverName: "Nguyễn Hoàng Bảo Trung",
      approvedAtText: t,
      totalItems: r.details.length,
      failedItems: r.totalErrors,
    };
  }

  await doc.ref.update({ isApproved: true, approvedAtUtc: FieldValue.serverTimestamp() });
  const approvedAt = new Date();
  return {
    success: true,
    message: `Đã duyệt checklist ${r.checklistTitle} của ${r.submitterName}.`,
    checklistTitle: r.checklistTitle,
    submitterName: r.submitterName,
    approverName: "Nguyễn Hoàng Bảo Trung",
    approvedAtText: approvedAt.toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" }),
    totalItems: r.details.length,
    failedItems: r.totalErrors,
  };
}

export function renderApproveHtml(vm: ApprovalVm): string {
  const status = vm.success ? "Duyệt checklist thành công" : "Không thể duyệt checklist";
  const statusIcon = vm.success ? "✔" : "✖";
  const statusColor = vm.success ? "#16a34a" : "#dc2626";
  const failedWarn =
    vm.failedItems > 0
      ? `<div class="warn"><strong>Lưu ý:</strong> Checklist có <b>${vm.failedItems}</b> mục không đạt. Vui lòng xem chi tiết trước khi chốt xử lý.</div>`
      : "";
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(status)}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 60%)}
.card{width:100%;max-width:760px;background:#fff;border:1px solid #dcfce7;border-radius:16px;box-shadow:0 10px 30px rgba(22,163,74,.08);padding:24px}
.head{display:flex;gap:14px;align-items:center}.icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;background:${statusColor};flex-shrink:0}
.title{margin:0;font-size:28px;font-weight:700;color:#111827}.sub{margin:8px 0 0;color:#4b5563}
.grid{margin-top:20px;display:grid;gap:10px 18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.item{border:1px solid #f3f4f6;border-radius:10px;padding:10px 12px;background:#fafafa}
.k{font-size:12px;color:#6b7280;margin-bottom:4px}.v{font-size:14px;color:#111827;font-weight:600}
.warn{margin-top:16px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:10px;padding:10px 12px}
</style></head><body><main class="card"><div class="head"><div class="icon">${statusIcon}</div><div><h1 class="title">${esc(status)}</h1><p class="sub">${esc(vm.message)}</p></div></div>
<section class="grid">
<div class="item"><div class="k">Checklist</div><div class="v">${esc(vm.checklistTitle)}</div></div>
<div class="item"><div class="k">Người nộp checklist</div><div class="v">${esc(vm.submitterName)}</div></div>
<div class="item"><div class="k">Người duyệt</div><div class="v">${esc(vm.approverName)}</div></div>
<div class="item"><div class="k">Thời gian duyệt</div><div class="v">${esc(vm.approvedAtText)}</div></div>
<div class="item"><div class="k">Tổng số hạng mục</div><div class="v">${vm.totalItems}</div></div>
<div class="item"><div class="k">Số mục không đạt</div><div class="v">${vm.failedItems}</div></div>
</section>${failedWarn}</main></body></html>`;
}
