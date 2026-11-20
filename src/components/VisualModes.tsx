import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {apiFetch} from '../lib/apiTransport.mjs';
import './burning.css';
import {useSiteAccount} from './AccountGate';

type Mode='off'|'chaos'|'chaos2'|'jelly'|'spin'|'quake'|'zero'|'mirror'|'burning';
type Controls={shake:()=>void;reset:()=>void;destroy:()=>void};
const modes = ['off','chaos','chaos2','jelly','spin','quake','zero','mirror','burning'];
const asMode = (value?: string): Mode => modes.includes(value ?? '') ? value as Mode : 'off';

export default function VisualModes({initialMode, initialMonitoring}: {initialMode?: string; initialMonitoring?: boolean}) {
 const username=useSiteAccount()?.username;
 const [mode,setMode]=useState<Mode>(()=>asMode(initialMode));
 const [monitoring,setMonitoring]=useState(initialMonitoring===true);
 const [sensorMessage,setSensorMessage]=useState('');
 const controls=useRef<Controls|null>(null);
 const [sensorGranted,setSensorGranted]=useState(false);
 const requiresPermission=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].some(type=>typeof type?.requestPermission==='function');
 useEffect(()=>{
  setMode(asMode(initialMode));
  setMonitoring(initialMonitoring===true);
 },[username,initialMode,initialMonitoring]);
 useEffect(()=>{
  const apply=(event:Event)=>{
   const detail=(event as CustomEvent<{mode?:string;monitoring?:boolean}>).detail;
   if(typeof detail?.mode==='string')setMode(asMode(detail.mode));
   if(typeof detail?.monitoring==='boolean')setMonitoring(detail.monitoring);
  };
  window.addEventListener('xerox-api-sidecar',apply);
  return()=>window.removeEventListener('xerox-api-sidecar',apply);
 },[]);
 useEffect(()=>{
  if(!monitoring||!username)return;
  const controller=new AbortController();
  let pending=false;
  const interval=setInterval(async()=>{
   if(pending)return;
   pending=true;
   try{
    const response=await apiFetch('/api/account/visual-mode',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
    if(!response.ok)return;
    const status=await response.json();
    if(controller.signal.aborted)return;
    if(typeof status.mode==='string')setMode(asMode(status.mode));
    if(typeof status.monitoring==='boolean')setMonitoring(status.monitoring);
   }catch{}finally{pending=false;}
  },60000);
  return()=>{controller.abort();clearInterval(interval);};
 },[username,monitoring]);
 useEffect(()=>{
  if(mode==='off'||mode==='quake'||mode==='zero'||mode==='mirror'||mode==='burning')return;
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
 if(mode==='burning')return createPortal(
  <div className="xerox-campfire">
   <div className="xerox-campfire-horizon"/>
   <div className="xerox-fire" aria-hidden="true">
    <i/><i/><i/><i/><i/>
    <b/><b/>
   </div>
   <div className="xerox-embers" aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i} style={{left:(i*37%100)+'%',animationDelay:(i%9)*-.48+'s',animationDuration:(2.4+i%5*.6)+'s'}}/>)}</div>
   <p className="xerox-chill" role="status">チルしましょう</p>
  </div>,document.body);
 if(mode==='off'||mode==='jelly'||mode==='spin'||mode==='quake'||mode==='zero'||mode==='mirror'||!requiresPermission||sensorGranted)return null;
 return <aside data-effect-controls className="fixed bottom-3 right-3 z-[290] max-w-xs rounded-xl bg-white p-2 text-xs shadow"><button onClick={()=>void enableSensors()}>傾き操作を許可</button>{sensorMessage&&<p role="status">{sensorMessage}</p>}</aside>;
}
