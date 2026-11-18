import {boundedRequestBody} from "../server/lib/requestSecurity.mjs";
import {fetchApiResponse} from "../server/lib/apiRequest.mjs";
import {apiSelector} from "../server/lib/apiAvailability.mjs";
import { apiPool, canRetry } from "../server/lib/apiPool.mjs";
export const config = { runtime: "edge" };
const forwarded = [
  "accept",
  "accept-language",
  "content-type",
  "origin",
  "referer",
  "cookie",
  "authorization",
  "range",
  "x-client-id",
  "x-usage-token",
  "x-client-usage",
];
const sidecarCache = new Map<string, {expires: number; value: Promise<string | null>}>();
const SIDECAR_PATHS = ['/api/account/visual-mode', '/api/account/dm', '/api/account/dm/rooms'];
const isYouTubeRead = (path: string) => /^\/api\/(?:recommendations|trending|search|suggestions|video|channel|channels|home|mix|shorts|shorts-ranking|user|playlists|playlist|sync)(?:[/?]|$)/.test(path);

async function accountSidecar(origin: string, headers: Headers): Promise<string | null> {
  const session = /(?:^|;\s*)__Host-xy_session=([^;]+)/.exec(headers.get('cookie') || '')?.[1];
  if (!session) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
  const key = Array.from(new Uint8Array(hash).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
  const previous = sidecarCache.get(key);
  if (previous && previous.expires > Date.now()) return previous.value;
  const value = (async () => {
    const metadataHeaders = new Headers(headers);
    metadataHeaders.set('accept', 'application/json');
    const data = await Promise.all(SIDECAR_PATHS.map(path =>
      fetchApiResponse(origin + path, { method: 'GET', headers: metadataHeaders, redirect: 'manual' }, 2000)
        .then(response => response.ok ? response.json() : null).catch(() => null)
    ));
    const [visual, messages, rooms] = data;
    const sidecar: Record<string, unknown> = {capturedAt: Date.now()};
    if (typeof visual?.mode === 'string') sidecar.mode = visual.mode;
    if (Array.isArray(messages?.threads)) sidecar.threads = messages.threads.slice(0, 16).map((t: any) => ({
      id: t.id, status: t.status, incoming: t.incoming, updatedAt: t.updatedAt, lastMine: t.lastMine, label: t.label,
    }));
    if (Array.isArray(rooms?.rooms)) sidecar.rooms = rooms.rooms.slice(0, 10).map((room: any) => ({
      id: room.id, status: room.status, lastAt: room.lastAt, lastMine: room.lastMine, name: room.name,
    }));
    return Object.keys(sidecar).length > 1 ? JSON.stringify(sidecar) : null;
  })().catch(() => null);
  if (sidecarCache.size >= 64) sidecarCache.delete(sidecarCache.keys().next().value!);
  sidecarCache.set(key, {expires: Date.now() + 12000, value});
  return value;
}

export default async function handler(request: Request) {
  const startedAt = Date.now();
  // Keep the entire Edge invocation below its 25s first-response limit,
  // including health checks, request-body parsing and upstream retries.
  const loginStart = /^\/api\/(instagram|tiktok)\/login\/(start|credentials|verify|check|finish)$/.test(new URL(request.url).pathname);
  const deadline = startedAt + (loginStart ? 24000 : 18000);
  const url = new URL(request.url);
  const routeName = '/' + url.pathname.split('/').filter(Boolean).slice(0, 3).map((part, index) => index === 2 && part !== 'batch' ? ':id' : part).join('/');
  let attempts = 0;
  let upstreamIndex = 0;
  const respond = (response: Response, reason?: string) => {
    const fields = {event: 'api_request', operation: routeName, method: request.method, status: response.status, durationMs: Date.now() - startedAt, attempts, upstreamIndex, ...(reason ? {reason} : {})};
    if (response.status >= 500) console.warn(JSON.stringify(fields));
    else console.info(JSON.stringify(fields));
    return response;
  };

  let pool: string[];
  try {
    pool = apiPool(process.env).filter(origin=>new URL(origin).hostname.endsWith('.workers.dev'));
  } catch {
    return respond(Response.json(
      { error: "API URLの環境変数を確認してください。" },
      { status: 503 },
    ), 'invalid_api_config');
  }
  if (url.pathname === "/api/transport-config")
    return respond(Response.json(
      { origins: [], mode: 'vercel-proxy' },
      { headers: { "Cache-Control": "no-store" } },
    ));
  if (!pool.length)
    return respond(Response.json(
      {
        error: "API_BASE_URL_1 を設定して再デプロイしてください。",
        code: "API_NOT_CONFIGURED",
      },
      { status: 503 },
    ), 'api_not_configured');
  const legacy =
    url.pathname === "/api/playback-gateway"
      ? url.searchParams.get("route")
      : null;
  const path = legacy || url.pathname;
  if (
    legacy &&
    !/^\/(stream|360|edu|scratch-edu)\/[A-Za-z0-9_-]+$/.test(legacy)
  )
    return respond(Response.json({ error: "Invalid playback route" }, { status: 400 }));
  const query = legacy ? "" : url.search;
  const headers = new Headers();
  for (const name of forwarded) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('Origin')) headers.set('Origin', url.origin);
  if (process.env.API_SHARED_SECRET) headers.set('Authorization','Bearer '+process.env.API_SHARED_SECRET);
  const configuredPool = pool;
  const cloudflareOnly=/^\/api\/(auth|user|instagram|tiktok)(\/|$)/.test(path)||path==='/api/account/cloudflare-session';
  if(cloudflareOnly)pool=pool.filter(origin=>new URL(origin).hostname.endsWith('.workers.dev'));
  else pool=await apiSelector.plan(pool,headers);
  if (!pool.length) return respond(Response.json({error:'利用できるAPIがありません。しばらくしてから再試行してください。',code:'API_UNAVAILABLE'}, {status:503,headers:{'Cache-Control':'no-store'}}), 'health_check_failed');
  // Metadata piggybacks on foreground YouTube API reads; no background polling.
  const wantsSidecar = request.method === 'GET'
    && request.headers.get('x-xeroxyt-sidecar') === '1'
    && isYouTubeRead(path)
    && !!headers.get('cookie');
  const sidecarTask = wantsSidecar ? accountSidecar(pool[0], headers) : null;
  const readonly = ["GET", "HEAD"].includes(request.method);
  let body: Uint8Array | undefined;
  try{body=readonly?undefined:await boundedRequestBody(request);}catch{return respond(Response.json({error:'Request too large'},{status:413}));}
  if (body && body.byteLength > 1024 * 1024)
    return respond(Response.json({ error: "Request too large" }, { status: 413 }));
  let lastFailure = 'upstream_unavailable';
  for (let i = 0; i < pool.length; i++) {
    if (Date.now() >= deadline) break;
    attempts++;
    upstreamIndex = configuredPool.indexOf(pool[i]) + 1;
    try {
      const response = await fetchApiResponse(pool[i] + path + query, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: request.signal,
      }, Math.max(1, Math.min(loginStart ? 22000 : 12000, deadline - Date.now())));
      // A route error or a per-user quota does not tell us whether this API is healthy.
      if (
        canRetry(request.method, path, response.status) &&
        i < pool.length - 1
      ) {
        await response.body?.cancel();
        continue;
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return respond(Response.json(
          { error: "API returned an unexpected redirect" },
          { status: 502 },
        ), 'upstream_redirect');
      }
      const outgoing = new Headers(response.headers);
      outgoing.delete("content-encoding");
      outgoing.delete("content-length");
      outgoing.set("Cache-Control", "private, no-store");
      if (sidecarTask) {
        const sidecar = await Promise.race<string | null>([
          sidecarTask,
          new Promise(resolve => setTimeout(() => resolve(null), 850)),
        ]);
        if (sidecar && sidecar.length < 3500) outgoing.set('X-XeroxYT-Sidecar', encodeURIComponent(sidecar));
      }
      outgoing.set("X-XeroxYT-Transport", "proxy");
      outgoing.set("X-XeroxYT-API-Index", String(configuredPool.indexOf(pool[i]) + 1));
      return respond(new Response(response.body, {
        status: response.status,
        headers: outgoing,
      }));
    } catch (error) {
      lastFailure = error instanceof Error ? error.name : 'upstream_error';
      console.warn(JSON.stringify({event:'api_upstream_failure',operation:routeName,method:request.method,upstreamIndex,durationMs:Date.now()-startedAt,reason:lastFailure}));
      if (request.signal.aborted) throw error;
      if (!readonly || /^\/api\/(account|auth)(\/|$)/.test(path)) break;
    }
  }
  return respond(Response.json(
    {
      error: "登録されているAPIに接続できませんでした。",
      code: Date.now() >= deadline ? "API_TIMEOUT" : "API_UNAVAILABLE",
    },
    { status: Date.now() >= deadline ? 504 : 502, headers: {'Cache-Control':'no-store'} },
  ), lastFailure);
}
