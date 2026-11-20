import {apiFetch} from '../lib/apiTransport.mjs';
import {useRealtimeRefresh} from '../lib/accountRealtime';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useSiteAccount} from './AccountGate';
type Sidecar={threads?:Array<{id:string;status:string;incoming?:boolean;updatedAt:number;lastMine?:boolean;label:string}>;rooms?:Array<{id:string;status:string;lastAt:number;lastMine?:boolean;name:string}>};
export default function MessageNotifications(){
 const username=useSiteAccount()?.username,location=useLocation(),navigate=useNavigate(),[toast,setToast]=useState('');
 useEffect(()=>{if(location.pathname==='/messages'){window.dispatchEvent(new CustomEvent('xerox-dm-unread',{detail:0}));setToast('');}},[location.pathname]);
 const known=useRef(new Map<string,number>());
 const initialized=useRef(new Set<string>());
 const unread=useRef(0);
 const hide=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{
  known.current.clear();initialized.current.clear();unread.current=0;
  return()=>clearTimeout(hide.current);
 },[username]);
 useEffect(()=>{if(location.pathname==='/messages')unread.current=0;},[location.pathname]);
 const refresh=async(kind:'dm'|'rooms')=>{
  const response=await apiFetch('/api/account/dm'+(kind==='rooms'?'/rooms':''),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;
  const data:Sidecar=await response.json();
  const items=kind==='dm'?(data.threads??[]).filter(t=>t.status==='accepted'||t.incoming&&t.status==='pending').map(t=>({id:'dm:'+t.id,time:t.updatedAt,mine:!!t.lastMine,label:t.label})):
   (data.rooms??[]).filter(r=>r.status==='joined'&&r.lastAt).map(r=>({id:'room:'+r.id,time:r.lastAt,mine:!!r.lastMine,label:r.name}));
  let latest='';
  for(const item of items){
   const previous=known.current.get(item.id)||0;
   known.current.set(item.id,item.time||0);
   if(initialized.current.has(kind)&&!item.mine&&item.time>previous&&location.pathname!=='/messages'){
    unread.current++;
    latest=item.label;
   }
  }
  initialized.current.add(kind);
  if(!latest)return;
  setToast(latest+'に新着メッセージがあります');
  window.dispatchEvent(new CustomEvent('xerox-dm-unread',{detail:unread.current}));
  clearTimeout(hide.current);
  hide.current=setTimeout(()=>setToast(''),6000);
  if('Notification' in window&&Notification.permission==='granted'){
   const notification=new Notification('新着メッセージ',{body:'DMに新しいメッセージがあります。',tag:'xerox-dm'});
   notification.onclick=()=>{window.focus();navigate('/messages');notification.close();};
  }
 };
 useRealtimeRefresh('account',['dm'],()=>refresh('dm'),!!username,false,username);
 useRealtimeRefresh('account',['rooms'],()=>refresh('rooms'),!!username,false,username);
 return toast?<Link to="/messages" role="status" data-effect-controls className="fixed right-4 top-20 z-[310] max-w-xs rounded-2xl border border-purple-100 bg-white px-5 py-4 text-sm text-gray-900 shadow-xl">{toast}<span className="mt-1 block text-xs text-purple-600">会話を開く →</span></Link>:null;
}
