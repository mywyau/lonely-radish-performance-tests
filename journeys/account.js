import { expectStatus, get, getBatch } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

const bootstrapCacheMs = 60_000
let lastBootstrapLoadAt = 0

export function accountJourney() {
  const member = authenticatedMember('account')
  if (!member) return
  const now = Date.now()
  if (now - lastBootstrapLoadAt >= bootstrapCacheMs) {
    expectStatus(get('/api/bootstrap', 'account', 'bootstrap', member.auth), 'account bootstrap')
    lastBootstrapLoadAt = now
  }

  think(0.5, 2)
  const pageResponses = getBatch([
    { path: '/api/profile/me', journey: 'account', endpoint: 'own-profile', extra: member.auth },
    { path: '/api/profile/readiness', journey: 'account', endpoint: 'profile-readiness', extra: member.auth },
  ])
  expectStatus(pageResponses[0], 'own-profile')
  expectStatus(pageResponses[1], 'profile-readiness')

  // Model navigating from Account to one editor rather than loading every
  // preference endpoint as part of the Account page.
  const preferenceEndpoints = [
    ['/api/preferences/general', 'general-preferences'],
    ['/api/preferences/dating', 'dating-preferences'],
    ['/api/preferences/schedule', 'schedule-preferences'],
  ]
  const [path, name] = preferenceEndpoints[(__VU + __ITER) % preferenceEndpoints.length]
  think()
  expectStatus(get(path, 'account', name, member.auth), name)
  think(1, 4)
}
