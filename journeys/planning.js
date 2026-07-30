import { expectStatus, get, jsonBody } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

export function planningJourney() {
  const member = authenticatedMember('planning')
  if (!member) return
  think()
  const response = get('/api/matches', 'planning', 'matches', member.auth)
  expectStatus(response, 'planning matches')
  const matches = jsonBody(response, {})?.matches || []
  const match = matches.find(item => item.stage !== 'queued' && item.slug)
  if (match?.slug) {
    think()
    expectStatus(
      get(`/api/planning/${encodeURIComponent(match.slug)}`, 'planning', 'planning', member.auth),
      'date planning',
    )
  }
  think()
  expectStatus(get('/api/account/reliability', 'planning', 'date-reliability', member.auth), 'date reliability')
  think(1, 4)
}

