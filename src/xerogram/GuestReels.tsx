import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from './AppPicker';

function reelCode(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(url.hostname)
      || url.username || url.password || url.port) return null;
    return /^\/reel\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)?.[1] || null;
  } catch { return null; }
}

export default function GuestReels() {
  const [code, setCode] = useState<string>();
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('url') || '').trim();
    const next = reelCode(value);
    if (!next) { setError('https://www.instagram.com/reel/ から始まるリンクを入力してください。'); return; }
    setError('');
    setCode(next);
  }
  const original = code ? 'https://www.instagram.com/reel/' + code + '/' : '';
  return <main className="xg-shell xg-guest" data-theme="dark">
    <div className="xg-guest-content">
      <header className="xg-brand"><AppIcon/><h1>Xerogram</h1></header>
      <section className="xg-panel">
        <h2>公開リールを見る</h2>
        <p>Instagramで共有されたリールのリンクを貼り付けてください。埋め込みが許可されている公開リールを表示できます。</p>
        <form className="xg-guest-form" onSubmit={submit}>
          <label>リールのリンク<input name="url" type="url" inputMode="url" autoComplete="off" required
            placeholder="https://www.instagram.com/reel/…" maxLength={2048}/></label>
          <button type="submit">リールを表示</button>
        </form>
        {error && <p role="alert" className="xg-error">{error}</p>}
        <Link to="/xerogram">ログインしてXerogramを使う</Link>
      </section>
      {original && <section className="xg-guest-player">
        <iframe key={code} title="公開リール" src={original + 'embed/'} allow="encrypted-media; fullscreen; picture-in-picture"
          sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" allowFullScreen />
        <a href={original} target="_blank" rel="noopener noreferrer">表示されない場合はInstagramで開く</a>
      </section>}
    </div>
  </main>;
}
