#!/usr/bin/env sh
set -eu

test_script=${1:?Usage: scripts/staging-run.sh tests/example.js}

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

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

exec k6 run "$test_script"
