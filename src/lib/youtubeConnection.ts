import {useSyncExternalStore} from 'react';
export function isYouTubeLinked(){try{return localStorage.getItem('xerox_youtube_linked')==='1';}catch{return false;}}
function subscribe(callback:()=>void){window.addEventListener('xerox-youtube-connection',callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener('xerox-youtube-connection',callback);window.removeEventListener('storage',callback);};}
export function useYouTubeLinked(){return useSyncExternalStore(subscribe,isYouTubeLinked,()=>false);}
