import {useEffect,useState} from 'react';
import {Home,Clapperboard,Send,ExternalLink,RefreshCw,Camera,LogIn,ShieldCheck} from 'lucide-react';
import AppSwitcher from '../components/AppSwitcher';
import './social.css';
import './instagram-beta.css';
type Media={id:string;user:{username:string;avatar?:string};image?:string;video?:string;caption?:string;code?:string};
type Data={connected?:boolean;items?:Media[];users?:{user:{id:string;username:string;avatar?:string};items:Media[]}[];threads?:{id:string;title:string}[]};
const official='https://www.instagram.com/';
async function get(op:string,signal:AbortSignal):Promise<Data>{
 const r=await fetch('/api/instagram-beta?op='+encodeURIComponent(op),{credentials:'same-origin',cache:'no-store',signal});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.detail||'β版の接続設定を確認してください。');
 return d;
}
function MediaCard({item}:{item:Media}){
 return <article className="social-post"><div className="social-post-content"><header><span>{item.user.avatar&&<img className="ig-beta-avatar" src={item.user.avatar} alt="" referrerPolicy="no-referrer"/>}<b>{item.user.username}</b></span>{item.code&&<a href={official+'p/'+encodeURIComponent(item.code)+'/'} rel="noreferrer"><ExternalLink size={18}/></a>}</header><div className="social-post-media">{item.video?<video src={item.video} poster={item.image} controls playsInline preload="none"/>:item.image?<img src={item.image} loading="lazy" alt="Instagram投稿" referrerPolicy="no-referrer"/>:<p>表示できるメディアがありません。</p>}</div><div className="social-caption"><p>{item.caption}</p></div></div></article>;
}
const tabs=[{id:'feed',name:'ホーム',Icon:Home,link:official},{id:'reels',name:'リール',Icon:Clapperboard,link:official+'reels/'},{id:'stories',name:'ストーリー',Icon:Camera,link:official},{id:'dm',name:'メッセージ',Icon:Send,link:official+'direct/inbox/'}];
export default function InstagramWorkspace(){
 const [tab,setTab]=useState('feed'),[connected,setConnected]=useState(false),[data,setData]=useState<Data>({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');setData({});get('health',c.signal).then(async h=>{if(c.signal.aborted)return;setConnected(!!h.connected);if(h.connected)setData(await get(tab,c.signal))}).catch(e=>{if(!c.signal.aborted){setConnected(false);setError(e.message)}}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[tab,refresh]);
 const current=tabs.find(t=>t.id===tab)||tabs[0];
 const menu=tabs.map(({id,name,Icon})=><button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={24}/><span>{name}</span></button>);
 return <div className="social-app instagram-mode ig-beta"><aside className="social-sidebar"><AppSwitcher/><div className="ig-beta-wordmark"><img src="/app-icons/instagram-beta.webp" alt=""/>Instagram <small>β</small></div>{menu}<a href={official} rel="noreferrer"><ShieldCheck/>公式の設定・安全機能</a></aside><div className="social-body"><header className="social-mobile-header"><AppSwitcher/><span>Instagram <small>β</small></span></header><div className="social-page-heading"><h1>{current.name} <span className="ig-beta-pill">BETA</span></h1><button onClick={()=>setRefresh(n=>n+1)} disabled={loading} aria-label="更新"><RefreshCw size={20}/></button></div>
 {loading&&<p className="social-notice" role="status">接続状態を確認中…</p>}{error&&<p className="social-alert" role="alert">{error}</p>}
 {!connected&&!loading?<section className="ig-beta-connect"><img src="/app-icons/instagram-beta.webp" alt=""/><h2>Instagram β版</h2><p>公式Instagramでログインしてください。現在のβ版ではInstagramのパスワードやログインCookieを収集しません。</p><a className="ig-beta-primary" href={current.link} rel="noreferrer"><LogIn size={18}/>公式Instagramを開く</a><small>Xerox独自の非公式ワークスペースです。公式認証連携は未対応です。</small></section>:<div className="social-home-feed">{(data.items||[]).map(m=><MediaCard key={m.id} item={m}/>)}{(data.users||[]).map(r=><section key={r.user.id}><h3>{r.user.username}</h3>{r.items.map(m=><MediaCard key={m.id} item={m}/>)}</section>)}{(data.threads||[]).map(t=><p key={t.id}>{t.title}</p>)}<a href={current.link} rel="noreferrer">公式Instagramで開く</a></div>}
 </div><nav className="social-bottom-nav">{menu}</nav></div>;
}
