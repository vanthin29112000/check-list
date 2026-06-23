import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined

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
  }
  return auth
}

/** Yêu cầu đã đăng nhập (Microsoft SSO). */
export async function ensureFirebaseUser(): Promise<void> {
  const a = getFirebaseAuth()
  if (!a.currentUser) {
    throw new Error('Bạn cần đăng nhập Microsoft để tiếp tục.')
  }
}

/** @deprecated Dùng ensureFirebaseUser sau khi bật Microsoft SSO */
export async function ensureFirebaseAnonymousUser(): Promise<void> {
  return ensureFirebaseUser()
}
