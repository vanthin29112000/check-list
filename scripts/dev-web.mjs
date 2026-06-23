import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.join(__dirname, '..', 'checklist-react')
const PORT = 5173
const HOST = '127.0.0.1'

function isPortOpen(port, host = HOST) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    socket.setTimeout(500)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })
}

async function main() {
  if (await isPortOpen(PORT)) {
    // Netlify Dev gọi dev.command hai lần trên Windows — không khởi động thêm Vite.
    await new Promise(() => {})
    return
  }

  const child = spawn('npm', ['run', 'dev'], {
    cwd: webDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })

  child.on('exit', (code) => process.exit(code ?? 1))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
