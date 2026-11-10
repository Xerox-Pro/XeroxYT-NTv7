import {useState} from 'react';
import {usePlayerPreferences} from '../lib/playerPreferences';
// Uses the video's public thumbnail. Cross-origin embeds cannot expose live pixels.
export default function AmbientBackdrop({videoId,thumbnail,active=true}:{videoId?:string;thumbnail?:string;active?:boolean}){
 const prefs=usePlayerPreferences();
 const source=thumbnail|| (videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:'');
 const [failed,setFailed]=useState('');
 if(!prefs.ambient||!active||!source||failed===source)return null;
 return <div className="ambient-backdrop" aria-hidden="true" style={{opacity:prefs.ambientStrength/100}}><img key={source} src={source} alt="" draggable={false} onError={()=>setFailed(source)}/></div>;
}
