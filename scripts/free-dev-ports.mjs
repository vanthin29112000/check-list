import { execSync } from 'node:child_process'

const PORTS = [8888, 38889]

function freePortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
    const pids = new Set()
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue
      const pid = line.trim().split(/\s+/).pop()
      if (pid && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
      } catch {
        /* process already gone */
      }
    }
  } catch {
    /* port free */
  }
}

for (const port of PORTS) {
  if (process.platform === 'win32') freePortWindows(port)
}
