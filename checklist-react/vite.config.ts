import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const NOTIFY_FN = '/.netlify/functions/send-checklist-notification'

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
      // Netlify Dev (và một số tool) probe cổng 5173 — cần lắng nghe rõ ràng, không đổi cổng im lặng
      host: true,
      port: 5173,
      strictPort: true,
      ...(proxyNetlify
        ? {
            proxy: {
              '/.netlify/functions': { target: 'http://127.0.0.1:8888', changeOrigin: true },
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
