import {useEffect,useRef,useState} from 'react';
import {useSiteAccount} from './AccountGate';

type Mode='off'|'chaos'|'chaos2'|'jelly'|'spin'|'quake'|'zero'|'mirror';
type Controls={shake:()=>void;reset:()=>void;destroy:()=>void};
const titles={off:'通常',chaos:'カオス',chaos2:'カオス2',jelly:'ゼリー',spin:'スピン',quake:'地震',zero:'無重力',mirror:'ミラー'};
export default function VisualModes(){
 const username=useSiteAccount()?.username;
 const [mode,setMode]=useState<Mode>('off'),[sensorMessage,setSensorMessage]=useState('');
 const controls=useRef<Controls|null>(null);
 const modeRef=useRef<Mode>('off');
 const [sensorGranted,setSensorGranted]=useState(false);
 const requiresPermission=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].some(type=>typeof type?.requestPermission==='function');
 useEffect(()=>{
  setMode('off');modeRef.current='off';
  const apply=(event:Event)=>{
   const next=(event as CustomEvent<{mode?:string}>).detail?.mode;
   if(typeof next==='string')setMode(['chaos','chaos2','jelly','spin','quake','zero','mirror'].includes(next)?next as Mode:'off');
  };
  window.addEventListener('xerox-api-sidecar',apply);
  // Presence heartbeats and ordinary YouTube reads now carry mode updates.
  // Fetch once at mount, then no more than every five minutes on focus.
  let stopped=false,inflight=false,lastCheck=0;
  const check=async()=>{
   if(stopped||inflight||document.hidden)return;
   inflight=true;lastCheck=Date.now();
   try{
    const response=await fetch('/api/account/visual-mode',{credentials:'same-origin',cache:'no-store'});
    if(response.ok){const data=await response.json();if(!stopped&&typeof data.mode==='string')apply(new CustomEvent('mode',{detail:{mode:data.mode}}));}
   }catch{}finally{inflight=false;}
  };
  void check();
  const onFocus=()=>{if(Date.now()-lastCheck>300000)void check();};
  window.addEventListener('focus',onFocus);
  return()=>{stopped=true;window.removeEventListener('focus',onFocus);window.removeEventListener('xerox-api-sidecar',apply);};
 },[username]);
 useEffect(()=>{
  if(mode==='off'||mode==='quake'||mode==='zero'||mode==='mirror')return;
  let disposed=false;const timer=setTimeout(()=>{void import('../lib/visualPhysics.mjs').then(({startVisualPhysics})=>{if(!disposed){const root=document.getElementById('root');if(root)controls.current=startVisualPhysics(root,mode);}});},350);
  return()=>{disposed=true;clearTimeout(timer);controls.current?.destroy();controls.current=null;};
 },[mode]);
 useEffect(()=>{
  const className=mode==='quake'?'xerox-mode-quake':mode==='zero'?'xerox-mode-zero':mode==='mirror'?'xerox-mode-mirror':'';
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
 if(mode==='off'||mode==='jelly'||mode==='spin'||mode==='quake'||mode==='zero'||mode==='mirror'||!requiresPermission||sensorGranted)return null;
 return <aside data-effect-controls className="fixed bottom-3 right-3 z-[290] max-w-xs rounded-xl bg-white p-2 text-xs shadow"><button onClick={()=>void enableSensors()}>傾き操作を許可</button>{sensorMessage&&<p role="status">{sensorMessage}</p>}</aside>;
}
