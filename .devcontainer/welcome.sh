#!/usr/bin/env bash
# Printed each time a terminal attaches. Cheap, and it saves reading the docs
# to remember two commands.

set -uo pipefail

if [ -n "${CODESPACE_NAME:-}" ]; then
  API_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
else
  API_URL="http://localhost:8000"
fi

cat <<EOF

  ┌──────────────────────────────────────────────────────────────────────┐
  │  GymFlow AI — trainer accountability for SLAM                        │
  └──────────────────────────────────────────────────────────────────────┘

  Start the API        npm run api          (or: make api)
  Start the app        npm run mobile       Expo, tunnelled for real devices
  Run every check      npm run verify

  API             ${API_URL}
  API docs        ${API_URL}/docs

  Demo logins     owner@slam.demo · vikas.menon@slam.demo
                  aditya.rao@member.slam.demo
                  password SlamDemo2026!   ·   check-in PIN 246813

  Port 8000 must be Public for a phone to reach the API — Ports tab, or
  gh codespace ports visibility 8000:public

EOF
