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
  GITHUB_REPO?: string;
  CF_WA_SITE_TAG?: string;
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

const fetchJson = async <T>(url: string, env: Env): Promise<T | null> => {
  if (!env.CLOUDFLARE_API_TOKEN) return null;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
};

const discoverCloudflareAccountId = async (env: Env): Promise<string | null> => {
  if (env.CLOUDFLARE_ACCOUNT_ID) return env.CLOUDFLARE_ACCOUNT_ID;
  if (!env.CLOUDFLARE_API_TOKEN) return null;

  const accounts = await fetchJson<Array<{ id?: string; name?: string }>>(
    "https://api.cloudflare.com/client/v4/accounts",
    env,
  );

  return accounts?.[0]?.id || null;
};

const getCloudflareProjectStatus = async (env: Env) => {
  const token = env.CLOUDFLARE_API_TOKEN;
  const projectName = env.CLOUDFLARE_PAGES_PROJECT || "spbzorro";
  if (!token) {
    return {
      configured: true,
      ok: true,
      source: "github",
      project: projectName,
      url: "https://spbzorro.pages.dev",
      message: "Cloudflare credentials not configured; using GitHub commit history for activity.",
    };
  }

  if (!token || !projectName) {
    return {
      configured: false,
      message: "Cloudflare Pages credentials are not configured yet.",
      project: projectName,
    };
  }

  const accountId = await discoverCloudflareAccountId(env);
  if (!accountId) {
    return {
      configured: false,
      message: "Cloudflare account could not be discovered for this token.",
      project: projectName,
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
      project: (project.name as string) || projectName,
      url: project.subdomain ? `https://${project.subdomain}` : "https://spbzorro.pages.dev",
      production_branch: (project.production_branch as string) || "production",
      last_deployment: (deployment.created_on as string) || (deployment.id as string) || null,
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

const getCloudflareDeploymentHistory = async (env: Env) => {
  const projectName = env.CLOUDFLARE_PAGES_PROJECT || "spbzorro";
  if (!env.CLOUDFLARE_API_TOKEN) return await getGitHubCommitHistory(env);

  const accountId = await discoverCloudflareAccountId(env);
  if (!accountId) return [] as Array<{ timestamp: string; count: number }>;

  const projects = await fetchJson<{ result?: Array<{ name?: string }> }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
    env,
  );

  if (!projects?.result?.find((project) => project.name === projectName)) {
    return [] as Array<{ timestamp: string; count: number }>;
  }

  const deployments = await fetchJson<{ result?: Array<{ created_on?: string }> }>(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=100`,
    env,
  );

  const buckets = new Map<string, number>();
  for (const deployment of deployments?.result || []) {
    if (!deployment.created_on) continue;
    const date = new Date(deployment.created_on);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const history: Array<{ timestamp: string; count: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    history.push({ timestamp: key, count: buckets.get(key) || 0 });
  }
  return history;
};

const getGitHubCommitHistory = async (env: Env) => {
  const repo = env.GITHUB_REPO || "beyazghost/beyazghost.github.io";
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const url = `https://api.github.com/repos/${repo}/commits?since=${since.toISOString()}&per_page=100`;
  try {
    const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json", "User-Agent": "journo-status-service" } });
    if (!res.ok) return [] as Array<{ timestamp: string; count: number }>;
    const data = await res.json() as Array<{ commit?: { author?: { date?: string } } }>;
    const buckets = new Map<string, number>();
    for (const c of data || []) {
      const d = c?.commit?.author?.date;
      if (!d) continue;
      const key = new Date(d).toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const history: Array<{ timestamp: string; count: number }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      history.push({ timestamp: key, count: buckets.get(key) || 0 });
    }
    return history;
  } catch {
    return [] as Array<{ timestamp: string; count: number }>;
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
  const threads = new Set([
    "news-birthday-update",
    "news-travel-update",
    "news-to-the-five-thousand",
    "news-sim-hacking",
    "news-old-accounts",
    "proof-of-life",
    "safety",
  ]);
  const siteUrl = "https://spbzorro.pages.dev";
  const pages = new Set(["/", "/news", "/reflections", "/refractions", "/reports", "/proof-of-life"]);

  try {
    const response = await fetch(`${siteUrl}/sitemap.xml`);
    if (response.ok) {
      const sitemap = await response.text();
      for (const match of sitemap.matchAll(/<loc>https:\/\/spbzorro\.pages\.dev(\/writing\/[a-z0-9-]+)<\/loc>/gi)) {
        pages.add(match[1]);
      }
    }
  } catch {
    // Continue with the current static pages if sitemap discovery is offline.
  }

  const pageResults = await Promise.allSettled([...pages].map(async (page) => {
    const response = await fetch(`${siteUrl}${page}`);
    if (!response.ok) return "";
    return await response.text();
  }));
  for (const result of pageResults) {
    if (result.status !== "fulfilled") continue;
    for (const match of result.value.matchAll(/data-thread=["']([a-z0-9_-]{1,100})["']/gi)) {
      threads.add(match[1]);
    }
  }

  const results: Array<{ body: string; created_at: string; thread: string }> = [];
  const commentResults = await Promise.allSettled([...threads].slice(0, 30).map(async (thread) => {
    const response = await fetch(`${apiUrl}/comments?thread=${encodeURIComponent(thread)}`);
    if (!response.ok) return [] as Array<{ body: string; created_at: string; thread: string }>;
    const payload = await response.json() as { comments?: Array<{ body: string; created_at: string }> };
    return (payload.comments || []).map((comment) => ({ ...comment, thread }));
  }));
  for (const result of commentResults) {
    if (result.status === "fulfilled") results.push(...result.value);
  }

  return {
    total: results.length,
    entries: results
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25),
  };
};

const buildHistoryFromEntries = (welfareEntries: { timestamp?: string }[], commentEntries: { created_at?: string }[], deploymentHistory: Array<{ timestamp: string; count: number }>) => {
  const byDay = new Map<string, { welfare: number; comments: number; deployments: number }>();
  const today = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    byDay.set(key, { welfare: 0, comments: 0, deployments: 0 });
  }

  for (const entry of welfareEntries) {
    if (!entry.timestamp) continue;
    const key = new Date(entry.timestamp).toISOString().slice(0, 10);
    if (byDay.has(key)) {
      byDay.get(key)!.welfare += 1;
    }
  }

  for (const entry of commentEntries) {
    if (!entry.created_at) continue;
    const key = new Date(entry.created_at).toISOString().slice(0, 10);
    if (byDay.has(key)) {
      byDay.get(key)!.comments += 1;
    }
  }

  for (const deployment of deploymentHistory) {
    if (byDay.has(deployment.timestamp)) {
      byDay.get(deployment.timestamp)!.deployments += deployment.count;
    }
  }

  return Array.from(byDay.entries()).map(([date, values]) => ({
    date,
    label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    welfare: values.welfare,
    comments: values.comments,
    deployments: values.deployments,
    total: values.welfare + values.comments + values.deployments,
  }));
};

const requireWordCheck = async (body: { safe_word?: string; duress_word?: string; status?: string } | null) => {
  if (!body) return false;

  const safeWord = typeof body.safe_word === "string" ? body.safe_word.trim() : "";
  const duressWord = typeof body.duress_word === "string" ? body.duress_word.trim() : "";

  return safeWord === "bubbaissafe" || duressWord === "bubba";
};


const analyticsKey = (date: string) => `analytics:${date}`;

const recordAnalyticsHit = async (env: Env) => {
  if (!env.STATUS_KV) return;
  const key = analyticsKey(new Date().toISOString().slice(0, 10));
  const raw = await env.STATUS_KV.get(key);
  const count = (raw ? parseInt(raw, 10) : 0) + 1;
  await env.STATUS_KV.put(key, String(count));
};

const getAnalyticsSummary = async (env: Env) => {
  const days: Array<{ date: string; total: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    let total = 0;
    if (env.STATUS_KV) {
      const raw = await env.STATUS_KV.get(analyticsKey(key));
      total = raw ? (parseInt(raw, 10) || 0) : 0;
    }
    days.push({ date: key, total });
  }
  return { days, total: days.reduce((a, b) => a + b.total, 0) };
};


const getWebAnalytics = async (env: Env) => {
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || "d2a246f376937c8a6d58d1f75925ac4b";
  const projectName = env.CLOUDFLARE_PAGES_PROJECT || "spbzorro";
  if (!token) {
    return { configured: false, days: [], countries: [], encrypted: 0, total: 0, message: "Cloudflare API token not configured." };
  }
  // Discover Web Analytics site tag from the Pages project (if enabled in dashboard).
  let siteTag = env.CF_WA_SITE_TAG || null;
  if (!siteTag) {
    try {
      const projRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (projRes.ok) {
        const projData = await projRes.json() as any;
        siteTag = projData?.result?.build_config?.web_analytics_tag || null;
      }
    } catch {}
  }
  if (!siteTag) {
    return { configured: false, days: [], countries: [], encrypted: 0, total: 0, message: "Web Analytics not enabled on the Pages project. Enable it in the Cloudflare dashboard (Pages project → Settings → Web Analytics) so a site tag is generated." };
  }
  const since = new Date(); since.setDate(since.getDate() - 7);
  const until = new Date();
  const query = `{ viewer { accounts(filter: {accountTag: "${accountId}"}) { rumPageloadEventsAdaptiveGroups(limit: 10000, filter: {siteTag: "${siteTag}", date_geq: "${since.toISOString().slice(0,10)}", date_leq: "${until.toISOString().slice(0,10)}"}) { count dimensions { date countryName requestScheme } } } } }`;
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { configured: true, error: "HTTP " + res.status, days: [], countries: [], encrypted: 0, total: 0 };
    const data = await res.json() as any;
    const groups = data?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || [];
    const byDay = new Map<string, number>();
    const byCountry = new Map<string, number>();
    let encrypted = 0; let total = 0;
    for (const g of groups) {
      const c = g.count || 0;
      const d = g.dimensions?.date;
      if (d) byDay.set(d, (byDay.get(d) || 0) + c);
      const country = g.dimensions?.countryName || "Unknown";
      byCountry.set(country, (byCountry.get(country) || 0) + c);
      if ((g.dimensions?.requestScheme || "").toLowerCase() === "https") encrypted += c;
      total += c;
    }
    const days: Array<{ date: string; total: number }> = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today); date.setHours(0,0,0,0); date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0,10);
      days.push({ date: key, total: byDay.get(key) || 0 });
    }
    const countries = Array.from(byCountry.entries()).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,15);
    return { configured: true, days, countries, encrypted, total };
  } catch (e) {
    return { configured: true, error: String(e), days: [], countries: [], encrypted: 0, total: 0 };
  }
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

      const [cloudflare, welfare, comments, deploymentHistory] = await Promise.all([
        getCloudflareProjectStatus(env),
        getWelfareEntries(env),
        getCommentEntries(env),
        getCloudflareDeploymentHistory(env),
      ]);

      const analytics = await getAnalyticsSummary(env);
      const webAnalytics = await getWebAnalytics(env);
      return json({
        ok: true,
        timestamp: new Date().toISOString(),
        cloudflare,
        welfare,
        comments,
        analytics,
        webAnalytics,
        history: buildHistoryFromEntries(
          welfare.entries,
          comments.entries,
          deploymentHistory,
        ),
      }, env, { status: 200 });
    }


    if (url.pathname === "/analytics/hit") {
      if (request.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(env) });
      await recordAnalyticsHit(env);
      return json({ ok: true }, env, { status: 202 });
    }

    if (url.pathname === "/analytics/summary") {
      const summary = await getAnalyticsSummary(env);
      return json({ ok: true, ...summary }, env);
    }

    return json({ error: "Not found" }, env, { status: 404 });
  },
};
