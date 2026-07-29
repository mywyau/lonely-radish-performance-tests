import exec from 'k6/execution'
import { expectStatus, postJson } from '../helpers/http.js'
import { authenticatedParams, sessionForVu } from '../helpers/sessions.js'
import { runId } from '../helpers/config.js'

export function sendSyntheticInterest() {
  const session = sessionForVu()
  if (!session) throw new Error('Write tests require SESSION_FILE or SESSION_COOKIE')
  if (!session.writeProfileSlug) {
    throw new Error(`Session fixture ${session.label || __VU} is missing writeProfileSlug`)
  }

  const idempotencyKey = `${runId}-interest-${__VU}-${exec.scenario.iterationInTest}`.slice(0, 200)
  const response = postJson(
    '/api/interests',
    { profileSlug: session.writeProfileSlug },
    'member-write',
    'send-interest',
    authenticatedParams(session, { 'Idempotency-Key': idempotencyKey }),
  )
  expectStatus(response, 'send interest')
}

