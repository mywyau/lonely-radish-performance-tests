import { readFile } from 'node:fs/promises'
import { assertStagingReady, deploymentProtectionHeaders, loadManifest, sessionPath, stagingTarget } from './performance-safety.mjs'

await assertStagingReady()
const target = stagingTarget()
const manifest = await loadManifest()
const sessions = JSON.parse(await readFile(sessionPath(), 'utf8'))
if (!Array.isArray(sessions) || sessions.length !== manifest.accounts.length) {
  throw new Error('Session fixture size does not match the performance-user manifest')
}

let cursor = 0
let valid = 0
async function worker() {
  while (true) {
    const index = cursor++
    if (index >= sessions.length) return
    const session = sessions[index]
    if (!session?.cookie || /[\r\n]/.test(session.cookie)) throw new Error(`Invalid cookie for session ${index + 1}`)
    const response = await fetch(new URL('/api/auth/session', target), {
      headers: { ...deploymentProtectionHeaders(), cookie: `lonely-radish-session=${session.cookie}` },
    })
    if (!response.ok || (await response.json()).authenticated !== true) {
      throw new Error(`Session ${session.label || index + 1} is not authenticated`)
    }
    valid++
  }
}
await Promise.all(Array.from({ length: Math.min(20, sessions.length) }, () => worker()))
console.log(`Validated ${valid} authenticated staging sessions.`)
