import { expectStatus, get } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

export function accountJourney() {
  const member = authenticatedMember('account')
  if (!member) return
  const endpoints = [
    ['/api/profile/me', 'own-profile'],
    ['/api/profile/readiness', 'profile-readiness'],
    ['/api/preferences/general', 'general-preferences'],
    ['/api/preferences/dating', 'dating-preferences'],
    ['/api/preferences/schedule', 'schedule-preferences'],
    ['/api/navigation/counts', 'navigation-counts'],
  ]
  for (const [path, name] of endpoints) {
    think(0.5, 2)
    expectStatus(get(path, 'account', name, member.auth), name)
  }
  think(1, 4)
}

