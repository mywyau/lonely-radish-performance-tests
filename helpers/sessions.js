import { SharedArray } from 'k6/data'

const sessionFile = (__ENV.SESSION_FILE || '').trim()
// k6 resolves open() paths relative to the module that calls it. SESSION_FILE is
// documented and generated relative to the repository root, while this helper
// lives one directory below it.
const k6SessionFile = sessionFile && !sessionFile.startsWith('/')
  ? `../${sessionFile.replace(/^\.\//, '')}`
  : sessionFile
const fileSessions = sessionFile
  ? new SharedArray('synthetic member sessions', () => {
      const parsed = JSON.parse(open(k6SessionFile))
      if (!Array.isArray(parsed)) throw new Error('SESSION_FILE must contain a JSON array')
      return parsed
    })
  : []

const environmentSession = (__ENV.SESSION_COOKIE || '').trim()
const requireUniqueSessions = (__ENV.REQUIRE_UNIQUE_SESSIONS || '').trim().toLowerCase() === 'true'

export function hasSessions() {
  return fileSessions.length > 0 || Boolean(environmentSession)
}

export function sessionCount() {
  return fileSessions.length || (environmentSession ? 1 : 0)
}

export function sessionForVu(vu = __VU) {
  if (requireUniqueSessions && fileSessions.length && vu > fileSessions.length) {
    throw new Error(`VU ${vu} has no unique synthetic session; SESSION_FILE contains ${fileSessions.length}`)
  }
  const record = fileSessions.length
    ? fileSessions[(Math.max(1, vu) - 1) % fileSessions.length]
    : environmentSession ? { label: 'environment-session', cookie: environmentSession } : null
  if (!record || typeof record.cookie !== 'string' || !record.cookie.trim()) return null
  return record
}

export function cookieHeader(record) {
  const value = record?.cookie?.trim() || ''
  if (!value || /[\r\n]/.test(value)) throw new Error('Session cookie is missing or invalid')
  return value.startsWith('lonely-radish-session=')
    ? value
    : `lonely-radish-session=${value}`
}

export function cookieValue(record) {
  const header = cookieHeader(record)
  return header.slice(header.indexOf('=') + 1)
}

export function authenticatedParams(record, extraHeaders = {}) {
  return {
    headers: {
      Cookie: cookieHeader(record),
      ...extraHeaders,
    },
  }
}
