import { setTimeout as delay } from 'node:timers/promises'
import { required } from './performance-safety.mjs'

export const performanceMarker = 'lonely-radish-performance'

export function auth0Domain() {
  return required('PERF_AUTH0_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export async function managementToken() {
  const domain = auth0Domain()
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: required('PERF_AUTH0_MGMT_CLIENT_ID'),
      client_secret: required('PERF_AUTH0_MGMT_CLIENT_SECRET'),
      audience: `https://${domain}/api/v2/`,
    }),
  })
  if (!response.ok) throw new Error(`Auth0 token request failed with HTTP ${response.status}`)
  return (await response.json()).access_token
}

export async function auth0Request(token, path, options = {}) {
  const domain = auth0Domain()
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response = await fetch(`https://${domain}/api/v2${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers },
    })
    if (response.ok) return response.status === 204 ? null : response.json()
    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after') || '1')
      await delay(Math.max(1000, retryAfter * 1000))
      continue
    }
    const detail = await response.text()
    throw new Error(`Auth0 ${options.method || 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 300)}`)
  }
  throw new Error('Auth0 request retry limit reached')
}

export function assertPerformanceUser(user, definition, poolId) {
  const metadata = user?.app_metadata || {}
  if (user?.email?.toLowerCase() !== definition.email || metadata.test_type !== performanceMarker
    || metadata.pool_id !== poolId || metadata.environment !== 'staging') {
    throw new Error(`Refusing to reuse unmarked Auth0 account ${definition.email}`)
  }
}

export async function ensurePerformanceUser(token, definition, poolId) {
  const connection = required('PERF_AUTH0_CONNECTION')
  const matches = await auth0Request(token, `/users-by-email?email=${encodeURIComponent(definition.email)}`)
  const existing = matches.find(user => user.identities?.some(identity => identity.connection === connection))
  if (existing) {
    assertPerformanceUser(existing, definition, poolId)
    return existing
  }
  return auth0Request(token, '/users', {
    method: 'POST',
    body: JSON.stringify({
      connection,
      email: definition.email,
      password: required('PERF_TEST_PASSWORD'),
      email_verified: true,
      verify_email: false,
      name: definition.name,
      given_name: definition.name,
      app_metadata: { test_type: performanceMarker, pool_id: poolId, environment: 'staging' },
    }),
  })
}
