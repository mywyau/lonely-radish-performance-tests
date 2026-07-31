# Lonely Radish performance tests

Protocol-level load tests for the Lonely Radish Nuxt/Nitro application. The
suite uses Grafana k6 and can run locally, in GitHub Actions, or locally while
streaming results to Grafana Cloud k6.

The default workloads are read-only. Write tests are isolated entry points with
additional safety flags and must use synthetic accounts.

## Coverage

The public journey requests:

- the homepage;
- the FAQ;
- public user statistics.

When synthetic member sessions are supplied, traffic uses this weighted mix:

- 20% anonymous homepage and FAQ browsing;
- 40% discovery filtering and profile viewing;
- 20% matches, sent/received interests, and notifications;
- 15% date planning and reliability data;
- 5% profile, preference, schedule, and navigation data.

Every request has stable `name`, `endpoint`, and `journey` tags. Grafana can
therefore break latency down by feature instead of reporting only a global
maximum.

These are HTTP protocol tests. They measure the server-rendered page request and
API calls, but they do not execute Vue in a browser or download every browser
asset. Browser performance remains the responsibility of the Playwright suite
or a separate k6 browser test.

## Prerequisites

Install a current k6 release:

```sh
brew install k6
```

Install the Node dependencies used by staging account provisioning and its
Chromium login step:

```sh
npm install
npx playwright install chromium
```

The k6 workloads themselves still run in k6 rather than Node.

## Safe first run

Start Lonely Radish locally on port 3000, then run:

```sh
npm run smoke
```

Localhost is inferred as `TARGET_ENV=local`. Every remote target must identify
itself explicitly:

```sh
BASE_URL=https://staging.example.com \
TARGET_ENV=staging \
npm run smoke
```

Run `npm run inspect` to statically load every entry point without generating
traffic.

## Workload profiles

| Script | Maximum VUs | Default shape | Purpose |
| --- | ---: | --- | --- |
| `smoke` | 1 | about 50 seconds | Confirm scripts, target, and checks |
| `baseline` | 25 | about 5 minutes | Establish normal latency |
| `load:50` | 50 | about 6 minutes | Intermediate free-tier load |
| `load:100` | 100 | about 16 minutes | Grafana free-tier maximum |
| `stress:100` | 100 | about 11 minutes | Sustain the free-tier ceiling |
| `spike:100` | 100 | about 4 minutes | Jump quickly from 10 to 100 VUs |
| `soak` | 50 | about 34 minutes | Detect leaks and gradual degradation |
| `capacity` | up to 100 | about 11 minutes | Ramp from 10 to 100 requests/second |
| `browser:smoke` | 1 browser | one iteration | Measure rendered pages and Web Vitals |
| `local:load:250` | 250 | about 16 minutes | Local-only test above Cloud free tier |
| `local:stress:500` | 500 | about 10 minutes | Local-only high stress |

Override the steady soak duration with `SOAK_DURATION=2h`.

Each read iteration includes human-like pauses. A k6 VU therefore represents an
actively browsing member, not an idle logged-in browser.

## Thresholds

Read workloads currently require:

- HTTP failure rate below 1%;
- overall p95 below 800 ms;
- overall p99 below 1.5 seconds;
- each authenticated journey p95 below 800 ms;
- named discovery, profile, matches, and planning endpoint p95 below 800 ms;
- named notifications endpoint p95 below 700 ms;
- checks above 99%.

The capacity test additionally requires zero dropped iterations. Browser smoke
uses p75 thresholds of LCP below 2.5 seconds, CLS below 0.1, FCP below 1.8
seconds, and TTFB below 800 ms.

The test aborts after a sustained HTTP failure-rate breach. Treat thresholds as
an initial service-level objective and adjust them only after reviewing a real
baseline; do not loosen them merely to make a run pass.

## Authenticated synthetic users

The application stores authentication in an encrypted, HTTP-only cookie named
`lonely-radish-session`. k6 does not bypass Auth0. It reuses short-lived sessions
created by logging dedicated synthetic users into the target environment.

For staging, configure `.env` from `.env.example` with the guarded target,
database, Auth0 and pool values:

```dotenv
BASE_URL=https://your-staging-origin.example
TARGET_ENV=staging
PERF_ALLOWED_HOST=your-staging-host.example
PERF_PRODUCTION_URL=https://your-production-origin.example

PERF_DATABASE_URL=postgresql://...
PERF_EXPECTED_DATABASE_HOST=your-exact-database-host
PERF_EXPECTED_DATABASE_PROJECT_REF=your-staging-supabase-ref
PERF_ALLOW_DATABASE_WRITE=true

PERF_AUTH0_DOMAIN=your-staging-tenant.eu.auth0.com
PERF_AUTH0_MGMT_CLIENT_ID=...
PERF_AUTH0_MGMT_CLIENT_SECRET=...
PERF_AUTH0_CONNECTION=Username-Password-Authentication
PERF_TEST_PASSWORD=a-strong-dedicated-test-password

PERF_USER_COUNT=100
PERF_EMAIL_DOMAIN=test-domain-you-control.example
PERF_EMAIL_PREFIX=perf-load
PERF_SLUG_PREFIX=perf-load
PERF_POOL_ID=default
SESSION_FILE=fixtures/sessions.json
REQUIRE_UNIQUE_SESSIONS=true
```

The staging-only Auth0 Management application needs `read:users` and
`create:users`. Install the browser once, then prepare the pool:

```sh
npm install
npx playwright install chromium
npm run users:check
npm run users:prepare
```

This verifies `/api/health`, creates or reuses marked Auth0 accounts, resets and
seeds only their staging database records, signs each account in through
Universal Login, writes `fixtures/sessions.json`, and validates every session.
Account creation and login happen before the timed k6 run.

Generated addresses are deterministic, such as
`perf-load-00001@test-domain-you-control.example`. They must be unique but do
not need separate inboxes. Staging email is suppressed unless an address is
explicitly included in the app's staging allowlist.

If you do not have a catch-all domain, one inbox with plus addressing also
works. For example, `PERF_EMAIL_PREFIX=yourname+radish-perf` and
`PERF_EMAIL_DOMAIN=gmail.com` generates unique Auth0 addresses that all route to
the same mailbox. Profile slugs automatically replace the `+` with `-`.

The user manifest and cookie fixture are ignored by Git. Regenerate expired
sessions without reseeding profiles:

```sh
npm run users:sessions
npm run users:validate
```

Pools may be increased up to 500 accounts. To reduce the pool or change its
email namespace, destroy the existing pool first so no marked accounts are
orphaned.

Run progressively against staging:

```sh
npm run staging:smoke
npm run staging:baseline
npm run staging:load:50
npm run staging:load:100
npm run staging:capacity
```

The staging wrappers load `.env` automatically. `REQUIRE_UNIQUE_SESSIONS=true`
makes a run fail instead of silently sharing an identity between VUs. Use at
least as many accounts as the workload's maximum VUs.

Use at least one session per expected authenticated VU. Reusing one account
across hundreds of VUs produces unrealistic data, can trigger per-user rate
limits, and makes database contention unlike real traffic.

For a one-user local check, `SESSION_COOKIE` may contain a cookie value directly.
Prefer `SESSION_FILE` for all shared environments.

Optional fixture fields let browser and staging stateful tests open or mutate a
known pair:

- `profileSlug`: the primary synthetic member;
- `partnerCookie` and `partnerProfileSlug`: their paired synthetic member;
- `proposal`: a public venue and future time compatible with the primary
  member's saved availability.

To completely remove the pool, grant the staging Management application
`delete:users`, then use the separately locked command:

```sh
PERF_ALLOW_ACCOUNT_DELETE=true npm run users:destroy
```

Deletion validates the marker, pool, IDs and emails from the ignored manifest
and removes only those exact accounts from staging Auth0 and PostgreSQL.

## Controlled production testing

Production always requires explicit acknowledgement:

```sh
BASE_URL=https://your-production-origin.example \
TARGET_ENV=production \
ALLOW_PRODUCTION_LOAD_TEST=true \
PRODUCTION_MAX_VUS=1 \
npm run smoke
```

Production defaults to a hard ceiling of 25 VUs. A workload above that ceiling
must raise `PRODUCTION_MAX_VUS` deliberately. Load, stress, spike, and soak also
require:

```sh
ALLOW_HEAVY_PRODUCTION_LOAD_TEST=true
```

Start with smoke, review application and database telemetry, then run baseline.
Do not run a heavy profile until the lower stage has passed and someone is
monitoring Vercel, PostgreSQL, Redis, QStash, Supabase Storage, and error rates.

### Free-tier load progression

After sourcing `.env`, stream the read-only progression to Grafana:

```sh
npm run cloud:smoke
npm run cloud:baseline
npm run cloud:load:50
npm run cloud:load:100
npm run cloud:capacity
```

Raise `PRODUCTION_MAX_VUS` to 25, 50, then 100 as required. Every step above
baseline also requires `ALLOW_HEAVY_PRODUCTION_LOAD_TEST=true`. Review the
previous result before advancing.

`capacity` is an open-model test: each iteration makes exactly one request, and
the executor ramps through 10, 25, 50, 75, and 100 requests per second. It is
different from a realistic VU journey with reading pauses.

Tests above the Grafana Cloud 100-VU free-tier limit run with local open-source
k6 and do not stream to Cloud:

```sh
npm run local:load:250
npm run local:stress:500
```

Monitor the load generator's CPU, memory, and network so the local machine does
not become the measured bottleneck.

## Browser and Web Vitals testing

Run the rendered browser smoke locally or stream it to Grafana:

```sh
npm run browser:smoke
npm run cloud:browser:smoke
```

Without a session it visits the homepage and FAQ. With a session it also renders
discovery, matches, account settings, and a known plan when
`partnerProfileSlug` exists. k6 launches Chromium and emits LCP, CLS, FCP, TTFB,
browser request duration, and browser failure metrics.

## Write and stateful testing

The only write workload currently sends one interest per VU. It uses a unique
idempotency key and intentionally runs exactly one iteration for each synthetic
user.

Each session fixture needs a dedicated `writeProfileSlug` belonging to a
synthetic recipient. The sender and recipient must be reset between runs because
the product permanently records interest history.

Run against staging:

```sh
BASE_URL=https://staging.example.com \
TARGET_ENV=staging \
SESSION_FILE=fixtures/sessions.json \
ENABLE_WRITES=true \
WRITE_VUS=5 \
npm run write:interest
```

Production additionally requires `ALLOW_PRODUCTION_LOAD_TEST=true` and
`ALLOW_PRODUCTION_WRITES=true`. Do not use production writes until synthetic
data isolation and a reliable fixture reset process exist.

Proposal, rescheduling, cancellation, and match-acceptance load tests should be
run only on staging. The guarded end-to-end stateful journey now performs:

1. Member A sends interest to member B.
2. Member B loads and accepts the interest.
3. Member B creates and sends a date proposal.
4. Member A loads and accepts the proposed time.
5. Member B cancels the confirmed date.

It is forbidden in production and requires a fresh synthetic pair for every
run:

```sh
TARGET_ENV=staging \
SESSION_FILE=fixtures/sessions.json \
ENABLE_STATEFUL_FLOWS=true \
STATEFUL_VUS=1 \
npm run stateful:match-plan
```

The generated proposal time is in the future and matches the seeded availability.
Run `npm run users:seed` before another stateful/write run to reset the marked
pool's relationship data, then regenerate sessions only if they have expired.

## Grafana Cloud k6

Set the Grafana Cloud token, stack ID, and Lonely Radish project ID as shell or CI values:

```sh
export K6_CLOUD_TOKEN=...
export K6_CLOUD_STACK_ID=...
export K6_CLOUD_PROJECT_ID=...
```

Open **Testing & synthetics → Performance → Projects**, select the Lonely
Radish project, and copy the numeric project ID shown beneath its name. Cloud
commands fail when this value is absent so runs cannot silently fall back to an
unrelated default project.

Execute locally while streaming metrics to Grafana Cloud:

```sh
BASE_URL=https://staging.example.com \
TARGET_ENV=staging \
npm run cloud:smoke
```

The command uses `--no-archive-upload`, so the test archive and session fixture
are not uploaded to Grafana Cloud. Metric tags include the workload, target
environment, and a generated run ID. Cookie values, profile slugs, and user
identifiers are never added to metric tags or error output.

## GitHub Actions

The workflow:

- inspects all test scripts on pull requests;
- offers smoke, baseline, 50/100-VU, stress, spike, soak, capacity, and browser
  read-only workloads through manual dispatch;
- uses a protected GitHub Environment named `staging` or `production`;
- optionally streams locally executed results to Grafana Cloud.

Configure each GitHub Environment with:

| Type | Name | Purpose |
| --- | --- | --- |
| Variable | `LR_BASE_URL` | Target HTTPS origin |
| Secret | `LR_K6_SESSIONS_JSON` | JSON array matching the local fixture |
| Secret | `K6_CLOUD_TOKEN` | Grafana Cloud k6 API token |
| Secret | `K6_CLOUD_STACK_ID` | Grafana Cloud stack ID |
| Variable | `K6_CLOUD_PROJECT_ID` | Numeric Lonely Radish k6 project ID |

Add required reviewers to the production environment. Manual runs require an
explicit VU ceiling and a separate acknowledgement for heavy workloads. The
workflow never exposes stateful write workloads.

## Interpreting results

Compare each run with application telemetry during the same `run_id`. Review:

- request p50, p95, p99, and failure rate;
- PostgreSQL query and pool-wait time;
- database connection counts;
- serverless instance and cold-start behaviour;
- Redis and external-provider latency;
- outbox backlog and dead-letter events;
- recovery after traffic ramps down.

A passing client-side k6 summary is necessary but not sufficient. The run also
needs correct match limits, no duplicate records, no growing background backlog,
and healthy provider dashboards.
