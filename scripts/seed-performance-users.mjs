import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import pg from 'pg'
import { ensurePerformanceUser, managementToken } from './performance-auth0.mjs'
import {
  assertStagingReady, databaseSsl, manifestPath, poolConfiguration, required,
  stagingDatabaseUrl, stagingTarget,
} from './performance-safety.mjs'

await assertStagingReady()
const target = stagingTarget()
const pool = poolConfiguration()
const output = manifestPath()
const password = required('PERF_TEST_PASSWORD')
if (password.length < 12) throw new Error('PERF_TEST_PASSWORD must contain at least 12 characters')

try {
  const existingManifest = JSON.parse(await readFile(output, 'utf8'))
  const namespace = `${pool.prefix}-*@${pool.domain}`
  if (existingManifest.target !== target.origin || existingManifest.poolId !== pool.poolId
    || existingManifest.emailNamespace !== namespace
    || existingManifest.slugNamespace !== `${pool.slugPrefix}-*`) {
    throw new Error('Existing performance-user manifest belongs to a different target, pool, email, or slug namespace')
  }
  if (existingManifest.accounts?.length > pool.count) {
    throw new Error('Refusing to shrink a pool because it would orphan test accounts; destroy it first')
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const width = Math.max(5, String(pool.count).length)
const definitions = Array.from({ length: pool.count }, (_, index) => {
  const number = String(index + 1).padStart(width, '0')
  return {
    number,
    email: `${pool.prefix}-${number}@${pool.domain}`,
    name: `Performance Member ${number}`,
    slug: `${pool.slugPrefix}-${number}`,
  }
})

console.log(`Creating or reusing ${pool.count} marked Auth0 users for pool ${pool.poolId}...`)
const token = await managementToken()
const accounts = []
for (const [index, definition] of definitions.entries()) {
  const user = await ensurePerformanceUser(token, definition, pool.poolId)
  accounts.push({ id: user.user_id, ...definition })
  if ((index + 1) % 25 === 0 || index + 1 === definitions.length) {
    console.log(`Auth0 users ready: ${index + 1}/${definitions.length}`)
  }
}

const database = new pg.Client({ connectionString: stagingDatabaseUrl(), ssl: databaseSsl() })
await database.connect()
try {
  await database.query('begin')
  await database.query(`select pg_advisory_xact_lock(hashtext('lonely-radish-performance-seed'))`)
  const migration = await database.query(`select exists(
    select 1 from schema_migrations where filename='20260901_pace_received_interests.sql'
  ) as current`)
  if (migration.rows[0]?.current !== true) throw new Error('Staging database migrations are not current')

  const ids = accounts.map(account => account.id)
  const emails = accounts.map(account => account.email)
  const collisions = await database.query(`select id,email from users
    where lower(email)=any($1::text[]) and not(id=any($2::text[]))`, [emails, ids])
  if (collisions.rowCount) throw new Error('A generated performance email belongs to a different database user')

  await database.query(`delete from outbox_events where
    payload->>'senderId'=any($1::text[]) or payload->>'recipientId'=any($1::text[])
    or payload->>'userOneId'=any($1::text[]) or payload->>'userTwoId'=any($1::text[])`, [ids])
  await database.query(`delete from notifications where recipient_id=any($1::text[]) or actor_id=any($1::text[])`, [ids])
  await database.query(`delete from daily_interests where sender_id=any($1::text[]) or recipient_id=any($1::text[])`, [ids])
  await database.query(`delete from blocks where blocker_id=any($1::text[]) or blocked_id=any($1::text[])`, [ids])
  await database.query(`delete from reports where reporter_id=any($1::text[]) or reported_id=any($1::text[])`, [ids])
  await database.query(`delete from matches where user_one_id=any($1::text[]) or user_two_id=any($1::text[])`, [ids])
  for (const table of ['profile_photos', 'profile_activities', 'profile_interests', 'availability', 'match_preferences']) {
    await database.query(`delete from ${table} where user_id=any($1::text[])`, [ids])
  }
  await database.query(`delete from profiles where user_id=any($1::text[])`, [ids])

  const photo = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='1000'%3E%3Crect width='100%25' height='100%25' fill='%23e9d5c2'/%3E%3Ccircle cx='400' cy='350' r='160' fill='%23b4234a'/%3E%3Cpath d='M130 920c45-220 495-220 540 0' fill='%23b4234a'/%3E%3C/svg%3E`
  for (const [index, account] of accounts.entries()) {
    const longitude = -0.145 + (index % 20) * 0.001
    const latitude = 51.495 + (index % 15) * 0.001
    await database.query(`insert into users(
        id,email,first_name,last_name,role,account_status,timezone,account_type,onboarding_completed_at,
        stripe_customer_id,paused_at,paused_until,deleting_at,deletion_requested_at,deletion_status,deleted_at,
        confirmed_no_show_count,discovery_restricted_until,interest_inbox_reopens_at
      ) values($1,$2,$3,'Test','member','active','Europe/London','personal',now(),null,null,null,null,null,null,null,0,null,null)
      on conflict(id) do update set email=excluded.email,first_name=excluded.first_name,last_name='Test',
        role='member',account_status='active',timezone='Europe/London',account_type='personal',
        onboarding_completed_at=now(),stripe_customer_id=null,paused_at=null,paused_until=null,deleting_at=null,
        deletion_requested_at=null,deletion_status=null,deleted_at=null,confirmed_no_show_count=0,
        discovery_restricted_until=null,interest_inbox_reopens_at=null,updated_at=now()`,
      [account.id, account.email, account.name])
    await database.query(`insert into entitlements(user_id,plan,subscription_status,cancel_at_period_end)
      values($1,'free','no_subscription',false) on conflict(user_id) do update
      set plan='free',subscription_status='no_subscription',current_period_start=null,current_period_end=null,
        cancel_at_period_end=false,canceled_at=null`, [account.id])
    await database.query(`insert into email_notification_preferences(user_id,interests,matches,date_plans,follow_ups)
      values($1,false,false,false,false) on conflict(user_id) do update set interests=false,matches=false,
        date_plans=false,follow_ups=false,updated_at=now()`, [account.id])
    await database.query(`insert into profiles(
        user_id,slug,display_name,date_of_birth,pronouns,bio,visibility,gender_identity,race_ethnicity,
        sexual_orientation,postcode_area,location_label,location,height_cm,drinking,smoking,daily_rhythm
      ) values($1,$2,$3,'1992-04-12','they/them',
        'Synthetic staging account reserved for performance testing.','active','neither','White','bisexual',
        'EC1','Central London',extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,
        170,'socially','never','flexible')`, [account.id, account.slug, account.name, longitude, latitude])
    await database.query(`insert into profile_photos(user_id,public_url,alt_text,position)
      values($1,$2,$3,1)`, [account.id, photo, `${account.name} synthetic portrait`])
    await database.query(`insert into profile_activities(user_id,activity_id,position)
      select $1,id,1 from activities where lower(name)=lower('Gallery walks') limit 1`, [account.id])
    await database.query(`insert into profile_interests(user_id,label,position)
      values($1,'Performance testing',1),($1,'Gallery walks',2)`, [account.id])
    await database.query(`insert into availability(user_id,label,position,weekday,start_time,end_time)
      values($1,'Saturday afternoons',1,5,'12:00','18:00')`, [account.id])
    await database.query(`insert into match_preferences(
        user_id,max_distance_km,minimum_age,maximum_age,timing,public_places_only,interested_genders,
        open_to_everyone,preferred_ethnicities,no_ethnicity_preference,dating_preferences_set,
        availability_visible_before_match,interested_orientations,no_orientation_preference
      ) values($1,100,18,80,array['Weekends'],true,'{}',true,'{}',true,true,true,array['bisexual'],false)`, [account.id])
    if ((index + 1) % 25 === 0 || index + 1 === accounts.length) {
      console.log(`Database profiles ready: ${index + 1}/${accounts.length}`)
    }
  }
  await database.query('commit')
} catch (error) {
  await database.query('rollback')
  throw error
} finally {
  await database.end()
}

await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({
  version: 1,
  target: target.origin,
  poolId: pool.poolId,
  emailNamespace: `${pool.prefix}-*@${pool.domain}`,
  slugNamespace: `${pool.slugPrefix}-*`,
  createdAt: new Date().toISOString(),
  accounts,
}, null, 2)}\n`, { mode: 0o600 })
console.log(`Performance pool ready. Manifest written to ${output}`)
