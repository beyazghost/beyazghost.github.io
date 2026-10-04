export interface Env {
  STATUS_TOKEN?: string;
  STATUS_SECRET?: string;
  ALLOWED_ORIGIN?: string;
  STATUS_KV?: KVNamespace;
  DASHBOARD_PASSWORD?: string;
  DASHBOARD_SESSION_SECRET?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_PAGES_PROJECT?: string;
  COMMENTS_API_URL?: string;
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

const getDashboardSecret = (env: Env) => env.DASHBOARD_SESSION_SECRET || env.STATUS_SECRET || "local-dashboard-secret";

const createDashboardToken = async (env: Env) => {
  const payload = { user: "admin", exp: Date.now() + 60 * 60 * 1000 };
  const encoded = btoa(JSON.stringify(payload));
  const signature = await makeSignature(encoded, getDashboardSecret(env));
  return `${encoded}.${signature}`;
};

const verifyDashboardToken = async (env: Env, token: string | null) => {
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = await makeSignature(encoded, getDashboardSecret(env));
  if (signature !== expectedSignature) return false;

  try {
    const payload = JSON.parse(atob(encoded));
    return payload.user === "admin" && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
};

const getCloudflareProjectStatus = async (env: Env) => {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const projectName = env.CLOUDFLARE_PAGES_PROJECT;

  if (!token || !accountId || !projectName) {
    return {
      configured: false,
      message: "Cloudflare Pages credentials are not configured yet.",
      project: projectName || "spbzorro",
    };
  }

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json() as {
      errors?: Array<{ message?: string }>;
      result?: Record<string, unknown>;
    };
    if (!response.ok) {
      return {
        configured: true,
        ok: false,
        error: data?.errors?.[0]?.message || "Cloudflare API request failed.",
      };
    }

    const project = (data.result || {}) as Record<string, unknown>;
    const deployment = (project.latest_deployment as Record<string, unknown> | undefined) || (project.deployment as Record<string, unknown> | undefined) || {};

    return {
      configured: true,
      ok: true,
      project: project.name || projectName,
      url: project.subdomain ? `https://${project.subdomain}` : "https://spbzorro.pages.dev",
      production_branch: project.production_branch || "production",
      last_deployment: deployment.created_on || deployment.id || null,
      status: project.latest_deployment ? "active" : "unknown",
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Cloudflare API error.",
    };
  }
};

const getWelfareEntries = async (env: Env) => {
  if (!env.STATUS_KV) {
    return { total: 0, entries: [] };
  }

  const list = await env.STATUS_KV.list({ prefix: "request-" });
  const entries = await Promise.all(
    (list.keys || []).map(async ({ name }) => {
      const raw = await env.STATUS_KV!.get(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }),
  );

  return {
    total: entries.filter(Boolean).length,
    entries: entries.filter(Boolean).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  };
};

const getCommentEntries = async (env: Env) => {
  const apiUrl = env.COMMENTS_API_URL || "https://journo-comments.journo-sentinel.workers.dev";
  const threads = [
    "news-birthday-update",
    "news-travel-update",
    "news-to-the-five-thousand",
    "news-sim-hacking",
    "news-old-accounts",
    "proof-of-life",
    "safety",
  ];

  const results: Array<{ body: string; created_at: string; thread: string }> = [];

  for (const thread of threads) {
    try {
      const response = await fetch(`${apiUrl}/comments?thread=${encodeURIComponent(thread)}`);
      if (!response.ok) continue;
      const payload = await response.json() as { comments?: Array<{ body: string; created_at: string }> };
      for (const comment of payload.comments || []) {
        results.push({ ...comment, thread });
      }
    } catch {
      // Ignore individual thread failures and continue collecting the rest.
    }
  }

  return {
    total: results.length,
    entries: results
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25),
  };
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

    if (url.pathname === "/dashboard/login") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, env, { status: 405 });
      }

      try {
        const body = await request.json<{ password?: string }>();
        if (!body || body.password !== env.DASHBOARD_PASSWORD) {
          return json({ error: "Invalid password" }, env, { status: 401 });
        }

        const token = await createDashboardToken(env);
        return json({ ok: true, token }, env, { status: 200 });
      } catch {
        return json({ error: "Invalid login payload" }, env, { status: 400 });
      }
    }

    if (url.pathname === "/dashboard/data") {
      const auth = request.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

      if (!(await verifyDashboardToken(env, token))) {
        return json({ error: "Unauthorized" }, env, { status: 401 });
      }

      const [cloudflare, welfare, comments] = await Promise.all([
        getCloudflareProjectStatus(env),
        getWelfareEntries(env),
        getCommentEntries(env),
      ]);

      return json({
        ok: true,
        timestamp: new Date().toISOString(),
        cloudflare,
        welfare,
        comments,
      }, env, { status: 200 });
    }

    return json({ error: "Not found" }, env, { status: 404 });
  },
};
