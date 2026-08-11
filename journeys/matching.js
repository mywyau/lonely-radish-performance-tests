import { expectStatus, expectValue, get, jsonBody } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

export function matchingJourney() {
  const member = authenticatedMember('matching')
  if (!member) return
  think()
  const dashboard = get('/api/matches?includeNotifications=true', 'matching', 'matches', member.auth)
  expectStatus(dashboard, 'matches dashboard')
  const dashboardBody = jsonBody(dashboard, {})
  expectValue(Array.isArray(dashboardBody.matches), 'matches dashboard: includes matches')
  expectValue(Array.isArray(dashboardBody.notifications), 'matches dashboard: includes notifications')
  expectValue(Number.isFinite(dashboardBody.unreadNotificationCount), 'matches dashboard: includes unread count')
  think()
  expectStatus(get('/api/interests/received', 'matching', 'received-interests', member.auth), 'received interests')
  think()
  expectStatus(get('/api/interests/sent', 'matching', 'sent-interests', member.auth), 'sent interests')
  think(1, 4)
}
