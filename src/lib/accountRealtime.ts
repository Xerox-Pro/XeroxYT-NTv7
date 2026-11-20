import {useEffect,useRef} from 'react';
import {apiFetch} from './apiTransport.mjs';

type Scope = 'account' | 'admin';
type RealtimeEvent = 'ready' | 'mode' | 'banned' | 'unbanned' | 'session' | 'dm' | 'rooms' | 'accounts' | 'logs' | 'monitor';
const eventName = (scope:Scope) => 'xerox-realtime-' + scope;

export function useAccountRealtime(scope:Scope, enabled:boolean, identity?:string) {
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let socket:WebSocket|undefined;
  let retry:ReturnType<typeof setTimeout>|undefined;
  let failback:ReturnType<typeof setTimeout>|undefined;
  let watchdog:ReturnType<typeof setInterval>|undefined;
  let delay=1000;
  let avoid='';
  let lastSeen=0;
  let expires=Infinity;
  const emit=(type:RealtimeEvent,banned?:boolean)=>{
   window.dispatchEvent(new CustomEvent(eventName(scope),{detail:{type,banned}}));
  };
  const reconnect=()=>{
   clearInterval(watchdog);
   clearTimeout(failback);
   if(controller.signal.aborted||retry)return;
   retry=setTimeout(()=>{retry=undefined;void connect();},delay+Math.random()*500);
   delay=Math.min(delay*2,300000);
  };
  const connect=async()=>{
   try{
    const response=await apiFetch('/api/account/realtime/ticket?scope='+scope,{
     cache:'no-store',headers:avoid?{'X-XeroxYT-Realtime-Avoid':avoid}:undefined,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),
    });
    if(controller.signal.aborted)return;
    if(response.status===401||response.status===403||response.status===423){
     if(scope==='account')emit('session');
     return;
    }
    if(!response.ok){reconnect();return;}
    const origin=new URL(response.headers.get('X-XeroxYT-Realtime-Origin')||'');
    if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev'))throw Error('Invalid realtime origin');
    const {ticket}=await response.json();
    if(controller.signal.aborted)return;
    const url=new URL('/api/account/realtime/socket',origin);
    url.protocol='wss:';
    const connection=new WebSocket(url,['xerox-realtime-v1',ticket]);
    socket=connection;
    let ready=false;
    if(response.headers.get('X-XeroxYT-Realtime-Preferred')==='0')failback=setTimeout(()=>connection.close(),120000+Math.random()*30000);
    lastSeen=Date.now();
    expires=Infinity;
    connection.onmessage=event=>{
     if(controller.signal.aborted)return;
     lastSeen=Date.now();
     if(event.data==='pong')return;
     const data=JSON.parse(event.data);
     if(data.type==='ready'){
      ready=true;
      avoid='';
      delay=1000;
      expires=Number(data.expires);
     }
     emit(data.type,data.banned);
    };
    connection.onclose=()=>{
     if(!ready)avoid=response.headers.get('X-XeroxYT-API-Index')||'';
     reconnect();
    };
    watchdog=setInterval(()=>{
     const now=Date.now();
     if(now>=expires||now-lastSeen>90000)connection.close();
     else if(connection.readyState===WebSocket.OPEN)connection.send('ping');
     else if(connection.readyState===WebSocket.CONNECTING)connection.close();
    },30000);
   }catch{
    reconnect();
   }
  };
  void connect();
  return()=>{
   controller.abort();
   clearTimeout(retry);
   clearInterval(watchdog);
   clearTimeout(failback);
   socket?.close();
  };
 },[scope,enabled,identity]);
}

export function onRealtime(scope:Scope, listener:(detail:{type:RealtimeEvent;banned?:boolean})=>void) {
 const receive=(event:Event)=>listener((event as CustomEvent).detail);
 window.addEventListener(eventName(scope),receive);
 return()=>window.removeEventListener(eventName(scope),receive);
}

// Coalesce bursts and rerun once if a change arrives during a fetch.
export function useRealtimeRefresh(scope:Scope, types:RealtimeEvent[], refresh:()=>Promise<void>, enabled=true, initial=true, key='') {
 const refreshRef=useRef(refresh);
 refreshRef.current=refresh;
 const events=types.join(',');
 useEffect(()=>{
  if(!enabled)return;
  const accepted=new Set(events.split(','));
  let closed=false,running=false,queued=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const run=async()=>{
   timer=undefined;
   if(closed||running)return;
   running=true;
   queued=false;
   try{await refreshRef.current();}catch{}finally{
    running=false;
    if(queued)schedule();
   }
  };
  const schedule=()=>{
   if(closed)return;
   queued=true;
   if(!running&&!timer)timer=setTimeout(()=>void run(),250);
  };
  const cleanup=onRealtime(scope,({type})=>{if(type==='ready'||accepted.has(type))schedule();});
  if(initial)void run();
  return()=>{closed=true;clearTimeout(timer);cleanup();};
 },[scope,events,enabled,initial,key]);
}
