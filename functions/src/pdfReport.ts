import PDFDocument from "pdfkit";
import type { ChecklistResultDoc, ChecklistResultDetailDoc } from "./models";

const MANAGER_NAME = "Nguyễn Hoàng Bảo Trung";
const TZ = "Asia/Ho_Chi_Minh";

function toDisplayInTz(utc: Date): Date {
  const s = utc.toLocaleString("en-US", { timeZone: TZ });
  return new Date(s);
}

function toDisplayOptional(utc: Date | null | undefined): Date | null {
  if (!utc) return null;
  return toDisplayInTz(utc);
}

export function generateChecklistPdfBuffer(result: ChecklistResultDoc): Promise<Buffer> {
  const byGroup = new Map<string, ChecklistResultDetailDoc[]>();
  for (const d of result.details) {
    const list = byGroup.get(d.groupTitle) ?? [];
    list.push(d);
    byGroup.set(d.groupTitle, list);
  }
  const groupKeys = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(10);
    doc.text("TRUNG TÂM QUẢN LÝ KÝ TÚC XÁ", { align: "center" }).moveDown(0.2);
    doc.font("Helvetica-Bold").text("PHÒNG CTSV-CĐS", { align: "center" }).font("Helvetica");
    doc.moveDown(0.3);
    doc.text("Số:      /CL-CNTTDL", { align: "center" });
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" });
    doc.text("Độc lập - Tự do - Hạnh phúc", { align: "center" }).font("Helvetica");
    const created = toDisplayInTz(result.createdAtUtc);
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Oblique")
      .text(
        `Thành phố Hồ Chí Minh, ngày ${String(created.getDate()).padStart(2, "0")} tháng ${String(created.getMonth() + 1).padStart(2, "0")} năm ${created.getFullYear()}`,
        { align: "center" },
      )
      .font("Helvetica");
    doc.moveDown(1);
    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(13).text(result.checklistTitle.toUpperCase(), { align: "center" });
    doc.font("Helvetica").fontSize(10);
    doc.moveDown(0.4);
    doc.text(`Người check: ${result.submitterName} (${result.submitterEmail})`);
    doc.text(`Ngày kiểm tra: ${formatDdMmYyyy(result.checkDate)}`);
    doc.text(`Ngày gửi: ${formatDateTime(result.createdAtUtc)} (GMT+7)`);
    doc.font("Helvetica-Bold").text(`Tổng lỗi: ${result.totalErrors}`);
    doc.font("Helvetica").moveDown(0.6);

    for (const g of groupKeys) {
      const items = (byGroup.get(g) ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
      doc.font("Helvetica-Bold").fontSize(11).text(g);
      doc.font("Helvetica").fontSize(9).moveDown(0.2);
      for (const item of items) {
        if (doc.y > doc.page.height - 80) doc.addPage();
        doc.font("Helvetica-Bold").text(item.label, { continued: false });
        doc.font("Helvetica").fontSize(8).text(`Tiêu chuẩn: ${item.standard}`);
        const status = item.passed ? "Đạt" : "Không đạt";
        doc.fillColor(item.passed ? "#166534" : "#b91c1c").font("Helvetica-Bold").text(`Kết quả: ${status}`);
        doc.fillColor("#000000").font("Helvetica");
        if (item.note) doc.text(`Ghi chú: ${item.note}`);
        doc.moveDown(0.4);
      }
      doc.moveDown(0.3);
    }

    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    doc.moveDown(1);
    const footY = doc.y;
    const mid = doc.page.width / 2;
    doc.font("Helvetica-Bold").text("NGƯỜI KIỂM TRA", 36, footY, { width: mid - 36, align: "center" });
    doc.text("QUẢN LÝ ĐƠN VỊ", mid, footY, { width: doc.page.width - mid - 36, align: "center" });
    doc.font("Helvetica");
    let y2 = footY + 16;
    if (result.isApproved) {
      const approved = toDisplayOptional(result.approvedAtUtc);
      const stamp = approved
        ? `ĐÃ DUYỆT\n${String(approved.getDate()).padStart(2, "0")}/${String(approved.getMonth() + 1).padStart(2, "0")}/${approved.getFullYear()} ${String(approved.getHours()).padStart(2, "0")}:${String(approved.getMinutes()).padStart(2, "0")}`
        : "ĐÃ DUYỆT";
      doc
        .fillColor("#b91c1c")
        .font("Helvetica-Bold")
        .text(stamp, mid, y2, { width: doc.page.width - mid - 36, align: "center" });
      doc.fillColor("#000000").font("Helvetica");
      y2 += 40;
    } else {
      y2 += 48;
    }
    doc.font("Helvetica-Bold").text(result.submitterName, 36, y2, { width: mid - 36, align: "center" });
    doc.text(MANAGER_NAME, mid, y2, { width: doc.page.width - mid - 36, align: "center" });

    doc.end();
  });
}

function formatDdMmYyyy(checkDate: string): string {
  const [y, m, d] = checkDate.split("-").map(Number);
  if (!y || !m || !d) return checkDate;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function formatDateTime(utc: Date): string {
  const t = toDisplayInTz(utc);
  return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
