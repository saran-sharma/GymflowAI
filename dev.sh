#!/usr/bin/env bash
# ==============================================================================
# GymFlow AI — Unified Development Script
# ==============================================================================
# Starts backend and Metro bundler, configures Codespaces public URLs,
# tests health endpoints, and presents mobile development connection options.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure Node is installed
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but was not found in PATH." >&2
  exit 1
fi

# Hand off to the development runner
exec node scripts/dev-runner.mjs "$@"
