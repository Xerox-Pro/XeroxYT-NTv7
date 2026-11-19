import {useEffect,useRef,useState} from 'react';
import {Play,Pause,Volume2,VolumeX,ExternalLink} from 'lucide-react';
import {Item,learn} from './client';
import {parseSocialLink} from './services.mjs';

// Use HTMLVideoElement progressive media loading (including HTTP Range where
// supported by the source) rather than downloading full files into the app.
export default function TikTokPlayer({item,active,preload=false}:{item:Item;active:boolean;preload?:boolean}){
 const video=useRef<HTMLVideoElement>(null),last=useRef(0),completed=useRef(false);
 const [muted,setMuted]=useState(true),[paused,setPaused]=useState(false),[failed,setFailed]=useState(false),[progress,setProgress]=useState(0);
 const source=item.media&&!failed?item.media:'';
 const fallback=parseSocialLink(item.url,'tiktok')?.embed||'';
 useEffect(()=>{setPaused(false);setFailed(false);setProgress(0);last.current=0;completed.current=false;},[item.id,item.media]);
 useEffect(()=>{
  const node=video.current;if(!node)return;
  if(!active){node.pause();setPaused(false);return;}
  const start=()=>node.play().then(()=>setPaused(false)).catch(()=>setPaused(true));void start();
  return()=>node.pause();
 },[active,source,item.id]);
 const toggle=()=>{const node=video.current;if(!node)return;if(node.paused)void node.play().then(()=>setPaused(false)).catch(()=>{});else{node.pause();setPaused(true);}};
 const track=()=>{const node=video.current;if(!node||!active||!Number.isFinite(node.duration)||node.duration<=0)return;
  setProgress(Math.min(1,node.currentTime/node.duration));
  if(node.currentTime-last.current>=3){learn('tiktok',item,'watch',Math.min(5,node.currentTime-last.current)/node.duration);last.current=node.currentTime;}
  if(node.currentTime/node.duration>.9&&!completed.current){completed.current=true;learn('tiktok',item,'complete');}
 };
 return <div className="tt-player">
  {source?<video key={item.id} ref={video} src={source} poster={item.thumbnail} playsInline muted={muted} loop preload={active||preload?'metadata':'none'} onTimeUpdate={track} onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} onError={()=>setFailed(true)} aria-label={item.title||'TikTok動画'} onClick={toggle}/>:active&&fallback?<iframe key={item.id} title={item.title||'TikTok動画'} src={fallback+(fallback.includes('?')?'&':'?')+'autoplay=1&muted=1&loop=1'} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<div className="tt-player-unavailable">{item.thumbnail&&<img src={item.thumbnail} alt="" loading="lazy"/>}<a href={item.url} target="_blank" rel="noopener noreferrer">TikTokで開く <ExternalLink size={17}/></a></div>}
  {source&&<>
    {paused&&active&&<button className="tt-center-play" aria-label="再生" onClick={toggle}><Play size={38} fill="currentColor"/></button>}
    <button className="tt-volume" aria-label={muted?'音声をオン':'ミュート'} onClick={()=>setMuted(value=>!value)}>{muted?<VolumeX size={22}/>:<Volume2 size={22}/>}</button>
    <input className="tt-progress" type="range" min="0" max="1000" step="1" value={Math.round(progress*1000)} aria-label="動画の再生位置" onChange={event=>{const node=video.current;if(node&&Number.isFinite(node.duration))node.currentTime=Number(event.target.value)/1000*node.duration;}}/>
   </>}
  {failed&&<a className="tt-fallback-link" href={item.url} target="_blank" rel="noopener noreferrer">再生できない場合はTikTokで開く <ExternalLink size={14}/></a>}
 </div>;
}
