import {useState, type FormEvent} from 'react';
import {ArrowLeft, Camera, Clapperboard, ChevronLeft, ChevronRight, Search} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Vault, request, usePages, useResource, type Page, type Person, type Post, type Profile, type Story} from './data';
import {Avatar, Composer, Feedback, MediaDisplay, More, PersonRow, PostCard, Refresh, paths, primePost, root} from './ui';

function StoryTray({vault}: {vault: Vault}) {
  const view = usePages<Person>(vault, 'stories', {}, {persistent: false});
  return <section className="xg-card xg-stories">
    <div className="xg-section-title"><h2>ストーリーズ</h2><Refresh onClick={view.retry} disabled={view.pending}/></div>
    <Feedback error={view.error} pending={!view.data && view.pending} empty={!view.items.length ? '表示できるストーリーはありません。' : ''} retry={view.retry}/>
    {!!view.items.length && <div className="xg-stories-scroll">{view.items.filter(person => person.id && person.handle).map(person =>
      <Link key={person.id} to={root + '/story/' + person.id}><span><Avatar person={person}/></span><small>{person.handle}</small></Link>
    )}</div>}
  </section>;
}

export function Deck({vault, action}: {vault: Vault; action: 'feed' | 'reels'}) {
  const [mode, setMode] = useState('all');
  const reel = action === 'reels';
  const view = usePages<Post>(vault, action, reel ? {mode} : {});
  return <div className="xg-center">
    <div className="xg-page-heading"><h1>{reel ? 'リール' : 'ホーム'}</h1><Refresh onClick={view.retry} disabled={view.pending}/></div>
    {reel
      ? <div className="xg-tabs" aria-label="リールの種類">{[['all', 'おすすめ'], ['following', 'フォロー中'], ['friends', '友達']].map(([id, label]) =>
        <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
      )}</div>
      : <StoryTray vault={vault}/>}
    <Feedback error={view.error} pending={!view.data && view.pending} empty={!view.items.length ? '表示できる投稿はありません。' : ''} retry={view.retry}/>
    <div className="xg-stack">{view.items.map(post => <PostCard key={post.id} post={post} vault={vault} reel={reel}/>)}</div>
    <More {...view}/>
  </div>;
}

export function Explore({vault}: {vault: Vault}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const suggestions = useResource<Page<Person>>(vault, 'suggestions', {}, {enabled: !query});
  const search = useResource<{view: string; items: (Post | Person)[]}>(vault, 'search', {text: query}, {enabled: !!query});
  const view = query ? search : suggestions;
  const people = query ? search.data?.items.filter((item): item is Person => 'handle' in item) : suggestions.data?.items;
  const posts = query ? search.data?.items.filter((item): item is Post => 'assets' in item) : [];
  return <div className="xg-center">
    <div className="xg-page-heading"><h1>発見</h1><Refresh onClick={view.retry} disabled={view.pending}/></div>
    <form className="xg-search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); }}>
      <Search size={20}/><input aria-label="アカウントやハッシュタグを検索" placeholder="アカウント、#ハッシュタグ" maxLength={80} value={draft} onChange={event => { setDraft(event.target.value); if (!event.target.value) setQuery(''); }}/>
      <button className="xg-primary" type="submit">検索</button>
    </form>
    <h2 className="xg-subheading">{query ? '検索結果' : 'おすすめのアカウント'}</h2>
    <Feedback error={view.error} pending={view.pending && !view.data} empty={!view.data?.items.length ? '表示できる結果がありません。' : ''} retry={view.retry}/>
    {people && people.length > 0 && <div className="xg-card xg-list">{people.map(person => <PersonRow key={person.id} person={person}/>)}</div>}
    {posts && posts.length > 0 && <div className="xg-stack">{posts.map(post => <PostCard key={post.id} post={post} vault={vault}/>)}</div>}
  </div>;
}

export function StoryViewer({vault, id}: {vault: Vault; id: string}) {
  const view = usePages<Story>(vault, 'story', {id}, {persistent: false});
  const [index, setIndex] = useState(0);
  const current = view.items[index];
  return <div className="xg-center">
    <div className="xg-page-heading"><Link className="xg-icon" to={paths.home} aria-label="ホームへ戻る"><ArrowLeft/></Link><h1>ストーリー</h1><Refresh onClick={() => { setIndex(0); view.retry(); }} disabled={view.pending}/></div>
    <Feedback error={view.error} pending={view.pending && !view.data} empty={!current ? '表示できるストーリーはありません。' : ''} retry={view.retry}/>
    {current && <div className="xg-card xg-story">
      <PersonRow person={current.user}/>
      <div className="xg-media"><MediaDisplay key={current.id} asset={current} description="ストーリー"/>
        {index > 0 && <button className="xg-media-arrow xg-prev" onClick={() => setIndex(index - 1)} aria-label="前のストーリー"><ChevronLeft/></button>}
        {index + 1 < view.items.length && <button className="xg-media-arrow xg-next" onClick={() => setIndex(index + 1)} aria-label="次のストーリー"><ChevronRight/></button>}
        <span className="xg-media-counter">{index + 1} / {view.items.length}</span>
      </div>
    </div>}
  </div>;
}

function Gallery({vault, id, tab}: {vault: Vault; id: string; tab: string}) {
  const view = usePages<Post>(vault, tab, {id});
  return <>
    <div className="xg-section-title"><h2>{tab === 'saved' ? '保存済み' : tab === 'profile_reels' ? 'リール' : '投稿'}</h2><Refresh onClick={view.retry} disabled={view.pending}/></div>
    <Feedback error={view.error} pending={!view.data && view.pending} empty={!view.items.length ? '表示できる投稿はありません。' : ''} retry={view.retry}/>
    <div className="xg-grid">{view.items.map(item => <Link key={item.id} to={root + '/post/' + item.id} onClick={() => primePost(vault, item)} aria-label={item.caption.slice(0, 60) || '投稿を開く'}>
      {item.assets[0]?.image ? <img src={item.assets[0].image} loading="lazy" alt=""/> : <Camera size={26}/>}
      {item.assets[0]?.video && <Clapperboard size={17} className="xg-grid-video"/>}
    </Link>)}</div>
    <More {...view}/>
  </>;
}

function PeopleList({vault, id, kind}: {vault: Vault; id: string; kind: 'followers' | 'following'}) {
  const view = usePages<Person>(vault, kind, {id});
  return <>
    <Feedback error={view.error} pending={!view.data && view.pending} empty={!view.items.length ? '表示できるアカウントはありません。' : ''} retry={view.retry}/>
    {!!view.items.length && <div className="xg-card xg-list">{view.items.map(item => <PersonRow person={item} key={item.id}/>)}</div>}
    <More {...view}/>
  </>;
}

export function ProfilePage({vault, id}: {vault: Vault; id: string}) {
  const view = useResource<Profile>(vault, 'profile', {id});
  const [tab, setTab] = useState('posts');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = id === vault.session.user.id;
  const person = view.data;
  const relationship = person?.relationship?.following ? 'following' : person?.relationship?.pending ? 'pending' : 'none';

  async function follow() {
    if (busy || view.pending || !person) return;
    setBusy(true);
    setError('');
    try {
      await request(relationship === 'none' ? 'follow' : 'unfollow', {id});
      view.retry();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="xg-center">
    <div className="xg-page-heading"><h1>プロフィール</h1><Refresh onClick={view.retry} disabled={view.pending}/></div>
    <Feedback error={view.error} pending={!view.data && view.pending} retry={view.retry}/>
    {person && <>
      <section className="xg-card xg-profile">
        <Avatar person={person} large/><div><h2>{person.name || person.handle}</h2><p className="xg-muted">@{person.handle}{person.private && ' · 非公開'}</p></div>
        <div className="xg-profile-stats"><button onClick={() => setTab('posts')}><strong>{person.posts}</strong>投稿</button>
          <button onClick={() => setTab('followers')}><strong>{person.followers}</strong>フォロワー</button>
          <button onClick={() => setTab('following')}><strong>{person.following}</strong>フォロー中</button></div>
        {person.bio && <p className="xg-bio">{person.bio}</p>}
        {!own && <div className="xg-profile-actions">
          <button className={relationship === 'none' ? 'xg-primary' : 'xg-secondary'} onClick={follow} disabled={busy || view.pending}>{relationship === 'none' ? 'フォロー' : relationship === 'pending' ? 'リクエスト済み' : 'フォロー中'}</button>
          <Link className="xg-secondary" to={paths.messages + '/new/' + id}>メッセージ</Link>
        </div>}
        <Feedback error={error}/>
      </section>
      <div className="xg-tabs">{[['posts', '投稿'], ['profile_reels', 'リール'], ...(own ? [['saved', '保存済み']] : [])].map(([key, label]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
      )}</div>
      {tab === 'followers' || tab === 'following' ? <PeopleList key={tab} vault={vault} id={id} kind={tab}/> : <Gallery key={tab} vault={vault} id={id} tab={tab}/>}
    </>}
  </div>;
}

export function PostPage({vault, id}: {vault: Vault; id: string}) {
  const post = useResource<{item: Post}>(vault, 'post', {id});
  const view = usePages<{id: string; text: string; user: Person}>(vault, 'comments', {id});
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    setPending(true);
    setError('');
    try {
      await request('comment', {id, text: draft});
      setDraft('');
      view.retry();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return <div className="xg-center">
    <div className="xg-page-heading"><Link className="xg-icon" to={paths.home} aria-label="ホームへ戻る"><ArrowLeft/></Link><h1>投稿</h1><Refresh onClick={() => { post.retry(); view.retry(); }} disabled={post.pending}/></div>
    <Feedback error={post.error} pending={!post.data && post.pending} retry={post.retry}/>
    {post.data && <PostCard post={post.data.item} vault={vault}/>}
    <section className="xg-card xg-comments">
      <h2>コメント</h2>
      <Feedback error={view.error || error} pending={!view.data && view.pending} empty={!view.items.length && !view.pending ? 'コメントはありません。' : ''} retry={view.error ? view.retry : undefined}/>
      {view.items.map(comment => <div className="xg-comment" key={comment.id}><PersonRow person={comment.user}/><p>{comment.text}</p></div>)}
      <More {...view}/>
      {post.data && <Composer label="コメントを書く" value={draft} setValue={setDraft} pending={pending} submit={send}/>}
    </section>
  </div>;
}
