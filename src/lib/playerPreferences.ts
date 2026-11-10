import {useSyncExternalStore} from 'react';
export const playerDefaults = {ambient:true, ambientLive:false, ambientStrength:90, brightness:100, contrast:100, saturation:100, warmth:0, sleepUntil:0, stopAtEnd:false, miniOpacity:100, miniSnap:true};
export type PlayerPreferences = typeof playerDefaults;
const key='xerox_player_preferences_v1';
let snapshot:PlayerPreferences|undefined;
const listeners=new Set<()=>void>();
export function readPlayerPreferences():PlayerPreferences {
 if(snapshot)return snapshot;
 let data:Partial<PlayerPreferences>={};try{data=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
 snapshot={...playerDefaults};
 for(const name of ['ambientLive','stopAtEnd','miniSnap'] as const)if(typeof data[name]==='boolean')snapshot[name]=data[name];
 const ranges={ambientStrength:[20,100],brightness:[50,150],contrast:[50,150],saturation:[0,200],warmth:[0,60],sleepUntil:[0,Number.MAX_SAFE_INTEGER],miniOpacity:[40,100]};
 for(const [name,[min,max]] of Object.entries(ranges)){const value=data[name];if(typeof value==='number'&&Number.isFinite(value))snapshot[name]=Math.max(min,Math.min(max,value));}
 return snapshot;
}
export function updatePlayerPreferences(patch:Partial<PlayerPreferences>){snapshot={...readPlayerPreferences(),...patch,ambient:true};snapshot.ambientStrength=Math.max(20,Math.min(100,snapshot.ambientStrength));try{localStorage.setItem(key,JSON.stringify(snapshot));}catch{}listeners.forEach(listener=>listener());}
function subscribe(listener:()=>void){listeners.add(listener);const sync=(e:StorageEvent)=>{if(e.key===key){snapshot=undefined;listener();}};window.addEventListener('storage',sync);return()=>{listeners.delete(listener);window.removeEventListener('storage',sync);};}
export function usePlayerPreferences(){return useSyncExternalStore(subscribe,readPlayerPreferences,()=>playerDefaults);}
export function videoEffectsStyle(p:PlayerPreferences){return {filter:`brightness(${p.brightness}%) contrast(${p.contrast}%) saturate(${p.saturation}%) sepia(${p.warmth}%)`};}
