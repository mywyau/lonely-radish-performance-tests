import { expectStatus, get, jsonBody } from '../helpers/http.js'
import { authenticatedMember, think } from './member-common.js'

const categories = ['casual', 'culture', 'sports', 'outdoors', 'games', 'learn-create', 'wellness', 'nightlife', 'explore', 'community']

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
    expectStatus(
      get(`/api/profiles/${encodeURIComponent(person.slug)}`, 'discovery', 'profile', member.auth),
      'discovered profile',
    )
  }
  think(1, 4)
}

