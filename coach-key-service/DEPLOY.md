# Deploy coach-key-service (personal / C-Rogs)

This service is **personal infrastructure** for sharing the Coach iOS app with friends. It is not part of monday.com or corporate work.

## Prerequisites

1. Free [Cloudflare](https://dash.cloudflare.com) account
2. [OpenRouter](https://openrouter.ai) account with credits (free models still need an account)
3. OpenRouter **Management API key** (not a normal completion key):
   - https://openrouter.ai/settings/management-keys
   - Create key → copy once

## 1. Install dependencies

```bash
cd /Users/cameronro/Development/Coacher/coach-key-service
npm install
```

## 2. Create KV namespace

```bash
npx wrangler kv namespace create DEVICE_KEYS
npx wrangler kv namespace create DEVICE_KEYS --preview
```

Copy both IDs into `wrangler.toml` under `[[kv_namespaces]]`:

- `id` = production namespace id
- `preview_id` = preview namespace id

## 3. Generate the app shared secret (one time)

```bash
openssl rand -hex 32
```

Use the same value in:

1. `coach-key-service/.dev.vars` as `APP_SHARED_SECRET` (local dev)
2. `npx wrangler secret put APP_SHARED_SECRET` (production)
3. `Coach/Services/CoachKeyServiceConfig.swift` → `appSharedSecret` in the Coach app

## 4. Local dev (optional)

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

- `OPENROUTER_MANAGEMENT_KEY` = your management key
- `APP_SHARED_SECRET` = must match `CoachKeyServiceConfig.swift` in the Coach app

```bash
npm run dev
```

Test:

```bash
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/v1/provision \
  -H "Authorization: Bearer <APP_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"550e8400-e29b-41d4-a716-446655440000"}'
```

## 5. Log in to Cloudflare

```bash
npx wrangler login
```

Uses your personal Cloudflare account (not monday).

## 6. Deploy

```bash
npm run deploy
```

Note the worker URL, e.g. `https://coach-key-service.<your-subdomain>.workers.dev`

## 7. Set production secrets

Never commit these:

```bash
npx wrangler secret put OPENROUTER_MANAGEMENT_KEY
npx wrangler secret put APP_SHARED_SECRET
```

Paste the same `APP_SHARED_SECRET` value that is in the Coach app config.

## 8. Wire the Coach app

In `/Users/cameronro/Development/coach/Coach/Services/CoachKeyServiceConfig.swift`:

```swift
static let baseURLString = "https://coach-key-service.<your-subdomain>.workers.dev"
```

Rebuild Coach (Release / TestFlight). On first launch, the app auto-provisions an OpenRouter key.

## 9. Tune limits (optional)

Edit `wrangler.toml` `[vars]`:

| Var | Default | Meaning |
|-----|---------|---------|
| `KEY_LIMIT_USD` | `5` | Monthly spend cap per friend device |
| `KEY_LIMIT_RESET` | `monthly` | OpenRouter limit reset |
| `MAX_DEVICES` | `25` | Max distinct devices that can provision |

Redeploy after changes: `npm run deploy`

## Updating later

1. Edit `src/index.ts` or `wrangler.toml`
2. `npm run deploy`
3. No app update needed unless you change `APP_SHARED_SECRET` or the worker URL

## Rotating secrets

```bash
npx wrangler secret put APP_SHARED_SECRET
```

Update `CoachKeyServiceConfig.swift` with the new secret and ship a new TestFlight build.

## Monitoring

- Cloudflare dashboard → Workers → `coach-key-service` → Metrics
- OpenRouter dashboard → API keys → filter `coach-friend-*`
