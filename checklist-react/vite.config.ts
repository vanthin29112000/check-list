import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const NOTIFY_FN = '/.netlify/functions/send-checklist-notification'

const FUNCTIONS_DEV_PORT = 38889

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyNetlify = env.VITE_NETLIFY_DEV_PROXY === '1'
  const notifyExplicit = env.VITE_NOTIFY_FUNCTION_URL?.trim()
  let notifyProxyTarget: string | null = null
  if (!proxyNetlify && notifyExplicit) {
    try {
      notifyProxyTarget = new URL(notifyExplicit).origin
    } catch {
      /* bỏ qua URL sai */
    }
  }

  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: 8888,
      strictPort: true,
      ...(proxyNetlify
        ? {
            proxy: {
              '/.netlify/functions': {
                target: `http://127.0.0.1:${FUNCTIONS_DEV_PORT}`,
                changeOrigin: true,
                timeout: 120_000,
                proxyTimeout: 120_000,
              },
            },
          }
        : notifyProxyTarget
          ? {
              // Tránh CORS: trình duyệt gọi cùng origin :5173, Vite chuyển tiếp tới Netlify đã deploy
              [NOTIFY_FN]: {
                target: notifyProxyTarget,
                changeOrigin: true,
                secure: true,
              },
            }
          : {}),
    },
  }
})
