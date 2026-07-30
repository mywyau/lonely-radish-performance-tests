import exec from 'k6/execution'
import { expectStatus, expectValue, get, jsonBody, postJson } from '../helpers/http.js'
import { authenticatedParams, sessionForVu } from '../helpers/sessions.js'
import { runId } from '../helpers/config.js'

function required(record, field) {
  const value = record?.[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Stateful fixture ${record?.label || __VU} is missing ${field}`)
  }
  return value.trim()
}

function key(step) {
  return `${runId}-${step}-${__VU}-${exec.scenario.iterationInTest}`.slice(0, 200)
}

export function statefulMatchAndPlanJourney() {
  const sender = sessionForVu()
  if (!sender) throw new Error('Stateful journeys require SESSION_FILE')
  const senderAuth = authenticatedParams(sender)
  const senderSlug = required(sender, 'profileSlug')
  const recipientSlug = required(sender, 'partnerProfileSlug')
  const recipientAuth = authenticatedParams({ cookie: required(sender, 'partnerCookie') })
  const proposal = sender.proposal
  if (!proposal || typeof proposal !== 'object') {
    throw new Error(`Stateful fixture ${sender.label || __VU} is missing proposal`)
  }

  const interest = postJson('/api/interests', { profileSlug: recipientSlug },
    'stateful', 'send-interest', authenticatedParams(sender, { 'Idempotency-Key': key('send-interest') }))
  if (!expectStatus(interest, 'stateful send interest')) return

  const received = get('/api/interests/received', 'stateful', 'received-interests', recipientAuth)
  if (!expectStatus(received, 'stateful received interests')) return
  const incoming = (jsonBody(received, {})?.interests || []).find(item => item.slug === senderSlug)
  if (!expectValue(incoming?.id, 'stateful incoming interest found')) return

  const accepted = postJson(`/api/interests/${encodeURIComponent(incoming.id)}/accept`, {},
    'stateful', 'accept-interest',
    { ...recipientAuth, headers: { ...recipientAuth.headers, 'Idempotency-Key': key('accept-interest') } })
  if (!expectStatus(accepted, 'stateful accept interest')) return
  if (!expectValue(jsonBody(accepted, {})?.queued === false, 'stateful match activated')) return

  const draft = postJson('/api/proposals', {
    profileSlug: senderSlug,
    activity: required(proposal, 'activity'),
    inviteNote: proposal.inviteNote || '',
    venue: required(proposal, 'venue'),
    venueAddress: required(proposal, 'venueAddress'),
    venuePostcode: required(proposal, 'venuePostcode'),
    meetingPoint: proposal.meetingPoint || '',
    publicVenueConfirmed: true,
    times: [required(proposal, 'time')],
  }, 'stateful', 'create-proposal', recipientAuth)
  if (!expectStatus(draft, 'stateful create proposal')) return
  const proposalId = jsonBody(draft, {})?.id
  if (!expectValue(proposalId, 'stateful proposal created')) return

  const sent = postJson(`/api/proposals/${encodeURIComponent(proposalId)}/send`, {},
    'stateful', 'send-proposal', recipientAuth)
  if (!expectStatus(sent, 'stateful send proposal')) return

  const planning = get(`/api/planning/${encodeURIComponent(recipientSlug)}`,
    'stateful', 'planning', senderAuth)
  if (!expectStatus(planning, 'stateful load proposal')) return
  const activeProposal = jsonBody(planning, {})?.proposal
  const timeId = activeProposal?.times?.[0]?.id
  if (!expectValue(activeProposal?.id === proposalId && timeId, 'stateful proposal visible to invitee')) return

  const response = postJson(`/api/proposals/${encodeURIComponent(proposalId)}/respond`,
    { status: 'accepted', timeId }, 'stateful', 'accept-proposal', senderAuth)
  if (!expectStatus(response, 'stateful accept proposal')) return

  const cancelled = postJson(`/api/proposals/${encodeURIComponent(proposalId)}/attendance`,
    { action: 'cancel' }, 'stateful', 'cancel-date', recipientAuth)
  expectStatus(cancelled, 'stateful cancel confirmed date')
}

