import {createStore, delMany, get, keys, set} from 'idb-keyval';
import {useEffect, useRef, useState} from 'react';

export type Person = {
  id: string; handle: string; name: string; avatar: string; verified: boolean; private: boolean;
};
export type Asset = {image: string; video: string};
export type Post = {
  id: string; code: string; user: Person; caption: string; time: string;
  likes: number; comments: number; liked: boolean | null; saved: boolean | null; assets: Asset[];
};
export type Story = Asset & {id: string; user: Person; time: string};
export type Profile = Person & {
  bio: string; posts: number; followers: number; following: number;
  relationship: {following: boolean; pending: boolean} | null;
};
export type Thread = {id: string; title: string; users: Person[]; time: string; muted: boolean};
export type Message = {
  id: string; sender: string; own: boolean; time: string; kind: string; unsent: boolean;
  text: string; image: string; video: string; media: string;
};
export type Note = {id: string; text: string; user: Person};
export type Page<T> = {items: T[]; next: string};
export type Session = {user: Person; cacheKey: string};
type Params = Record<string, string | boolean>;

const errors: Record<string, string> = {
  two_factor: 'Instagram の認証コードを入力してください。',
  verify_expired: '認証の有効期限が切れました。もう一度ログインしてください。',
  signed_out: 'セッションが切れました。もう一度ログインしてください。',
  login_failed: 'ログインできませんでした。アカウント名とパスワードを確認してください。',
  challenge: 'Instagram が追加確認を求めています。公式アプリで確認を完了してから再試行してください。',
  provider_rate_limit: 'Instagram がリクエストを一時的に制限しています。時間をおいて再試行してください。',
  provider_timeout: 'Instagram の応答がタイムアウトしました。',
  provider_rejected: 'Instagram がこの操作を完了できませんでした。',
  provider_error: 'Instagram のデータを取得できませんでした。',
  not_found: 'Instagram でこのデータを開けませんでした。',
  invalid_request: '入力内容を確認してください。',
  configuration: 'Xerogram のサーバー設定が完了していません。',
};

export class XerogramError extends Error {
  constructor(public code: string) {
    super(errors[code] || 'Xerogram に接続できませんでした。');
  }
}

export const refreshSessionEvent = 'xerogram-session-ended';

export async function request<T>(action: string, params: Params = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/xerogram', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: {'Content-Type': 'application/json', 'X-Xerogram': '1'},
      body: JSON.stringify({action, ...params}),
      signal: AbortSignal.timeout(48_000),
    });
  } catch {
    throw new XerogramError('network');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    if (data?.error === 'signed_out') window.dispatchEvent(new Event(refreshSessionEvent));
    throw new XerogramError(data?.error || 'connection');
  }
  return data;
}

let store: ReturnType<typeof createStore> | undefined;
const database = () => store ??= createStore('xerogram-private-v1', 'responses');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
type RecordValue = {iv: Uint8Array<ArrayBuffer>; bytes: ArrayBuffer};

export class Vault {
  readonly memory = new Map<string, unknown>();
  readonly pending = new Map<string, Promise<unknown>>();
  readonly key: Promise<CryptoKey>;
  private readonly namespace: string;

  constructor(readonly session: Session) {
    this.namespace = session.user.id + ':';
    const bytes = Uint8Array.from(atob(session.cacheKey), char => char.charCodeAt(0));
    this.key = crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  private async storageKey(key: string) {
    // Keep search terms, thread identifiers and resource names out of plaintext IndexedDB keys.
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(this.session.cacheKey + ':' + key));
    return this.namespace + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async read<T>(key: string): Promise<T | undefined> {
    if (this.memory.has(key)) return this.memory.get(key) as T;
    try {
      const storageKey = await this.storageKey(key);
      const stored = await get<RecordValue>(storageKey, database());
      if (!stored) return undefined;
      const aad = encoder.encode(storageKey);
      const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: stored.iv, additionalData: aad}, await this.key, stored.bytes);
      const result: T = JSON.parse(decoder.decode(plain));
      if (this.memory.has(key)) return this.memory.get(key) as T;
      this.memory.set(key, result);
      return result;
    } catch {
      return undefined;
    }
  }

  async write<T>(key: string, data: T, persistent = true) {
    this.memory.set(key, data);
    if (!persistent) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const storageKey = await this.storageKey(key);
      const aad = encoder.encode(storageKey);
      const bytes = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, await this.key, encoder.encode(JSON.stringify(data)));
      if (this.memory.get(key) === data) await set(storageKey, {iv, bytes}, database());
    } catch {
      // Private mode or a device storage limit still allows in-memory use.
    }
  }

  async clear() {
    this.memory.clear();
    const ids = await keys(database());
    await delMany(ids.filter(id => typeof id === 'string' && id.startsWith(this.namespace)), database());
  }

  async get<T>(action: string, params: Params, key: string, refresh: boolean, persistent: boolean): Promise<T> {
    if (!refresh) {
      const stored = await this.read<T>(key);
      if (stored !== undefined) return stored;
    }
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const task = request<T>(action, params).then(async value => {
      await this.write(key, value, persistent);
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }
}

function useResource<T>(vault: Vault, action: string, params: Params, options: {enabled?: boolean; persistent?: boolean} = {}) {
  const {enabled = true, persistent = true} = options;
  const encoded = JSON.stringify(params);
  const key = action + encoded;
  const [state, setState] = useState<{key: string; data?: T; pending: boolean; error: string}>({
    key, pending: enabled, error: '',
  });
  const [retry, setRetry] = useState<{key: string; count: number}>({key: '', count: 0});
  const force = retry.key === key ? retry.count : 0;
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState(previous => ({key, data: previous.key === key ? previous.data : undefined, pending: true, error: ''}));
    const refresh = force > lastRefresh.current;
    if (refresh) lastRefresh.current = force;
    void vault.get<T>(action, JSON.parse(encoded), key, refresh, persistent).then(
      data => { if (active) setState({key, data, pending: false, error: ''}); },
      error => { if (active) setState(previous => ({...previous, pending: false, error: error.message})); },
    );
    return () => { active = false; };
  }, [vault, action, encoded, key, force, enabled, persistent]);

  const visible = state.key === key ? state : {key, pending: enabled, error: '', data: undefined};
  return {...visible, retry: () => setRetry(previous => ({key, count: previous.count + 1}))};
}

export {useResource};

export function usePages<T extends {id: string}>(vault: Vault, action: string, params: Params = {}, options: {persistent?: boolean} = {}) {
  const identity = action + JSON.stringify(params);
  const resource = useResource<Page<T>>(vault, action, params, options);
  const [extra, setExtra] = useState<{identity: string; items: T[]; next?: string}>({identity: '', items: []});
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const visible = extra.identity === identity ? extra : {items: [] as T[], next: undefined};
  const next = visible.next ?? resource.data?.next;
  const rows = [...(resource.data?.items ?? []), ...visible.items];
  const items = Array.from(new Map(rows.map(item => [item.id, item])).values());

  async function more() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setPageError('');
    const nextParams = {...params, cursor: next};
    try {
      const page = await vault.get<Page<T>>(action, nextParams, action + JSON.stringify(nextParams), false, options.persistent !== false);
      setExtra(previous => ({
        identity, items: [...(previous.identity === identity ? previous.items : []), ...page.items],
        next: page.next === next ? '' : page.next,
      }));
    } catch (error) {
      setPageError((error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function retry() {
    setExtra({identity, items: []});
    setPageError('');
    resource.retry();
  }

  return {...resource, items, next, more, loadingMore, pageError, retry};
}
