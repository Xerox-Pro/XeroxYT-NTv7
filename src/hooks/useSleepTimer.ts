import {useEffect,useRef} from 'react';
import {readPlayerPreferences,updatePlayerPreferences,usePlayerPreferences} from '../lib/playerPreferences';
export function consumeEndTimer(){if(!readPlayerPreferences().stopAtEnd)return false;updatePlayerPreferences({stopAtEnd:false});return true;}
export function useSleepTimer(onStop:()=>void){
 const prefs=usePlayerPreferences();const stop=useRef(onStop);stop.current=onStop;
 useEffect(()=>{const pause=()=>stop.current();window.addEventListener('xerox-sleep-expired',pause);return()=>window.removeEventListener('xerox-sleep-expired',pause);},[]);
 useEffect(()=>{
  if(!prefs.sleepUntil)return;
  const check=()=>{if(readPlayerPreferences().sleepUntil===prefs.sleepUntil&&Date.now()>=prefs.sleepUntil){updatePlayerPreferences({sleepUntil:0});window.dispatchEvent(new Event('xerox-sleep-expired'));}};
  const timer=setInterval(check,1000);check();window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);
  return()=>{clearInterval(timer);window.removeEventListener('pageshow',check);document.removeEventListener('visibilitychange',check);};
 },[prefs.sleepUntil]);
}
