import { corsHeaders } from './firebase-admin-shared.mjs'

function parseEmailList(raw) {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((e) => e.includes('@'))
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || ''
  const headers = corsHeaders(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const leaderEmails = parseEmailList(process.env.LEADER_EMAILS)
  const hrEmails = parseEmailList(process.env.HR_EMAILS)
  const managerEmails = parseEmailList(process.env.MANAGER_EMAILS)
  const allHr = [...new Set([...hrEmails, ...managerEmails].map((e) => e.toLowerCase()))].map(
    (lower) => [...hrEmails, ...managerEmails].find((e) => e.toLowerCase() === lower) ?? lower,
  )

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      leaders: leaderEmails.map((email) => ({
        displayName: email.split('@')[0] ?? email,
        email,
      })),
      hrStaff: allHr.map((email) => ({
        displayName: email.split('@')[0] ?? email,
        email,
      })),
    }),
  }
}
