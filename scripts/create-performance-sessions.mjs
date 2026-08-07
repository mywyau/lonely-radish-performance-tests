import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium, request } from '@playwright/test'
import { assertStagingReady, deploymentProtectionUrl, loadManifest, required, sessionPath, stagingTarget } from './performance-safety.mjs'

await assertStagingReady()
const target = stagingTarget()
const manifest = await loadManifest()
const password = required('PERF_TEST_PASSWORD')
const auth0Domain = required('PERF_AUTH0_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '')
const auth0Connection = required('PERF_AUTH0_CONNECTION')
const concurrency = Number.parseInt(process.env.PERF_AUTH_CONCURRENCY || '1', 10)
const delayMs = Number.parseInt(process.env.PERF_AUTH_DELAY_MS || '250', 10)
const authHeaded = process.env.PERF_AUTH_HEADED === 'true'
const slowMo = Number.parseInt(process.env.PERF_AUTH_SLOW_MO || '0', 10)
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 10) {
  throw new Error('PERF_AUTH_CONCURRENCY must be between 1 and 10')
}
if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 10_000) {
  throw new Error('PERF_AUTH_DELAY_MS must be between 0 and 10000')
}
if (!Number.isSafeInteger(slowMo) || slowMo < 0 || slowMo > 5_000) {
  throw new Error('PERF_AUTH_SLOW_MO must be between 0 and 5000')
}

async function createVercelBypassState() {
  if (!process.env.PERF_VERCEL_BYPASS_SECRET?.trim()) return undefined
  const api = await request.newContext()
  try {
    const response = await api.get(deploymentProtectionUrl('/').toString())
    if (!response.ok()) throw new Error(`Vercel protection bypass returned HTTP ${response.status()}`)
    const state = await api.storageState()
    if (!state.cookies.some(cookie => cookie.name === '_vercel_jwt')) {
      throw new Error('Vercel accepted the bypass but did not issue a browser cookie')
    }
    return state
  } finally { await api.dispose() }
}

async function submitFormFor(field) {
  const submit = field.locator('xpath=ancestor::form[1]').locator([
    'button[type="submit"]:not([aria-hidden="true"]):visible',
    'input[type="submit"]:not([aria-hidden="true"]):visible',
  ].join(', ')).last()
  await submit.waitFor({ state: 'visible', timeout: 20_000 })
  await submit.click()
}

async function visibleAuthError(page) {
  const messages = await page.locator([
    '[role="alert"]:visible', '[aria-live="assertive"]:visible',
    '.ulp-input-error-message:visible', '.ulp-error-info:visible',
  ].join(', ')).allInnerTexts().catch(() => [])
  return [...new Set(messages.map(message => message.replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' | ')
}

const initialStorageState = await createVercelBypassState()

async function signIn(browser, account) {
  const context = await browser.newContext({ storageState: initialStorageState })
  const page = await context.newPage()
  try {
    const loginUrl = new URL('/api/auth/login?mode=switch&returnTo=/matches', target)
    const loginResponse = await context.request.get(loginUrl.toString(), { maxRedirects: 0 })
    if (![301, 302, 303, 307, 308].includes(loginResponse.status())) {
      throw new Error(`Application login initiation returned HTTP ${loginResponse.status()}`)
    }
    const location = loginResponse.headers().location
    if (!location) throw new Error('Application login initiation did not return an Auth0 redirect')
    const authorizeUrl = new URL(location)
    if (authorizeUrl.hostname !== auth0Domain) {
      throw new Error(`Application login redirected to unexpected identity host ${authorizeUrl.hostname}`)
    }
    authorizeUrl.searchParams.set('connection', auth0Connection)
    await page.goto(authorizeUrl.toString(), { waitUntil: 'domcontentloaded' })
    const identity = page.locator([
      'input[name="username"]:visible', 'input[name="email"]:visible', 'input[type="email"]:visible',
    ].join(', ')).first()
    await identity.waitFor({ state: 'visible', timeout: 20_000 })
    await identity.fill(account.email)
    let passwordInput = page.locator('input[name="password"]:visible, input[type="password"]:visible').first()
    if (!await passwordInput.isVisible()) {
      await submitFormFor(identity)
      passwordInput = page.locator('input[name="password"]:visible, input[type="password"]:visible').first()
      await passwordInput.waitFor({ state: 'visible', timeout: 20_000 })
    }
    await passwordInput.fill(password)
    await submitFormFor(passwordInput)
    const rejected = page.getByText(
      /wrong email or password|incorrect (?:username|email) or password|invalid password|too many attempts|suspicious|captcha|verify you are human|blocked|access denied/i,
    ).first().waitFor({ state: 'visible', timeout: 45_000 }).then(async () => {
      throw new Error(`Auth0 rejected the login${await visibleAuthError(page) ? `: ${await visibleAuthError(page)}` : ''}`)
    })
    await Promise.race([
      page.waitForURL(url => url.origin === target.origin && !url.pathname.startsWith('/api/auth/'), {
        timeout: 45_000, waitUntil: 'domcontentloaded',
      }),
      rejected,
    ])
    const contextCookies = await context.cookies(target.origin)
    const cookie = contextCookies.find(item => item.name === 'lonely-radish-session')
    if (!cookie?.value) throw new Error('application session cookie was not created')
    const bypassCookie = contextCookies.find(item => item.name === '_vercel_jwt')
    return { cookie: cookie.value, bypassCookie: bypassCookie
      ? { name: bypassCookie.name, value: bypassCookie.value } : null }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const diagnosticPath = resolve(process.cwd(), 'test-results', 'auth', `login-failure-${account.number}.png`)
    await mkdir(dirname(diagnosticPath), { recursive: true })
    await page.screenshot({ path: diagnosticPath, fullPage: true }).catch(() => undefined)
    const visibleError = await visibleAuthError(page)
    throw new Error(`Could not authenticate ${account.email} on ${page.url()}${visibleError ? ` (${visibleError})` : ''}. Screenshot: ${diagnosticPath}. ${detail}`)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ headless: !authHeaded, slowMo })
const authenticationStates = new Array(manifest.accounts.length)
let cursor = 0
let completed = 0
try {
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= manifest.accounts.length) return
      authenticationStates[index] = await signIn(browser, manifest.accounts[index])
      completed++
      if (completed % 10 === 0 || completed === manifest.accounts.length) {
        console.log(`Authenticated sessions ready: ${completed}/${manifest.accounts.length}`)
      }
      if (delayMs) await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs))
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
    cookie: authenticationStates[index].cookie,
    deploymentProtectionCookie: authenticationStates[index].bypassCookie,
    profileSlug: account.slug,
    writeProfileSlug: partner.slug,
    partnerCookie: authenticationStates[partnerIndex].cookie,
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
