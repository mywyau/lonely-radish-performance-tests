import { sleep } from 'k6'
import { expectStatus, expectValue, get, jsonBody } from '../helpers/http.js'
import { authenticatedParams, sessionForVu } from '../helpers/sessions.js'

export function think(min = 0.8, max = 3) {
  sleep(min + Math.random() * (max - min))
}

export function authenticatedMember(journey) {
  const session = sessionForVu()
  if (!session) return null
  const auth = authenticatedParams(session)
  const response = get('/api/auth/session', journey, 'session', auth)
  if (!expectStatus(response, `${journey} session`)) return null
  const authenticated = jsonBody(response, {})?.authenticated === true
  if (!expectValue(authenticated, `${journey}: session is authenticated`)) return null
  return { session, auth }
}

