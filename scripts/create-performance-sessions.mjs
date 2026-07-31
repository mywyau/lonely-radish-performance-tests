import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { chromium } from '@playwright/test'
import { assertStagingReady, loadManifest, required, sessionPath, stagingTarget } from './performance-safety.mjs'

await assertStagingReady()
const target = stagingTarget()
const manifest = await loadManifest()
const password = required('PERF_TEST_PASSWORD')
const concurrency = Number.parseInt(process.env.PERF_AUTH_CONCURRENCY || '3', 10)
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 10) {
  throw new Error('PERF_AUTH_CONCURRENCY must be between 1 and 10')
}

async function signIn(browser, account) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(new URL('/api/auth/login?mode=switch&returnTo=/matches', target).toString(), {
      waitUntil: 'domcontentloaded',
    })
    const identity = page.locator('input[name="username"], input[name="email"], input[type="email"]').first()
    await identity.waitFor({ state: 'visible', timeout: 30_000 })
    await identity.fill(account.email)
    let passwordInput = page.locator('input[name="password"], input[type="password"]').first()
    if (!await passwordInput.isVisible()) {
      await page.locator('button[type="submit"], input[type="submit"]').first().click()
      passwordInput = page.locator('input[name="password"], input[type="password"]').first()
      await passwordInput.waitFor({ state: 'visible', timeout: 30_000 })
    }
    await passwordInput.fill(password)
    await page.locator('button[type="submit"], input[type="submit"]').first().click()
    await page.waitForURL(url => url.origin === target.origin && !url.pathname.startsWith('/api/auth/'), {
      timeout: 45_000,
    })
    const cookie = (await context.cookies(target.origin)).find(item => item.name === 'lonely-radish-session')
    if (!cookie?.value) throw new Error('application session cookie was not created')
    return cookie.value
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not authenticate ${account.email}: ${detail}`)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()
const cookies = new Array(manifest.accounts.length)
let cursor = 0
let completed = 0
try {
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= manifest.accounts.length) return
      cookies[index] = await signIn(browser, manifest.accounts[index])
      completed++
      if (completed % 10 === 0 || completed === manifest.accounts.length) {
        console.log(`Authenticated sessions ready: ${completed}/${manifest.accounts.length}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, manifest.accounts.length) }, () => worker()))
} finally {
  await browser.close()
}

function nextSaturdayProposalTime() {
  const date = new Date()
  const days = (6 - date.getUTCDay() + 7) % 7 || 7
  date.setUTCDate(date.getUTCDate() + days)
  date.setUTCHours(14, 0, 0, 0)
  return date.toISOString()
}

const partnerOffset = manifest.accounts.length / 2
const sessions = manifest.accounts.map((account, index) => {
  const partnerIndex = (index + partnerOffset) % manifest.accounts.length
  const partner = manifest.accounts[partnerIndex]
  return {
    label: account.slug,
    cookie: cookies[index],
    profileSlug: account.slug,
    writeProfileSlug: partner.slug,
    partnerCookie: cookies[partnerIndex],
    partnerProfileSlug: partner.slug,
    proposal: {
      activity: 'Gallery walk',
      inviteNote: 'Synthetic staging performance test',
      venue: 'Barbican Centre',
      venueAddress: 'Silk Street, London',
      venuePostcode: 'EC2Y 8DS',
      meetingPoint: 'Outside the main entrance',
      time: nextSaturdayProposalTime(),
    },
  }
})

const output = sessionPath()
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(sessions, null, 2)}\n`, { mode: 0o600 })
console.log(`Wrote ${sessions.length} short-lived application sessions to ${output}`)
