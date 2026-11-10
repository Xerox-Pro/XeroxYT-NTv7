import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {usePlayerPreferences} from '../lib/playerPreferences';
import {ambientScreenMask} from '../lib/ambientMask.mjs';
// Public video images supply the palette; this animation does not analyze audio.
export default function AmbientBackdrop({videoId,thumbnail,active=true}:{videoId?:string;thumbnail?:string;active?:boolean}){
 const prefs=usePlayerPreferences();
 const backdrop=useRef<HTMLDivElement>(null);
 const [screenMask,setScreenMask]=useState('');
 const source=thumbnail|| (videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:'');
 const [failed,setFailed]=useState('');
 const [hidden,setHidden]=useState(()=>document.hidden);
 useEffect(()=>{if(!active||!prefs.ambient)return;const sync=()=>setHidden(document.hidden);sync();document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[active,prefs.ambient]);
 useLayoutEffect(()=>{
  if(!active||!prefs.ambient)return;
  const player=backdrop.current?.parentElement?.querySelector<HTMLElement>('[data-ambient-player]');
  if(!player){setScreenMask('');return;}
  let scheduled=0;
  const measure=()=>{scheduled=0;setScreenMask(ambientScreenMask(player.getBoundingClientRect(),window.innerWidth,window.innerHeight));};
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
 },[active,prefs.ambient,source,failed]);
 if(!prefs.ambient||!active||!source||failed===source)return null;
 const intensity=prefs.ambientStrength/100;
 return <>
  <div ref={backdrop} className="ambient-backdrop ambient-backdrop-live" aria-hidden="true" style={{opacity:intensity}}><img key={source} src={source} alt="" draggable={false} onError={()=>setFailed(source)}/></div>
  {intensity>0&&createPortal(<div className={`ambient-concert ${hidden?'ambient-concert-paused':''} ${prefs.ambientLive?'':'ambient-concert-static'}`} aria-hidden="true" style={{'--ambient-intensity':intensity,maskImage:screenMask,WebkitMaskImage:screenMask,maskSize:'100% 100%',WebkitMaskSize:'100% 100%',maskRepeat:'no-repeat',WebkitMaskRepeat:'no-repeat',visibility:screenMask?'visible':'hidden'} as CSSProperties}>
   <div className="ambient-concert-wash"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-beam ambient-concert-beam-left"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-beam ambient-concert-beam-right"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-halo"/>
  </div>,document.body)}
 </>;
}
