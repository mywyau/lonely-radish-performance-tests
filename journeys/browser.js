import { browser } from 'k6/browser'
import { check } from 'k6'
import { baseUrl } from '../helpers/config.js'
import { cookieValue, hasSessions, sessionForVu } from '../helpers/sessions.js'

async function navigate(page, path, name) {
  const target = `${baseUrl}${path}`
  const response = await page.goto(target, { waitUntil: 'load', timeout: 30000 })
  check({ response, currentUrl: page.url() }, {
    [`browser ${name}: navigation succeeded`]: result => {
      const status = result.response?.status()
      return (typeof status === 'number' && status >= 200 && status < 400)
        || result.currentUrl === target
    },
  })
}

export async function browserJourney() {
  const context = await browser.newContext()
  const session = hasSessions() ? sessionForVu() : null
  if (session) {
    const cookies = [{
      name: 'lonely-radish-session',
      value: cookieValue(session),
      url: baseUrl,
      httpOnly: true,
      secure: baseUrl.startsWith('https://'),
      sameSite: 'Lax',
    }]
    if (session.deploymentProtectionCookie?.name && session.deploymentProtectionCookie?.value) {
      cookies.push({ name: session.deploymentProtectionCookie.name,
        value: session.deploymentProtectionCookie.value, url: baseUrl,
        httpOnly: true, secure: baseUrl.startsWith('https://'), sameSite: 'Lax' })
    }
    await context.addCookies(cookies)
  }
  const page = await context.newPage()
  try {
    await navigate(page, '/', 'homepage')
    await navigate(page, '/faq', 'faq')
    if (session) {
      await navigate(page, '/activities/casual', 'discovery')
      await navigate(page, '/matches', 'matches')
      if (session.partnerProfileSlug) {
        await navigate(page, `/plans/${encodeURIComponent(session.partnerProfileSlug)}`, 'planning')
      }
      await navigate(page, '/account/v2', 'account')
    }
  } finally {
    await page.close()
    await context.close()
  }
}
