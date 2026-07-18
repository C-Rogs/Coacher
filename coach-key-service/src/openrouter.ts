import { COACH_FREE_MODELS, GUARDRAIL_NAME } from "./models";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface OpenRouterErrorBody {
  error?: { message?: string };
}

export interface MintedKey {
  key: string;
  name: string;
  hash: string;
}

function managementHeaders(managementKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${managementKey}`,
    "Content-Type": "application/json",
  };
}

export async function ensureFreeOnlyGuardrail(
  managementKey: string,
  kv: KVNamespace,
): Promise<string> {
  const cached = await kv.get("meta:guardrail_id");
  if (cached) {
    return cached;
  }

  const listResponse = await fetch(`${OPENROUTER_BASE}/guardrails`, {
    headers: managementHeaders(managementKey),
  });
  const listPayload = (await listResponse.json()) as {
    data?: Array<{ id?: string; name?: string }>;
    error?: { message?: string };
  };

  if (!listResponse.ok) {
    throw new Error(
      listPayload.error?.message ?? `list guardrails failed: HTTP ${listResponse.status}`,
    );
  }

  const existing = listPayload.data?.find((g) => g.name === GUARDRAIL_NAME);
  if (existing?.id) {
    await kv.put("meta:guardrail_id", existing.id);
    return existing.id;
  }

  const createResponse = await fetch(`${OPENROUTER_BASE}/guardrails`, {
    method: "POST",
    headers: managementHeaders(managementKey),
    body: JSON.stringify({
      name: GUARDRAIL_NAME,
      description: "Coach TestFlight friends — free OpenRouter models only",
      allowed_models: [...COACH_FREE_MODELS],
      limit_usd: 0,
      reset_interval: "monthly",
    }),
  });

  const createPayload = (await createResponse.json()) as {
    data?: { id?: string };
    error?: { message?: string };
  };

  if (!createResponse.ok || !createPayload.data?.id) {
    throw new Error(
      createPayload.error?.message ??
        `create guardrail failed: HTTP ${createResponse.status}`,
    );
  }

  await kv.put("meta:guardrail_id", createPayload.data.id);
  return createPayload.data.id;
}

export async function mintOpenRouterKey(
  deviceId: string,
  managementKey: string,
  limitUsd: number,
  limitReset: string,
): Promise<MintedKey> {
  const shortId = deviceId.slice(0, 8);
  const name = `coach-friend-${shortId}`;

  const response = await fetch(`${OPENROUTER_BASE}/keys`, {
    method: "POST",
    headers: managementHeaders(managementKey),
    body: JSON.stringify({
      name,
      limit: limitUsd,
      limit_reset: limitReset,
      include_byok_in_limit: false,
    }),
  });

  const payload = (await response.json()) as {
    key?: string;
    data?: { hash?: string; name?: string };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `mint key failed: HTTP ${response.status}`,
    );
  }

  if (!payload.key || !payload.data?.hash) {
    throw new Error("mint key response missing key or hash");
  }

  return {
    key: payload.key,
    name: payload.data.name ?? name,
    hash: payload.data.hash,
  };
}

export async function assignKeyToGuardrail(
  guardrailId: string,
  keyHash: string,
  managementKey: string,
): Promise<void> {
  const response = await fetch(
    `${OPENROUTER_BASE}/guardrails/${guardrailId}/assignments/keys`,
    {
      method: "POST",
      headers: managementHeaders(managementKey),
      body: JSON.stringify({ key_hashes: [keyHash] }),
    },
  );

  const payload = (await response.json()) as OpenRouterErrorBody & {
    assigned_count?: number;
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `assign guardrail failed: HTTP ${response.status}`,
    );
  }
}
