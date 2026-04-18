import { Router } from "express";
import { getFirestore } from "firebase-admin/firestore";
import {
  approveByToken,
  getCompletionStatus,
  getDailyStatus,
  getDashboard,
  getDefinitionsResponse,
  getHistory,
  getPdfBuffer,
  renderApproveHtml,
  resendEmails,
  submitChecklist,
} from "../workflow";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createChecklistRouter(): Router {
  const r = Router();

  r.get("/definitions", (_req, res) => {
    res.json(getDefinitionsResponse());
  });

  r.post("/submit", async (req, res) => {
    try {
      const db = getFirestore();
      const out = await submitChecklist(db, req.body);
      res.json({
        resultId: out.resultId,
        totalErrors: out.totalErrors,
        failureLabels: out.failureLabels,
        approvalLink: out.approvalLink,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("DUPLICATE:")) {
        res.status(409).json({ error: msg.replace(/^DUPLICATE:/, "") });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  r.get("/history", async (req, res) => {
    try {
      const db = getFirestore();
      const out = await getHistory(db, {
        checklistKey: (req.query.checklistKey as string) ?? undefined,
        checkDate: (req.query.checkDate as string) ?? undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      });
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.get("/dashboard", async (req, res) => {
    try {
      const db = getFirestore();
      const out = await getDashboard(db, {
        checklistKey: (req.query.checklistKey as string) ?? undefined,
        fromDate: (req.query.fromDate as string) ?? undefined,
        toDate: (req.query.toDate as string) ?? undefined,
      });
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.get("/completion-status", async (req, res) => {
    try {
      const db = getFirestore();
      const out = await getCompletionStatus(db, (req.query.date as string) ?? undefined);
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.get("/daily-status", async (req, res) => {
    try {
      const db = getFirestore();
      const fromDate = String(req.query.fromDate ?? "");
      const toDate = String(req.query.toDate ?? "");
      const out = await getDailyStatus(db, fromDate, toDate);
      res.json(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Khoảng ngày")) {
        res.status(400).json({ error: msg });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  r.get("/approve", async (req, res) => {
    try {
      const db = getFirestore();
      const token = typeof req.query.token === "string" ? req.query.token : undefined;
      const vm = await approveByToken(db, token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderApproveHtml(vm));
    } catch (e) {
      res.status(500).send(String(e));
    }
  });

  r.get("/:id/pdf", async (req, res) => {
    try {
      if (!uuidRe.test(req.params.id)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const db = getFirestore();
      const { buffer, fileName } = await getPdfBuffer(db, req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("NOTFOUND:")) {
        res.status(404).json({ error: msg.replace(/^NOTFOUND:/, "") });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  r.post("/:id/resend-email", async (req, res) => {
    try {
      if (!uuidRe.test(req.params.id)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const db = getFirestore();
      await resendEmails(db, req.params.id);
      res.json({ message: "Đã gửi lại email checklist." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("NOTFOUND:")) {
        res.status(404).json({ error: msg.replace(/^NOTFOUND:/, "") });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  return r;
}
