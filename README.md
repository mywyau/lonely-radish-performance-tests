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

When synthetic member sessions are supplied, approximately 80% of virtual users
instead exercise an authenticated journey:

- validate the application session;
- browse a rotating discovery category;
- open the first available profile;
- load matches;
- open planning for an active match when available;
- load notifications.

These are HTTP protocol tests. They measure the server-rendered page request and
API calls, but they do not execute Vue in a browser or download every browser
asset. Browser performance remains the responsibility of the Playwright suite
or a separate k6 browser test.

## Prerequisites

Install a current k6 release:

```sh
brew install k6
```

No npm dependencies are required. The `package.json` scripts are command
shortcuts only.

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
| `load` | 250 | about 16 minutes | Validate expected growth |
| `stress` | 500 | about 10 minutes | Find the first bottleneck |
| `spike` | 300 | about 4 minutes | Test sudden traffic and recovery |
| `soak` | 50 | about 34 minutes | Detect leaks and gradual degradation |

Override the steady soak duration with `SOAK_DURATION=2h`.

Each read iteration includes human-like pauses. A k6 VU therefore represents an
actively browsing member, not an idle logged-in browser.

## Thresholds

Read workloads currently require:

- HTTP failure rate below 1%;
- overall p95 below 500 ms;
- overall p99 below 1.2 seconds;
- authenticated journey p95 below 800 ms;
- checks above 99%.

The test aborts after a sustained HTTP failure-rate breach. Treat thresholds as
an initial service-level objective and adjust them only after reviewing a real
baseline; do not loosen them merely to make a run pass.

## Authenticated synthetic users

The application stores authentication in an encrypted, HTTP-only cookie named
`lonely-radish-session`. k6 does not bypass Auth0. It reuses short-lived sessions
created by logging dedicated synthetic users into the target environment.

Copy the ignored fixture:

```sh
cp fixtures/sessions.example.json fixtures/sessions.json
```

For each synthetic account:

1. Sign in through the normal application login.
2. Open browser developer tools.
3. Copy only the value of the `lonely-radish-session` cookie.
4. Add it to `fixtures/sessions.json`.

Then run:

```sh
BASE_URL=https://staging.example.com \
TARGET_ENV=staging \
SESSION_FILE=fixtures/sessions.json \
npm run baseline
```

The fixture is gitignored. Never commit session cookies or use genuine member
accounts. Sessions last up to seven days but may become invalid sooner; replace
them when authenticated checks fail.

Use at least one session per expected authenticated VU. Reusing one account
across hundreds of VUs produces unrealistic data, can trigger per-user rate
limits, and makes database contention unlike real traffic.

For a one-user local check, `SESSION_COOKIE` may contain a cookie value directly.
Prefer `SESSION_FILE` for all shared environments.

## Controlled production testing

Production always requires explicit acknowledgement:

```sh
BASE_URL=https://lonelyradish.app \
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

## Write testing

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
added after staging has an automated seed/reset mechanism. Repeatedly creating
those records without reset would measure corrupted fixture state rather than
normal user behaviour.

## Grafana Cloud k6

Set the Grafana Cloud token and stack ID as shell or CI secrets:

```sh
export K6_CLOUD_TOKEN=...
export K6_CLOUD_STACK_ID=...
```

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
- allows only smoke or baseline runs through manual dispatch;
- uses a protected GitHub Environment named `staging` or `production`;
- optionally streams locally executed results to Grafana Cloud.

Configure each GitHub Environment with:

| Type | Name | Purpose |
| --- | --- | --- |
| Variable | `LR_BASE_URL` | Target HTTPS origin |
| Secret | `LR_K6_SESSIONS_JSON` | JSON array matching the local fixture |
| Secret | `K6_CLOUD_TOKEN` | Grafana Cloud k6 API token |
| Secret | `K6_CLOUD_STACK_ID` | Grafana Cloud stack ID |

Add required reviewers to the production environment. The checked-in workflow
caps production dispatches at 25 VUs and does not expose write or heavy workload
choices.

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

