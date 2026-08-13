#!/usr/bin/env bash
#
# One-time setup for a fresh Codespace / dev container.
#
# Everything here is idempotent: re-running it on an existing container is safe
# and is the fastest way to recover from a half-finished first run.
#
# The database is addressed through the standard PG* variables, which
# docker-compose sets to the `db` service. That also makes this script runnable
# against any reachable Postgres (PGHOST=localhost ./post-create.sh), which is
# how it gets tested.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

PGHOST="${PGHOST:-db}"
PGUSER="${PGUSER:-gymflow}"
export PGHOST PGUSER
export PGPASSWORD="${PGPASSWORD:-gymflow}"

APP_DB="${APP_DB:-gymflow}"
TEST_DB="${TEST_DB:-gymflow_test}"

say() { printf '\n\033[1;31m▸ %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- registries
# The public registry, explicitly. A corporate proxy inherited from the
# environment would make a fresh Codespace fail to install with errors that
# look like network flakiness.
unset npm_config_proxy npm_config_https_proxy NPM_CONFIG_PROXY NPM_CONFIG_HTTPS_PROXY 2>/dev/null || true

# ------------------------------------------------------------------ backend
say "Python dependencies"
python3 -m venv "$REPO_ROOT/.venv"
"$REPO_ROOT/.venv/bin/pip" install --quiet --upgrade pip
"$REPO_ROOT/.venv/bin/pip" install --quiet -r "$REPO_ROOT/backend/requirements-dev.txt"

say "Waiting for PostgreSQL at ${PGHOST}"
for _ in $(seq 1 30); do
  if pg_isready -q -d "$APP_DB"; then break; fi
  sleep 1
done
pg_isready -d "$APP_DB"

# The suite uses a database of its own, so a test run never destroys the data
# you were just looking at in the app.
if ! psql -lqt | cut -d'|' -f1 | grep -qw "$TEST_DB"; then
  say "Creating ${TEST_DB}"
  createdb "$TEST_DB"
fi

# --------------------------------------------------------------------- env
# Where the API is reachable from *outside* the container. A phone running Expo
# Go is not on the Codespace's network, so localhost would never resolve for it.
if [ -n "${CODESPACE_NAME:-}" ]; then
  API_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  API_URL="http://localhost:8000"
fi

if [ ! -f "$REPO_ROOT/backend/.env" ]; then
  say "backend/.env"
  cp "$REPO_ROOT/backend/.env.example" "$REPO_ROOT/backend/.env"
  sed -i "s|@localhost:5432/gymflow|@${PGHOST}:5432/gymflow|" "$REPO_ROOT/backend/.env"
  # A throwaway key, so this container is not running on the checked-in default.
  SECRET="$("$REPO_ROOT/.venv/bin/python" -c 'import secrets;print(secrets.token_urlsafe(48))')"
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET}|" "$REPO_ROOT/backend/.env"
fi

say "apps/mobile/.env"
cat > "$REPO_ROOT/apps/mobile/.env" <<EOF
# Written by .devcontainer/post-create.sh — safe to edit, not tracked by git.
#
# In a Codespace this is the *public* forwarded URL for port 8000, because the
# phone running the app is not on the container's network. If the app cannot
# reach the API, check that port 8000 is Public in the Ports tab.
EXPO_PUBLIC_API_URL=${API_URL}
EXPO_PUBLIC_PUSH_ENABLED=false
EOF

# ------------------------------------------------------------------ schema
say "Database schema and demo data"
(
  cd "$REPO_ROOT/backend"
  "$REPO_ROOT/.venv/bin/alembic" upgrade head
  "$REPO_ROOT/.venv/bin/python" -m app.seed
)

# ------------------------------------------------------------- node modules
say "Mobile dependencies"
( cd "$REPO_ROOT/apps/mobile" && npm ci --no-audit )

say "Web demo dependencies"
( cd "$REPO_ROOT/apps/web-demo" && npm ci --no-audit )

say "Ready — run 'npm run api' and 'npm run mobile'"
