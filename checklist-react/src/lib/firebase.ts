import { initializeApp, type FirebaseApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined
let persistenceReady: Promise<void> | undefined

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim()
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim()
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      'Thiếu biến môi trường Firebase: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID',
    )
  }
  return { apiKey, authDomain, projectId, appId }
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = initializeApp(readConfig())
  }
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())
  }
  return db
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp())
    persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {
      /* trình duyệt không hỗ trợ — dùng mặc định */
    })
  }
  return auth
}

/** Đợi persistence localStorage sẵn sàng trước khi đọc phiên. */
export async function ensureAuthPersistence(): Promise<void> {
  getFirebaseAuth()
  await persistenceReady
}

/** Yêu cầu đã đăng nhập (Microsoft SSO). */
export async function ensureFirebaseUser(): Promise<void> {
  await ensureAuthPersistence()
  const a = getFirebaseAuth()
  if (!a.currentUser) {
    throw new Error('Bạn cần đăng nhập Microsoft để tiếp tục.')
  }
}
