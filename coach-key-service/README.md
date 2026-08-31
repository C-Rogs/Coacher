# coach-key-service

Implementation of the Worker described in the [repo README](../README.md). Deploy notes: [DEPLOY.md](DEPLOY.md).

## API

`GET /health` returns `{ ok, service, free_models_only }`.

`POST /v1/provision`

Headers: `Authorization: Bearer <APP_SHARED_SECRET>`, `Content-Type: application/json`

```json
{ "device_id": "550e8400-e29b-41d4-a716-446655440000" }
```

`201` on first mint, `200` if that device already has a key. Body includes `key`, `free_models_only`, `limit_usd`, `limit_reset`.

## Local

```bash
cp .dev.vars.example .dev.vars
npm install
npm run dev
```
