const rawBaseUrl = __ENV.BASE_URL || 'http://localhost:3000'
export const baseUrl = rawBaseUrl.replace(/\/+$/, '')
const localBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
export const targetEnvironment = (__ENV.TARGET_ENV || (localBaseUrl ? 'local' : '')).trim().toLowerCase()
export const runId = (__ENV.RUN_ID || `${targetEnvironment || 'unknown'}-${Date.now()}`)
  .replace(/[^a-zA-Z0-9._:-]/g, '-')
  .slice(0, 100)

const profiles = {
  smoke: {
    heavy: false,
    maxVUs: 1,
    stages: [
      { duration: '10s', target: 1 },
      { duration: '30s', target: 1 },
      { duration: '10s', target: 0 },
    ],
  },
  baseline: {
    heavy: false,
    maxVUs: 25,
    stages: [
      { duration: '1m', target: 10 },
      { duration: '3m', target: 25 },
      { duration: '1m', target: 0 },
    ],
  },
  load: {
    heavy: true,
    maxVUs: 250,
    stages: [
      { duration: '2m', target: 25 },
      { duration: '3m', target: 50 },
      { duration: '4m', target: 100 },
      { duration: '5m', target: 250 },
      { duration: '2m', target: 0 },
    ],
  },
  stress: {
    heavy: true,
    maxVUs: 500,
    stages: [
      { duration: '2m', target: 100 },
      { duration: '3m', target: 250 },
      { duration: '3m', target: 500 },
      { duration: '2m', target: 0 },
    ],
  },
  spike: {
    heavy: true,
    maxVUs: 300,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '15s', target: 300 },
      { duration: '1m', target: 300 },
      { duration: '30s', target: 20 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: {
    heavy: true,
    maxVUs: 50,
    stages: [
      { duration: '2m', target: 50 },
      { duration: __ENV.SOAK_DURATION || '30m', target: 50 },
      { duration: '2m', target: 0 },
    ],
  },
}

function enabled(name) {
  return (__ENV[name] || '').trim().toLowerCase() === 'true'
}

function isLocalTarget() {
  return localBaseUrl
}

function assertTarget(profileName, profile, writes = false) {
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('BASE_URL must be an absolute http:// or https:// URL')
  }

  if (!['local', 'staging', 'production'].includes(targetEnvironment)) {
    throw new Error('Set TARGET_ENV to local, staging, or production')
  }

  if (targetEnvironment === 'local' && !isLocalTarget()) {
    throw new Error('TARGET_ENV=local may target only localhost or 127.0.0.1')
  }

  if (targetEnvironment !== 'local' && !baseUrl.startsWith('https://')) {
    throw new Error('Remote load-test targets must use HTTPS')
  }

  if (targetEnvironment !== 'production') return

  if (!enabled('ALLOW_PRODUCTION_LOAD_TEST')) {
    throw new Error('Production tests require ALLOW_PRODUCTION_LOAD_TEST=true')
  }

  const productionMaxVUs = Number.parseInt(__ENV.PRODUCTION_MAX_VUS || '25', 10)
  if (!Number.isFinite(productionMaxVUs) || productionMaxVUs < 1) {
    throw new Error('PRODUCTION_MAX_VUS must be a positive integer')
  }
  if (profile.maxVUs > productionMaxVUs) {
    throw new Error(`${profileName} requests ${profile.maxVUs} VUs, above PRODUCTION_MAX_VUS=${productionMaxVUs}`)
  }
  if (profile.heavy && !enabled('ALLOW_HEAVY_PRODUCTION_LOAD_TEST')) {
    throw new Error('Production load, stress, spike, and soak tests require ALLOW_HEAVY_PRODUCTION_LOAD_TEST=true')
  }
  if (writes && !enabled('ALLOW_PRODUCTION_WRITES')) {
    throw new Error('Production write tests require ALLOW_PRODUCTION_WRITES=true')
  }
}

const thresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '20s' }],
  http_req_duration: ['p(95)<500', 'p(99)<1200'],
  checks: ['rate>0.99'],
  'http_req_duration{journey:public}': ['p(95)<500'],
  'http_req_duration{journey:member-read}': ['p(95)<800'],
}

export function optionsFor(profileName) {
  const profile = profiles[profileName]
  if (!profile) throw new Error(`Unknown workload profile: ${profileName}`)
  assertTarget(profileName, profile)
  return {
    scenarios: {
      [profileName]: {
        executor: 'ramping-vus',
        gracefulRampDown: '20s',
        gracefulStop: '30s',
        stages: profile.stages,
      },
    },
    thresholds,
    tags: {
      application: 'lonely-radish',
      workload: profileName,
      target_environment: targetEnvironment,
      run_id: runId,
    },
    discardResponseBodies: false,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  }
}

export function writeInterestOptions() {
  const vus = Number.parseInt(__ENV.WRITE_VUS || '1', 10)
  if (!Number.isFinite(vus) || vus < 1 || vus > 50) {
    throw new Error('WRITE_VUS must be between 1 and 50')
  }
  const profile = { heavy: vus > 10, maxVUs: vus }
  assertTarget('write-interest', profile, true)
  if (!enabled('ENABLE_WRITES')) {
    throw new Error('Write tests require ENABLE_WRITES=true')
  }
  return {
    scenarios: {
      write_interest: {
        executor: 'per-vu-iterations',
        vus,
        iterations: 1,
        maxDuration: '5m',
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<800', 'p(99)<1500'],
      checks: ['rate>0.99'],
    },
    tags: {
      application: 'lonely-radish',
      workload: 'write-interest',
      target_environment: targetEnvironment,
      run_id: runId,
    },
  }
}
