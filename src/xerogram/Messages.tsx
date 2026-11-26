import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ChevronRight} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {Vault, XerogramError, request, usePages, useResource, type Message, type Note, type Page, type Profile, type Thread} from './data';
import {Avatar, Composer, Feedback, MediaDisplay, More, PersonRow, Refresh, formatTime, paths, root} from './ui';

export function InboxPage({vault}: {vault: Vault}) {
  const [tab, setTab] = useState('inbox');
  const view = usePages<Thread>(vault, tab, {}, {persistent: false});
  return <div className="xg-center">
    <div className="xg-page-heading"><h1>メッセージ</h1><Refresh onClick={view.retry} disabled={view.pending}/></div>
    <div className="xg-tabs">
      <button aria-pressed={tab === 'inbox'} onClick={() => setTab('inbox')}>受信箱</button>
      <button aria-pressed={tab === 'requests'} onClick={() => setTab('requests')}>リクエスト</button>
      <Link to={paths.messages + '/notes'}>ノート</Link>
    </div>
    <Feedback error={view.error} pending={!view.data && view.pending} empty={!view.items.length ? 'スレッドはありません。' : ''} retry={view.retry}/>
    {!!view.items.length && <div className="xg-card xg-list">{view.items.map(thread => <Link className="xg-person" key={thread.id} to={paths.messages + '/' + thread.id}>
      <Avatar person={thread.users[0]}/><span><strong>{thread.title || thread.users.map(person => person.handle).join('、') || 'メッセージ'}</strong><small>{formatTime(thread.time)}</small></span><ChevronRight size={18}/>
    </Link>)}</div>}
    <More {...view}/>
  </div>;
}

export function NotesPage({vault}: {vault: Vault}) {
  const view = usePages<Note>(vault, 'notes', {}, {persistent: false});
  const [draft, setDraft] = useState('');
  const [closeFriends, setCloseFriends] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function update(action: string, params: Record<string, string | boolean>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await request(action, params);
      setDraft('');
      view.retry();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return <div className="xg-center">
    <div className="xg-page-heading"><Link className="xg-icon" aria-label="受信箱に戻る" to={paths.messages}><ArrowLeft/></Link><h1>ノート</h1><Refresh onClick={view.retry} disabled={pending || view.pending}/></div>
    <div className="xg-card xg-comments">
      <Composer label="ノートを投稿" value={draft} setValue={setDraft} pending={pending} max={60} submit={event => { event.preventDefault(); void update('note', {text: draft, closeFriends}); }}/>
      <label className="xg-check"><input type="checkbox" checked={closeFriends} onChange={event => setCloseFriends(event.target.checked)}/>親しい友達に共有</label>
      <Feedback error={error || view.error} pending={!view.data && view.pending} empty={!view.items.length ? '表示できるノートはありません。' : ''} retry={view.error ? view.retry : undefined}/>
      {view.items.map(note => <article className="xg-comment" key={note.id}><PersonRow person={note.user}/><p>{note.text}</p>
        {note.user.id === vault.session.user.id && <button className="xg-secondary" disabled={pending} onClick={() => void update('delete_note', {id: note.id})}>削除</button>}
      </article>)}
    </div>
  </div>;
}

export function Conversation({vault, id, newUser = false}: {vault: Vault; id: string; newUser?: boolean}) {
  const navigate = useNavigate();
  const resource = useResource<Page<Message> & {thread: Thread}>(vault, 'messages', {id}, {enabled: !newUser, persistent: false});
  const person = useResource<Profile>(vault, 'profile', {id}, {enabled: newUser});
  const [archive, setArchive] = useState<Message[]>([]);
  const [sent, setSent] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const archiveKey = 'unsent-own:' + id;

  useEffect(() => {
    if (newUser) return;
    let active = true;
    void vault.read<Message[]>(archiveKey).then(items => { if (active && items) setArchive(items); });
    return () => { active = false; };
  }, [vault, archiveKey, newUser]);

  async function perform(action: string, operation: () => Promise<void>, uncertain = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    setError('');
    try {
      await operation();
    } catch (error) {
      const message = (error as Error).message;
      const uncertainError = uncertain && error instanceof XerogramError && ['network', 'connection', 'provider_timeout', 'provider_error'].includes(error.code);
      setError(uncertainError ? message + ' 再送信する前にメッセージを更新して確認してください。' : message);
    } finally {
      setBusy('');
      lock.current = false;
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    void perform('send', async () => {
      const data = await request<{item: Message | null; threadId: string}>('send', {text: draft, ...(newUser ? {user: id} : {id})});
      setDraft('');
      if (newUser && data.threadId) navigate(paths.messages + '/' + data.threadId, {replace: true});
      else if (newUser) navigate(paths.messages, {replace: true});
      else if (data.item) setSent(previous => [...previous, data.item!]);
    }, true);
  }

  function unsend(item: Message) {
    if (!window.confirm('送信を取り消しますか？ 自分の端末に「取り消し済み」として残ります。')) return;
    void perform('unsend', async () => {
      await request('unsend', {id, message: item.id});
      const updated = [...(await vault.read<Message[]>(archiveKey) ?? []), {...item, unsent: true}];
      setArchive(updated);
      await vault.write(archiveKey, updated);
    });
  }

  const next = cursor ?? resource.data?.next;
  function more() {
    if (!next) return;
    void perform('more', async () => {
      const params = {id, cursor: next};
      const data = await vault.get<Page<Message>>('messages', params, 'messages' + JSON.stringify(params), false, false);
      setOlder(previous => [...previous, ...data.items]);
      setCursor(data.next === next ? '' : data.next);
    });
  }

  function refresh() {
    setSent([]);
    setOlder([]);
    setCursor(undefined);
    resource.retry();
  }

  const rows = [...sent, ...older, ...(resource.data?.items ?? []), ...archive];
  const messages = Array.from(new Map(rows.map(item => [item.id, item])).values()).sort((a, b) => a.time.localeCompare(b.time));
  const thread = resource.data?.thread;

  return <div className="xg-center">
    <div className="xg-page-heading"><Link className="xg-icon" to={paths.messages} aria-label="受信箱に戻る"><ArrowLeft/></Link>
      <h1>{thread?.title || person.data?.handle || (newUser ? '新規メッセージ' : 'メッセージ')}</h1>
      {!newUser && <Refresh onClick={refresh} disabled={resource.pending || !!busy}/>}
    </div>
    <div className="xg-card xg-conversation">
      {thread && <div className="xg-thread-actions">
        <button className="xg-secondary" disabled={!!busy} onClick={() => void perform('mute', async () => { await request(thread.muted ? 'unmute' : 'mute', {id}); resource.retry(); })}>{thread.muted ? 'ミュート解除' : 'ミュート'}</button>
        <button className="xg-secondary" disabled={!!busy} onClick={() => void perform('unread', async () => { await request('mark_unread', {id}); navigate(paths.messages); })}>未読にする</button>
      </div>}
      <Feedback error={error || (newUser ? person.error : resource.error)} pending={newUser ? person.pending : resource.pending && !resource.data} retry={resource.error ? refresh : undefined}/>
      {next && <button className="xg-secondary xg-more" disabled={!!busy} onClick={more}>以前のメッセージを表示</button>}
      <div className="xg-messages">
        {messages.map(item => <article className={'xg-message ' + (item.own ? 'xg-message-own' : '')} key={item.id}>
          <header>{item.own ? '自分' : thread?.users.find(user => user.id === item.sender)?.handle || ''} <time dateTime={item.time}>{formatTime(item.time)}</time></header>
          {item.unsent && <strong className="xg-unsent">取り消し済み</strong>}
          {item.text && <p>{item.text}</p>}
          {(item.image || item.video) && <div className="xg-dm-media"><MediaDisplay asset={item} description="添付メディア"/></div>}
          {!item.text && !item.image && !item.video && !item.unsent && <p className="xg-muted">Instagram アプリでこのメッセージを開いてください。</p>}
          {item.media && <Link to={root + '/post/' + item.media}>共有された投稿</Link>}
          {item.own && !item.unsent && <button className="xg-text-button" onClick={() => unsend(item)} disabled={!!busy}>送信を取り消す</button>}
        </article>)}
      </div>
      {(newUser ? person.data : resource.data) && <Composer label="メッセージを書く" value={draft} setValue={setDraft} pending={!!busy} submit={send}/>}
    </div>
  </div>;
}
