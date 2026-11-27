import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from './AppPicker';

function instagramPath(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    const post = /^\/(p|reel)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname);
    if (post) return { path: '/' + post[1] + '/' + post[2] + '/', story: false };
    const story = /^\/stories\/([A-Za-z0-9_.]{1,30})\/([0-9]{1,30})\/?$/.exec(url.pathname);
    return story ? { path: '/stories/' + story[1] + '/' + story[2] + '/', story: true } : null;
  } catch { return null; }
}

function guestTheme() {
  try {
    const theme = localStorage.getItem('xerogram-theme');
    if (theme === 'light' || theme === 'dark') return theme;
  } catch { /* Theme follows the OS when storage is unavailable. */ }
  return 'auto';
}

export default function GuestReels() {
  const [media, setMedia] = useState<ReturnType<typeof instagramPath>>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('url') || '').trim();
    const next = instagramPath(value);
    if (!next) { setMedia(null); setError('Instagramの投稿・リール・ストーリーの共有リンクを入力してください。'); return; }
    setError('');
    setMedia(next);
  }
  const original = media ? 'https://www.instagram.com' + media.path : '';
  const search = (filter: string) => 'https://www.google.com/search?' + new URLSearchParams({ q: filter + ' ' + query.trim() });
  return <main className="xg-shell xg-guest" data-theme={guestTheme()}>
    <div className="xg-guest-content">
      <header className="xg-brand"><AppIcon/><h1>Xerogram</h1></header>
      <section className="xg-panel">
        <h2>公開投稿・リールを見る</h2>
        <p>公開投稿やリールの共有リンクを貼り付けると、埋め込みが許可されたものを表示できます。</p>
        <form className="xg-guest-form" onSubmit={submit}>
          <label>Instagramの共有リンク<input name="url" type="url" inputMode="url" autoComplete="off" required
            placeholder="https://www.instagram.com/reel/…" maxLength={2048}/></label>
          <button type="submit">リンクを確認</button>
        </form>
        {error && <p role="alert" className="xg-error">{error}</p>}
        <Link to="/xerogram">ログインしてXerogramを使う</Link>
      </section>
      <section className="xg-panel">
        <h2>公開投稿を探す</h2>
        <label>キーワード<input type="search" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="アカウント名・ハッシュタグなど"/></label>
        <p>Googleに掲載されている公開コンテンツを検索し、共有リンクをこの画面で開けます。</p>
        {!!query.trim() && <div className="xg-actions">
          <a href={search('site:instagram.com/p/')} target="_blank" rel="noopener noreferrer">Googleで投稿を検索</a>
          <a href={search('site:instagram.com/reel/')} target="_blank" rel="noopener noreferrer">Googleでリールを検索</a>
        </div>}
      </section>
      {original && <section className="xg-guest-player">
        {media.story ? <p>ストーリーはInstagramで開きます。視聴時にログインが求められる場合があります。</p> :
        <iframe key={original} title="Instagramの公開投稿" src={original + 'embed/'} allow="encrypted-media; fullscreen; picture-in-picture"
          sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" allowFullScreen />}
        <a href={original} target="_blank" rel="noopener noreferrer">Instagramで開く</a>
      </section>}
    </div>
  </main>;
}
