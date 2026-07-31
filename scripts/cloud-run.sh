#!/usr/bin/env sh
set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

test_script=${1:?Usage: scripts/cloud-run.sh tests/example.js}

exec k6 cloud run --local-execution --no-archive-upload \
  -e REQUIRE_CLOUD_PROJECT=true \
  -e K6_CLOUD_PROJECT_ID="${K6_CLOUD_PROJECT_ID:-}" \
  -e BASE_URL="${BASE_URL:-}" \
  -e TARGET_ENV="${TARGET_ENV:-}" \
  -e SESSION_FILE="${SESSION_FILE:-}" \
  -e REQUIRE_UNIQUE_SESSIONS="${REQUIRE_UNIQUE_SESSIONS:-false}" \
  -e ALLOW_PRODUCTION_LOAD_TEST="${ALLOW_PRODUCTION_LOAD_TEST:-false}" \
  -e ALLOW_HEAVY_PRODUCTION_LOAD_TEST="${ALLOW_HEAVY_PRODUCTION_LOAD_TEST:-false}" \
  -e PRODUCTION_MAX_VUS="${PRODUCTION_MAX_VUS:-25}" \
  -e SOAK_DURATION="${SOAK_DURATION:-30m}" \
  "$test_script"
