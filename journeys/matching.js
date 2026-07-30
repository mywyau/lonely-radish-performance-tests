import { expectStatus, get } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

export function matchingJourney() {
  const member = authenticatedMember('matching')
  if (!member) return
  think()
  expectStatus(get('/api/matches', 'matching', 'matches', member.auth), 'matches')
  think()
  expectStatus(get('/api/interests/received', 'matching', 'received-interests', member.auth), 'received interests')
  think()
  expectStatus(get('/api/interests/sent', 'matching', 'sent-interests', member.auth), 'sent interests')
  think()
  expectStatus(get('/api/notifications', 'matching', 'notifications', member.auth), 'notifications')
  think(1, 4)
}

