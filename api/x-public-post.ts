export const config = {maxDuration: 15};

const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const postHosts = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const entities: Record<string, string> = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '};

function canonicalPost(input: string) {
 if (input.length > 2048) return null;
 try {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !postHosts.has(url.hostname)) return null;
  const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/.exec(url.pathname);
  return match ? 'https://x.com/' + match[1] + '/status/' + match[2] : null;
 } catch {
  return null;
 }
}

function extractText(html: string) {
 const paragraph = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i.exec(html)?.[1];
 return (paragraph ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
   if (code[0] !== '#') return entities[code] ?? entity;
   const hex = code[1]?.toLowerCase() === 'x';
   const value = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
   return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  }).trim().slice(0, 5000);
}

async function lookup(request: Request) {
 if (request.method !== 'GET') return Response.json({error: 'GETのみ対応しています。'}, {status: 405, headers: {...headers, Allow: 'GET'}});
 const url = canonicalPost(new URL(request.url).searchParams.get('url') ?? '');
 if (!url) return Response.json({error: 'Xの公開投稿のURLを入力してください。'}, {status: 400, headers});
 const endpoint = new URL('https://publish.twitter.com/oembed');
 endpoint.search = new URLSearchParams({url, omit_script: 'true', hide_thread: 'true'}).toString();
 try {
  const response = await fetch(endpoint, {redirect: 'error', signal: AbortSignal.timeout(8500)});
  if (!response.ok) {
   const status = [403, 404, 429].includes(response.status) ? response.status : 502;
   return Response.json({error: status === 429 ? 'Xが取得回数を制限しています。' : 'この投稿の公開データを取得できませんでした。'}, {status, headers});
  }
  const data = await response.json();
  if (typeof data.html !== 'string' || data.html.length > 100000 || typeof data.author_name !== 'string') throw new Error('Invalid response');
  return Response.json({url, author: data.author_name.slice(0, 200), text: extractText(data.html)}, {headers});
 } catch {
  return Response.json({error: 'Xの公開投稿APIに接続できませんでした。'}, {status: 502, headers});
 }
}

export default async function handler(req: {method?: string; url?: string}, res: {
 status: (code: number) => unknown;
 setHeader: (name: string, value: string) => unknown;
 end: (body: string) => unknown;
}) {
 const url = new URL(req.url ?? '/', 'https://xeroxapp044.vercel.app');
 const response = await lookup(new Request(url, {method: req.method ?? 'GET'}));
 res.status(response.status);
 for (const [key, value] of response.headers) res.setHeader(key, value);
 res.end(await response.text());
}
