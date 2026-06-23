/** Chờ Netlify Functions (port 38889) sẵn sàng trước khi mở Vite — tránh proxy ETIMEDOUT lúc khởi động. */
import http from 'node:http'

const HOST = '127.0.0.1'
const PORT = 38889
const MAX_MS = 120_000
const INTERVAL_MS = 500

function probe() {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port: PORT, method: 'GET', path: '/', timeout: 3000 }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.end()
  })
}

const start = Date.now()
while (Date.now() - start < MAX_MS) {
  try {
    await probe()
    process.exit(0)
  } catch {
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
}
console.error(`Timed out waiting for http://${HOST}:${PORT} (Netlify Functions)`)
process.exit(1)
