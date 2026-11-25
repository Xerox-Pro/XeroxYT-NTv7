import {useEffect,useRef,useState} from 'react';
import {apiFetch,getApiPreference} from './apiTransport.mjs';

type Scope = 'account' | 'admin';
type RealtimeEvent = 'ready' | 'mode' | 'banned' | 'unbanned' | 'session' | 'dm' | 'rooms' | 'accounts' | 'logs' | 'monitor' | 'log-stream';
type RealtimeDetail={type:RealtimeEvent;banned?:boolean;logs?:unknown;apiIndex?:string;mode?:string};
const eventName = (scope:Scope) => 'xerox-realtime-' + scope;

export function useAccountRealtime(scope:Scope, enabled:boolean, identity?:string) {
 const [preference,setPreference]=useState(getApiPreference);
 useEffect(()=>{
  const update=()=>setPreference(getApiPreference());
  window.addEventListener('xerox-api-preference',update);
  return()=>window.removeEventListener('xerox-api-preference',update);
 },[]);
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let retry:ReturnType<typeof setTimeout>|undefined;
  let delay=1000;
  let avoid='';
  let avoidUntil=0;
  const emit=(type:RealtimeEvent,banned?:boolean,logs?:unknown,apiIndex?:string,mode?:string)=>{
   window.dispatchEvent(new CustomEvent(eventName(scope),{detail:{type,banned,logs,apiIndex,mode}}));
  };
  const connect=async()=>{
   let ready=false;
   let index='';
   let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
   try{
    if(Date.now()>=avoidUntil)avoid='';
    const response=await apiFetch('/api/account/realtime/events?scope='+scope,{
     cache:'no-store',
     headers:avoid?{'X-XeroxYT-Realtime-Avoid':avoid}:undefined,
     signal:AbortSignal.any([controller.signal,AbortSignal.timeout(290000)]),
    });
    if(controller.signal.aborted)return;
    if([401,403,423].includes(response.status)){
     if(scope==='account')emit('session');
     return;
    }
    index=response.headers.get('X-XeroxYT-API-Index')||'';
    if(!response.ok||!response.body)throw Error('Realtime stream unavailable');
    reader=response.body.getReader();
    const decoder=new TextDecoder();
    let pending='';
    while(!controller.signal.aborted){
     const {done,value}=await reader.read();
     if(done)break;
     pending+=decoder.decode(value,{stream:true});
     if(pending.length>2*1024*1024)throw Error('Realtime event too large');
     const frames=pending.split('\n\n');
     pending=frames.pop()??'';
     for(const frame of frames){
      if(!frame.startsWith('data: '))continue;
      const data=JSON.parse(frame.slice(6));
      if(data.type==='ready'){
       ready=true;
       delay=1000;
      }
      emit(data.type,data.banned,data.logs,index,data.mode);
     }
    }
   }catch{
    // A disconnected stream is reopened below.
   }finally{
    void reader?.cancel().catch(()=>{});
   }
   if(controller.signal.aborted)return;
   if(!ready&&index){
    avoid=index;
    avoidUntil=Date.now()+600000;
   }
   retry=setTimeout(()=>void connect(),delay+Math.random()*500);
   delay=Math.min(delay*2,30000);
  };
  void connect();
  return()=>{controller.abort();clearTimeout(retry);};
 },[scope,enabled,identity,preference]);
}

export function onRealtime(scope:Scope, listener:(detail:RealtimeDetail)=>void) {
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
