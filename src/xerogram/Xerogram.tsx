import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Camera, Clapperboard, Compass, Home, MessageCircle, RefreshCw, Settings, UserRound, Send, Image, ChevronLeft } from 'lucide-react';
import AppPicker, { AppIcon } from './AppPicker';
import { clearCache, mergePage, readCache, reconcileThread, request, restoreThreadDelta, writeCache, XerogramError } from './data';
import type { Account, Args, Asset, Message, Page, Person, Post, TextRow, Thread } from './data';

const tabs = [
  ['feed', 'ホーム', Home], ['search', '検索', Compass], ['reels', 'リール', Clapperboard],
  ['inbox', 'DM', MessageCircle], ['stories', 'ストーリー', Camera], ['profile', 'マイページ', UserRound],
] as const;
type Screen = { op: string; label: string; args?: Args };
const start: Screen = { op: 'feed', label: 'ホーム' };
const emptyPage: Page = { items: [], cursor: '' };

function describe(error: unknown) { return error instanceof Error ? error.message : '通信に失敗しました。'; }

function Media({ asset, auto = false, label = 'メディア', onRefresh }: { asset: Asset; auto?: boolean; label?: string; onRefresh?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [asset.image, asset.video]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || entry.intersectionRatio < .65) element.pause();
      else if (auto && !document.hidden) void element.play().catch(() => {});
    }, { threshold: [.65] });
    const pause = () => { if (document.hidden) element.pause(); };
    observer.observe(element);
    document.addEventListener('visibilitychange', pause);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', pause); element.pause(); };
  }, [auto, asset.video, broken]);
  if (broken) return <div className="xg-media-error">メディアを読み込めません。{onRefresh && <button onClick={onRefresh}>投稿情報を更新</button>}</div>;
  if (asset.video) return <video ref={video} src={asset.video} poster={asset.image} controls playsInline muted={auto}
    preload={auto ? 'metadata' : 'none'} loop={auto} aria-label={label} onError={() => setBroken(true)} />;
  if (asset.image) return <img src={asset.image} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return null;
}

function Avatar({ person }: { person?: Person }) {
  return person?.avatar ? <img className="xg-avatar" src={person.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" /> :
    <span className="xg-avatar xg-avatar-placeholder"><UserRound size={17} /></span>;
}

function Section({ account, screen, back, open, activeThread }: { account: Account; screen: Screen; back: () => void; open: (view: Screen) => void; activeThread?: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [storyPeople, setStoryPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (screen.op !== 'feed' || !navigator.onLine) return;
    let current = true;
    request<Page>('stories', {slot: account.slot}, true).then(data => {
      if (current) setStoryPeople(data.items as Person[]);
    }).catch(() => {});
    return () => { current = false; };
  }, [screen.op, account.slot]);
  const [reply, setReply] = useState<Message | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [knownLikes, setLikes] = useState<Record<string, boolean>>({});
  const [relationship, setRelationship] = useState<boolean>();
  const [photos, setPhotos] = useState(false);
  const [group, setGroup] = useState(false);
  const [members, setMembers] = useState<Person[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const status = useRef({ alive: true, busy: false, sending: false, page: null as Page | null });
  const gestures = useRef<{ x: number; y: number } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const args = screen.args || {};
  const thread = screen.op === 'thread';
  const newChat = screen.op === 'new_chat';
  const enabled = !newChat && (screen.op !== 'search' || !!args.query);
  const cacheable = !['stories', 'story', 'highlight', 'notes'].includes(screen.op);
  const scrollKey = JSON.stringify([account.user.id, screen.op, args.id || '', args.query || '']);

  function install(value: Page) {
    if (!status.current.alive) return;
    status.current.page = value;
    setPage(value);
  }

  async function load(older = false, firstOpen = false) {
    if (!enabled || status.current.busy) return;
    status.current.busy = true;
    setBusy(true);
    setError('');
    try {
      const cursor = older ? status.current.page?.cursor : undefined;
      const known = thread && !older ? Object.fromEntries(((status.current.page?.items || []) as Message[])
        .slice(0, 20).filter(item => item.revision).map(item => [item.id, item.revision])) : undefined;
      const incoming = await request<Page>(screen.op, { ...args, slot: account.slot, cursor, ...(thread && !older ? { seen: firstOpen, known } : {}) }, true);
      const next = thread ? restoreThreadDelta(status.current.page, incoming) : incoming;
      if (!status.current.alive) return;
      const result = thread && !older ? reconcileThread(status.current.page, next) : mergePage(status.current.page, next, older);
      install(result);
      if (cacheable) void writeCache(account, screen.op, args, result);
    } catch (error) {
      if (status.current.alive) setError(describe(error));
    } finally {
      status.current.busy = false;
      if (status.current.alive) setBusy(false);
    }
  }

  useEffect(() => {
    status.current.alive = true;
    let current = true;
    void (async () => {
      const hit = cacheable ? await readCache(account, screen.op, args) : null;
      if (!current) return;
      if (hit) install(hit);
      if (screen.op === 'search') {
        const log = await readCache(account, 'search-history', {});
        if (!current) return;
        const query = String(args.query || '');
        const history = (log?.items || []) as string[];
        const next = query ? [query, ...history.filter(item => item !== query)].slice(0, 12) : history;
        setRecent(next);
        if (query) void writeCache(account, 'search-history', {}, { ...emptyPage, items: next });
      }
      if (enabled && (!hit || thread) && navigator.onLine) void load(false, thread);
      else if (!hit && enabled && !navigator.onLine) setError('オフラインです。この画面の保存データがありません。');
      else if (!enabled) install(emptyPage);
    })();
    const view = scroll.current;
    return () => {
      current = false;
      status.current.alive = false;
      if (view) scrollPositions.set(scrollKey, view.scrollTop);
    };
  }, []);

  const restored = useRef(false);
  useEffect(() => {
    const view = scroll.current;
    if (!view || !page || restored.current) return;
    restored.current = true;
    view.scrollTop = scrollPositions.get(scrollKey) ?? (thread ? view.scrollHeight : 0);
  }, [page, scrollKey, thread]);

  async function action<T>(op: string, params: Args, done?: (data: T) => void) {
    if (status.current.sending) return;
    status.current.sending = true;
    setSending(true);
    setError('');
    try {
      const data = await request<T>(op, { ...params, slot: account.slot });
      if (data && typeof data === 'object' && 'ok' in data && data.ok === false) throw new XerogramError('UPSTREAM');
      if (status.current.alive) done?.(data);
    } catch (error) {
      if (status.current.alive) setError(describe(error));
    } finally {
      status.current.sending = false;
      if (status.current.alive) setSending(false);
    }
  }

  function updateItems(next: (items: unknown[]) => unknown[]) {
    const current = status.current.page || emptyPage;
    const nextPage = { ...current, items: next(current.items) };
    install(nextPage);
    if (cacheable) void writeCache(account, screen.op, args, nextPage);
  }

  function profile(person: Person) { open({ op: 'profile', label: '@' + person.username, args: { id: person.id } }); }
  function show(op: string, label: string, id: string) { open({ op, label, args: { id } }); }
  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    if (newChat) void action<{ id: string; message: Message }>('send_to', { id: args.id, text: draft }, result => {
      setDraft('');
      if (result.id) show('thread', screen.label, result.id);
      else { setError('送信しました。受信トレイを更新すると会話を開けます。'); }
    });
    else if (thread) void action<Message>('send', { id: args.id, text: draft, reply: reply?.id }, result => {
      updateItems(items => [result, ...items.filter(item => (item as Message).id !== result.id)]);
      setDraft(''); setReply(null);
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
    });
    else if (screen.op === 'comments') void action<TextRow>('comment', { id: args.id, text: draft }, result => {
      updateItems(items => [result, ...items]); setDraft('');
    });
    else void action('note', { text: draft }, () => { setDraft(''); void load(); });
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const files = values.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length > (screen.op === 'feed' ? 6 : 1) || files.reduce((size, file) => size + file.size, 0) > 3_000_000) {
      setError('写真は合計3 MBまで選べます。'); return;
    }
    if (sending || !files.length || !window.confirm(thread ? 'この写真を送信しますか？' : 'Instagramに公開しますか？')) return;
    try {
      const images = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('写真を読み込めませんでした。'));
        reader.readAsDataURL(file);
      })));
      const op = thread ? 'send_photo' : screen.op === 'stories' ? 'upload_story' : 'upload_post';
      await action<Message | Post>(op, { photos: images, text: values.get('caption') || '', id: args.id }, result => {
        setPhotos(false);
        if (op === 'upload_story') void load();
        else updateItems(items => [result, ...items.filter(item => (item as Message | Post).id !== result.id)]);
      });
    } catch (error) { setError(describe(error)); }
  }

  function postCard(post: Post) {
    const liked = knownLikes[post.id] ?? post.liked;
    const isStory = ['story', 'highlight'].includes(screen.op);
    if (screen.op === 'story' && post.expires && Date.parse(post.expires) < Date.now()) return null;
    return <article className={'xg-post' + (screen.op === 'reels' ? ' xg-reel' : '')} key={post.id}>
      {post.user && <button className="xg-person" onClick={() => profile(post.user)}><Avatar person={post.user}/><strong>@{post.user.username}</strong></button>}
      <div className="xg-assets">{(post.items?.length ? post.items : [post]).map((asset, index) =>
        <Media key={index} asset={asset} auto={screen.op === 'reels'} onRefresh={() => void load()} />)}</div>
      {post.caption && <p>{post.caption}</p>}
      <div className="xg-actions">
        {isStory ? <>
          {screen.op === 'story' && <button disabled={sending} onClick={() => void action('story_seen', {id: post.id})}>閲覧済みにする</button>}
          <button disabled={sending} onClick={() => void action('story_like', {id: post.id}, () => setLikes(previous => ({ ...previous, [post.id]: true })))}>{liked ? 'リアクション済み' : '♥ リアクション'}</button>
          {post.user?.id === account.user.id && <button onClick={() => show('story_viewers', '閲覧者', post.pk)}>閲覧者</button>}
        </> : <>
          <button disabled={sending} aria-pressed={!!liked} onClick={() => void action(liked ? 'unlike' : 'like', { id: post.id }, () => {
            setLikes(previous => ({ ...previous, [post.id]: !liked }));
            updateItems(items => items.map(item => (item as Post).id === post.id ? { ...(item as Post), liked: !liked } : item));
          })}>{liked ? '♥ いいね済み' : '♡ いいね'}</button>
          <button onClick={() => show('comments', 'コメント', post.id)}>コメント</button>
          <button disabled={sending} aria-pressed={!!(saved[post.id] ?? (post.saved || screen.op === 'saved'))} onClick={() => {
            const value = saved[post.id] ?? (post.saved || screen.op === 'saved');
            void action(value ? 'unsave' : 'save', { id: post.id }, () => {
              setSaved(previous => ({ ...previous, [post.id]: !value }));
              updateItems(items => screen.op === 'saved' && value ? items.filter(item => (item as Post).id !== post.id) :
                items.map(item => (item as Post).id === post.id ? { ...(item as Post), saved: !value } : item));
            });
          }}>{(saved[post.id] ?? (post.saved || screen.op === 'saved')) ? '保存済み' : '保存'}</button>
          {post.user?.id === account.user.id && <>
            <button disabled={sending} onClick={() => {
              const text = window.prompt('キャプションを編集', post.caption || '');
              if (text !== null) void action('edit_post', { id: post.id, text }, () => updateItems(items => items.map(item => (item as Post).id === post.id ? { ...(item as Post), caption: text } : item)));
            }}>編集</button>
            <button disabled={sending} onClick={() => {
              if (window.confirm('Instagramからこの投稿を削除しますか？')) void action('delete_post', { id: post.id }, () => updateItems(items => items.filter(item => (item as Post).id !== post.id)));
            }}>削除</button>
          </>}
        </>}
      </div>
    </article>;
  }

  function gallery(posts: Post[]) {
    return <div className="xg-gallery">{posts.map(post => {
      const cover = post.image || post.items?.[0]?.image;
      return <button key={post.id} onClick={() => show('post', '投稿', post.pk)} aria-label={post.caption || '投稿を開く'}>
        {cover ? <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <Image size={24}/>}
        {post.video && <Clapperboard className="xg-tile-video" size={19}/>}
      </button>;
    })}</div>;
  }

  function content(): ReactNode {
    if (!page) return busy ? <div aria-label="読み込み中" role="status" className="xg-skeleton" /> : null;
    const rows = page.items;
    if (screen.op === 'inbox') return rows.filter(item => ((item as Thread).title || '').toLowerCase().includes(filter.toLowerCase())).map(item => {
      const row = item as Thread;
      return <button className="xg-row xg-inbox-row" key={row.id} aria-current={activeThread === row.id ? 'true' : undefined} onClick={() => show('thread', row.title || 'チャット', row.id)}>
        <Avatar person={row.person}/><span><strong>{row.title || 'チャット'}</strong><small>{row.preview || (row.group ? 'グループ' : '会話を開く')}</small></span>{row.unread && <span aria-label="未読" className="xg-unread"/>}
      </button>;
    });
    if (thread) return [...rows].reverse().map(item => {
      const row = item as Message;
      const mine = row.user === account.user.id;
      const sender = page.users?.find(value => value.id === row.user);
      const original = rows.find(item => (item as Message).id === row.reply) as Message | undefined;
      const isRead = Object.entries(page.seen || {}).some(([user, id]) => user !== account.user.id && id === row.id);
      return <article key={row.id} className={'xg-message ' + (mine ? 'mine' : '')}
        onPointerDown={event => { gestures.current = { x: event.clientX, y: event.clientY }; }}
        onPointerCancel={() => { gestures.current = null; }}
        onPointerUp={event => {
          const origin = gestures.current;
          gestures.current = null;
          if (origin && event.clientX - origin.x > 52 && Math.abs(event.clientY - origin.y) < 40) setReply(row);
        }}>
        {!mine && <small>{sender?.username || 'メンバー'}</small>}
        {row.reply && <blockquote>{original?.text || 'メッセージへの返信'}</blockquote>}
        <p>{row.text || (!row.image && !row.video && !row.shared ? 'このメッセージ形式は表示できません' : '')}</p>
        <Media asset={row.shared || row} label="DMの添付メディア" onRefresh={() => void load()} />
        <div className="xg-actions">
          <button onClick={() => setReply(row)}>返信</button>
          <button disabled={sending} onClick={() => void action('reaction', { id: args.id, message: row.id }, () => {
            updateItems(items => items.map(item => (item as Message).id === row.id ? { ...(item as Message), reactions: [...(row.reactions || []), true] } : item));
          })}>♥ {row.reactions?.length || ''}</button>
          {mine && <button disabled={sending} onClick={() => {
            if (window.confirm('このメッセージの送信を取り消しますか？')) void action('unsend', { id: args.id, message: row.id }, () => {
              if (reply?.id === row.id) setReply(null);
              updateItems(items => items.filter(item => (item as Message).id !== row.id));
            });
          }}>送信取消</button>}
          {mine && isRead && <small>既読</small>}
        </div>
      </article>;
    });
    if (['comments', 'notes', 'notifications'].includes(screen.op)) return rows.map(item => {
      const row = item as TextRow;
      return <article className="xg-text-row" key={row.id}>{row.user && <button className="xg-person" onClick={() => profile(row.user)}><Avatar person={row.user}/>@{row.user.username}</button>}<p>{row.text}</p></article>;
    });
    if (screen.op === 'highlights') return rows.map(item => {
      const row = item as {id: string; title: string};
      return <button className="xg-row" key={row.id} onClick={() => show('highlight', row.title, row.id)}>{row.title}</button>;
    });
    if (['suggestions', 'followers', 'following', 'stories', 'story_viewers'].includes(screen.op) || (screen.op === 'search' && !String(args.query).startsWith('#'))) return rows.map(item => {
      const person = item as Person;
      if (group && screen.op === 'search') {
        const checked = members.some(member => member.id === person.id);
        return <label key={person.id} className="xg-row"><input type="checkbox" checked={checked} disabled={!checked && members.length >= 8}
          onChange={() => setMembers(previous => checked ? previous.filter(member => member.id !== person.id) : [...previous, person])}/><Avatar person={person}/>@{person.username}</label>;
      }
      return <button className="xg-row xg-person" key={person.id} onClick={() => screen.op === 'stories' ? show('story', '@' + person.username, person.id) : profile(person)}>
        <Avatar person={person}/><span><strong>@{person.username}</strong><small>{person.name}</small></span>
      </button>;
    });
    if (screen.op === 'profile' || (screen.op === 'search' && String(args.query).startsWith('#'))) return gallery(rows as Post[]);
    return rows.map(row => postCard(row as Post));
  }

  return <section className="xg-section" data-view={screen.op}>
    <header className="xg-toolbar">
      <button onClick={back} aria-label="前の画面"><ChevronLeft size={21}/></button><h2>{page?.title || screen.label}</h2>
      <button onClick={() => void load()} disabled={busy || !enabled} aria-label="更新"><RefreshCw size={18}/></button>
    </header>
    {error && <p className="xg-error" role="alert">{error}</p>}
    {screen.op === 'search' && <form className="xg-search" onSubmit={event => {
      event.preventDefault();
      const query = String(new FormData(event.currentTarget).get('query') || '').trim();
      if (query && query !== args.query) open({ op: 'search', label: '検索', args: { query } });
    }}>
      <input aria-label="アカウントまたはハッシュタグ" name="query" type="search" placeholder="アカウント名・#ハッシュタグ" defaultValue={String(args.query || '')} maxLength={100} required/>
      <button type="submit">検索</button>
    </form>}
    {screen.op === 'search' && <>
      <button className="xg-shortcut" onClick={() => open({op:'suggestions', label:'おすすめアカウント'})}>おすすめアカウント</button>
      {!args.query && recent.length > 0 && <div className="xg-actions">{recent.map(query => <button key={query} onClick={() => open({op:'search', label:'検索', args:{query}})}>{query}</button>)}</div>}
      {!!args.query && !String(args.query).startsWith('#') && <button className="xg-shortcut" onClick={() => { setGroup(!group); setMembers([]); }}>{group ? '選択をやめる' : '検索結果からグループを作成'}</button>}
      {group && <button className="xg-shortcut" disabled={members.length < 2 || sending} onClick={() => {
        const title = window.prompt('グループ名', '');
        if (title !== null) void action<{id: string}>('start_chat', {users:members.map(member => member.id), title}, result => show('thread', title || 'グループ', result.id));
      }}>選択した {members.length} 人でグループ作成</button>}
    </>}
    {['feed', 'stories'].includes(screen.op) && <button className="xg-shortcut" onClick={() => setPhotos(!photos)}>{screen.op === 'stories' ? '写真のストーリーを投稿' : '写真を投稿'}</button>}
    {screen.op === 'inbox' && <div className="xg-inbox-tools"><input type="search" aria-label="会話を検索" placeholder="会話を検索" value={filter} onChange={event => setFilter(event.target.value)} /><button className="xg-shortcut" onClick={() => open({ op: 'notes', label: 'ノート' })}>ノート</button></div>}
    <div ref={scroll} className={'xg-scroll' + (screen.op === 'reels' ? ' xg-reels' : '')}>
      {screen.op === 'feed' && storyPeople.length > 0 && <div className="xg-story-strip" aria-label="ストーリー">
        {storyPeople.slice(0, 12).map(person => <button key={person.id} onClick={() => show('story', '@' + person.username, person.id)}><span><Avatar person={person}/></span><small>{person.username}</small></button>)}
      </div>}
      {page?.user && <article className="xg-profile-card">
        <Avatar person={page.user}/><h3>{page.user.name || page.user.username}</h3>
        <p>@{page.user.username}</p><p>{page.user.bio}</p>
        <div className="xg-actions">
          <button onClick={() => show('followers', 'フォロワー', page.user.id)}>フォロワー {page.user.followers}</button>
          <button onClick={() => show('following', 'フォロー中', page.user.id)}>フォロー中 {page.user.following}</button>
          <button onClick={() => show('highlights', 'ハイライト', page.user.id)}>ハイライト</button>
          {account.user.id === page.user.id ? <>
            <button onClick={() => open({ op: 'saved', label: '保存済み投稿' })}><Bookmark size={16}/> 保存済み</button>
            <button onClick={() => open({ op: 'notifications', label: '通知' })}>通知</button>
            <button disabled={sending} onClick={() => {
              const name = window.prompt('表示名', page.user.name || '');
              if (!name?.trim()) return;
              const bio = window.prompt('自己紹介', page.user.bio || '');
              if (bio !== null) void action<{ user: Person }>('edit_profile', { name, bio }, result => {
                const updated = { ...page, user: { ...page.user, ...result.user } };
                install(updated); void writeCache(account, screen.op, args, updated);
              });
            }}>プロフィール編集</button>
          </> : <>
            <button disabled={sending} onClick={() => {
              const follows = relationship ?? page.user.follows;
              void action(follows ? 'unfollow' : 'follow', { id: page.user.id }, () => setRelationship(!follows));
            }}>{(relationship ?? page.user.follows) ? 'フォロー解除' : 'フォロー'}</button>
            <button disabled={sending} onClick={() => show('new_chat', '@' + page.user.username, page.user.id)}>メッセージ</button>
            <button disabled={sending} onClick={() => void action('close_add', { id: page.user.id }, () => setError('親しい友達に追加しました。'))}>親しい友達に追加</button>
            <button disabled={sending} onClick={() => void action('close_remove', { id: page.user.id }, () => setError('親しい友達から削除しました。'))}>親しい友達から削除</button>
          </>}
        </div>
      </article>}
      {thread && !!page?.cursor && <button className="xg-more" disabled={busy} onClick={() => void load(true)}>以前のメッセージ</button>}
      {content()}
      {enabled && page && !page.items.length && !busy && <p className="xg-empty">表示するデータがありません。</p>}
      {!thread && !!page?.cursor && <button className="xg-more" disabled={busy} onClick={() => void load(true)}>{busy ? '読み込み中…' : '続きを表示'}</button>}
    </div>
    {photos && <form className="xg-compose" onSubmit={upload}>
      <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple={screen.op === 'feed'} required aria-label="写真を選択"/>
      {!thread && <input name="caption" maxLength={2200} placeholder="キャプション" aria-label="キャプション"/>}
      <div><button type="submit" disabled={sending}>{thread ? '写真を送信' : '写真を投稿'}</button> <button type="button" onClick={() => setPhotos(false)}>閉じる</button></div>
    </form>}
    {(thread || newChat || ['comments', 'notes'].includes(screen.op)) && <form className="xg-compose" onSubmit={send}>
      {thread && !photos && <button type="button" className="xg-shortcut" onClick={() => setPhotos(true)}>写真を添付</button>}
      {reply && <div><span>返信先 {reply.text || '添付メディア'}</span> <button type="button" onClick={() => setReply(null)}>解除</button></div>}
      <label className="xg-composer-row"><input value={draft} onChange={event => setDraft(event.target.value)} aria-label="本文"
        placeholder={thread || newChat ? 'メッセージを入力' : screen.op === 'notes' ? 'ノートを入力' : 'コメントを入力'}
        maxLength={screen.op === 'notes' ? 60 : 2000} /><button disabled={sending || !draft.trim()} type="submit">{sending ? '送信中…' : '送信'}</button></label>
    </form>}
  </section>;
}

const scrollPositions = new Map<string, number>();
function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem('xerogram-' + key) || fallback; } catch { return fallback; }
}
function writePreference(key: string, value: string) {
  try { localStorage.setItem('xerogram-' + key, value); } catch { /* Private mode can disable storage. */ }
}

export default function Xerogram() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [slot, setSlot] = useState(() => readPreference('slot', 'a'));
  const [theme, setTheme] = useState(() => readPreference('theme', 'auto'));
  const [stack, setStack] = useState([start]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [verification, setVerification] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [loginName, setLoginName] = useState('');
  const [settings, setSettings] = useState(false);
  const [storageStatus, setStorageStatus] = useState('');
  const shell = useRef<HTMLDivElement>(null);
  const account = accounts.find(value => value.slot === slot) || accounts[0];
  const screen = stack.at(-1);
  const selected = stack[0]?.op;
  const dmLayout = screen.op === 'inbox' || screen.op === 'thread' && selected === 'inbox';
  function open(view: Screen) {
    setStack(previous => view.op === 'thread' && previous[0].op === 'inbox' ? [previous[0], view] : [...previous, view]);
  }
  function back() { setStack(previous => previous.length > 1 ? previous.slice(0, -1) : [start]); }

  async function status(preferred?: string) {
    const data = await request<{accounts: Account[]}>('status', {}, true);
    setAccounts(data.accounts);
    const selected = data.accounts.find(value => value.slot === preferred)?.slot;
    if (selected) { setSlot(selected); writePreference('slot', selected); }
  }
  useEffect(() => {
    let live = true;
    status().catch(error => { if (live) setError(describe(error)); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const measure = () => shell.current?.style.setProperty('--xg-height', (viewport?.height || window.innerHeight) + 'px');
    measure();
    viewport?.addEventListener('resize', measure);
    return () => viewport?.removeEventListener('resize', measure);
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const username = String(values.get('username') || '').trim();
    const password = String(values.get('password') || '');
    const code = String(values.get('code') || '').replace(/[\s-]/g, '');
    form.reset();
    setLoginName(username);
    setConnecting(true);
    setBusy(true);
    setError('');
    try {
      const result = await request<{ slot: string }>('login', { username, password, code });
      await status(result.slot);
      setStack([start]);
      setConnecting(false);
      setVerification(false);
    } catch (error) {
      if (error instanceof XerogramError) {
        if (error.code === 'TWO_FACTOR' || error.code === 'VERIFY_REJECTED') {
          setVerification(true);
          setPasswordRequired(error.passwordRequired);
        } else if (error.code === 'VERIFY_EXPIRED') {
          setVerification(false);
        }
      }
      setError(describe(error));
    } finally { setBusy(false); }
  }

  function switchAccount(target: string) {
    setSlot(target); writePreference('slot', target); setStack([start]); setConnecting(false); setError('');
  }

  async function logout() {
    if (!account) return;
    setBusy(true); setError('');
    try {
      await request('logout', { slot: account.slot });
      await status();
      setStack([start]); setSettings(false);
      await clearCache(account);
    } catch (error) { setError(describe(error)); }
    finally { setBusy(false); }
  }

  return <div className="xg-shell" data-theme={theme} ref={shell}>
    <aside className="xg-rail">
      <div className="xg-brand"><AppIcon/><span>Xerogram</span></div>
      <nav aria-label="Xerogram">
        {tabs.map(([op, label, Icon], index) => <div key={op}>
          <button type="button" aria-current={selected === op && !settings ? 'page' : undefined} disabled={!account || connecting} onClick={() => {
            setSettings(false); setStack([{ op, label, args: op === 'profile' ? { id: account.user.id } : undefined }]);
          }}><Icon size={21}/><span>{label}</span></button>
          {index === 0 && <div className="xg-picker-desktop"><AppPicker current="xerogram" /></div>}
        </div>)}
      </nav>
      <button type="button" className="xg-settings-button" onClick={() => setSettings(!settings)} aria-label="設定"><Settings size={20}/><span>設定</span></button>
    </aside>
    <main className="xg-main" data-screen={screen.op}>
      <header className="xg-mobile">
        <strong>Xerogram</strong><AppPicker current="xerogram"/><button onClick={() => setSettings(!settings)} aria-label="設定"><Settings size={19}/></button>
      </header>
      {error && <p className="xg-error xg-global-error" role="alert">{error}</p>}
      {busy && !account && !connecting && <div className="xg-skeleton" role="status" aria-label="接続確認中" />}
      {settings ? <div className="xg-panel">
        <h2>設定</h2>
        <label>外観 <select value={theme} onChange={event => {
          setTheme(event.target.value); writePreference('theme', event.target.value);
        }}><option value="auto">端末の設定に合わせる</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
        {account && <>
          <label>アカウント <select value={account.slot} onChange={event => switchAccount(event.target.value)}>
            {accounts.map(value => <option value={value.slot} key={value.slot}>@{value.user.username}</option>)}
          </select></label>
          <button onClick={() => { setConnecting(true); setSettings(false); setVerification(false); setLoginName(''); setError(''); }}>アカウントを追加・再接続</button>
          <button onClick={() => void navigator.storage?.estimate().then(data => setStorageStatus('このサイトの使用量 ' + Math.round((data.usage || 0) / (1024 * 1024)) + ' MB')).catch(() => setStorageStatus('使用量を取得できませんでした。'))}>端末の使用量を確認</button>
          <button onClick={() => {
            void clearCache(account).then(() => { scrollPositions.clear(); setStorageStatus('このアカウントのキャッシュを削除しました。'); }).catch(error => setStorageStatus(describe(error)));
          }}>キャッシュを削除</button>
          {storageStatus && <p role="status">{storageStatus}</p>}
          <button disabled={busy} onClick={() => void logout()}>Instagramからログアウト</button>
        </>}
      </div> : (connecting || (!account && !busy)) ? <form className="xg-panel xg-login" onSubmit={login}>
        <AppIcon/><h2>Instagramに接続</h2>
        <p>Xerogramで利用するInstagramアカウントを入力してください。</p>
        <label>ユーザー名<input key={loginName} name="username" autoComplete="username" defaultValue={loginName} readOnly={verification} maxLength={30} required/></label>
        {(!verification || passwordRequired) && <label>パスワード<input name="password" type="password" autoComplete="current-password" required/></label>}
        {verification && <label>認証コード<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={16} required/></label>}
        <button type="submit" disabled={busy}>{busy ? '接続中…' : verification ? '認証コードを確認' : '接続'}</button>
        {verification && <button type="button" disabled={busy} onClick={() => {setVerification(false); setError('');}}>ログインからやり直す</button>}
        <Link className="xg-guest-link" to="/xerogram/guest">ログインせず公開投稿・リールを見る</Link>
        {account && <button type="button" onClick={() => { setConnecting(false); setError(''); }}>戻る</button>}
      </form> : account && (dmLayout ? <div className="xg-dm-layout" data-thread={screen.op === 'thread'}>
        <Section key={account.slot + '-inbox'} account={account} screen={stack[0]} back={back} open={open} activeThread={screen.op === 'thread' ? String(screen.args?.id) : undefined}/>
        {screen.op === 'thread'
          ? <Section key={account.slot + String(screen.args?.id)} account={account} screen={screen} back={back} open={open}/>
          : <div className="xg-dm-placeholder"><Send size={30}/><h2>メッセージ</h2><p>会話を選ぶとここに表示されます。</p></div>}
      </div> : <Section key={account.slot + account.user.id + JSON.stringify(screen)} account={account} screen={screen} back={back} open={open}/>)}
    </main>
  </div>;
}
