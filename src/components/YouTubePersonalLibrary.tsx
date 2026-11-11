import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {fetchJSON} from '../utils';
import type {Video} from '../types';
const tabs=[['liked','高評価'],['watch-later','後で見る'],['history','YouTubeの履歴'],['subscriptions','登録チャンネルの動画'],['playlists','再生リスト'],['channels','登録チャンネル']] as const;
type Item=Video&{id?:string;avatar?:string;thumbnail?:string;videoCount?:number};
export default function YouTubePersonalLibrary({onVideoSelect,onPlaylistPlay,initialKind='liked',initialTitle=''}:{initialKind?:string;initialTitle?:string;onVideoSelect:(id:string,video?:Video)=>void;onPlaylistPlay?:(id:string,title:string,videos:Video[],startId:string)=>void}){
 const [kind,setKind]=useState<string>(initialKind),[title,setTitle]=useState(initialTitle),[items,setItems]=useState<Item[]>([]),[cursor,setCursor]=useState(''),[hasMore,setHasMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),locked=useRef(false);
 const load=async(append=false)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');const current=generation.current;
  try{const playlist=kind.startsWith('playlist:');const path=playlist?'/api/user/playlist/'+encodeURIComponent(kind.slice(9)):'/api/user/feed/'+kind;const data=await fetchJSON(path+'?continuation='+encodeURIComponent(append?cursor:''));if(current!==generation.current)return;
   const next:Item[]=kind==='playlists'?data.playlists||[]:kind==='channels'?data.channels||[]:data.videos||[];
   setItems(previous=>[...new Map((append?[...previous,...next]:next).map(item=>[item.videoId||item.id,item])).values()]);setCursor(data.continuation||'');setHasMore(!!data.hasMore);
  }catch(e:any){if(current===generation.current)setError(e.message||'一覧を取得できませんでした。');}finally{if(current===generation.current){locked.current=false;setBusy(false);}}
 };
 useEffect(()=>{generation.current++;locked.current=false;setItems([]);setCursor('');setHasMore(false);void load();return()=>{generation.current++;};},[kind]);
 return <div><div className="youtube-feed-tabs" role="group" aria-label="YouTubeの個人データ">{tabs.map(([value,label])=><button aria-pressed={kind===value} key={value} onClick={()=>{setKind(value);setTitle('');}}>{label}</button>)}</div>
 {title&&<h3>{title}</h3>}{error&&<p role="alert">{error}<button onClick={()=>void load(items.length>0)}>再試行</button></p>}
 <div className="youtube-personal-list">{items.map(item=>kind==='channels'?<Link key={item.id} to={'/channel/'+item.id}>{item.avatar&&<img src={item.avatar} alt="" className="youtube-account-avatar"/>}{item.title}</Link>:<button key={item.videoId||item.id} onClick={()=>{if(kind==='playlists'&&item.id){setKind('playlist:'+item.id);setTitle(item.title);}else if(item.videoId){if(kind.startsWith('playlist:')&&onPlaylistPlay)onPlaylistPlay(kind.slice(9),title,items,item.videoId);else onVideoSelect(item.videoId,item);}}}>{(item.videoThumbnails?.[0]?.url||item.thumbnail)&&<img src={item.videoThumbnails?.[0]?.url||item.thumbnail} alt="" loading="lazy"/>}<span>{item.title}<small>{item.author|| (item.videoCount?`${item.videoCount}本の動画`:'')}</small></span></button>)}</div>
 {busy&&<p role="status">読み込み中…</p>}{!busy&&!error&&!items.length&&<p>表示できる項目はありません。</p>}{hasMore&&<button disabled={busy} onClick={()=>void load(true)}>{busy?'読み込み中…':'もっと読み込む'}</button>}
 </div>;
}
