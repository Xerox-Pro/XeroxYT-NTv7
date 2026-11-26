import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Bookmark, Camera, ChevronLeft, ChevronRight, CircleUserRound, Heart, MessageCircle, RefreshCw, Send} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Vault, request, type Asset, type Person, type Post} from './data';

export const root = '/xerogram';
export const paths = {
  home: root, explore: root + '/explore', reels: root + '/reels',
  messages: root + '/messages', profile: root + '/profile', settings: root + '/settings',
};
export const profilePath = (id: string) => paths.profile + '/' + id;

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return date.toLocaleString('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

export function Avatar({person, large = false}: {person?: Person; large?: boolean}) {
  const [broken, setBroken] = useState('');
  return <span className={'xg-avatar' + (large ? ' xg-avatar-large' : '')} aria-hidden="true">
    {person?.avatar && broken !== person.avatar
      ? <img src={person.avatar} alt="" loading="lazy" onError={() => setBroken(person.avatar)}/>
      : <CircleUserRound size={large ? 38 : 20}/>}
  </span>;
}

export function PersonRow({person}: {person: Person}) {
  if (!person.id || !person.handle) return null;
  return <Link className="xg-person" to={profilePath(person.id)}>
    <Avatar person={person}/><span><strong>{person.name || person.handle}</strong><small>@{person.handle}</small></span>
    <ChevronRight size={16}/>
  </Link>;
}

export function Feedback({error, pending, empty, retry}: {error?: string; pending?: boolean; empty?: string; retry?: () => void}) {
  if (error) return <div className="xg-feedback" role="alert">{error}{retry && <button onClick={retry}>再試行</button>}</div>;
  if (pending) return <div className="xg-feedback" role="status"><RefreshCw size={17} className="xg-spin"/>読み込み中</div>;
  return empty ? <div className="xg-feedback">{empty}</div> : null;
}

export function Refresh({onClick, disabled}: {onClick: () => void; disabled?: boolean}) {
  return <button className="xg-icon" type="button" aria-label="更新" title="更新" onClick={onClick} disabled={disabled}><RefreshCw size={19}/></button>;
}

export function More({next, more, loadingMore, pageError}: {
  next?: string; more: () => void; loadingMore: boolean; pageError: string;
}) {
  return <>{pageError && <Feedback error={pageError}/>}
    {next && <button className="xg-secondary xg-more" onClick={more} disabled={loadingMore}>{loadingMore ? '読み込み中…' : 'さらに表示'}</button>}
  </>;
}

export function MediaDisplay({asset, description, reel = false}: {asset: Asset; description: string; reel?: boolean}) {
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = video.current;
    if (!node || !reel || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        void node.play().catch(() => {});
      } else {
        node.pause();
      }
    }, {threshold: [0, 0.6, 1]});
    observer.observe(node);
    return () => { observer.disconnect(); node.pause(); };
  }, [asset.video, reel]);

  if (failed || (!asset.video && !asset.image)) return <div className="xg-media-empty"><Camera size={24}/>メディアを読み込めません。ページを更新してください。</div>;
  if (asset.video) return <video ref={video} src={asset.video} poster={asset.image || undefined} muted={reel} loop={reel} controls playsInline preload="none" onError={() => setFailed(true)} aria-label={description}/>;
  return <img src={asset.image} loading="lazy" alt={description} onError={() => setFailed(true)}/>;
}

export function PostCard({post, vault, reel = false}: {post: Post; vault: Vault; reel?: boolean}) {
  const [slide, setSlide] = useState(0);
  const [interactions, setInteractions] = useState<{liked?: boolean; saved?: boolean}>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = 'interactions:' + post.id;
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    void vault.read<typeof interactions>(key).then(value => { if (active && value) setInteractions(value); });
    return () => { active = false; };
  }, [key, vault]);

  async function toggle(kind: 'liked' | 'saved') {
    if (lock.current) return;
    lock.current = true;
    const next = !(interactions[kind] ?? post[kind]);
    const action = kind === 'liked' ? (next ? 'like' : 'unlike') : (next ? 'save' : 'unsave');
    setBusy(true);
    setError('');
    try {
      await request(action, {id: post.id});
      const updated = {...interactions, [kind]: next};
      setInteractions(updated);
      await vault.write(key, updated);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  const asset = post.assets[slide];
  return <article className={'xg-card xg-post' + (reel ? ' xg-reel' : '')}>
    <div className="xg-post-author"><PersonRow person={post.user}/>{post.time && <time dateTime={post.time}>{formatTime(post.time)}</time>}</div>
    {asset && <div className="xg-media">
      <MediaDisplay key={asset.video || asset.image} asset={asset} description={post.caption.slice(0, 100) || '投稿メディア'} reel={reel}/>
      {post.assets.length > 1 && <>
        {slide > 0 && <button className="xg-media-arrow xg-prev" aria-label="前の写真" onClick={() => setSlide(slide - 1)}><ChevronLeft/></button>}
        {slide + 1 < post.assets.length && <button className="xg-media-arrow xg-next" aria-label="次の写真" onClick={() => setSlide(slide + 1)}><ChevronRight/></button>}
        <span className="xg-media-counter">{slide + 1} / {post.assets.length}</span>
      </>}
    </div>}
    <div className="xg-post-body">
      <div className="xg-post-actions">
        <button className="xg-icon xg-like" aria-label="いいね" aria-pressed={interactions.liked ?? !!post.liked} disabled={busy} onClick={() => void toggle('liked')}><Heart size={22}/></button>
        <Link className="xg-icon" aria-label="コメント" to={root + '/post/' + post.id} onClick={() => primePost(vault, post)}><MessageCircle size={22}/></Link>
        <button className="xg-icon xg-save" aria-label="保存" aria-pressed={interactions.saved ?? !!post.saved} disabled={busy} onClick={() => void toggle('saved')}><Bookmark size={22}/></button>
      </div>
      {post.likes > 0 && <div className="xg-count">いいね {post.likes.toLocaleString('ja-JP')}件</div>}
      {post.caption && <p>{post.caption}</p>}
      {post.comments > 0 && <Link className="xg-muted" to={root + '/post/' + post.id} onClick={() => primePost(vault, post)}>コメント {post.comments}件</Link>}
      <Feedback error={error}/>
    </div>
  </article>;
}

export function Composer({label, value, setValue, pending, submit, max = 1000}: {
  label: string; value: string; setValue: (value: string) => void; pending: boolean; submit: (event: FormEvent) => void; max?: number;
}) {
  return <form className="xg-composer" onSubmit={submit}>
    <textarea rows={1} aria-label={label} placeholder={label} maxLength={max} required value={value} onChange={event => setValue(event.target.value)}/>
    <button type="submit" className="xg-primary" disabled={pending || !value.trim()} aria-label="送信"><Send size={18}/></button>
  </form>;
}

export function primePost(vault: Vault, post: Post) {
  const key = 'post' + JSON.stringify({id: post.id});
  if (!vault.memory.has(key)) void vault.write(key, {item: post});
}