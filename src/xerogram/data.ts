import { createStore, delMany, get, keys, set } from 'idb-keyval';

export type Person = { id: string; username: string; name?: string; avatar?: string; bio?: string; followers?: number; following?: number; follows?: boolean };
export type Account = { slot: string; user: Person; cache: string };
export type Asset = { image?: string; video?: string };
export type Post = Asset & { id: string; pk: string; user?: Person; caption?: string; liked?: boolean; saved?: boolean; likes?: number; items?: Asset[]; expires?: string };
export type Message = Asset & { id: string; user: string; text?: string; type?: string; revision?: string; date: string; reply?: string; shared?: Post; reactions?: unknown[] };
export type Thread = { id: string; title: string; group?: boolean; unread?: boolean; preview?: string; person?: Person };
export type TextRow = { id: string; text: string; user?: Person };
export type Page = { items: unknown[]; cursor: string; title?: string; user?: Person; users?: Person[]; seen?: Record<string, string>; order?: string[] };
export type Args = Record<string, unknown>;

const errors: Record<string, string> = {
  SITE_LOGIN: 'XeroxYTにログインしてください。',
  SITE_UNAVAILABLE: 'XeroxYTの認証サーバーに接続できません。',
  UNCONFIGURED: 'この環境ではXerogramのAPIが設定されていません。',
  ORIGIN: 'このページからAPIに接続できません。',
  TWO_FACTOR: 'Instagramの二段階認証コードを入力してください。',
  VERIFY_EXPIRED: '認証の有効期限が切れました。ログインからやり直してください。',
  VERIFY_REJECTED: '認証コードを確認できませんでした。最新のコードを入力してください。',
  LOGIN_FAILED: 'Instagramへのログインに失敗しました。入力内容を確認してください。',
  IG_SESSION: 'Instagramのセッションが切れました。アカウントを接続し直してください。',
  ACCOUNT_LIMIT: 'この端末で接続できるのは3アカウントまでです。',
  CHALLENGE: 'Instagram公式アプリで本人確認を完了してから接続し直してください。',
  RATE_LIMIT: 'アクセスが集中しています。時間をおいてから操作してください。',
  NOT_FOUND: '投稿またはメッセージが見つかりません。',
  INPUT: '入力内容を確認してください。',
  SESSION_SIZE: 'このアカウントのセッションを端末に保存できませんでした。',
  REPLY_UNAVAILABLE: '返信先のメッセージを取得できませんでした。',
  IG_LOGIN_UPSTREAM: 'Instagramの認証APIに接続できませんでした。少し時間をおいてからお試しください。',
  INTERNAL: 'Xerogramのサーバーでエラーが発生しました。',
  UPSTREAM: 'Instagramとの通信に失敗しました。時間をおいてお試しください。',
};

export class XerogramError extends Error {
  constructor(public code: string, public passwordRequired = true) { super(errors[code] || 'サーバーに接続できませんでした。'); }
}

const pending = new Map<string, Promise<unknown>>();
let active = 0;
let blockedUntil = 0;
const queue: (() => void)[] = [];

export function request<T>(op: string, args: Args = {}, dedupe = false): Promise<T> {
  const body = JSON.stringify({ op, ...args });
  if (dedupe && pending.has(body)) return pending.get(body) as Promise<T>;
  const run = new Promise<void>(resolve => {
    if (active < 2) { active++; resolve(); }
    else queue.push(resolve);
  }).then(async () => {
    if (Date.now() < blockedUntil) throw new XerogramError('RATE_LIMIT');
    if (!navigator.onLine) throw new Error('オフラインです。保存済みのデータを表示できます。');
    const response = await fetch('/api/xerogram', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(45000),
    });
    if (response.status === 429) {
      blockedUntil = Date.now() + 1000 * (Number(response.headers.get('Retry-After')) || 60);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new XerogramError(data?.error || 'UPSTREAM', data?.passwordRequired !== false);
    return data as T;
  }).finally(() => {
    const next = queue.shift();
    if (next) next();
    else active--;
    if (dedupe) pending.delete(body);
  });
  if (dedupe) pending.set(body, run);
  return run;
}

const store = createStore('xerogram-local-v1', 'cache');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const accountKeys = new WeakMap<Account, Promise<{ prefix: string; key: CryptoKey }>>();

function accountKey(account: Account) {
  let entry = accountKeys.get(account);
  if (!entry) {
    const raw = Uint8Array.from(atob(account.cache.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
    entry = Promise.all([crypto.subtle.digest('SHA-256', raw), crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])])
      .then(([hash, key]) => ({ prefix: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''), key }));
    accountKeys.set(account, entry);
  }
  return entry;
}

async function pageKey(op: string, args: Args) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([op, args])));
  return '|' + Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

export async function readCache(account: Account, op: string, args: Args): Promise<Page | null> {
  try {
    const { prefix, key } = await accountKey(account);
    const name = prefix + await pageKey(op, args);
    const entry = await get<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }>(name, store);
    if (!entry) return null;
    return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: entry.iv, additionalData: encoder.encode(name) }, key, entry.data)));
  } catch { return null; }
}

export async function writeCache(account: Account, op: string, args: Args, page: Page) {
  try {
    const { prefix, key } = await accountKey(account);
    const name = prefix + await pageKey(op, args);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(name) }, key, encoder.encode(JSON.stringify(page)));
    await set(name, { iv, data }, store);
  } catch { /* The current view remains usable when quota or storage is unavailable. */ }
}

export async function clearCache(account: Account) {
  const { prefix } = await accountKey(account);
  const accountEntries = (await keys(store)).filter(key => String(key).startsWith(prefix));
  await delMany(accountEntries, store);
}

export function mergePage(previous: Page | null, incoming: Page, older: boolean): Page {
  if (!older || !previous) return incoming;
  const indexed = new Map(previous.items.map(item => [(item as { id: string }).id, item]));
  for (const item of incoming.items) {
    const id = (item as { id: string }).id;
    if (!indexed.has(id)) indexed.set(id, item);
  }
  return { ...incoming, items: [...indexed.values()] };
}

export function reconcileThread(previous: Page | null, incoming: Page): Page {
  const latest = incoming.items as Message[];
  if (!previous || !incoming.cursor || !latest.length) return incoming;
  const boundary = latest.at(-1)!;
  const prior = previous.items as Message[];
  const index = prior.findIndex(item => item.id === boundary.id);
  const older = index >= 0 ? prior.slice(index + 1) : prior.filter(item => Date.parse(item.date) < Date.parse(boundary.date));
  const current = new Set(latest.map(item => item.id));
  return { ...incoming, items: [...latest, ...older.filter(item => !current.has(item.id))] };
}

export function restoreThreadDelta(previous: Page | null, incoming: Page): Page {
  if (!incoming.order) return incoming;
  const old = new Map((previous?.items as Message[] || []).map(item => [item.id, item]));
  const updated = new Map((incoming.items as Message[]).map(item => [item.id, item]));
  return { ...incoming, items: incoming.order.map(id => updated.get(id) || old.get(id)).filter(Boolean) };
}
