import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailAttachment {
  fileName: string;
  content: Buffer;
  contentType: string;
}

let cached: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (cached !== undefined) return cached;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    cached = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = (process.env.SMTP_USE_SSL || "true").toLowerCase() !== "false";
  const user = process.env.SMTP_USER?.trim();
  const pass = (process.env.SMTP_PASSWORD || "").replace(/ /g, "");
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465 ? true : secure,
    auth: user ? { user, pass } : undefined,
  });
  return cached;
}

function normalizeFrom(): string {
  const from = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  if (from) return from;
  if (user) return user;
  return "noreply@localhost";
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[] | null,
): Promise<void> {
  // eslint-disable-next-line no-console
  console.info(`[EMAIL] To=${to} Subject=${subject}\n${body}`);
  const transport = getTransporter();
  if (!transport) return;
  const from = normalizeFrom();
  await transport.sendMail({
    from,
    to,
    subject,
    text: body,
    attachments: attachments?.map((a) => ({
      filename: a.fileName,
      content: a.content,
      contentType: a.contentType,
    })),
  });
}
