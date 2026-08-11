import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { poolConfiguration, stagingDatabaseUrl, stagingTarget } from '../scripts/performance-safety.mjs'

const names = [
  'TARGET_ENV', 'BASE_URL', 'PERF_ALLOWED_HOST', 'PERF_PRODUCTION_URL', 'PERF_DATABASE_URL',
  'PERF_EXPECTED_DATABASE_HOST', 'PERF_EXPECTED_DATABASE_PROJECT_REF', 'PERF_ALLOW_DATABASE_WRITE',
  'PERF_ALLOW_ACCOUNT_DELETE', 'PERF_USER_COUNT', 'PERF_EMAIL_DOMAIN', 'PERF_EMAIL_PREFIX',
  'PERF_SLUG_PREFIX', 'PERF_POOL_ID', 'PERF_ALLOW_LARGE_USER_POOL',
]
const original = Object.fromEntries(names.map(name => [name, process.env[name]]))

beforeEach(() => {
  delete process.env.PERF_SLUG_PREFIX
  delete process.env.PERF_ALLOW_LARGE_USER_POOL
  Object.assign(process.env, {
    TARGET_ENV: 'staging',
    BASE_URL: 'https://staging.example.com',
    PERF_ALLOWED_HOST: 'staging.example.com',
    PERF_PRODUCTION_URL: 'https://www.example.com',
    PERF_DATABASE_URL: 'postgresql://postgres.stagingref:secret@pooler.example.com:6543/postgres',
    PERF_EXPECTED_DATABASE_HOST: 'pooler.example.com',
    PERF_EXPECTED_DATABASE_PROJECT_REF: 'stagingref',
    PERF_ALLOW_DATABASE_WRITE: 'true',
    PERF_USER_COUNT: '100',
    PERF_EMAIL_DOMAIN: 'tests.example.com',
    PERF_EMAIL_PREFIX: 'perf-load',
    PERF_POOL_ID: 'default',
  })
})

afterEach(() => {
  for (const name of names) {
    if (original[name] == null) delete process.env[name]
    else process.env[name] = original[name]
  }
})

test('accepts an explicitly locked staging app and database', () => {
  assert.equal(stagingTarget().origin, 'https://staging.example.com')
  assert.match(stagingDatabaseUrl(), /^postgresql:/)
  assert.deepEqual(poolConfiguration(), {
    count: 100, prefix: 'perf-load', slugPrefix: 'perf-load', poolId: 'default', domain: 'tests.example.com',
  })
})

test('supports plus-address aliases while producing safe profile slugs', () => {
  process.env.PERF_EMAIL_PREFIX = 'owner+radish-perf'
  assert.equal(poolConfiguration().prefix, 'owner+radish-perf')
  assert.equal(poolConfiguration().slugPrefix, 'owner-radish-perf')
})

test('refuses production, host mismatches, and database project mismatches', () => {
  process.env.PERF_PRODUCTION_URL = process.env.BASE_URL
  assert.throws(() => stagingTarget(), /production application target/)
  process.env.PERF_PRODUCTION_URL = 'https://www.example.com'
  process.env.PERF_ALLOWED_HOST = 'another.example.com'
  assert.throws(() => stagingTarget(), /does not match BASE_URL/)
  process.env.PERF_ALLOWED_HOST = 'staging.example.com'
  process.env.PERF_EXPECTED_DATABASE_PROJECT_REF = 'productionref'
  assert.throws(() => stagingDatabaseUrl(), /does not match PERF_EXPECTED_DATABASE_PROJECT_REF/)
})

test('requires an even bounded account pool and explicit large-pool and destructive permissions', () => {
  process.env.PERF_USER_COUNT = '99'
  assert.throws(() => poolConfiguration(), /even number between 2 and 2000/)
  process.env.PERF_USER_COUNT = '2002'
  assert.throws(() => poolConfiguration(), /even number between 2 and 2000/)
  process.env.PERF_USER_COUNT = '1000'
  assert.throws(() => poolConfiguration(), /PERF_ALLOW_LARGE_USER_POOL/)
  process.env.PERF_ALLOW_LARGE_USER_POOL = 'true'
  assert.equal(poolConfiguration().count, 1000)
  process.env.PERF_USER_COUNT = '100'
  assert.throws(() => stagingDatabaseUrl({ destructive: true }), /PERF_ALLOW_ACCOUNT_DELETE/)
  process.env.PERF_ALLOW_ACCOUNT_DELETE = 'true'
  assert.match(stagingDatabaseUrl({ destructive: true }), /^postgresql:/)
})
