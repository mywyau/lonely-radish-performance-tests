import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function stagingTarget() {
  if (required('TARGET_ENV').toLowerCase() !== 'staging') {
    throw new Error('Performance-user automation requires TARGET_ENV=staging')
  }
  const target = new URL(required('BASE_URL'))
  if (target.protocol !== 'https:' || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('BASE_URL must be an HTTPS origin without a path')
  }
  if (target.hostname !== required('PERF_ALLOWED_HOST')) {
    throw new Error('PERF_ALLOWED_HOST does not match BASE_URL')
  }
  const production = process.env.PERF_PRODUCTION_URL?.trim()
  if (production && new URL(production).origin === target.origin) {
    throw new Error('Refusing to use the production application target')
  }
  return target
}

export function stagingDatabaseUrl({ destructive = false } = {}) {
  stagingTarget()
  if (process.env.PERF_ALLOW_DATABASE_WRITE !== 'true') {
    throw new Error('PERF_ALLOW_DATABASE_WRITE must be exactly true')
  }
  if (destructive && process.env.PERF_ALLOW_ACCOUNT_DELETE !== 'true') {
    throw new Error('PERF_ALLOW_ACCOUNT_DELETE must be exactly true')
  }
  const database = new URL(required('PERF_DATABASE_URL'))
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new Error('PERF_DATABASE_URL must be a PostgreSQL URL')
  }
  if (database.hostname !== required('PERF_EXPECTED_DATABASE_HOST')) {
    throw new Error('PERF_EXPECTED_DATABASE_HOST does not match PERF_DATABASE_URL')
  }
  const expectedRef = required('PERF_EXPECTED_DATABASE_PROJECT_REF').toLowerCase()
  const directRef = database.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1]
  const pooledRef = decodeURIComponent(database.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1]
  if ((directRef || pooledRef)?.toLowerCase() !== expectedRef) {
    throw new Error('PERF_DATABASE_URL does not match PERF_EXPECTED_DATABASE_PROJECT_REF')
  }
  return database.toString()
}

export function databaseSsl() {
  return process.env.PERF_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
}

export function poolConfiguration() {
  const count = Number.parseInt(process.env.PERF_USER_COUNT || '100', 10)
  if (!Number.isSafeInteger(count) || count < 2 || count > 500 || count % 2 !== 0) {
    throw new Error('PERF_USER_COUNT must be an even number between 2 and 500')
  }
  const prefix = (process.env.PERF_EMAIL_PREFIX || 'perf-load').trim().toLowerCase()
  const slugPrefix = (process.env.PERF_SLUG_PREFIX || prefix.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    .trim().toLowerCase()
  const poolId = (process.env.PERF_POOL_ID || 'default').trim().toLowerCase()
  const domain = required('PERF_EMAIL_DOMAIN').toLowerCase()
  if (!/^[a-z0-9][a-z0-9._+-]{0,62}$/.test(prefix)) throw new Error('PERF_EMAIL_PREFIX is invalid')
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slugPrefix)) throw new Error('PERF_SLUG_PREFIX is invalid')
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(poolId)) throw new Error('PERF_POOL_ID is invalid')
  if (!/^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error('PERF_EMAIL_DOMAIN must be a valid domain you control')
  }
  return { count, prefix, slugPrefix, poolId, domain }
}

export function manifestPath() {
  return resolve(process.cwd(), process.env.PERF_USER_MANIFEST || 'fixtures/performance-users.json')
}

export function sessionPath() {
  return resolve(process.cwd(), process.env.SESSION_FILE || 'fixtures/sessions.json')
}

export async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath(), 'utf8'))
  const target = stagingTarget()
  const pool = poolConfiguration()
  if (manifest.target !== target.origin || manifest.poolId !== pool.poolId) {
    throw new Error('Performance-user manifest does not match the configured staging target and pool')
  }
  if (!Array.isArray(manifest.accounts) || manifest.accounts.length !== pool.count) {
    throw new Error('Performance-user manifest size does not match PERF_USER_COUNT')
  }
  return manifest
}

export async function assertStagingReady() {
  const response = await fetch(new URL('/api/health', stagingTarget()))
  if (!response.ok) throw new Error(`Staging health returned HTTP ${response.status}`)
  const health = await response.json()
  if (health.status !== 'ok' || health.environment !== 'staging' || health.checks?.deploymentSafety !== 'safe') {
    throw new Error('The target did not report a safe, ready staging environment')
  }
}
