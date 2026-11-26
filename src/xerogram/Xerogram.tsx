import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Camera, CircleUserRound, Clapperboard, Compass, House, Inbox, Moon, Settings, Sun} from 'lucide-react';
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom';
import AppPicker from '../components/AppPicker';
import {Deck, Explore, PostPage, ProfilePage, StoryViewer} from './Feed';
import {Conversation, InboxPage, NotesPage} from './Messages';
import {Vault, XerogramError, refreshSessionEvent, request, type Session} from './data';
import {Avatar, Feedback, PersonRow, paths, root} from './ui';
import './xerogram.css';

const nav = [
  {name: 'ホーム', to: paths.home, icon: House},
  {name: '発見', to: paths.explore, icon: Compass},
  {name: 'リール', to: paths.reels, icon: Clapperboard},
  {name: 'メッセージ', to: paths.messages, icon: Inbox},
  {name: 'プロフィール', to: paths.profile, icon: CircleUserRound},
];
const oneSession = () => request<Session | {user: null}>('session');
let sessionRequest: ReturnType<typeof oneSession> | undefined;
function sessionOnce() {
  if (!sessionRequest) sessionRequest = oneSession().finally(() => { sessionRequest = undefined; });
  return sessionRequest;
}

function Login({onLogin, connectionError, reconnect}: {onLogin: (session: Session) => void; connectionError: string; reconnect: () => void}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError('');
    try {
      const data = await request<Session>(verify ? 'verify' : 'login', {
        username: username.trim(), password, ...(verify ? {code: code.trim()} : {}),
      });
      setPassword('');
      onLogin(data);
      void navigator.storage?.persist?.().catch(() => {});
    } catch (error) {
      if (error instanceof XerogramError && error.code === 'two_factor') {
        setVerify(true);
        setCode('');
      } else {
        setError((error as Error).message);
        if (error instanceof XerogramError && error.code === 'verify_expired') {
          setVerify(false);
          setPassword('');
        }
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return <section className="xg-login">
    <div className="xg-login-mark"><Camera size={33}/></div>
    <h1>{verify ? '二段階認証' : 'Xerogram にログイン'}</h1>
    <p>{verify ? 'Instagram の認証コードを入力してください。' : 'Instagram アカウントで、フィードやリール、メッセージを開けます。'}</p>
    <form onSubmit={submit}>
      {verify ? <label>認証コード
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} value={code} onChange={e => setCode(e.target.value)} required disabled={pending}/>
      </label> : <>
        <label>ユーザーネーム・メール・電話番号
          <input autoComplete="username" maxLength={254} value={username} onChange={e => setUsername(e.target.value)} required disabled={pending}/>
        </label>
        <label>パスワード
          <input type="password" autoComplete="current-password" maxLength={512} value={password} onChange={e => setPassword(e.target.value)} required disabled={pending}/>
        </label>
      </>}
      <Feedback error={error || connectionError} retry={connectionError ? reconnect : undefined}/>
      <button className="xg-primary" type="submit" disabled={pending}>{pending ? '確認中…' : verify ? '認証する' : 'ログイン'}</button>
      {verify && <button className="xg-secondary" type="button" disabled={pending} onClick={() => { setVerify(false); setPassword(''); setCode(''); setError(''); }}>ログインに戻る</button>}
    </form>
    <p className="xg-login-foot">パスワードはログイン時にのみ使われます。再利用する閲覧データは、この端末で暗号化して保存します。</p>
  </section>;
}

function SettingsPage({vault, onLogout}: {vault: Vault; onLogout: () => void}) {
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function clear() {
    if (busy || !window.confirm('このアカウントの端末キャッシュを削除しますか？')) return;
    setBusy('clear');
    setError('');
    try {
      await vault.clear();
      setStatus('この端末に保存したデータを削除しました。');
    } catch {
      setError('端末のデータを削除できませんでした。');
    } finally {
      setBusy('');
    }
  }

  async function logout() {
    if (busy) return;
    setBusy('logout');
    setError('');
    try {
      await request('logout');
      onLogout();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy('');
    }
  }

  return <div className="xg-center">
    <div className="xg-page-heading"><h1>設定</h1></div>
    <section className="xg-card xg-settings">
      <PersonRow person={vault.session.user}/>
      <div><h2>端末の保存データ</h2><p>保存済みの閲覧データは再訪時に表示されます。最新のデータは、各画面の更新ボタンから取得できます。</p></div>
      <button className="xg-secondary" disabled={!!busy} onClick={clear}>この端末の保存データを削除</button>
      <Feedback error={error}/>{status && <p role="status">{status}</p>}
      <button className="xg-secondary xg-danger" disabled={!!busy} onClick={logout}>{busy === 'logout' ? 'ログアウト中…' : 'ログアウト'}</button>
    </section>
  </div>;
}

function Workspace({vault, onLogout, pathname}: {vault: Vault; onLogout: () => void; pathname: string}) {
  const [, , area, id, target] = pathname.split('/');
  const valid = (value: string | undefined) => /^[0-9]{1,45}$/.test(value ?? '');

  if (area === 'explore') return <Explore vault={vault}/>;
  if (area === 'reels') return <Deck vault={vault} action="reels"/>;
  if (area === 'story' && valid(id)) return <StoryViewer vault={vault} id={id}/>;
  if (area === 'post' && valid(id)) return <PostPage vault={vault} id={id}/>;
  if (area === 'profile' && (!id || valid(id))) return <ProfilePage vault={vault} id={id || vault.session.user.id}/>;
  if (area === 'messages') {
    if (id === 'notes') return <NotesPage vault={vault}/>;
    if (id === 'new' && valid(target)) return <Conversation vault={vault} newUser id={target}/>;
    if (valid(id)) return <Conversation vault={vault} id={id}/>;
    return <InboxPage vault={vault}/>;
  }
  if (area === 'settings') return <SettingsPage vault={vault} onLogout={onLogout}/>;
  if (area) return <div className="xg-center"><Feedback empty="このページは見つかりません。"/><Link className="xg-secondary" to={paths.home}>ホームへ</Link></div>;
  return <Deck vault={vault} action="feed"/>;
}

export default function Xerogram() {
  const {pathname} = useLocation();
  const navigate = useNavigate();
  const [vault, setVault] = useState<Vault>();
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const sessionChannel = useRef<BroadcastChannel | undefined>(undefined);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const value = localStorage.getItem('xerogram-theme');
      if (value === 'light' || value === 'dark') return value;
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    let active = true;
    setChecking(true);
    setConnectionError('');
    void sessionOnce().then(
      value => { if (active && value.user) setVault(new Vault(value as Session)); },
    ).catch(error => {
      if (active) setConnectionError(error.message);
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const end = () => setVault(undefined);
    window.addEventListener(refreshSessionEvent, end);
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('xerogram-session') : undefined;
    sessionChannel.current = channel;
    if (channel) channel.onmessage = end;
    return () => {
      window.removeEventListener(refreshSessionEvent, end);
      channel?.close();
      sessionChannel.current = undefined;
    };
  }, []);

  useEffect(() => {
    document.title = 'Xerogram';
    return () => { document.title = 'XeroxYT-NTv7'; };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('xerogram-theme', next); } catch {}
  }

  return <div className={'xg xg-' + theme}>
    <header className="xg-top">
      <div className="xg-brand"><Link to={paths.home}><span><Camera size={21}/></span>Xerogram</Link><AppPicker current="xerogram"/></div>
      <div className="xg-top-actions">
        {vault && <Link className="xg-icon" to={paths.settings} aria-label="設定" title="設定"><Settings size={20}/></Link>}
        <button className="xg-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'ライトテーマ' : 'ダークテーマ'} title={theme === 'dark' ? 'ライトテーマ' : 'ダークテーマ'}>
          {theme === 'dark' ? <Sun size={21}/> : <Moon size={21}/>}
        </button>
      </div>
    </header>
    {vault ? <div className="xg-workspace">
      <aside className="xg-sidebar">
        <nav aria-label="Xerogram のナビゲーション">
          {nav.map(entry => <NavLink key={entry.to} to={entry.to} end={entry.to === paths.home} className="xg-nav-item" title={entry.name}>
            <entry.icon size={22}/><span>{entry.name}</span>
          </NavLink>)}
        </nav>
        <Link className="xg-side-account" to={paths.settings}><Avatar person={vault.session.user}/><span>{vault.session.user.handle}</span><Settings size={16}/></Link>
      </aside>
      <main className="xg-main" id="xerogram-main" key={pathname}><Workspace vault={vault} pathname={pathname} onLogout={() => { setVault(undefined); sessionChannel.current?.postMessage('logout'); navigate(root, {replace: true}); }}/></main>
    </div> : <main className="xg-entry" id="xerogram-main">
      {checking ? <Feedback pending/> : <Login onLogin={session => {
        try { setVault(new Vault(session)); sessionChannel.current?.postMessage('login'); } catch { setConnectionError('暗号化を利用できるブラウザーで開いてください。'); }
      }} connectionError={connectionError} reconnect={() => setAttempt(attempt + 1)}/>}
    </main>}
  </div>;
}
