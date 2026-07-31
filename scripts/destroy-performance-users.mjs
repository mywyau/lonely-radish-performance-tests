import { unlink } from 'node:fs/promises'
import pg from 'pg'
import { assertPerformanceUser, auth0Request, managementToken } from './performance-auth0.mjs'
import {
  databaseSsl, loadManifest, manifestPath, poolConfiguration, sessionPath, stagingDatabaseUrl,
} from './performance-safety.mjs'

const databaseUrl = stagingDatabaseUrl({ destructive: true })
const manifest = await loadManifest()
const pool = poolConfiguration()
const token = await managementToken()

console.log(`Validating ${manifest.accounts.length} marked Auth0 accounts before deletion...`)
for (const account of manifest.accounts) {
  const matches = await auth0Request(token, `/users-by-email?email=${encodeURIComponent(account.email)}`)
  const user = matches.find(candidate => candidate.user_id === account.id)
  if (user) assertPerformanceUser(user, account, pool.poolId)
}

const database = new pg.Client({ connectionString: databaseUrl, ssl: databaseSsl() })
await database.connect()
try {
  await database.query('begin')
  await database.query(`select pg_advisory_xact_lock(hashtext('lonely-radish-performance-destroy'))`)
  const ids = manifest.accounts.map(account => account.id)
  const expected = new Map(manifest.accounts.map(account => [account.id, account.email]))
  const existing = await database.query('select id,email from users where id=any($1::text[])', [ids])
  for (const row of existing.rows) {
    if (expected.get(row.id) !== row.email.toLowerCase()) {
      throw new Error(`Database identity mismatch for marked account ${row.id}`)
    }
  }
  await database.query(`delete from outbox_events where
    payload->>'senderId'=any($1::text[]) or payload->>'recipientId'=any($1::text[])
    or payload->>'userOneId'=any($1::text[]) or payload->>'userTwoId'=any($1::text[])`, [ids])
  await database.query('delete from users where id=any($1::text[])', [ids])
  await database.query('commit')
} catch (error) {
  await database.query('rollback')
  throw error
} finally {
  await database.end()
}

let deleted = 0
for (const account of manifest.accounts) {
  const matches = await auth0Request(token, `/users-by-email?email=${encodeURIComponent(account.email)}`)
  const user = matches.find(candidate => candidate.user_id === account.id)
  if (!user) continue
  assertPerformanceUser(user, account, pool.poolId)
  await auth0Request(token, `/users/${encodeURIComponent(account.id)}`, { method: 'DELETE' })
  deleted++
  if (deleted % 25 === 0) console.log(`Auth0 users deleted: ${deleted}`)
}

for (const path of [sessionPath(), manifestPath()]) {
  try { await unlink(path) } catch (error) { if (error?.code !== 'ENOENT') throw error }
}
console.log(`Destroyed the marked staging performance pool (${deleted} Auth0 users removed).`)
