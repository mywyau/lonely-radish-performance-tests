#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(dirname -- "$script_dir")
cd "$repository_dir"

mode=${1:-smoke}

print_usage() {
  echo "Usage: ./scripts/run-performance-tests.sh MODE"
  echo "Modes: smoke baseline load-50 load-100 stress-100 spike-100 soak capacity browser"
  echo "       local-250 local-500 local-1000 local-1000-diagnostic"
  echo "       diagnostic-400 diagnostic-500 diagnostic-600"
  echo "       write-interest stateful-match-plan inspect"
  echo "       cloud-smoke cloud-baseline cloud-load-50 cloud-load-100 cloud-stress-100"
  echo "       cloud-spike-100 cloud-soak cloud-capacity cloud-browser"
}

if [ "$mode" = "help" ] || [ "$mode" = "--help" ] || [ "$mode" = "-h" ]; then
  print_usage
  exit 0
fi

if [ "$mode" = "inspect" ]; then
  exec npm run inspect
fi

if [ ! -f .env ]; then
  echo "Missing $repository_dir/.env. Copy .env.example and add the staging values first." >&2
  exit 1
fi

set -a
. ./.env
set +a

if [ "${TARGET_ENV:-}" != "staging" ]; then
  echo "TARGET_ENV must be staging" >&2
  exit 1
fi
if [ -z "${BASE_URL:-}" ]; then
  echo "BASE_URL is required" >&2
  exit 1
fi

export SESSION_FILE="${SESSION_FILE:-fixtures/sessions.json}"
export REQUIRE_UNIQUE_SESSIONS="${REQUIRE_UNIQUE_SESSIONS:-true}"

case "$mode" in
  smoke) exec k6 run tests/smoke.js ;;
  baseline) exec k6 run tests/baseline.js ;;
  load-50) exec k6 run tests/load-50.js ;;
  load-100) exec k6 run tests/load.js ;;
  stress-100) exec k6 run tests/stress.js ;;
  spike-100) exec k6 run tests/spike.js ;;
  soak) exec k6 run tests/soak.js ;;
  capacity) exec k6 run tests/capacity.js ;;
  browser) exec k6 run tests/browser-smoke.js ;;
  local-250) exec k6 run tests/local-load-250.js ;;
  local-500) exec k6 run tests/local-stress-500.js ;;
  local-1000) exec k6 run tests/local-load-1000.js ;;
  local-1000-diagnostic) exec k6 run tests/local-load-1000-diagnostic.js ;;
  diagnostic-400) exec k6 run tests/diagnostic-400.js ;;
  diagnostic-500) exec k6 run tests/diagnostic-500.js ;;
  diagnostic-600) exec k6 run tests/diagnostic-600.js ;;
  write-interest)
    export ENABLE_WRITES=true
    exec k6 run tests/write-interest.js
    ;;
  stateful-match-plan)
    export ENABLE_STATEFUL_FLOWS=true
    exec k6 run tests/stateful-match-plan.js
    ;;
  cloud-smoke) exec ./scripts/cloud-run.sh tests/smoke.js ;;
  cloud-baseline) exec ./scripts/cloud-run.sh tests/baseline.js ;;
  cloud-load-50) exec ./scripts/cloud-run.sh tests/load-50.js ;;
  cloud-load-100) exec ./scripts/cloud-run.sh tests/load.js ;;
  cloud-stress-100) exec ./scripts/cloud-run.sh tests/stress.js ;;
  cloud-spike-100) exec ./scripts/cloud-run.sh tests/spike.js ;;
  cloud-soak) exec ./scripts/cloud-run.sh tests/soak.js ;;
  cloud-capacity) exec ./scripts/cloud-run.sh tests/capacity.js ;;
  cloud-browser) exec ./scripts/cloud-run.sh tests/browser-smoke.js ;;
  *)
    print_usage >&2
    exit 2
    ;;
esac
