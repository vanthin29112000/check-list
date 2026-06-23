import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  OAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { fetchEmailRecipientsConfig } from '../api/checklistFirestore'
import { getDb, getFirebaseAuth } from '../lib/firebase'

export type AppRole = 'staff' | 'manager' | 'leader'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: AppRole
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  role: AppRole
  isManager: boolean
  allowAnonymousLogin: boolean
  authRedirectError: string | null
  signInMicrosoft: () => Promise<void>
  signInAnonymousDev: () => Promise<void>
  logout: () => Promise<void>
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string }).code
  const message = (error as { message?: string }).message ?? ''
  const raw = `${message} ${JSON.stringify(error)}`

  if (raw.includes('AADSTS50194') || raw.includes('not configured as a multi-tenant')) {
    return [
      'App Azure đang là Single tenant — Firebase không được dùng endpoint /common.',
      'Cách sửa: Azure → Microsoft Entra ID → Overview → copy Directory (tenant) ID.',
      'Thêm vào checklist-react/.env: VITE_MICROSOFT_TENANT_ID=<tenant-id>',
      'Restart npm run dev, đăng nhập bằng email @tổ chức (HQG TP.HCM).',
    ].join(' ')
  }

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Chưa bật đăng nhập Microsoft trên Firebase Console (Authentication → Sign-in method → Microsoft).'
    case 'auth/unauthorized-domain':
      return 'Domain chưa được phép. Mở app bằng http://localhost:8888 (không dùng 127.0.0.1). Nếu vẫn lỗi, thêm localhost vào Firebase → Authentication → Settings → Authorized domains.'
    case 'auth/popup-closed-by-user':
      return 'Bạn đã đóng cửa sổ đăng nhập. Vui lòng thử lại.'
    case 'auth/popup-blocked':
      return 'Trình duyệt chặn popup. Cho phép popup hoặc thử lại (app sẽ chuyển sang redirect).'
    case 'auth/account-exists-with-different-credential':
      return 'Email này đã liên kết phương thức đăng nhập khác.'
    case 'auth/invalid-credential':
    case 'auth/invalid-oauth-client-id':
      return [
        'Microsoft/Azure chưa khớp với Firebase (mã: auth/invalid-credential).',
        'Hay gặp nhất: trên Azure → Authentication, Redirect URI phải ở platform **Web** (KHÔNG phải Single-page application / SPA). Xóa platform SPA nếu có.',
        'Redirect URI (Web): https://chatbot-ktx.firebaseapp.com/__/auth/handler',
        'Firebase Microsoft: Application (client) ID + Secret cột Value (tạo secret mới nếu nghi ngờ).',
        'Mở F12 → Console xem chi tiết; popup Microsoft có thể hiện AADSTS9002325 nếu đang dùng SPA.',
      ].join(' ')
    default:
      return `${message ?? 'Đăng nhập thất bại.'}${code ? ` (mã: ${code})` : ''}`
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function resolveRoleForUser(email: string, displayName: string): Promise<AppRole> {
  const em = normalizeEmail(email)
  try {
    const cfg = await fetchEmailRecipientsConfig()
    if (cfg.leaders.some((x) => normalizeEmail(x.email) === em)) return 'leader'
    if (cfg.hrStaff.some((x) => normalizeEmail(x.email) === em)) return 'manager'
  } catch {
    /* ignore */
  }
  const managers = (import.meta.env.VITE_MANAGER_EMAILS as string | undefined)?.split(',') ?? []
  if (managers.map(normalizeEmail).includes(em)) return 'manager'
  void displayName
  return 'staff'
}

async function ensureUserProfile(user: User): Promise<UserProfile> {
  if (user.isAnonymous) {
    return {
      uid: user.uid,
      email: '',
      displayName: 'Dev (ẩn danh)',
      role: 'staff',
    }
  }

  const db = getDb()
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  const email = user.email ?? ''
  const displayName = user.displayName ?? email.split('@')[0] ?? 'User'

  if (snap.exists()) {
    const d = snap.data() as Record<string, unknown>
    return {
      uid: user.uid,
      email: String(d.email ?? email),
      displayName: String(d.displayName ?? displayName),
      role: (d.role as AppRole) ?? 'staff',
    }
  }

  const role = await resolveRoleForUser(email, displayName)
  const profile: UserProfile = { uid: user.uid, email, displayName, role }
  try {
    await setDoc(ref, {
      email,
      displayName,
      role,
      createdAtUtc: serverTimestamp(),
    })
  } catch {
    /* Firestore rules chưa deploy — vẫn cho vào app với profile tạm */
  }
  return profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authRedirectError, setAuthRedirectError] = useState<string | null>(null)

  const allowAnonymousLogin = import.meta.env.VITE_ALLOW_ANONYMOUS_LOGIN === '1'

  useEffect(() => {
    const auth = getFirebaseAuth()
    void getRedirectResult(auth).catch((e) => {
      setAuthRedirectError(authErrorMessage(e))
    })
    return onAuthStateChanged(auth, (u) => {
      void (async () => {
        setUser(u)
        if (!u) {
          setProfile(null)
          setLoading(false)
          return
        }
        try {
          const p = await ensureUserProfile(u)
          setProfile(p)
        } catch {
          setProfile(null)
        } finally {
          setLoading(false)
        }
      })()
    })
  }, [])

  const signInAnonymousDev = useCallback(async () => {
    await signInAnonymously(getFirebaseAuth())
  }, [])

  const signInMicrosoft = useCallback(async () => {
    const auth = getFirebaseAuth()
    const provider = new OAuthProvider('microsoft.com')
    const tenant = import.meta.env.VITE_MICROSOFT_TENANT_ID?.trim()
    if (tenant) {
      provider.setCustomParameters({ tenant })
    }
    provider.addScope('email')
    provider.addScope('profile')
    provider.addScope('openid')
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      console.error('[auth] Microsoft sign-in failed:', e)
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
        return
      }
      throw e
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut(getFirebaseAuth())
    setProfile(null)
  }, [])

  const role = profile?.role ?? 'staff'
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      role,
      isManager: role === 'manager' || role === 'leader',
      allowAnonymousLogin,
      authRedirectError,
      signInMicrosoft,
      signInAnonymousDev,
      logout,
    }),
    [user, profile, loading, role, allowAnonymousLogin, authRedirectError, signInMicrosoft, signInAnonymousDev, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
