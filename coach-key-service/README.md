# Coach key service

Personal Cloudflare Worker for the **Coach** iOS app. Mints capped OpenRouter API keys so friends can use cloud models without creating OpenRouter accounts.

**Not corporate.** Runs on your personal OpenRouter account and Cloudflare account (`C-Rogs`).

## What it does

1. Coach app sends a stable per-device UUID (Keychain).
2. Worker checks KV for an existing key for that device.
3. If none, worker mints a key, attaches the **free-model guardrail**, stores the key.
4. App saves the key in Keychain and talks to OpenRouter directly.

**$0 spend cap** + guardrail allowlist = paid models blocked server-side.

## No server needed

Hosted on **Cloudflare Workers** (free tier). Deploy from your Mac; Cloudflare runs it.

```bash
cd coach-key-service
./scripts/deploy-from-mac.sh
```

## Cost

- Cloudflare: free tier
- OpenRouter: **$0** if friends only hit free models (enforced by guardrail)

## API

### `GET /health`

Health check.

### `POST /v1/provision`

Headers:

- `Authorization: Bearer <APP_SHARED_SECRET>`
- `Content-Type: application/json`

Body:

```json
{ "device_id": "550e8400-e29b-41d4-a716-446655440000" }
```

Response `201` (new) or `200` (existing device):

```json
{
  "key": "sk-or-v1-...",
  "provisioned": true,
  "free_models_only": true,
  "limit_usd": 0,
  "limit_reset": "monthly"
}
```

## Security notes

- The app shared secret is embedded in the iOS binary. Fine for a friends-only TestFlight build; not for a public App Store launch.
- Rotate `APP_SHARED_SECRET` and redeploy if the app binary leaks.
- Set `MAX_DEVICES` to cap how many friends can provision.

## Related repo

iOS integration lives in `/Users/cameronro/Development/coach` (`CoachKeyServiceClient`, `OpenRouterKeyProvisioner`).
