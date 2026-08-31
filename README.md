# Coacher

Cloudflare Worker that mints capped OpenRouter keys for friends on the Coach iOS app. Coach sends a device UUID. The Worker returns a key with a $0 spend cap and a guardrail that only allows free models. Paid models stay blocked if someone extracts the key from the phone.

The iOS app lives in a sibling repo (`coach`). Helm v1 does not call this Worker.

## What it does

1. Coach sends `POST /v1/provision` with a Keychain device id and `Authorization: Bearer <APP_SHARED_SECRET>`.
2. Worker reads `device:{uuid}` from KV.
3. Already minted: return that key. New device: mint, attach guardrail `coach-friends-free-only`, store, return 201.
4. Coach talks to OpenRouter directly after that.

`GET /health` is the liveness check. Other paths are 404.

Defaults in `coach-key-service/wrangler.toml`: `$0` per key, monthly reset, 25 devices.

## Precedent

Giving friends a personal OpenRouter key is how a 70B call lands on your bill. The Management API plus a guardrail means they do not create an account and you do not pay, as long as they only hit `:free` models.

The shared secret is compiled into the iOS binary. Fine for a friends TestFlight. Rotate the secret and redeploy if that IPA leaks. An App Store build would need a user session.

## Building blocks

| Piece | Job |
| --- | --- |
| Worker `coach-key-service` | [`coach-key-service/src/index.ts`](coach-key-service/src/index.ts) |
| KV `DEVICE_KEYS` | one record per device |
| OpenRouter Management API | mint, create or reuse the guardrail, assign the key |
| [`src/models.ts`](coach-key-service/src/models.ts) | free-model allowlist; keep in sync with Coach `OpenRouterModel.swift` |

Secrets are Wrangler secrets, not git. `.setup-secret.txt` is local. `wrangler.toml` still has placeholder KV ids until the first deploy on this account.

```bash
cd coach-key-service
cp .dev.vars.example .dev.vars
npm install
npm run dev
```

```bash
curl -s http://127.0.0.1:8787/health
```

Production walkthrough: [`coach-key-service/DEPLOY.md`](coach-key-service/DEPLOY.md).
