# Deploy coach-key-service (personal / C-Rogs)

**No server needed.** This runs on [Cloudflare Workers](https://workers.cloudflare.com) (free tier). Your Mac only deploys the code; Cloudflare hosts it.

Personal infrastructure for Coach TestFlight friends — not monday.com / corporate.

## Fastest path (from this Mac)

```bash
cd /Users/cameronro/Development/Coacher/coach-key-service
./scripts/deploy-from-mac.sh
```

The script will:

1. `wrangler login` (browser — use personal Cloudflare account)
2. Create KV namespace if needed
3. Deploy the worker
4. Prompt for OpenRouter + app secrets

You need an OpenRouter **Management API key** first: https://openrouter.ai/settings/management-keys

App shared secret is already in `.setup-secret.txt` (local, gitignored). Inject into Coach before TestFlight:

```bash
cd /Users/cameronro/Development/coach
./scripts/inject-key-service-secret.sh
```

## What gets enforced (zero cost)

On each new device key the worker:

1. Mints an OpenRouter API key with **`limit: $0`**
2. Creates/reuses guardrail **`coach-friends-free-only`**
3. Allowlists only Coach free models (`:free` + `openrouter/free`)
4. Assigns that guardrail to the minted key

Paid models are blocked server-side even if someone extracts the key.

Free model list lives in `src/models.ts` — keep in sync with `coach/Coach/Models/OpenRouterModel.swift`.

## Manual steps (if you prefer)

### 1. Install

```bash
cd /Users/cameronro/Development/Coacher/coach-key-service
npm install
```

### 2. Cloudflare login

```bash
npx wrangler login
```

### 3. KV namespace

```bash
npx wrangler kv namespace create DEVICE_KEYS
npx wrangler kv namespace create DEVICE_KEYS --preview
```

Paste IDs into `wrangler.toml`.

### 4. Deploy + secrets

```bash
npm run deploy
npx wrangler secret put OPENROUTER_MANAGEMENT_KEY
npx wrangler secret put APP_SHARED_SECRET   # from .setup-secret.txt
```

### 5. Wire Coach app

Edit `coach/Coach/Services/CoachKeyServiceConfig.swift`:

```swift
static let baseURLString = "https://coach-key-service.<your-subdomain>.workers.dev"
```

Then inject secret + archive for TestFlight.

## Config (`wrangler.toml`)

| Var | Default | Meaning |
|-----|---------|---------|
| `KEY_LIMIT_USD` | `0` | Per-key spend cap (backup to guardrail) |
| `KEY_LIMIT_RESET` | `monthly` | OpenRouter limit reset |
| `MAX_DEVICES` | `25` | Max friend devices |

## Test locally

```bash
cp .dev.vars.example .dev.vars   # add management key + shared secret
npm run dev
```

```bash
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/v1/provision \
  -H "Authorization: Bearer <APP_SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"550e8400-e29b-41d4-a716-446655440000"}'
```

## Monitoring

- Cloudflare → Workers → `coach-key-service`
- OpenRouter → API keys → `coach-friend-*`
- OpenRouter → Guardrails → `coach-friends-free-only`
