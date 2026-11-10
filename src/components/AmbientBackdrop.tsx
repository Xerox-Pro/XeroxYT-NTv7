import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {usePlayerPreferences} from '../lib/playerPreferences';
// Public video images supply the palette; this animation does not analyze audio.
export default function AmbientBackdrop({videoId,thumbnail,active=true}:{videoId?:string;thumbnail?:string;active?:boolean}){
 const prefs=usePlayerPreferences();
 const source=thumbnail|| (videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:'');
 const [failed,setFailed]=useState('');
 const [hidden,setHidden]=useState(()=>document.hidden);
 useEffect(()=>{if(!active||!prefs.ambient)return;const sync=()=>setHidden(document.hidden);sync();document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[active,prefs.ambient]);
 if(!prefs.ambient||!active||!source||failed===source)return null;
 const intensity=prefs.ambientStrength/100;
 return <>
  <div className="ambient-backdrop ambient-backdrop-live" aria-hidden="true" style={{opacity:intensity}}><img key={source} src={source} alt="" draggable={false} onError={()=>setFailed(source)}/></div>
  {intensity>0&&createPortal(<div className={`ambient-concert ${hidden?'ambient-concert-paused':''} ${prefs.ambientLive?'':'ambient-concert-static'}`} aria-hidden="true" style={{'--ambient-intensity':intensity} as CSSProperties}>
   <div className="ambient-concert-wash"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-beam ambient-concert-beam-left"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-beam ambient-concert-beam-right"><img src={source} alt="" draggable={false}/></div>
   <div className="ambient-concert-halo"/>
  </div>,document.body)}
 </>;
}
