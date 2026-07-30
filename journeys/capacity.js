import { expectStatus, get } from '../helpers/http.js'
import { authenticatedParams, hasSessions, sessionForVu } from '../helpers/sessions.js'

const categories = ['casual', 'culture', 'sports', 'outdoors', 'games', 'learn-create', 'wellness', 'nightlife', 'explore', 'community']

export function capacityRequest() {
  const bucket = (__VU * 13 + __ITER * 11) % 100
  if (!hasSessions() || bucket < 20) {
    const endpoint = bucket % 2 === 0 ? ['/', 'homepage'] : ['/faq', 'faq']
    expectStatus(get(endpoint[0], 'capacity', endpoint[1]), `capacity ${endpoint[1]}`)
    return
  }

  const session = sessionForVu()
  const auth = authenticatedParams(session)
  if (bucket < 55) {
    const category = categories[(__VU + __ITER) % categories.length]
    expectStatus(get(`/api/activities/${category}/people`, 'capacity', 'discovery', auth), 'capacity discovery')
  } else if (bucket < 70) {
    expectStatus(get('/api/matches', 'capacity', 'matches', auth), 'capacity matches')
  } else if (bucket < 80) {
    expectStatus(get('/api/notifications', 'capacity', 'notifications', auth), 'capacity notifications')
  } else if (bucket < 90) {
    expectStatus(get('/api/interests/received', 'capacity', 'received-interests', auth), 'capacity received interests')
  } else {
    expectStatus(get('/api/profile/me', 'capacity', 'own-profile', auth), 'capacity own profile')
  }
}

