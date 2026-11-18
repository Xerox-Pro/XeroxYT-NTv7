import {useSyncExternalStore} from 'react';
export const displayDefaults={thumbnailSize:'normal',playerSize:'normal',textSize:'normal',density:'normal',hideShorts:false,hideCategories:false,hideAvatars:false,hideViews:false,hideDates:false,reduceMotion:false};
export type DisplayPreferences=typeof displayDefaults;
const key='xerox_display_preferences_v1';
let current={...displayDefaults};
try{const saved=JSON.parse(localStorage.getItem(key)||'{}');for(const name of Object.keys(displayDefaults) as (keyof DisplayPreferences)[]){const value=saved[name];if(typeof displayDefaults[name]==='boolean'?typeof value==='boolean':['small','normal','large'].includes(value))(current as any)[name]=value;}}catch{}
const listeners=new Set<()=>void>();
function apply(){const root=document.documentElement;for(const [name,value]of Object.entries(current))root.setAttribute('data-pref-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(value));}
apply();
export function updateDisplayPreferences(patch:Partial<DisplayPreferences>){current={...current,...patch};try{localStorage.setItem(key,JSON.stringify(current));}catch{}apply();listeners.forEach(listener=>listener());}
export function useDisplayPreferences(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>current);}
