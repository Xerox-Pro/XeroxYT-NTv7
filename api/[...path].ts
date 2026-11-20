import {boundedRequestBody} from "../server/lib/requestSecurity.mjs";
import {fetchApiResponse} from "../server/lib/apiRequest.mjs";
import {apiSelector} from "../server/lib/apiAvailability.mjs";
import { apiPool, canRetry, orderApiPool, workerQuotaExceeded } from "../server/lib/apiPool.mjs";
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
const realtimeTicketPath = '/api/account/realtime/ticket';

export default async function handler(request: Request) {
  const startedAt = Date.now();
  // Keep the entire Edge invocation below its 25s first-response limit,
  // including health checks, request-body parsing and upstream retries.
  const deadline = startedAt + 18000;
  const url = new URL(request.url);
  if (/^\/api\/(?:instagram|tiktok|x|x-public-post|social-browser)(?:\/|$)/i.test(url.pathname)) {
    return Response.json({error:'Not found'}, {status:404});
  }
  const routeName = '/' + url.pathname.split('/').filter(Boolean).slice(0, 3).map((part, index) => index === 2 && part !== 'batch' ? ':id' : part).join('/');
  let attempts = 0;
  let upstreamIndex = 0;
  const respond = (response: Response, reason?: string) => {
    const fields = {event: 'api_request', operation: routeName, method: request.method, status: response.status, durationMs: Date.now() - startedAt, attempts, upstreamIndex, ...(reason ? {reason} : {})};
    // Request metadata is recorded once at the Cloudflare API boundary.
    if (response.status >= 500) console.warn(JSON.stringify(fields));
    else console.info(JSON.stringify(fields));
    return response;
  };

  // Internal telemetry is not a public API: prevent client-forged log entries.
  if(url.pathname==='/api/account/telemetry')return respond(Response.json({error:'Not found'},{status:404}));
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
  if (/^\/api(?:\/|$)/.test(path)) headers.set('Accept','application/json');
  if (!headers.has('Origin')) headers.set('Origin', url.origin);
  if (process.env.API_SHARED_SECRET) headers.set('Authorization','Bearer '+process.env.API_SHARED_SECRET);
  const configuredPool = pool;
  const secondarySecret = process.env.API_SHARED_SECRET_2;
  const secondaryOrigin = secondarySecret ? apiPool({API_BASE_URL_2: process.env.API_BASE_URL_2})[0] : undefined;
  const headersFor = (origin: string) => {
    if (!secondarySecret || origin !== secondaryOrigin) return headers;
    const peerHeaders = new Headers(headers);
    peerHeaders.set('Authorization', 'Bearer ' + secondarySecret);
    return peerHeaders;
  };
  // Linked provider credentials use the primary Worker's encryption key.
  const linkedAccountRoute = /^\/api\/(auth|user)(\/|$)/.test(path)
    || path === '/api/account/cloudflare-session';
  if (linkedAccountRoute) pool = pool.filter(origin => origin !== secondaryOrigin);
  else {
    const preferred = request.headers.get('X-XeroxYT-Prefer-API');
    let ordered=orderApiPool(pool, secondaryOrigin, preferred);
    if(path===realtimeTicketPath){
      const unavailable=configuredPool[Number(request.headers.get('X-XeroxYT-Realtime-Avoid'))-1];
      if(unavailable&&ordered.length>1)ordered=[...ordered.filter(origin=>origin!==unavailable),unavailable];
    }
    pool = await apiSelector.plan(ordered, headers, headersFor);
  }
  if (!pool.length) return respond(Response.json({error:'利用できるAPIがありません。しばらくしてから再試行してください。',code:'API_UNAVAILABLE'}, {status:503,headers:{'Cache-Control':'no-store'}}), 'health_check_failed');
  const readonly = ["GET", "HEAD"].includes(request.method);
  const sharedAccountRead = Boolean(secondaryOrigin) && /^\/api\/account(?:\/|$)/.test(path);
  const canTryAnother = readonly && (!/^\/api\/(account|auth)(\/|$)/.test(path) || sharedAccountRead);
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
        headers: headersFor(pool[i]),
        body,
        redirect: "manual",
        signal: request.signal,
      }, Math.max(1, Math.min(12000, deadline - Date.now())));
      if (await workerQuotaExceeded(response)) {
        apiSelector.reportQuota(pool[i]);
        await response.body?.cancel();
        lastFailure = 'worker_daily_quota';
        console.warn(JSON.stringify({event:'api_worker_quota',operation:routeName,upstreamIndex}));
        continue;
      }
      // A route error or a per-user quota does not tell us whether this API is healthy.
      if (
        canRetry(request.method, path, response.status, sharedAccountRead) &&
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
      if (path === realtimeTicketPath) outgoing.set('X-XeroxYT-Realtime-Preferred', pool[i] === (request.headers.get('X-XeroxYT-Prefer-API') === '2' ? secondaryOrigin || configuredPool[0] : configuredPool[0]) ? '1' : '0');
      outgoing.delete("content-encoding");
      outgoing.delete("content-length");
      outgoing.set("Cache-Control", "private, no-store");
      if (path === realtimeTicketPath && response.ok) outgoing.set('X-XeroxYT-Realtime-Origin', pool[i]);
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
      if (!canTryAnother) break;
    }
  }
  return respond(Response.json(
    {
      error: lastFailure === 'worker_daily_quota' ? "APIの利用上限に達しました。利用できる接続先がありません。" : "登録されているAPIに接続できませんでした。",
      code: Date.now() >= deadline ? "API_TIMEOUT" : "API_UNAVAILABLE",
    },
    { status: Date.now() >= deadline ? 504 : 502, headers: {'Cache-Control':'no-store'} },
  ), lastFailure);
}
