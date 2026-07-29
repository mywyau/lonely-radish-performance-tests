import { sleep } from 'k6'
import { expectStatus, get, jsonBody } from '../helpers/http.js'
import { authenticatedParams, sessionForVu } from '../helpers/sessions.js'

const categories = ['casual', 'culture', 'sports', 'outdoors', 'games', 'learn-create', 'wellness', 'nightlife', 'explore', 'community']

function think(min = 0.8, max = 3) {
  sleep(min + Math.random() * (max - min))
}

export function memberReadJourney() {
  const session = sessionForVu()
  if (!session) return false
  const auth = authenticatedParams(session)

  const sessionResponse = get('/api/auth/session', 'member-read', 'session', auth)
  if (!expectStatus(sessionResponse, 'authenticated session')) return false
  const sessionBody = jsonBody(sessionResponse, {})
  if (!sessionBody?.authenticated) {
    expectStatus({ status: 401 }, 'session is authenticated')
    return false
  }

  think()
  const category = categories[(__VU + __ITER) % categories.length]
  const discoveryResponse = get(`/api/activities/${category}/people`, 'member-read', 'discovery', auth)
  expectStatus(discoveryResponse, 'discovery')
  const discovery = jsonBody(discoveryResponse, {})

  if (discovery?.people?.[0]?.slug) {
    think()
    expectStatus(
      get(`/api/profiles/${encodeURIComponent(discovery.people[0].slug)}`, 'member-read', 'profile', auth),
      'profile',
    )
  }

  think()
  const matchesResponse = get('/api/matches', 'member-read', 'matches', auth)
  expectStatus(matchesResponse, 'matches')
  const matches = jsonBody(matchesResponse, {})
  const plannableMatch = matches?.matches?.find(match => match.stage !== 'queued' && match.slug)

  if (plannableMatch?.slug) {
    think()
    expectStatus(
      get(`/api/planning/${encodeURIComponent(plannableMatch.slug)}`, 'member-read', 'planning', auth),
      'planning',
    )
  }

  think()
  expectStatus(get('/api/notifications', 'member-read', 'notifications', auth), 'notifications')
  think(1, 4)
  return true
}

