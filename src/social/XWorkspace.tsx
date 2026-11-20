import {useState} from 'react';
import {ArrowUpRight, Compass, Search, TrendingUp} from 'lucide-react';
import AppSwitcher from '../components/AppSwitcher';
import './social.css';

export default function XWorkspace() {
 const [query, setQuery] = useState('');
 const [postUrl, setPostUrl] = useState('');
 const [post, setPost] = useState<{url:string; author:string; text:string} | null>(null);
 const [error, setError] = useState('');
 const [loading, setLoading] = useState(false);

 const loadPost = async () => {
  if (loading || !postUrl.trim()) return;
  setLoading(true);setError('');setPost(null);
  try {
   const response = await fetch('/api/x-public-post?' + new URLSearchParams({url:postUrl.trim()}), {signal:AbortSignal.timeout(10000)});
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || '投稿を取得できませんでした。');
   setPost(result);
  } catch (cause) {
   setError(cause instanceof Error ? cause.message : '投稿を取得できませんでした。');
  } finally {
   setLoading(false);
  }
 };
 return <main className="x-workspace">
  <aside className="x-rail">
   <AppSwitcher/>
   <nav aria-label="Xの機能">
    <a href="https://x.com/home" target="_blank" rel="noopener noreferrer"><Compass size={22}/><span>ホーム・おすすめ</span><ArrowUpRight size={15}/></a>
    <a href="https://x.com/explore/tabs/trending" target="_blank" rel="noopener noreferrer"><TrendingUp size={22}/><span>トレンド</span><ArrowUpRight size={15}/></a>
   </nav>
   <a className="x-login" href="https://x.com/i/flow/login" target="_blank" rel="noopener noreferrer">Xでログイン <ArrowUpRight size={16}/></a>
  </aside>
  <section className="x-workspace-content" aria-labelledby="x-home-title">
   <header className="x-workspace-intro"><img className="x-service-mark" src="/app-icons/x.webp" alt="" width={30} height={30}/><h1 id="x-home-title">ホーム</h1></header>
   <form className="x-preview-form" onSubmit={event=>{event.preventDefault();void loadPost();}}>
    <label htmlFor="x-post-url">公開投稿をプレビュー</label>
    <div><input id="x-post-url" type="url" value={postUrl} onChange={event=>setPostUrl(event.target.value)} required maxLength={2048} placeholder="https://x.com/…/status/…"/><button type="submit" disabled={loading || !postUrl.trim()}>{loading?'取得中…':'表示'}</button></div>
   </form>
   {error && <p role="alert" className="x-post-error">{error}</p>}
   {post && <article className="x-post-preview"><b>{post.author}</b><p>{post.text}</p><a href={post.url} target="_blank" rel="noopener noreferrer">Xで投稿を開く</a></article>}
  </section>
  <aside className="x-discovery">
   <form action="https://x.com/search" method="get" target="_blank" rel="noopener">
    <label htmlFor="x-query">Xで投稿を検索</label>
    <div><input id="x-query" name="q" value={query} onChange={event=>setQuery(event.target.value)} required maxLength={100}/><button type="submit" disabled={!query.trim()} aria-label="Xで検索"><Search size={19}/></button></div>
   </form>
  </aside>
 </main>;
}
