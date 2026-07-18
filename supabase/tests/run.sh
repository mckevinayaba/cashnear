#!/usr/bin/env bash
# Runs the Stage 1 SQL security regression suite (supabase/tests/*.sql)
# against the LOCAL Supabase dev database ONLY.
#
# Safety by construction, not by convention: this script never accepts a
# connection string, host, or credential as input, from an environment
# variable or otherwise -- it always derives the target from `supabase
# status`, which only ever describes the local `supabase start` instance.
# There is no flag, env var, or code path here that can point it at a
# staging or production project. Verifying a real Supabase project (staging
# or the live Lovable Cloud project) is a deliberate, manual, human-run
# process -- see docs/SUPABASE_SECURITY_TESTING.md -- never this script.
#
# Usage: supabase/tests/run.sh

set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found. See docs/SUPABASE_SECURITY_TESTING.md (Prerequisites)." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found. Install the PostgreSQL client (comes with Postgres.app / postgresql-client)." >&2
  exit 1
fi

echo "==> Resetting the local Supabase database and replaying every committed migration..."
supabase db reset

DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
if [ -z "$DB_URL" ]; then
  echo "error: could not determine the local DB_URL from 'supabase status'. Is 'supabase start' running?" >&2
  exit 1
fi
case "$DB_URL" in
  *127.0.0.1*|*localhost*) : ;;
  *)
    echo "error: refusing to run -- 'supabase status' returned a DB_URL that doesn't look local: $DB_URL" >&2
    echo "       This script only ever runs against a local 'supabase start' instance." >&2
    exit 1
    ;;
esac

echo "==> Running the Stage 1 SQL security regression suite against the local instance..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
echo "==> Done. Every line above should read NOTICE: PASS - ...; psql would have exited non-zero on the first FAIL/ERROR (ON_ERROR_STOP=1)."
