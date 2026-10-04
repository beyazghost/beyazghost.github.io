export interface Env {
  STATUS_TOKEN?: string;
  STATUS_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  STATUS_KV?: KVNamespace;
}

type StatusRecord = {
  status: "ok" | "overdue" | "unknown";
  window_hours: number;
  updated_at: string;
  note?: string;
  source: "manual" | "system" | "unknown";
  verified: boolean;
  signature?: string;
};

const inMemoryStatus: { current: StatusRecord | null } = {
  current: null,
};

const getCorsHeaders = (env: Env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Status-Token",
});

const json = (data: unknown, env: Env, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...getCorsHeaders(env),
      ...(init?.headers || {}),
    },
  });

const clampHours = (value: unknown, fallback = 24) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(168, Math.max(1, Math.round(num)));
};

const safeStatus = (value: unknown): StatusRecord["status"] => {
  if (value === "ok" || value === "overdue") return value;
  return "unknown";
};

const makeSignature = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
};

const getStoredStatus = async (env: Env): Promise<StatusRecord | null> => {
  if (env.STATUS_KV) {
    try {
      const raw = await env.STATUS_KV.get("current");
      if (raw) {
        const parsed = JSON.parse(raw) as StatusRecord;
        if (parsed && typeof parsed.updated_at === "string") {
          return parsed;
        }
      }
    } catch {
      // Fall through to in-memory fallback below.
    }
  }

  return inMemoryStatus.current;
};

const persistStatus = async (env: Env, record: StatusRecord) => {
  if (env.STATUS_KV) {
    await env.STATUS_KV.put("current", JSON.stringify(record));
  }
  inMemoryStatus.current = record;
  return record;
};

const checkStatusWindow = (record: StatusRecord): StatusRecord => {
  if (record.status !== "ok") {
    return record;
  }

  const updatedAt = new Date(record.updated_at).getTime();
  if (Number.isNaN(updatedAt)) {
    return { ...record, status: "unknown" };
  }

  const elapsed = Date.now() - updatedAt;
  const timeoutMs = record.window_hours * 60 * 60 * 1000;

  if (elapsed > timeoutMs) {
    return { ...record, status: "overdue" };
  }

  return record;
};

const requireWordCheck = async (body: { safe_word?: string; duress_word?: string; status?: string } | null) => {
  if (!body) return false;

  const safeWord = typeof body.safe_word === "string" ? body.safe_word.trim() : "";
  const duressWord = typeof body.duress_word === "string" ? body.duress_word.trim() : "";

  return safeWord === "bubbaissafe" || duressWord === "bubba";
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: getCorsHeaders(env) });
    }

    if (url.pathname === "/status") {
      const record = await getStoredStatus(env);
      const current = record ? checkStatusWindow(record) : {
        status: "unknown",
        window_hours: 24,
        updated_at: new Date(0).toISOString(),
        source: "unknown",
        verified: false,
      } satisfies StatusRecord;

      return json(
        {
          ...current,
          status: safeStatus(current.status),
          signature: current.signature || null,
        },
        env,
      );
    }

    if (url.pathname === "/checkin") {
      try {
        const body = await request.json<{ status?: string; window_hours?: number; note?: string; source?: string; safe_word?: string; duress_word?: string; }>();
        if (!(await requireWordCheck(body))) {
          return json({ error: "Safe word required" }, env, { status: 401 });
        }

        const safeWord = typeof body?.safe_word === "string" ? body.safe_word.trim() : "";
        const duressWord = typeof body?.duress_word === "string" ? body.duress_word.trim() : "";
        const status = safeWord === "bubbaissafe" ? "ok" : duressWord === "bubba" ? "overdue" : safeStatus(body?.status ?? "ok");
        const windowHours = clampHours(body?.window_hours, 24);
        const note = typeof body?.note === "string" ? body.note.slice(0, 500) : undefined;
        const source = body?.source === "manual" || body?.source === "system" ? body.source : "manual";
        const updatedAt = new Date().toISOString();

        const unsigned = JSON.stringify({
          status,
          window_hours: windowHours,
          updated_at: updatedAt,
          note,
          source,
        });

        const signature = env.STATUS_SECRET
          ? await makeSignature(unsigned, env.STATUS_SECRET)
          : undefined;

        const record: StatusRecord = {
          status,
          window_hours: windowHours,
          updated_at: updatedAt,
          note,
          source,
          verified: !!env.STATUS_SECRET,
          signature,
        };

        await persistStatus(env, checkStatusWindow(record));

        return json({
          ...record,
          status: safeStatus(record.status),
        }, env, { status: 200 });
      } catch {
        return json({ error: "Invalid JSON body" }, env, { status: 400 });
      }
    }

    if (url.pathname === "/request") {
      try {
        const body = await request.json<Record<string, unknown>>();
        const record = {
          timestamp: new Date().toISOString(),
          payload: body,
        };

        if (env.STATUS_KV) {
          const id = `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          await env.STATUS_KV.put(id, JSON.stringify(record));
        }

        return json({ ok: true, message: "Request received and queued for review." }, env, { status: 202 });
      } catch {
        return json({ error: "Invalid welfare request payload" }, env, { status: 400 });
      }
    }

    return json({ error: "Not found" }, env, { status: 404 });
  },
};
