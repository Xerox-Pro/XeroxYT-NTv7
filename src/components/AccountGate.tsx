import { useCallback, useEffect, useRef, useState, createContext, useContext, type ReactNode, type FormEvent } from 'react';
import {useLocation} from 'react-router-dom';
import {flushSync} from 'react-dom';
import VisualModes from './VisualModes';
import DirectMessages from './DirectMessages';
import MessageNotifications from './MessageNotifications';
import TermsGate,{RegistrationTerms} from './TermsAgreement';
import '../terms.css';

type Item = { videoId: string; timestamp?: number; [key: string]: unknown };
type User = { id: string; username: string; admin?: boolean; termsAccepted?: boolean };
type Cache = { history: Item[]; version: number; dirty: boolean };
type BanRecord = { userId?: string; username?: string; detectedAt: number };
export const AccountContext = createContext<{ username: string; isMaster?: boolean; logout: () => Promise<void> } | null>(null);
export const useSiteAccount = () => useContext(AccountContext);
const LEGACY_KEY = 'xerox_watch_history';
const SESSION_HINT_KEY = 'xerox_site_session_hint';
const BAN_LOCK_KEY = 'xerox_device_ban_v2';
const accountKey = (id: string) => `xerox_account_history_${id}`;
// Share only an in-app section and, for watch pages, a public video title.
// Never send full URLs, search queries, message text or other private page content.
function presencePage(path:string):{page:string;title:string}{
 const labels:Record<string,string>={
  '/':'ホーム','/watch':'動画','/shorts':'ショート','/results':'検索結果','/search':'検索',
  '/feed/subscriptions':'登録チャンネル','/feed/library':'ライブラリ','/feed/history':'履歴',
  '/settings':'設定','/announcements':'お知らせ','/messages':'メッセージ',
  '/debug/api':'API情報','/system/settings':'システム管理','/license':'ライセンス',
 };
 const section=path.startsWith('/shorts/')?'ショート':path.startsWith('/channel/')?'チャンネル':labels[path]||'その他';
 let title='';
 if(path==='/watch'){
  const current=document.title||'';
  const match=/^(.{1,120}?) - XeroxYT-NTv7(?: for GAS)?$/.exec(current);
  if(match&&match[1]!=='ショート'&&match[1]!=='XeroxYT-NTv7')title=match[1].replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120);
 }
 return {page:'YouTube / '+section,title};
}
// These values are device-local; keep them separate when accounts share a browser.
const deviceKeys = ['xerox_youtube_linked', 'xerox_short_history', 'xerox_youtube_credentials', 'xerox_user_info', 'xerox_subscriptions', 'xerox_user_playlists', 'xerox_ai_interests', 'xerox_video_cache'];
function switchDeviceAccount(id: string) {
  const previous = localStorage.getItem('xerox_last_account_id');
  if (previous === id) return;
  for (const key of deviceKeys) {
    const old = localStorage.getItem(key);
    if (old !== null) localStorage.setItem(`xerox_device_${previous || 'legacy'}_${key}`, old);
    const next = localStorage.getItem(`xerox_device_${id}_${key}`);
    if (next === null) localStorage.removeItem(key); else localStorage.setItem(key, next);
  }
}

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
// A ban must stop existing media immediately, not merely prevent the next API request.
// In particular, an iframe can keep playing audio after its containing page is hidden.
function stopAllPlaybackNow(){
  try{
    const iosVideo=document.querySelector('video') as (HTMLVideoElement & {webkitExitFullscreen?:()=>void;webkitSetPresentationMode?:(mode:'inline')=>void})|null;
    try{iosVideo?.webkitExitFullscreen?.();iosVideo?.webkitSetPresentationMode?.('inline');}catch{}
    for(const media of document.querySelectorAll<HTMLMediaElement>('video,audio')){
      try{
        media.pause();
        media.muted=true;
        if('srcObject' in media)media.srcObject=null;
        media.removeAttribute('src');
        media.querySelectorAll('source').forEach(source=>source.removeAttribute('src'));
        media.load();
      }catch{}
    }
    for(const frame of document.querySelectorAll<HTMLIFrameElement>('iframe')){
      try{frame.src='about:blank';}catch{}
    }
    if(document.pictureInPictureElement)void document.exitPictureInPicture().catch(()=>{});
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
  }catch{}
}

const merge = (...lists: Item[][]): Item[] => {
  const seen = new Map<string, Item>();
  lists.flat().forEach(item => {
    if (!item || typeof item.videoId !== 'string') return;
    const previous = seen.get(`${item.type || 'video'}:${item.videoId}`);
    if (!previous || Number(item.timestamp || 0) > Number(previous.timestamp || 0)) seen.set(`${item.type || 'video'}:${item.videoId}`, item);
  });
  const sorted = [...seen.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return [...sorted.filter(item => item.type !== 'short').slice(0, 50), ...sorted.filter(item => item.type === 'short').slice(0, 50)];
};
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/account${path}`, { method, credentials: 'same-origin', cache: 'no-store', ...(path === '/session' ? { signal: AbortSignal.timeout(7000) } : {}), ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error=Object.assign(new Error(data.error || '通信に失敗しました。'), { status: response.status, code:data.code });
    if(data.code==='ACCOUNT_BANNED')window.dispatchEvent(new CustomEvent('xerox-account-banned'));
    throw error;
  }
  return data;
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const location=useLocation();
  const pagePath=useRef(location.pathname);pagePath.current=location.pathname;
  useEffect(()=>{window.dispatchEvent(new Event('xerox-presence-page-changed'));},[location.pathname]);
  const [timeoutUntil,setTimeoutUntil]=useState(0);
  useEffect(()=>{const listener=(event:Event)=>setTimeoutUntil(Number((event as CustomEvent).detail?.suspendedUntil)||Date.now()+600000);window.addEventListener('xerox-account-timeout',listener);const timer=setInterval(()=>setTimeoutUntil(value=>value&&value<=Date.now()?0:value),1000);return()=>{window.removeEventListener('xerox-account-timeout',listener);clearInterval(timer);};},[]);
  const [initialBan] = useState<BanRecord | null>(()=>read<BanRecord|null>(BAN_LOCK_KEY,null));
  const [cachedUser] = useState<User | null>(() => { const handoff=(window as any).__XEROX_ACCOUNT_HANDOFF__;if(handoff&&Date.now()-handoff.savedAt<30000&&handoff.user?.id&&handoff.user?.username)return handoff.user;const hint = read<User | null>(SESSION_HINT_KEY, null); return hint && typeof hint.id === 'string' && typeof hint.username === 'string' && localStorage.getItem('xerox_last_account_id') === hint.id ? hint : null; });
  const [user, setUser] = useState<User | null>(cachedUser);
  const [phase, setPhase] = useState<'checking' | 'login' | 'loading' | 'ready' | 'error' | 'banned'>(initialBan?'banned':cachedUser ? 'checking' : 'login');
  const [banRecord,setBanRecord]=useState<BanRecord|null>(initialBan);
  const banRef=useRef(banRecord);banRef.current=banRecord;
  const [register, setRegister] = useState(false);
  const [agreedVersion,setAgreedVersion]=useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [migrate, setMigrate] = useState(false);
  const [message, setMessage] = useState('');
  const cache = useRef<Cache>(cachedUser ? read<Cache>(accountKey(cachedUser.id), { history: [], version: 0, dirty: false }) : { history: [], version: 0, dirty: false });
  const active = useRef<User | null>(cachedUser);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);
  const serverAuthenticated=useRef(false);
  const authEpoch = useRef(0);
  const sync = useRef<() => Promise<void>>(async () => {});
  useEffect(()=>{const prepare=async()=>{if(cache.current.dirty){await sync.current();if(cache.current.dirty)return false;}const current=active.current;if(current)(window as any).__XEROX_ACCOUNT_HANDOFF__={user:current,savedAt:Date.now()};return true;};(window as any).__XEROX_GAS_BEFORE_UPDATE__=prepare;return()=>{if((window as any).__XEROX_GAS_BEFORE_UPDATE__===prepare)delete (window as any).__XEROX_GAS_BEFORE_UPDATE__;};},[]);
  const lockBanned=useCallback(()=>{
    // Stop sound and blank embedded players synchronously, before React replaces the UI.
    stopAllPlaybackNow();
    authEpoch.current++; // Ignore any in-flight session/history response that predates this BAN.
    const current=active.current||cachedUser;
    const record={...(current?.id?{userId:current.id}:{}),...(current?.username?{username:current.username}:{}),detectedAt:Date.now()};
    localStorage.setItem(BAN_LOCK_KEY,JSON.stringify(record));
    serverAuthenticated.current=false;
    flushSync(()=>{setBanRecord(record);setPhase('banned');});
  },[cachedUser]);

  useEffect(()=>{
    const banned=()=>lockBanned();
    const storage=(event:StorageEvent)=>{
      if(event.key!==BAN_LOCK_KEY||!event.newValue)return;
      try{
        const record=JSON.parse(event.newValue) as BanRecord;
        if(record.userId&&record.userId===active.current?.id)lockBanned();
      }catch{}
    };
    window.addEventListener('xerox-account-banned',banned);
    window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('xerox-account-banned',banned);window.removeEventListener('storage',storage);};
  },[lockBanned]);

  const persist = (u: User) => localStorage.setItem(accountKey(u.id), JSON.stringify({...cache.current, savedAt: new Date().toISOString()}));
  const initialize = useCallback(async (u: User, importLegacy = false, background = false) => {
    if (!background) setPhase('loading'); setMessage('');
    const epoch = authEpoch.current;
    try {
      const remote = await api('/history');
      u = { ...u, termsAccepted: true };
      if (epoch !== authEpoch.current) return;
      const saved = active.current?.id === u.id ? cache.current : read<Cache | null>(accountKey(u.id), null);
      let history: Item[] = Array.isArray(remote.history) ? remote.history : [];
      let dirty = false;
      if (saved?.dirty) { history = saved.version === remote.version ? saved.history : merge(saved.history, history); dirty = true; }
      const legacy = read<Item[]>(LEGACY_KEY, []);
      if (!localStorage.getItem('xerox_last_account_id') && !localStorage.getItem('xerox_legacy_history_backup')) {
        localStorage.setItem('xerox_legacy_history_backup', JSON.stringify(legacy));
      }
      if (importLegacy) {
        history = merge(history, Array.isArray(legacy) ? legacy : []); dirty = true;
      }
      switchDeviceAccount(u.id);
      cache.current = { history, version: remote.version, dirty };
      localStorage.setItem(LEGACY_KEY, JSON.stringify(history.filter(item => item.type !== 'short')));
      localStorage.setItem('xerox_short_history', JSON.stringify(history.filter(item => item.type === 'short')));
      localStorage.setItem('xerox_last_account_id', u.id);
      localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(u));
      active.current = u; persist(u); setUser(u); setPhase('ready');
      if (background) window.dispatchEvent(new CustomEvent('xerox-history-remote', { detail: history }));
      if (dirty) setTimeout(() => void sync.current(), 0);
    } catch (err: any) {
      if(epoch!==authEpoch.current)return; // BAN or logout occurred while loading.
      if(err.code==='TERMS_REQUIRED'){if(active.current?.id!==u.id)cache.current=read<Cache>(accountKey(u.id),{history:[],version:0,dirty:false});const pending={...u,termsAccepted:false};active.current=pending;localStorage.setItem(SESSION_HINT_KEY,JSON.stringify(pending));setUser(pending);setPhase('ready');return;}
      if (err.status === 401 && background) { serverAuthenticated.current=false;setMessage('サーバーの認証を確認できません。端末内のデータを保持して表示しています。'); }
      else if (err.status === 401) { setMessage('認証を確認できませんでした。もう一度ログインしてください。');setPhase('login'); }
      else if (background) { setMessage('クラウドの履歴を確認できません。端末内の履歴を表示しています。'); }
      else { setUser(u); setMessage(err instanceof Error ? err.message : '履歴を読み込めませんでした。'); setPhase('error'); }
    }
  }, []);

  sync.current = async () => {
    const u = active.current;
    if (!u || !serverAuthenticated.current || sending.current || !cache.current.dirty) return;
    sending.current = true;
    const snapshot = cache.current;
    const epoch = authEpoch.current;
    const isCurrent = () => authEpoch.current === epoch && active.current?.id === u.id;
    try {
      const result = await api('/history', 'PUT', { history: snapshot.history, version: snapshot.version });
      if (!isCurrent()) return;
      cache.current = { ...cache.current, version: result.version, dirty: cache.current.history !== snapshot.history };
      persist(u); setMessage('');
    } catch (err: any) {
      if (!isCurrent()) return;
      if(err.status===401)serverAuthenticated.current=false;
      if (err.status === 409) {
        try {
          const remote = await api('/history');
          if (!isCurrent()) return;
          cache.current = { history: merge(cache.current.history, remote.history), version: remote.version, dirty: true };
          localStorage.setItem(LEGACY_KEY, JSON.stringify(cache.current.history)); persist(u);
          window.dispatchEvent(new CustomEvent('xerox-history-remote', { detail: cache.current.history }));
          setMessage('他の端末の履歴と統合しました。更新すると表示に反映されます。');
        } catch { if (isCurrent()) setMessage('履歴は端末に保存されています。同期を再試行します。'); }
      } else setMessage('履歴は端末に保存されています。同期を再試行します。');
    } finally {
      sending.current = false;
      if (cache.current.dirty && active.current && serverAuthenticated.current) timer.current = setTimeout(() => void sync.current(), 5000);
    }
  };

  useEffect(() => {
    if(cachedUser)active.current=cachedUser;
    let cancelled=false,busy=false,lastCheck=0;
    const verify=async(force=false)=>{
      if(cancelled||busy||Date.now()-lastCheck<(force?5000:60000))return;
      busy=true;lastCheck=Date.now();const epoch=authEpoch.current;
      try{
        const {user:existing}=await api('/session');
        if(cancelled||authEpoch.current!==epoch)return;
        if(!existing?.id)throw new Error('Invalid session response');
        if(banRef.current){localStorage.removeItem(BAN_LOCK_KEY);setBanRecord(null);}
        const wasAuthenticated=serverAuthenticated.current;
        serverAuthenticated.current=true;
        await initialize(existing,false,wasAuthenticated&&active.current?.id===existing.id);
      }catch(err:any){
        if(cancelled||authEpoch.current!==epoch)return;
        if(err.code==='ACCOUNT_BANNED'){lockBanned();return;}
        if(err.status===401){
          serverAuthenticated.current=false;
          stopAllPlaybackNow();
          setPhase('login');
          setMessage(banRef.current?'解除状況の確認には、同じアカウントで本人確認してください。':'ログインが必要です。アカウントにログインしてください。');
          return;
        }
        // A temporary network failure must not log out a previously verified session.
        if(serverAuthenticated.current){
          setMessage('通信が不安定です。ログイン情報を保持したまま再確認します。');
        }else{
          setMessage('サーバーのログイン状態を確認できません。通信環境を確認してください。');
          setPhase('error');
        }
      }finally{busy=false;}
    };
    const resume=()=>{if(!document.hidden)void verify();};
    // Refresh newly granted/revoked roles when returning to the app, without increasing background polling.
    const resumeNow=()=>{if(!document.hidden)void verify(true);};
    const checkBanNow=()=>{lastCheck=0;void verify(true);};
    void verify(true);
    const interval=setInterval(resume,30000);
    window.addEventListener('online',resumeNow);window.addEventListener('focus',resumeNow);window.addEventListener('xerox-ban-check',checkBanNow);document.addEventListener('visibilitychange',resumeNow);
    return ()=>{cancelled=true;active.current=null;clearInterval(interval);window.removeEventListener('online',resumeNow);window.removeEventListener('focus',resumeNow);window.removeEventListener('xerox-ban-check',checkBanNow);document.removeEventListener('visibilitychange',resumeNow);if(timer.current)clearTimeout(timer.current);};
  },[initialize,cachedUser,lockBanned]);

  // Check playback sessions between the normal session and presence updates.
  useEffect(()=>{
    if(phase!=='ready'||!user?.id)return;
    let stopped=false,inFlight=false;
    const hasPlayer=()=>!!document.querySelector('video,audio,iframe[allow*="autoplay"],iframe[allow*="picture-in-picture"]');
    const check=async()=>{
      // Keep checking a playing iframe even when the tab is backgrounded (e.g. picture-in-picture).
      if(stopped||inFlight||!hasPlayer())return;
      inFlight=true;
      try{
        const response=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(7000)});
        if(!stopped&&response.status===403){
          const data=await response.json().catch(()=>({}));
          if(data.code==='ACCOUNT_BANNED')window.dispatchEvent(new Event('xerox-account-banned'));
        }
      }catch{}finally{inFlight=false;}
    };
    void check();
    const interval=setInterval(check,5000);
    const resume=()=>void check();
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('online',resume);
    return()=>{stopped=true;clearInterval(interval);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);};
  },[phase,user?.id]);

  // Each foreground tab reports its current in-site section. The video title is
  // sent only for a watch page; search terms, DMs and external URLs stay private.
  useEffect(() => {
    if(phase!=='ready'||!user?.id)return;
    const tabId=crypto.randomUUID().replace(/-/g,'');
    let stopped=false,scheduled:ReturnType<typeof setTimeout>|undefined;
    let lastSent='';
    const send=(visible:boolean,force=false)=>{
      if(stopped&&visible)return;
      const page=visible?presencePage(pagePath.current):{page:'',title:''};
      const payload={tabId,visible,...page};
      const serialized=JSON.stringify(payload);
      if(visible&&!force&&serialized===lastSent)return;
      if(visible)lastSent=serialized;
      void fetch('/api/account/presence',{
        method:'POST',credentials:'same-origin',cache:'no-store',keepalive:!visible,
        headers:{'Content-Type':'application/json'},
        body:serialized,
      }).then(async response=>{
        if(!stopped&&response.status===403){
          const data=await response.json().catch(()=>({}));
          if(data.code==='ACCOUNT_BANNED')window.dispatchEvent(new Event('xerox-account-banned'));
        }
      }).catch(()=>{});
    };
    const schedule=()=>{
      if(document.hidden)return;
      if(scheduled)clearTimeout(scheduled);
      scheduled=setTimeout(()=>send(true),300);
    };
    const onVisibility=()=>send(!document.hidden,true);
    const onPageHide=()=>send(false,true);
    const titleNode=document.querySelector('title');
    const observer=titleNode?new MutationObserver(schedule):null;
    if(titleNode)observer?.observe(titleNode,{childList:true,characterData:true,subtree:true});
    if(!document.hidden)send(true,true);
    const interval=setInterval(()=>{if(!document.hidden)send(true,true);},30000);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',onPageHide);
    window.addEventListener('xerox-presence-page-changed',schedule);
    return()=>{
      stopped=true;clearInterval(interval);if(scheduled)clearTimeout(scheduled);observer?.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('pagehide',onPageHide);
      window.removeEventListener('xerox-presence-page-changed',schedule);
      send(false,true);
    };
  },[phase,user?.id]);

  useEffect(() => {
    const changed = (event: Event) => {
      const u = active.current;
      if (!u) return;
      const history = (event as CustomEvent<Item[]>).detail;
      if (!Array.isArray(history)) return;
      if (JSON.stringify(history) === JSON.stringify(cache.current.history)) return;
      cache.current = { ...cache.current, history, dirty: true }; persist(u);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void sync.current(), 800);
    };
    window.addEventListener('xerox-history-change', changed);
    return () => window.removeEventListener('xerox-history-change', changed);
  }, []);

  if(timeoutUntil>Date.now()&&phase!=='banned')return <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-5"><section role="alert" className="max-w-md rounded-3xl border border-amber-700 bg-gray-900 p-8 text-center"><h1 className="text-2xl font-bold">警告：一時的に利用を停止しています</h1><p className="mt-4 text-sm">過剰なリクエストを検出しました。{new Date(timeoutUntil).toLocaleTimeString('ja-JP')}までお待ちください。解除後に再発するとBANされます。</p></section></main>;
  async function submit(e: FormEvent) {
    e.preventDefault(); setMessage('');
    if (register && password !== confirm) { setMessage('パスワードが一致しません。'); return; }
    if(register&&!agreedVersion){setMessage('利用規約を確認し、同意してください。');return;}
    try {
      authEpoch.current++;
      setPhase('loading');
      sessionStorage.removeItem('xerox_guest');
      const result = await api(register ? '/register' : '/login', 'POST', { username, password, ...(register?{termsAccepted:true,termsVersion:agreedVersion}:{}) });
      // Successful authentication is authoritative after a BAN is lifted. Clear the persistent device lock.
      localStorage.removeItem(BAN_LOCK_KEY);banRef.current=null;setBanRecord(null);
      serverAuthenticated.current=true;setPassword(''); setConfirm(''); await initialize(result.user, migrate);
    } catch (err:any) { if(err?.code==='ACCOUNT_BANNED'){lockBanned();return;}setMessage(err instanceof Error ? err.message : 'ログインに失敗しました。'); setPhase('login'); }
  }
  async function logout(skipSync=false) {
    if (!skipSync&&cache.current.dirty) { await sync.current(); if (cache.current.dirty) { setMessage('履歴の同期が完了していません。端末内には保存されています。'); return; } }
    try { authEpoch.current++; await api('/logout', 'POST', {});serverAuthenticated.current=false; active.current = null; localStorage.removeItem(SESSION_HINT_KEY); setUser(null); setPhase('login'); setMessage(''); }
    catch { setMessage('ログアウトできませんでした。'); }
  }
  if (phase === 'checking') return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-5"><p role="status" className="text-sm text-gray-600">ログイン状態を確認しています…</p></main>;
  if (phase === 'ready' && user && serverAuthenticated.current) return <AccountContext.Provider value={{ username: user.username, ...(user.admin?{isMaster:true}:{}), logout }}><TermsGate key={user.id} alreadyAccepted={user.termsAccepted===true} onAccepted={()=>{if(active.current)void initialize(active.current,false,true);}} onLogout={()=>void logout(true)}><VisualModes/><MessageNotifications/>{children}{message && <div role="status" className="fixed top-16 right-4 z-[200] bg-gray-900 text-white text-xs p-3 rounded-xl max-w-xs shadow-lg">{message}{!serverAuthenticated.current&&<button type="button" className="block mt-2 underline" onClick={()=>{setPassword('');setConfirm('');setPhase('login');setMessage('端末内のデータを保持したまま再接続します。');}}>再ログインして同期を再開</button>}</div>}</TermsGate></AccountContext.Provider>;

  if(phase==='banned')return <TermsGate onAccepted={()=>{}} onLogout={()=>void logout(true)}><DirectMessages appealOnly/><main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-5"><section className="w-full max-w-md rounded-3xl border border-red-900 bg-gray-900 p-8 text-center shadow-2xl" role="alert"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950 text-3xl" aria-hidden="true">!</div><h1 className="mt-5 text-2xl font-bold">このアカウントはBANされています</h1><p className="mt-3 text-sm leading-6 text-gray-300">この端末では、新しいアカウントの作成、ログアウト、アカウント切り替えなどの操作はできません。</p>{banRecord?.username&&<p className="mt-4 text-xs text-gray-500">対象アカウント: @{banRecord.username}</p>}<p className="mt-5 text-xs text-gray-500">BAN解除後は下のボタンで状態を再確認できます。認証が期限切れの場合は再ログインが必要です。</p><button type="button" className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900" onClick={()=>window.dispatchEvent(new Event('xerox-ban-check'))}>BAN解除状況を確認</button></section></main></TermsGate>;

  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-5"><section className="w-full max-w-md bg-white rounded-3xl shadow-lg border border-gray-100 p-7 sm:p-9"><h1 className="text-2xl font-bold text-gray-900">XeroxYT-NTv7</h1><p className="text-sm text-gray-500 mt-2">アカウントにログインして、視聴履歴を端末とクラウドに保存します。</p>{phase === 'error' ? <><p className="mt-6 text-red-700" role="alert">{message}</p><button className="mt-4 rounded-xl bg-gray-900 text-white px-4 py-2" onClick={() => window.dispatchEvent(new Event('xerox-ban-check'))}>再試行</button></> : null}<form onSubmit={submit} className="mt-7 space-y-4"><h2 className="text-lg font-semibold">{register ? '新規アカウント作成' : 'ログイン'}</h2><label className="block text-sm">ユーザー名<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="英数字と _" /></label><label className="block text-sm">パスワード<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={12} maxLength={128} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" placeholder="12文字以上" /></label>{register && <label className="block text-sm">パスワード（確認）<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5" /></label>}{!localStorage.getItem('xerox_last_account_id') && <label className="flex items-start gap-2 text-sm text-gray-600"><input type="checkbox" checked={migrate} onChange={e => setMigrate(e.target.checked)} className="mt-1" />この端末にある以前の視聴履歴を取り込む</label>}{register&&<RegistrationTerms onChange={setAgreedVersion}/>} {message && <p className="text-sm text-red-700" role="alert">{message}</p>}<button disabled={phase === 'loading'||(register&&!agreedVersion)} className="w-full bg-gray-900 disabled:opacity-60 text-white rounded-xl py-3 font-semibold">{phase === 'loading' ? '処理中…' : register ? 'アカウントを作成' : 'ログイン'}</button><button type="button" onClick={() => { setRegister(!register);setAgreedVersion('');setMessage(''); }} className="w-full text-sm text-blue-700 py-2">{register ? 'すでにアカウントを持っている' : '新規アカウントを作成'}</button>{register && <p className="text-xs text-gray-500">パスワード再設定機能はまだありません。忘れないよう安全に保管してください。</p>}</form></section></main>;
}
