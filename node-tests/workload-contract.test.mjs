import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = path => readFileSync(resolve(process.cwd(), path), 'utf8')

test('matching models the consolidated matches dashboard request', () => {
  const matching = read('journeys/matching.js')
  assert.match(matching, /\/api\/matches\?includeNotifications=true/)
  assert.doesNotMatch(matching, /get\('\/api\/notifications'/)
  assert.match(matching, /dashboardBody\.notifications/)
  assert.match(matching, /dashboardBody\.unreadNotificationCount/)
})

test('account models bootstrap caching and the two concurrent page reads', () => {
  const account = read('journeys/account.js')
  assert.match(account, /bootstrapCacheMs = 60_000/)
  assert.match(account, /getBatch\(\[/)
  assert.match(account, /\/api\/profile\/me/)
  assert.match(account, /\/api\/profile\/readiness/)
  assert.doesNotMatch(account, /\/api\/navigation\/counts/)
})

test('profile navigation models the daily-interest client cache', () => {
  const discovery = read('journeys/discovery.js')
  assert.match(discovery, /dailyInterestCacheMs = 30_000/)
  assert.match(discovery, /getBatch\(requests\)/)
  assert.match(discovery, /\/api\/interests\/today/)
})

test('capacity uses the consolidated dashboard rather than a standalone notification request', () => {
  const capacity = read('journeys/capacity.js')
  assert.match(capacity, /\/api\/matches\?includeNotifications=true/)
  assert.doesNotMatch(capacity, /\/api\/notifications/)
})
