import { buildChecklistPdfBase64 } from './buildChecklistPdf.mjs'

function parseOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** @param {string | undefined} requestOrigin */
function corsHeaders(requestOrigin) {
  const allowed = parseOrigins()
  const o = (requestOrigin || '').trim()
  const allow = allowed.includes(o) ? o : o || allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export const handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || ''
  const headers = corsHeaders(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    const requiredSecret = process.env.NOTIFY_SHARED_SECRET?.trim()
    if (requiredSecret) {
      const authHeader = event.headers.authorization || event.headers.Authorization
      const bearer =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : ''
      if (bearer !== requiredSecret) {
        return {
          statusCode: 401,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Sai hoặc thiếu NOTIFY_SHARED_SECRET (Authorization: Bearer …).' }),
        }
      }
    }

    let body
    try {
      body = JSON.parse(event.body || '{}')
    } catch {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'JSON không hợp lệ' }),
      }
    }

    const raw = body && typeof body === 'object' ? body : {}
    const result = raw.result && typeof raw.result === 'object' ? raw.result : null
    if (!result) {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Thiếu trường result (object).' }),
      }
    }

    const { base64, fileName } = await buildChecklistPdfBase64(result)
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('build-checklist-pdf', e)
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: msg }),
    }
  }
}

