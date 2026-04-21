/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site URL for link duyệt trong mail / chia sẻ (mặc định: origin trình duyệt). */
  readonly VITE_PUBLIC_BASE_URL?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  /** URL đầy đủ tới function (tuỳ chọn). Mặc định: cùng origin + `/.netlify/functions/send-checklist-notification` */
  readonly VITE_NOTIFY_FUNCTION_URL?: string
  /** Đặt `1` khi chạy `netlify dev` (functions :8888) và muốn Vite proxy `/.netlify/functions` */
  readonly VITE_NETLIFY_DEV_PROXY?: string
  /** Trùng NOTIFY_SHARED_SECRET trên Netlify / .env gốc nếu bật bảo vệ function gửi mail (lộ trong bundle). */
  readonly VITE_NOTIFY_SHARED_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
