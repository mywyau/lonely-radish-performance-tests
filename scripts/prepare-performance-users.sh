#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(dirname -- "$script_dir")
cd "$repository_dir"

if [ ! -f .env ]; then
  echo "Missing $repository_dir/.env. Copy .env.example and add the staging values first." >&2
  exit 1
fi

# Every provisioning script imports dotenv/config. Make the repository's .env
# authoritative even when the terminal still exports values from an older run.
export DOTENV_CONFIG_OVERRIDE=true

echo "Validating staging safeguards and preparing the authenticated performance-user pool..."
npm run users:check
exec npm run users:prepare
