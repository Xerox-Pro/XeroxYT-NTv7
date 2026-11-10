import {useCallback,useEffect,useRef,useState} from 'react';
type SourceState={time:number|null;state:number;rate:number};
export default function AmbientVideo({url,source,onVisible}:{url:string;source:HTMLIFrameElement;onVisible:(visible:boolean)=>void}){
 const frame=useRef<HTMLIFrameElement>(null);
 const latest=useRef<SourceState>({time:null,state:-1,rate:1});
 const mirrorTime=useRef<number|null>(null);
 const lastSeek=useRef(0);
 const ready=useRef(false);
 const [failed,setFailed]=useState(false);
 const visible=useRef(onVisible);visible.current=onVisible;
 const command=useCallback((func:string,args:unknown[]=[])=>{frame.current?.contentWindow?.postMessage(JSON.stringify({event:'command',func,args}),new URL(url).origin);},[url]);
 const sync=useCallback((force=false)=>{
  if(!ready.current)return;
  command('mute');
  if(document.hidden){command('pauseVideo');return;}
  const state=latest.current;
  if(state.time!==null&&(force||mirrorTime.current===null||Math.abs(state.time-mirrorTime.current)>1.25)&&Date.now()-lastSeek.current>1000){command('seekTo',[state.time,true]);lastSeek.current=Date.now();mirrorTime.current=state.time;}
  command('setPlaybackRate',[state.rate]);
  command(state.state===1?'playVideo':'pauseVideo');
 },[command]);
 useEffect(()=>{
  ready.current=false;setFailed(false);mirrorTime.current=null;lastSeek.current=0;latest.current={time:null,state:-1,rate:1};visible.current(false);
  const receive=(event:MessageEvent)=>{
   const foreground=event.source===source.contentWindow&&event.origin===new URL(source.src).origin;
   const background=event.source===frame.current?.contentWindow&&event.origin===new URL(url).origin;
   if(!foreground&&!background)return;
   try{
    const data=typeof event.data==='string'?JSON.parse(event.data):event.data;
    if(!data||typeof data!=='object')return;
    const info=data.info&&typeof data.info==='object'?data.info:{};
    const state=data.event==='onStateChange'&&typeof data.info==='number'?data.info:info.playerState;
    if(foreground){
     if(!['infoDelivery','initialDelivery','onStateChange'].includes(data.event))return;
     if(Number.isFinite(info.currentTime)&&info.currentTime>=0)latest.current.time=info.currentTime;
     const rateChanged=Number.isFinite(info.playbackRate)&&info.playbackRate>0&&latest.current.rate!==info.playbackRate;
     if(Number.isFinite(info.playbackRate)&&info.playbackRate>0)latest.current.rate=info.playbackRate;
     const changed=typeof state==='number'&&latest.current.state!==state;
     if(typeof state==='number')latest.current.state=state;
     // Do not repeatedly send playVideo on every time update.
     if(changed||rateChanged||latest.current.time!==null&&(mirrorTime.current===null||Math.abs(latest.current.time-mirrorTime.current)>1.25))sync();
    }else{
     if(data.event==='onError'){setFailed(true);visible.current(false);command('pauseVideo');return;}
     if(data.event==='onReady'){ready.current=true;sync(true);}
     if(['infoDelivery','initialDelivery','onStateChange'].includes(data.event)){
      const first=!ready.current;ready.current=true;
      if(Number.isFinite(info.currentTime))mirrorTime.current=info.currentTime;
      if(state===1||state===2&&Number.isFinite(info.currentTime)){visible.current(true);command('mute');}
      if(first)sync(true);
      if(info.muted===false)command('mute');
      if(latest.current.state!==1||document.hidden)command('pauseVideo');
     }
    }
   }catch{/* Ignore messages that are not public player events. */}
  };
  const resume=()=>sync(true);
  window.addEventListener('message',receive);document.addEventListener('visibilitychange',resume);
  return()=>{command('pauseVideo');visible.current(false);window.removeEventListener('message',receive);document.removeEventListener('visibilitychange',resume);};
 },[url,source,sync,command]);
 if(failed)return null;
 return <iframe ref={frame} src={url} title="アンビエント背景（無音）" tabIndex={-1} aria-hidden="true" className="ambient-video-iframe" allow="autoplay; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>{
  const send=(target:HTMLIFrameElement)=>target.contentWindow?.postMessage(JSON.stringify({event:'listening'}),new URL(target.src).origin);
  if(frame.current){send(frame.current);command('addEventListener',['onReady']);command('addEventListener',['onStateChange']);command('addEventListener',['onError']);command('mute');}
  send(source);
 }}/ >;
}
