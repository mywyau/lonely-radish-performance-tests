import {
  assertStagingReady, poolConfiguration, required, stagingDatabaseUrl, stagingTarget,
} from './performance-safety.mjs'

const target = stagingTarget()
const database = new URL(stagingDatabaseUrl())
const pool = poolConfiguration()
for (const name of [
  'PERF_AUTH0_DOMAIN', 'PERF_AUTH0_MGMT_CLIENT_ID', 'PERF_AUTH0_MGMT_CLIENT_SECRET',
  'PERF_AUTH0_CONNECTION', 'PERF_TEST_PASSWORD',
]) required(name)
if (required('PERF_TEST_PASSWORD').length < 12) {
  throw new Error('PERF_TEST_PASSWORD must contain at least 12 characters')
}
await assertStagingReady()

console.log('Performance-user configuration is safe and complete.')
console.log(`Target: ${target.origin}`)
console.log(`Database host: ${database.hostname}`)
console.log(`Synthetic pool: ${pool.count} users in ${pool.poolId}`)
