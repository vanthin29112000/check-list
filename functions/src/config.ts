export function getPublicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
}

export function getManagerEmails(): string[] {
  return splitEmails(process.env.MANAGER_EMAILS || process.env.ALERT_MANAGER_EMAILS);
}

export function getErrorThreshold(): number {
  const n = Number(process.env.ERROR_THRESHOLD ?? process.env.ALERT_ERROR_THRESHOLD ?? "5");
  return Number.isFinite(n) ? n : 5;
}

function splitEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}
