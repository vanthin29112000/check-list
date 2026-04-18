import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import cors from "cors";
import express from "express";
import { createChecklistRouter } from "./routes/checklist";

initializeApp();

setGlobalOptions({ region: "asia-southeast1" });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/checklist", createChecklistRouter());

export const api = onRequest(
  {
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  app,
);
