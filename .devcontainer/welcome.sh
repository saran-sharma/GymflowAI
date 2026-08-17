#!/usr/bin/env bash
# Printed each time a terminal attaches. Cheap, and it saves reading the docs
# to remember two commands.

set -uo pipefail

if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  API_URL="https://${CODESPACE_NAME}-8000.${DOMAIN}"
  METRO_URL="https://${CODESPACE_NAME}-8082.${DOMAIN}"
else
  API_URL="http://localhost:8000"
  METRO_URL="http://localhost:8082"
fi

cat <<EOF

  ┌──────────────────────────────────────────────────────────────────────┐
  │  GymFlow AI — trainer accountability for SLAM                        │
  └──────────────────────────────────────────────────────────────────────┘

  Start everything     npm run dev          (or: ./dev.sh)
  Check status         npm run dev:status
  Stop all services    npm run dev:stop
  Run every check      npm run verify

  API             ${API_URL}
  Metro Bundler   ${METRO_URL}
  API docs        ${API_URL}/docs

  Demo logins     owner@slam.demo · vikas.menon@slam.demo
                  aditya.rao@member.slam.demo
                  password SlamDemo2026!   ·   check-in PIN 246813

  In Codespaces, ports 8000 and 8082 are auto-configured as Public.
  Connect your phone's GymFlow dev client to ${METRO_URL}.

EOF
