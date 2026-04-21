/**
 * Xóa toàn bộ dữ liệu checklist trên Firestore:
 *   - checklistResults
 *   - checklistUniqueness
 *
 * Chạy từ thư mục functions (để dùng firebase-admin đã cài):
 *   npm run clear-checklist-data -- --confirm
 *
 * Đọc service account từ biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON
 * hoặc từ file .env ở root repo (cùng key).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

const COLLECTIONS = ['checklistResults', 'checklistUniqueness']

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = readFileSync(filePath, 'utf8')
  const out = {}
  for (const line of raw.split(/\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function getServiceAccountJson() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  const envPath = resolve(__dirname, '../../.env')
  const env = parseEnvFile(envPath)
  const j = env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!j?.trim()) {
    throw new Error(
      'Thiếu FIREBASE_SERVICE_ACCOUNT_JSON (đặt trong .env ở root repo hoặc export biến môi trường).',
    )
  }
  return JSON.parse(j)
}

async function deleteCollection(db, name, batchSize = 400) {
  const ref = db.collection(name)
  let total = 0
  for (;;) {
    const snap = await ref.limit(batchSize).get()
    if (snap.empty) break
    const batch = db.batch()
    for (const doc of snap.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()
    total += snap.size
    process.stdout.write(`  ${name}: đã xóa ${total} tài liệu...\r`)
  }
  if (total > 0) process.stdout.write(`\n  ${name}: xong, ${total} tài liệu.\n`)
  else process.stdout.write(`  ${name}: không có tài liệu.\n`)
}

async function main() {
  const ok = process.argv.includes('--confirm')
  if (!ok) {
    console.error(
      'Thêm --confirm để thực sự xóa dữ liệu Firestore (checklistResults, checklistUniqueness).',
    )
    console.error('Ví dụ: npm run clear-checklist-data -- --confirm')
    process.exit(1)
  }

  const cred = getServiceAccountJson()
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cred),
    })
  }
  const db = admin.firestore()

  console.log('Đang xóa các collection:', COLLECTIONS.join(', '))
  for (const name of COLLECTIONS) {
    await deleteCollection(db, name)
  }
  console.log('Hoàn tất.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
