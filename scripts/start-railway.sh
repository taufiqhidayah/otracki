#!/usr/bin/env sh
set -e

export STACKSLEUTH_SDK_PORT="${STACKSLEUTH_SDK_PORT:-4000}"
export STACKSLEUTH_SDK_URL="${STACKSLEUTH_SDK_URL:-http://127.0.0.1:4000}"

STACKSLEUTH_SDK_PORT="$STACKSLEUTH_SDK_PORT" node packages/stacksleuth-sdk/dist/TriageServer.js &
SDK_PID=$!

cleanup() {
  kill "$SDK_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

cd apps/stacksleuth-app
exec next start -H 0.0.0.0 -p "${PORT:-3000}"
