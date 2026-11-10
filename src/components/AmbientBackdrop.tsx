import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {usePlayerPreferences} from '../lib/playerPreferences';
import AmbientVideo from './AmbientVideo';
import {ambientVideoUrl} from '../lib/ambientVideo.mjs';
import {ambientScreenMask} from '../lib/ambientMask.mjs';
// A single muted mirror supplies live video colors without reading cross-origin pixels.
export default function AmbientBackdrop({videoId,thumbnail,active=true}:{videoId?:string;thumbnail?:string;active?:boolean}){
 const prefs=usePlayerPreferences();
 const backdrop=useRef<HTMLDivElement>(null);
 const [screenMask,setScreenMask]=useState('');
 const [stretch,setStretch]=useState({width:1,height:1,x:1,y:1});
 const [mirror,setMirror]=useState<{url:string;source:HTMLIFrameElement;portrait:boolean}|null>(null);
 const [videoVisible,setVideoVisible]=useState(false);
 const [hidden,setHidden]=useState(()=>document.hidden);
 useEffect(()=>{if(!active||!prefs.ambient)return;const sync=()=>setHidden(document.hidden);sync();document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[active,prefs.ambient]);
 useLayoutEffect(()=>{
  if(!active||!prefs.ambient)return;
  const player=backdrop.current?.parentElement?.querySelector<HTMLElement>('[data-ambient-player]');
  if(!player){setScreenMask('');return;}
  let scheduled=0;
  const measure=()=>{scheduled=0;const rect=player.getBoundingClientRect();setScreenMask(ambientScreenMask(rect,window.innerWidth,window.innerHeight));const width=Math.max(1,rect.width),height=Math.max(1,rect.height);setStretch(previous=>previous.width===width&&previous.height===height&&previous.x===window.innerWidth/width*1.45&&previous.y===window.innerHeight/height*1.45?previous:{width,height,x:window.innerWidth/width*1.45,y:window.innerHeight/height*1.45});};
  const schedule=()=>{if(!scheduled)scheduled=window.requestAnimationFrame(measure);};
  measure();
  // Capture the route enter transition, which can move a player without resizing it.
  const settle=[100,300,600].map(delay=>window.setTimeout(schedule,delay));
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  observer?.observe(player);
  window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  document.addEventListener('fullscreenchange',schedule);
  return()=>{settle.forEach(window.clearTimeout);if(scheduled)window.cancelAnimationFrame(scheduled);observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.removeEventListener('fullscreenchange',schedule);};
 },[active,prefs.ambient,videoId]);
 useEffect(()=>{
  if(!active||!prefs.ambient||prefs.ambientStrength===0){setMirror(null);return;}
  const root=backdrop.current?.parentElement;if(!root)return;
  const find=()=>{
   const source=root.querySelector<HTMLIFrameElement>('[data-ambient-player] iframe');
   const url=source?ambientVideoUrl(source.src,videoId,window.location.origin):'';
   setMirror(previous=>previous?.source===source&&previous?.url===url?previous:url&&source?{url,source,portrait:root.classList.contains('shorts-player-row')}:null);
  };
  find();const observer=new window.MutationObserver(find);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  return()=>observer.disconnect();
 },[active,prefs.ambient,prefs.ambientStrength,videoId]);
 if(!prefs.ambient||!active)return null;
 const intensity=prefs.ambientStrength/100;
 return <>
  <div ref={backdrop} className="ambient-backdrop ambient-video-anchor" aria-hidden="true"/>
  {intensity>0&&createPortal(<div className={`ambient-concert ambient-video-concert ${hidden?'ambient-concert-paused':''} ${prefs.ambientLive?'':'ambient-concert-static'} ${mirror?.portrait?'ambient-video-portrait':''}`} aria-hidden="true" style={{'--ambient-intensity':intensity,'--ambient-source-width':stretch.width+'px','--ambient-source-height':stretch.height+'px','--ambient-stretch-x':stretch.x,'--ambient-stretch-y':stretch.y,maskImage:screenMask,WebkitMaskImage:screenMask,maskSize:'100% 100%',WebkitMaskSize:'100% 100%',maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat',visibility:screenMask?'visible':'hidden'} as CSSProperties}>
   <div className="ambient-concert-wash ambient-video-surface" style={{visibility:videoVisible?'visible':'hidden'}}>
    {mirror&&<AmbientVideo key={mirror.url} url={mirror.url} source={mirror.source} onVisible={setVideoVisible}/>}
   </div>
  </div>,document.body)}
 </>;
}
