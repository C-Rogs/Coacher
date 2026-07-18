export interface Env {
  DEVICE_KEYS: KVNamespace;
  OPENROUTER_MANAGEMENT_KEY: string;
  APP_SHARED_SECRET: string;
  KEY_LIMIT_USD?: string;
  KEY_LIMIT_RESET?: string;
  MAX_DEVICES?: string;
}

interface ProvisionRequest {
  device_id?: string;
}

interface StoredDeviceKey {
  key: string;
  created_at: string;
  name: string;
}

interface OpenRouterCreateKeyResponse {
  key?: string;
  data?: {
    hash?: string;
    name?: string;
  };
  error?: {
    message?: string;
  };
}

const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const META_DEVICE_COUNT_KEY = "meta:device_count";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "coach-key-service" });
    }

    if (request.method === "POST" && url.pathname === "/v1/provision") {
      return handleProvision(request, env);
    }

    return json({ error: "not_found" }, 404);
  },
};

async function handleProvision(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: ProvisionRequest;
  try {
    body = (await request.json()) as ProvisionRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const deviceId = body.device_id?.trim().toLowerCase();
  if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
    return json({ error: "invalid_device_id" }, 400);
  }

  const kvKey = `device:${deviceId}`;
  const existing = await env.DEVICE_KEYS.get<StoredDeviceKey>(kvKey, "json");
  if (existing?.key) {
    return json({
      key: existing.key,
      provisioned: false,
      limit_usd: parseLimit(env.KEY_LIMIT_USD),
      limit_reset: env.KEY_LIMIT_RESET ?? "monthly",
    });
  }

  const maxDevices = parseInt(env.MAX_DEVICES ?? "25", 10);
  if (Number.isFinite(maxDevices) && maxDevices > 0) {
    const countRaw = await env.DEVICE_KEYS.get(META_DEVICE_COUNT_KEY);
    const count = countRaw ? parseInt(countRaw, 10) : 0;
    if (count >= maxDevices) {
      return json({ error: "device_cap_reached" }, 503);
    }
  }

  const minted = await mintOpenRouterKey(deviceId, env);
  if (!minted.ok) {
    return json({ error: minted.error, detail: minted.detail }, minted.status);
  }

  const record: StoredDeviceKey = {
    key: minted.key,
    created_at: new Date().toISOString(),
    name: minted.name,
  };

  await env.DEVICE_KEYS.put(kvKey, JSON.stringify(record));

  const countRaw = await env.DEVICE_KEYS.get(META_DEVICE_COUNT_KEY);
  const nextCount = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  await env.DEVICE_KEYS.put(META_DEVICE_COUNT_KEY, String(nextCount));

  return json(
    {
      key: minted.key,
      provisioned: true,
      limit_usd: parseLimit(env.KEY_LIMIT_USD),
      limit_reset: env.KEY_LIMIT_RESET ?? "monthly",
    },
    201,
  );
}

function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  const expected = `Bearer ${env.APP_SHARED_SECRET}`;
  return timingSafeEqual(auth, expected);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function parseLimit(raw: string | undefined): number {
  const parsed = parseFloat(raw ?? "5");
  return Number.isFinite(parsed) ? parsed : 5;
}

async function mintOpenRouterKey(
  deviceId: string,
  env: Env,
): Promise<
  | { ok: true; key: string; name: string }
  | { ok: false; error: string; detail?: string; status: number }
> {
  const shortId = deviceId.slice(0, 8);
  const name = `coach-friend-${shortId}`;
  const limit = parseLimit(env.KEY_LIMIT_USD);
  const limitReset = env.KEY_LIMIT_RESET ?? "monthly";

  const response = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_MANAGEMENT_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      limit,
      limit_reset: limitReset,
      include_byok_in_limit: false,
    }),
  });

  const payload = (await response.json()) as OpenRouterCreateKeyResponse;

  if (!response.ok) {
    return {
      ok: false,
      error: "openrouter_mint_failed",
      detail: payload.error?.message ?? `HTTP ${response.status}`,
      status: 502,
    };
  }

  if (!payload.key) {
    return {
      ok: false,
      error: "openrouter_missing_key",
      status: 502,
    };
  }

  return { ok: true, key: payload.key, name };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
