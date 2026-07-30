import http from 'k6/http'
import { check } from 'k6'
import { baseUrl, runId } from './config.js'

function requestParams(journey, endpoint, extra = {}) {
  return {
    redirects: 5,
    ...extra,
    headers: {
      'User-Agent': 'lonely-radish-k6/1.0',
      'X-Load-Test-Run-Id': runId,
      ...(extra.headers || {}),
    },
    tags: {
      journey,
      endpoint,
      name: endpoint,
      ...(extra.tags || {}),
    },
  }
}

export function get(path, journey, endpoint, extra = {}) {
  return http.get(`${baseUrl}${path}`, requestParams(journey, endpoint, extra))
}

export function postJson(path, body, journey, endpoint, extra = {}) {
  return http.post(
    `${baseUrl}${path}`,
    JSON.stringify(body),
    requestParams(journey, endpoint, {
      ...extra,
      headers: {
        'Content-Type': 'application/json',
        ...(extra.headers || {}),
      },
    }),
  )
}

export function expectStatus(response, name, statuses = [200]) {
  const passed = check(response, {
    [`${name}: expected status`]: result => statuses.includes(result.status),
  })
  if (!passed && (__ENV.DEBUG || '').toLowerCase() === 'true') {
    console.error(`${name} failed with status ${response.status}`)
  }
  return passed
}

export function expectValue(value, name) {
  return check(value, {
    [name]: result => Boolean(result),
  })
}

export function jsonBody(response, fallback = null) {
  try {
    return response.json()
  } catch {
    return fallback
  }
}
