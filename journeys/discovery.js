import { expectStatus, get, getBatch, jsonBody } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

const categories = ['casual', 'culture', 'sports', 'outdoors', 'games', 'learn-create', 'wellness', 'nightlife', 'explore', 'community']
const dailyInterestCacheMs = 30_000
let lastDailyInterestLoadAt = 0

export function discoveryJourney() {
  const member = authenticatedMember('discovery')
  if (!member) return
  think()
  const category = categories[(__VU + __ITER) % categories.length]
  const response = get(`/api/activities/${category}/people`, 'discovery', 'discovery', member.auth)
  expectStatus(response, 'discovery results')
  const person = jsonBody(response, {})?.people?.[0]
  if (person?.slug) {
    think()
    const now = Date.now()
    const requests = [{
      path: `/api/profiles/${encodeURIComponent(person.slug)}`,
      journey: 'discovery', endpoint: 'profile', extra: member.auth,
    }]
    if (now - lastDailyInterestLoadAt >= dailyInterestCacheMs) {
      requests.push({ path: '/api/interests/today', journey: 'discovery', endpoint: 'today-interests', extra: member.auth })
      lastDailyInterestLoadAt = now
    }
    const responses = getBatch(requests)
    expectStatus(responses[0], 'discovered profile')
    if (responses[1]) expectStatus(responses[1], 'today interests')
  }
  think(1, 4)
}
