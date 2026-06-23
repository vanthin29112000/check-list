import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

export function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    if (!raw?.trim()) {
      throw new Error('Thiếu FIREBASE_SERVICE_ACCOUNT_JSON trên server.')
    }
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  return getFirestore()
}

export function corsHeaders(requestOrigin) {
  const allowed = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const o = (requestOrigin || '').trim()
  const allow = allowed.includes(o) ? o : o || allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-Id-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

export function checkSharedSecret(headers) {
  const secret = process.env.NOTIFY_SHARED_SECRET
  if (!secret) return true
  const auth = headers.authorization || headers.Authorization || ''
  return auth === `Bearer ${secret}`
}

export async function findResultByToken(db, token) {
  const snap = await db.collection('checklistResults').where('approvalToken', '==', token).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ref: doc.ref, data: doc.data() }
}

export function mapResultToVm(id, data) {
  const details = Array.isArray(data.details) ? data.details : []
  return {
    id,
    checklistKey: data.checklistKey,
    checklistTitle: data.checklistTitle,
    submitterName: data.submitterName,
    submitterEmail: data.submitterEmail,
    checkDate: data.checkDate,
    totalErrors: data.totalErrors ?? 0,
    isApproved: Boolean(data.isApproved),
    status: data.status ?? (data.isApproved ? 'approved' : 'pending'),
    rejectionReason: data.rejectionReason ?? null,
    approvedByEmail: data.approvedByEmail ?? null,
    approvedByName: data.approvedByName ?? null,
    details,
  }
}

export async function writeServerAudit(db, action, meta) {
  try {
    await db.collection('auditLog').add({
      action,
      meta,
      actorUid: meta.actorUid ?? 'server',
      createdAtUtc: FieldValue.serverTimestamp(),
    })
  } catch {
    /* ignore */
  }
}

/** Email của user có role manager hoặc leader (dùng cho mail duyệt). */
export async function loadManagerEmails(db) {
  const snap = await db.collection('users').where('role', 'in', ['manager', 'leader']).get()
  const seen = new Set()
  const out = []
  for (const doc of snap.docs) {
    const e = String(doc.data().email ?? '').trim()
    if (!e || !e.includes('@')) continue
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

/** Gộp email tab Lãnh đạo (appSettings) + user đã đăng nhập role manager/leader. */
export async function loadApprovalRecipientEmails(db) {
  const seen = new Set()
  const out = []
  const add = (email) => {
    const e = String(email ?? '').trim()
    if (!e || !e.includes('@')) return
    const k = e.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(e)
  }
  try {
    const cfgSnap = await db.collection('appSettings').doc('emailRecipients').get()
    if (cfgSnap.exists) {
      const leaders = cfgSnap.data()?.leaders
      if (Array.isArray(leaders)) {
        for (const row of leaders) {
          add(row?.email)
        }
      }
    }
  } catch {
    /* ignore */
  }
  for (const e of await loadManagerEmails(db)) {
    add(e)
  }
  return out
}

export async function verifyManagerIdToken(headers) {
  const raw = headers['x-firebase-id-token'] || headers['X-Firebase-Id-Token'] || ''
  const token = typeof raw === 'string' ? raw.trim() : ''
  if (!token) {
    return { ok: false, error: 'Cần đăng nhập tài khoản quản lý để duyệt checklist.' }
  }
  try {
    const { getAuth } = await import('firebase-admin/auth')
    const decoded = await getAuth().verifyIdToken(token)
    const db = getAdminDb()
    const userDoc = await db.collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? String(userDoc.data()?.role ?? 'staff') : 'staff'
    if (role !== 'manager' && role !== 'leader') {
      return { ok: false, error: 'Chỉ quản lý/lãnh đạo được phép duyệt checklist.' }
    }
    return { ok: true, uid: decoded.uid, email: decoded.email ?? null, role, name: userDoc.data()?.displayName ?? null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Xác thực đăng nhập thất bại: ${msg}` }
  }
}
