#!/usr/bin/env bash
# Deploy coach-key-service from your Mac — no server needed (Cloudflare Workers).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

echo "==> Coach key service deploy (Cloudflare Workers — no VPS)"
echo ""

if [[ ! -f package-lock.json ]]; then
  echo "Installing npm dependencies..."
  npm install
fi

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Log in to Cloudflare (browser will open). Use your personal account."
  npx wrangler login
fi

echo ""
echo "Cloudflare account:"
npx wrangler whoami

if grep -q 'REPLACE_AFTER_KV_CREATE' wrangler.toml; then
  echo ""
  echo "Creating KV namespace DEVICE_KEYS..."
  PROD_ID="$(npx wrangler kv namespace create DEVICE_KEYS | awk '/id =/ {print $3}')"
  PREVIEW_ID="$(npx wrangler kv namespace create DEVICE_KEYS --preview | awk '/id =/ {print $3}')"
  python3 - "${ROOT}/wrangler.toml" "${PROD_ID}" "${PREVIEW_ID}" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
prod, preview = sys.argv[2], sys.argv[3]
text = path.read_text()
text = text.replace("REPLACE_AFTER_KV_CREATE_PREVIEW", preview, 1)
text = text.replace("REPLACE_AFTER_KV_CREATE", prod, 1)
path.write_text(text)
PY
  echo "Updated wrangler.toml with KV namespace IDs."
fi

if [[ ! -f .dev.vars ]]; then
  cp .dev.vars.example .dev.vars
  echo ""
  echo "Created .dev.vars — edit it with your OpenRouter Management key before deploy."
  echo "  https://openrouter.ai/settings/management-keys"
  if [[ -f .setup-secret.txt ]]; then
    SECRET="$(grep '^APP_SHARED_SECRET=' .setup-secret.txt | cut -d= -f2-)"
    if [[ -n "${SECRET}" ]]; then
      if grep -q '^APP_SHARED_SECRET=' .dev.vars; then
        sed -i '' "s|^APP_SHARED_SECRET=.*|APP_SHARED_SECRET=${SECRET}|" .dev.vars
      fi
      echo "Copied APP_SHARED_SECRET from .setup-secret.txt into .dev.vars"
    fi
  fi
  echo ""
  read -r -p "Press Enter after OPENROUTER_MANAGEMENT_KEY is set in .dev.vars..."
fi

echo ""
echo "Deploying worker..."
npm run deploy

echo ""
echo "Set production secrets (paste when prompted):"
echo "  1) OPENROUTER_MANAGEMENT_KEY — from openrouter.ai/settings/management-keys"
if [[ -f .setup-secret.txt ]]; then
  echo "  2) APP_SHARED_SECRET — from .setup-secret.txt"
else
  echo "  2) APP_SHARED_SECRET — same value as coach/Secrets/CoachKeyService.local.txt"
fi

npx wrangler secret put OPENROUTER_MANAGEMENT_KEY
npx wrangler secret put APP_SHARED_SECRET

WORKER_URL="$(npx wrangler deployments list 2>/dev/null | awk '/https:/{print $1; exit}')"
if [[ -z "${WORKER_URL}" ]]; then
  WORKER_URL="https://coach-key-service.<your-subdomain>.workers.dev"
fi

echo ""
echo "Done. Worker URL (check Cloudflare dashboard if blank):"
echo "  ${WORKER_URL}"
echo ""
echo "Next — Coach app:"
echo "  1) Set baseURLString in coach/Coach/Services/CoachKeyServiceConfig.swift"
echo "  2) cd /Users/cameronro/Development/coach && ./scripts/inject-key-service-secret.sh"
echo "  3) Archive for TestFlight"
