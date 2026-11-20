import {useState} from 'react';
import {ArrowUpRight, Compass, Search, TrendingUp} from 'lucide-react';
import AppSwitcher from '../components/AppSwitcher';
import './social.css';

export default function XWorkspace() {
 const [query, setQuery] = useState('');
 return <main className="x-workspace">
  <header><AppSwitcher/><a href="https://x.com/i/flow/login" target="_blank" rel="noopener noreferrer">Xでログイン <ArrowUpRight size={16}/></a></header>
  <div className="x-workspace-content">
   <div className="x-workspace-intro"><span className="x-service-mark" aria-hidden="true">↗</span><h1>X</h1></div>
   <form action="https://x.com/search" method="get" target="_blank" rel="noopener">
    <label htmlFor="x-query">Xで投稿を検索</label>
    <div><input id="x-query" name="q" value={query} onChange={event => setQuery(event.target.value)} required maxLength={100}/><button type="submit" disabled={!query.trim()}><Search size={18}/>検索</button></div>
   </form>
   <nav aria-label="Xの機能">
    <a href="https://x.com/home" target="_blank" rel="noopener noreferrer"><Compass size={24}/><span>ホーム・おすすめ</span><ArrowUpRight size={16}/></a>
    <a href="https://x.com/explore/tabs/trending" target="_blank" rel="noopener noreferrer"><TrendingUp size={24}/><span>トレンド</span><ArrowUpRight size={16}/></a>
   </nav>
   <p>検索結果やおすすめはXで開きます。</p>
  </div>
 </main>;
}
