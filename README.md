# Lonely Radish performance tests

Grafana k6 tests for the Lonely Radish Nuxt/Nitro application. The suite covers
anonymous traffic, authenticated user journeys, rendered browser checks, and
guarded staging-only write flows.

## Install

```sh
brew install k6
npm install
npx playwright install chromium
```

The Playwright browser is used only to create authenticated staging sessions.
The load tests themselves run in k6.

## Quick local smoke test

Start the frontend on port 3000, then run:

```sh
npm run smoke
```

This sends anonymous requests to the homepage, FAQ and public user statistics.
Check that every k6 entry point loads without sending traffic:

```sh
npm run inspect
```

## Run authenticated tests against staging

Copy and complete the environment template:

```sh
cp .env.example .env
```

The `.env` file must point to the isolated staging app, database and Auth0
tenant. Important safety settings include:

```dotenv
TARGET_ENV=staging
BASE_URL=https://YOUR-STAGING-HOST
PERF_ALLOWED_HOST=YOUR-STAGING-HOST
PERF_PRODUCTION_URL=https://YOUR-PRODUCTION-HOST
PERF_VERCEL_BYPASS_SECRET=YOUR-STAGING-DEPLOYMENT-BYPASS-SECRET

PERF_DATABASE_URL=postgresql://...
PERF_EXPECTED_DATABASE_HOST=YOUR-STAGING-DATABASE-HOST
PERF_EXPECTED_DATABASE_PROJECT_REF=YOUR-STAGING-SUPABASE-PROJECT-REF
PERF_ALLOW_DATABASE_WRITE=true

PERF_USER_COUNT=100
SESSION_FILE=fixtures/sessions.json
REQUIRE_UNIQUE_SESSIONS=true
```

Complete the remaining Auth0, password and account namespace values shown in
`.env.example`. The staging Auth0 Machine-to-Machine application needs
`read:users` and `create:users`.

Prepare the synthetic users and login sessions:

```sh
./scripts/prepare-performance-users.sh
```

Session creation is sequential and lightly paced by default to avoid treating
setup as an Auth0 load test. Set `PERF_AUTH_HEADED=true` to watch it, or adjust
`PERF_AUTH_DELAY_MS` if the staging tenant applies additional protection.

Then progress through the read-only workloads one level at a time:

```sh
./scripts/run-performance-tests.sh smoke
./scripts/run-performance-tests.sh baseline
./scripts/run-performance-tests.sh load-50
./scripts/run-performance-tests.sh load-100
./scripts/run-performance-tests.sh capacity
```

Review application, database and provider telemetry after each level before
increasing load. List every runner mode with:

```sh
./scripts/run-performance-tests.sh help
```

## Workload modes

| Mode | Maximum load | Use |
| --- | ---: | --- |
| `smoke` | 1 VU | Verify the target, sessions and checks |
| `baseline` | 25 VUs | Establish normal latency |
| `load-50` | 50 VUs | Intermediate sustained load |
| `load-100` | 100 VUs | Full authenticated staging load |
| `stress-100` | 100 VUs | Sustain the ceiling |
| `spike-100` | 100 VUs | Sudden traffic jump |
| `soak` | 50 VUs | Find leaks and gradual degradation |
| `capacity` | 10–100 req/s | Find the request-rate ceiling |
| `browser` | 1 browser | Render pages and record Web Vitals |
| `write-interest` | configurable | Send synthetic interests on staging |
| `stateful-match-plan` | configurable | Match, plan, accept and cancel on staging |

Authenticated read traffic is weighted across discovery and profiles, matches
and interests, notifications, date planning, preferences and account data.
Stable k6 tags allow Grafana to break latency down by endpoint and journey.

The read journeys model current page behaviour rather than treating every API
route as a separate page request. In particular, the Matches page requests
matches and recent notifications together, the Account page reuses the
60-second bootstrap state and loads profile/readiness concurrently, and profile
navigation honours the 30-second daily-interest client cache. Standalone API
routes can still be tested directly when investigating a specific endpoint.

Use at least one prepared account per authenticated VU. The runner defaults to
`REQUIRE_UNIQUE_SESSIONS=true` and refuses to start if the pool is too small.

Pools above 500 accounts require an additional staging-only acknowledgement:

```dotenv
PERF_USER_COUNT=1000
PERF_ALLOW_LARGE_USER_POOL=true
```

The hard ceiling is 2,000 accounts, the pool size must remain even, and all
existing target, database, namespace and destructive-cleanup locks still apply.

## Grafana Cloud

Set your Grafana Cloud values in `.env` or the shell:

```dotenv
K6_CLOUD_TOKEN=...
K6_CLOUD_STACK_ID=...
K6_CLOUD_PROJECT_ID=...
```

The project ID is under **Testing & synthetics → Performance → Projects** in
Grafana Cloud. Run the same staging workloads with a `cloud-` prefix:

```sh
./scripts/run-performance-tests.sh cloud-smoke
./scripts/run-performance-tests.sh cloud-baseline
./scripts/run-performance-tests.sh cloud-load-50
./scripts/run-performance-tests.sh cloud-load-100
./scripts/run-performance-tests.sh cloud-capacity
```

Execution remains local and streams metrics to Grafana. The test archive and
session-cookie fixture are not uploaded.

## Browser, write and stateful tests

Run the rendered browser check with:

```sh
./scripts/run-performance-tests.sh browser
```

Write and stateful modes mutate only marked synthetic staging data:

```sh
./scripts/run-performance-tests.sh write-interest
./scripts/run-performance-tests.sh stateful-match-plan
```

Run `./scripts/prepare-performance-users.sh` before repeating these modes so
relationship and proposal data is reset. Never point them at production.

## Refresh or remove synthetic users

Refresh expired login sessions without reseeding profiles:

```sh
npm run users:sessions
npm run users:validate
```

To remove the pool, first grant the staging Management application
`delete:users`, then explicitly allow deletion:

```sh
PERF_ALLOW_ACCOUNT_DELETE=true npm run users:destroy
```

Deletion is limited to the marked accounts recorded in the ignored fixture
manifest.

## Higher local-only loads

These open-source k6 runs execute locally and do not consume Grafana Cloud VU
hours or depend on Cloud project limits:

```sh
npm run local:load:250
npm run local:stress:500
npm run local:load:1000
```

Monitor the load generator itself so its CPU, memory or network does not become
the bottleneck. The 1,000-VU profile requires 1,000 unique sessions and ramps
through 250, 500 and 750 VUs before holding 1,000 VUs for two minutes.

The normal 1,000-VU profile aborts when HTTP failures exceed 1%. To capture the
full degradation curve without weakening the normal safeguard, explicitly
enable the staging-only diagnostic profile:

```dotenv
PERF_ALLOW_THRESHOLD_OVERRUN=true
```

```sh
npm run local:diagnostic:1000
```

This mode continues after latency and HTTP-failure thresholds are crossed, but
the thresholds remain in the final summary and the command exits as failed. It
is forbidden in production. Stop it manually if staging or a provider shows
signs of broader instability.

To locate the saturation point without another six-minute run, use the short
fixed-load diagnostics. Each ramps up for 30 seconds, holds its named load for
one minute, and ramps down for 30 seconds:

```sh
npm run diagnostic:400
npm run diagnostic:500
npm run diagnostic:600
```

Run them separately and allow staging metrics to settle between runs. They use
the same `PERF_ALLOW_THRESHOLD_OVERRUN=true` acknowledgement and existing
session fixture; do not prepare the accounts again when `npm run users:validate`
passes. Unexpected responses are counted by status near the end of the k6
summary (for example, `unexpected_http_status_429` or
`unexpected_http_status_503`). Compare the first failing load with Vercel and
database telemetry from the same time window.

Results produced before the page-oriented workload update are not directly
comparable by raw request or iteration counts: the revised journeys issue fewer
duplicate requests and validate the consolidated Matches response. Latency and
failure rates remain useful, but establish a new 400-VU baseline before judging
the next 500-VU run.

## Safety and result checks

The staging runner loads `.env`, requires `TARGET_ENV=staging`, checks the
target host, and uses unique synthetic sessions. Production testing is not part
of the simple runner and requires the separate explicit production safety flags
implemented by the k6 scripts.

A passing k6 summary is only one part of a successful test. Also review p95 and
p99 latency, error rate, PostgreSQL connections and query time, serverless cold
starts, Redis/provider latency, background-job backlogs and recovery after load
returns to normal.
