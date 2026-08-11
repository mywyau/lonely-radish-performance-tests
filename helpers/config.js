import { assertSessionCapacity } from './sessions.js'

const rawBaseUrl = __ENV.BASE_URL || 'http://localhost:3000'
export const baseUrl = rawBaseUrl.replace(/\/+$/, '')
const localBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)
export const targetEnvironment = (__ENV.TARGET_ENV || (localBaseUrl ? 'local' : '')).trim().toLowerCase()
export const runId = (__ENV.RUN_ID || `${targetEnvironment || 'unknown'}-${Date.now()}`)
  .replace(/[^a-zA-Z0-9._:-]/g, '-')
  .slice(0, 100)

function fixedDiagnosticProfile(maxVUs) {
  return {
    heavy: true,
    maxVUs,
    stages: [
      { duration: '30s', target: maxVUs },
      { duration: '1m', target: maxVUs },
      { duration: '30s', target: 0 },
    ],
  }
}

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
  load50: {
    heavy: true,
    maxVUs: 50,
    stages: [
      { duration: '1m', target: 25 },
      { duration: '4m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  load100: {
    heavy: true,
    maxVUs: 100,
    stages: [
      { duration: '2m', target: 25 },
      { duration: '3m', target: 50 },
      { duration: '4m', target: 75 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 0 },
    ],
  },
  stress100: {
    heavy: true,
    maxVUs: 100,
    stages: [
      { duration: '1m', target: 25 },
      { duration: '2m', target: 50 },
      { duration: '2m', target: 75 },
      { duration: '5m', target: 100 },
      { duration: '1m', target: 0 },
    ],
  },
  spike100: {
    heavy: true,
    maxVUs: 100,
    stages: [
      { duration: '1m', target: 10 },
      { duration: '10s', target: 100 },
      { duration: '2m', target: 100 },
      { duration: '20s', target: 10 },
      { duration: '1m', target: 0 },
    ],
  },
  soak50: {
    heavy: true,
    maxVUs: 50,
    stages: [
      { duration: '2m', target: 50 },
      { duration: __ENV.SOAK_DURATION || '30m', target: 50 },
      { duration: '2m', target: 0 },
    ],
  },
  local250: {
    heavy: true,
    maxVUs: 250,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '4m', target: 175 },
      { duration: '5m', target: 250 },
      { duration: '2m', target: 0 },
    ],
  },
  local500: {
    heavy: true,
    maxVUs: 500,
    stages: [
      { duration: '2m', target: 100 },
      { duration: '3m', target: 250 },
      { duration: '3m', target: 500 },
      { duration: '2m', target: 0 },
    ],
  },
  local1000: {
    heavy: true,
    maxVUs: 1000,
    stages: [
      { duration: '1m', target: 250 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 750 },
      { duration: '2m', target: 1000 },
      { duration: '1m', target: 0 },
    ],
  },
  diagnostic400: fixedDiagnosticProfile(400),
  diagnostic500: fixedDiagnosticProfile(500),
  diagnostic600: fixedDiagnosticProfile(600),
}

function enabled(name) {
  return (__ENV[name] || '').trim().toLowerCase() === 'true'
}

function assertCloudProject() {
  if (!enabled('REQUIRE_CLOUD_PROJECT')) return
  const projectId = (__ENV.K6_CLOUD_PROJECT_ID || '').trim()
  if (!/^\d+$/.test(projectId)) {
    throw new Error('Cloud runs require the numeric K6_CLOUD_PROJECT_ID from the Lonely Radish project overview')
  }
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
    throw new Error('Production load, stress, spike, soak, and capacity tests require ALLOW_HEAVY_PRODUCTION_LOAD_TEST=true')
  }
  if (writes && !enabled('ALLOW_PRODUCTION_WRITES')) {
    throw new Error('Production write tests require ALLOW_PRODUCTION_WRITES=true')
  }
}

const baseThresholds = {
  http_req_duration: ['p(95)<800', 'p(99)<1500'],
  checks: ['rate>0.99'],
  'http_req_duration{journey:public}': ['p(95)<500'],
  'http_req_duration{journey:discovery}': ['p(95)<800'],
  'http_req_duration{journey:matching}': ['p(95)<800'],
  'http_req_duration{journey:planning}': ['p(95)<800'],
  'http_req_duration{journey:account}': ['p(95)<800'],
  'http_req_duration{name:homepage}': ['p(95)<500'],
  'http_req_duration{name:discovery}': ['p(95)<800'],
  'http_req_duration{name:profile}': ['p(95)<800'],
  'http_req_duration{name:matches}': ['p(95)<800'],
  'http_req_duration{name:planning}': ['p(95)<800'],
  'http_req_duration{name:notifications}': ['p(95)<700'],
}

function thresholdsFor({ abortOnHttpFailure = true } = {}) {
  return {
    ...baseThresholds,
    http_req_failed: abortOnHttpFailure
      ? [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '20s' }]
      : ['rate<0.01'],
  }
}

export function optionsFor(profileName, { abortOnHttpFailure = true, workload = profileName } = {}) {
  const profile = profiles[profileName]
  if (!profile) throw new Error(`Unknown workload profile: ${profileName}`)
  assertSessionCapacity(profile.maxVUs)
  assertCloudProject()
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
    thresholds: thresholdsFor({ abortOnHttpFailure }),
    tags: {
      application: 'lonely-radish',
      workload,
      target_environment: targetEnvironment,
      run_id: runId,
    },
    discardResponseBodies: false,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  }
}

export function diagnosticOptionsFor(profileName) {
  if (targetEnvironment === 'production') {
    throw new Error('Threshold-overrun diagnostics are forbidden in production')
  }
  if (!enabled('PERF_ALLOW_THRESHOLD_OVERRUN')) {
    throw new Error('Threshold-overrun diagnostics require PERF_ALLOW_THRESHOLD_OVERRUN=true')
  }
  return optionsFor(profileName, {
    abortOnHttpFailure: false,
    workload: `${profileName}-diagnostic`,
  })
}

export function arrivalRateOptions() {
  const profile = { heavy: true, maxVUs: 100 }
  assertCloudProject()
  assertTarget('capacity-100-rps', profile)
  return {
    scenarios: {
      capacity: {
        executor: 'ramping-arrival-rate',
        startRate: 10,
        timeUnit: '1s',
        preAllocatedVUs: 20,
        maxVUs: 100,
        gracefulStop: '30s',
        stages: [
          { duration: '1m', target: 10 },
          { duration: '2m', target: 25 },
          { duration: '2m', target: 50 },
          { duration: '2m', target: 75 },
          { duration: '3m', target: 100 },
          { duration: '1m', target: 0 },
        ],
      },
    },
    thresholds: {
      ...thresholdsFor(),
      dropped_iterations: ['count==0'],
      'http_req_duration{journey:capacity}': ['p(95)<800', 'p(99)<1500'],
    },
    tags: {
      application: 'lonely-radish',
      workload: 'capacity-100-rps',
      target_environment: targetEnvironment,
      run_id: runId,
    },
    discardResponseBodies: false,
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  }
}

export function browserSmokeOptions() {
  const profile = { heavy: false, maxVUs: 1 }
  assertCloudProject()
  assertTarget('browser-smoke', profile)
  return {
    scenarios: {
      browser_smoke: {
        executor: 'shared-iterations',
        vus: 1,
        iterations: 1,
        maxDuration: '3m',
        options: { browser: { type: 'chromium' } },
      },
    },
    thresholds: {
      checks: ['rate==1'],
      browser_http_req_failed: ['rate<0.01'],
      browser_web_vital_lcp: ['p(75)<2500'],
      browser_web_vital_cls: ['p(75)<0.1'],
      browser_web_vital_fcp: ['p(75)<1800'],
      browser_web_vital_ttfb: ['p(75)<800'],
    },
    tags: {
      application: 'lonely-radish',
      workload: 'browser-smoke',
      target_environment: targetEnvironment,
      run_id: runId,
    },
  }
}

export function statefulJourneyOptions() {
  if (targetEnvironment === 'production') {
    throw new Error('Stateful matching and planning journeys are forbidden in production')
  }
  if (!enabled('ENABLE_STATEFUL_FLOWS')) {
    throw new Error('Stateful journeys require ENABLE_STATEFUL_FLOWS=true')
  }
  const vus = Number.parseInt(__ENV.STATEFUL_VUS || '1', 10)
  if (!Number.isFinite(vus) || vus < 1 || vus > 10) {
    throw new Error('STATEFUL_VUS must be between 1 and 10')
  }
  assertTarget('stateful-match-and-plan', { heavy: false, maxVUs: vus }, true)
  return {
    scenarios: {
      stateful_match_and_plan: {
        executor: 'per-vu-iterations',
        vus,
        iterations: 1,
        maxDuration: '5m',
      },
    },
    thresholds: {
      http_req_failed: ['rate<0.01'],
      http_req_duration: ['p(95)<1000', 'p(99)<2000'],
      checks: ['rate==1'],
    },
    tags: {
      application: 'lonely-radish',
      workload: 'stateful-match-and-plan',
      target_environment: targetEnvironment,
      run_id: runId,
    },
  }
}

export function writeInterestOptions() {
  const vus = Number.parseInt(__ENV.WRITE_VUS || '1', 10)
  if (!Number.isFinite(vus) || vus < 1 || vus > 50) {
    throw new Error('WRITE_VUS must be between 1 and 50')
  }
  const profile = { heavy: vus > 10, maxVUs: vus }
  assertCloudProject()
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
