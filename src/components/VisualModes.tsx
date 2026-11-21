import {useRealtimeRefresh} from '../lib/accountRealtime';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {apiFetch} from '../lib/apiTransport.mjs';
import {Campfire} from './Campfire';
import {useSiteAccount} from './AccountGate';

type Mode='off'|'chaos'|'chaos2'|'jelly'|'spin'|'quake'|'zero'|'mirror'|'burning'|'cleaning';
type Controls={shake:()=>void;reset:()=>void;destroy:()=>void};
const modes = ['off','chaos','chaos2','jelly','spin','quake','zero','mirror','burning','cleaning'];
const asMode = (value?: string): Mode => modes.includes(value ?? '') ? value as Mode : 'off';

export default function VisualModes({initialMode}: {initialMode?: string}) {
 const username=useSiteAccount()?.username;
 const [mode,setMode]=useState<Mode>(()=>asMode(initialMode));
 const [sensorMessage,setSensorMessage]=useState('');
 const controls=useRef<Controls|null>(null);
 const [sensorGranted,setSensorGranted]=useState(false);
 const requiresPermission=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].some(type=>typeof type?.requestPermission==='function');
 useEffect(()=>{
  setMode(asMode(initialMode));
 },[username,initialMode]);
 useRealtimeRefresh('account',['mode'],async()=>{
  const response=await apiFetch('/api/account/visual-mode',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.ok){
   const status=await response.json();
   if(typeof status.mode==='string')setMode(asMode(status.mode));
  }
 },!!username,false,username);
 useEffect(()=>{
  if(mode==='off'||mode==='quake'||mode==='zero'||mode==='mirror'||mode==='burning'||mode==='cleaning')return;
  let disposed=false;const timer=setTimeout(()=>{void import('../lib/visualPhysics.mjs').then(({startVisualPhysics})=>{if(!disposed){const root=document.getElementById('root');if(root)controls.current=startVisualPhysics(root,mode);}});},350);
  return()=>{disposed=true;clearTimeout(timer);controls.current?.destroy();controls.current=null;};
 },[mode]);
 useEffect(()=>{
  const className=mode==='quake'?'xerox-mode-quake':mode==='zero'?'xerox-mode-zero':mode==='mirror'?'xerox-mode-mirror':mode==='burning'?'xerox-burning':'';
  if(!className)return;
  document.documentElement.classList.add(className);
  return()=>document.documentElement.classList.remove(className);
 },[mode]);
 const enableSensors=async()=>{
  try{
   const constructors=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].filter(Boolean);
   if(!constructors.length){setSensorMessage('この端末には傾きセンサーがありません。「揺らす」を使えます。');return;}
   const results=await Promise.all(constructors.map(type=>typeof type.requestPermission==='function'?type.requestPermission():Promise.resolve('granted')));
   setSensorGranted(results.some(value=>value==='granted'));setSensorMessage(results.some(value=>value==='granted')?'センサーを有効にしました。端末を傾けたり、軽く振ってください。':'センサーの利用が許可されませんでした。「揺らす」を使えます。');
  }catch{setSensorMessage('ブラウザの制限によりセンサーを使えません。「揺らす」を使えます。');}
 };
 if(mode==='cleaning')return createPortal(<Cleaning/>,document.body);
 if(mode==='burning')return createPortal(<Campfire/>,document.body);
 if(mode==='off'||mode==='jelly'||mode==='spin'||mode==='quake'||mode==='zero'||mode==='mirror'||!requiresPermission||sensorGranted)return null;
 return <aside data-effect-controls className="fixed bottom-3 right-3 z-[290] max-w-xs rounded-xl bg-white p-2 text-xs shadow"><button onClick={()=>void enableSensors()}>傾き操作を許可</button>{sensorMessage&&<p role="status">{sensorMessage}</p>}</aside>;
}

function Cleaning(){
 const [finished,setFinished]=useState(false);
 useEffect(()=>{
  const root=document.getElementById('root');
  if(!root)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const parts=[...root.querySelectorAll<HTMLElement>('img,video,button,a,input,h1,h2,h3,p,article,header,nav')];
  const animations=parts.filter(el=>!parts.some(other=>other!==el&&other.contains(el))).flatMap((el,i)=>{
   const rect=el.getBoundingClientRect();
   if(rect.bottom<=0||rect.top>=innerHeight)return [];
   return el.animate([{transform:'none',opacity:1},{transform:'translate('+Math.sin(i)*18+'vw,105vh) rotate('+Math.sin(i)*28+'deg)',opacity:0}],
    {delay:reduced?0:300+Math.max(0,rect.top)/innerHeight*1300,duration:reduced?0:1100,fill:'forwards'});
  });
  const timer=setTimeout(()=>setFinished(true),reduced?0:2800);
  return()=>{clearTimeout(timer);animations.forEach(animation=>animation.cancel());};
 },[]);
 return <div className={'wash-scene'+(finished?' complete':'')}><div className="wash-wave"/>{finished&&<strong role="status">綺麗になりました！！</strong>}</div>;
}
