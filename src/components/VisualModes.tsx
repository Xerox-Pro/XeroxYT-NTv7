import {onRealtime,useRealtimeRefresh} from '../lib/accountRealtime';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {apiFetch,getApiPreference} from '../lib/apiTransport.mjs';
import ElementalScene from './ElementalScene';
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
 const apiIndex=useRef('');
 const modeRequest=useRef(0);
 const refreshMode=async(signal?:AbortSignal)=>{
  const request=++modeRequest.current;
  const response=await apiFetch('/api/account/visual-mode',{
   cache:'no-store',
   headers:apiIndex.current==='2'?{'X-XeroxYT-Prefer-API':'2'}:undefined,
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),
  });
  if(response.ok){
   const status=await response.json();
   if(request===modeRequest.current&&!signal?.aborted&&typeof status.mode==='string')setMode(asMode(status.mode));
  }
 };
 useRealtimeRefresh('account',['mode'],refreshMode,!!username,false,username);
 useEffect(()=>{
  if(!username)return;
  const controller=new AbortController();
  apiIndex.current='';
  const refresh=()=>{
   if(document.hidden||(apiIndex.current!=='2'&&getApiPreference()!=='2'))return;
   void refreshMode(controller.signal).catch(()=>{});
  };
  const unsubscribe=onRealtime('account',event=>{
   if(event.type==='ready')apiIndex.current=event.apiIndex??'';
  });
  document.addEventListener('visibilitychange',refresh);
  const timer=setInterval(refresh,60000);
  return()=>{modeRequest.current++;controller.abort();clearInterval(timer);unsubscribe();document.removeEventListener('visibilitychange',refresh);};
 },[username]);
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
 if(mode==='cleaning')return createPortal(<ElementalScene key="water" kind="water"/>,document.body);
 if(mode==='burning')return createPortal(<ElementalScene key="fire" kind="fire"/>,document.body);
 if(mode==='off'||mode==='jelly'||mode==='spin'||mode==='quake'||mode==='zero'||mode==='mirror'||!requiresPermission||sensorGranted)return null;
 return <aside data-effect-controls className="fixed bottom-3 right-3 z-[290] max-w-xs rounded-xl bg-white p-2 text-xs shadow"><button onClick={()=>void enableSensors()}>傾き操作を許可</button>{sensorMessage&&<p role="status">{sensorMessage}</p>}</aside>;
}
