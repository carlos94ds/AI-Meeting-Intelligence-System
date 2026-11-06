#!/usr/bin/env bash
# Eén commando om alles te installeren (eerste keer) en te starten.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ] || [ ! -d frontend/node_modules ] || [ ! -d backend/.venv ]; then
  npm run setup
fi
npm run dev
