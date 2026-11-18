import {useEffect,useRef,useState} from 'react';
import {useSiteAccount} from './AccountGate';

type Mode='off'|'chaos'|'chaos2'|'jelly'|'spin';
type Controls={shake:()=>void;reset:()=>void;destroy:()=>void};
const titles={off:'通常',chaos:'カオス',chaos2:'カオス2',jelly:'ゼリー',spin:'スピン'};
export default function VisualModes(){
 const username=useSiteAccount()?.username;
 const [mode,setMode]=useState<Mode>('off'),[sensorMessage,setSensorMessage]=useState('');
 const controls=useRef<Controls|null>(null);
 const [sensorGranted,setSensorGranted]=useState(false);
 const requiresPermission=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].some(type=>typeof type?.requestPermission==='function');
 useEffect(()=>{
  setMode('off');
  const apply=(event:Event)=>{
   const next=(event as CustomEvent<{mode?:string}>).detail?.mode;
   if(typeof next==='string')setMode(['chaos','chaos2','jelly','spin'].includes(next)?next as Mode:'off');
  };
  window.addEventListener('xerox-gas-sidecar',apply);
  return()=>window.removeEventListener('xerox-gas-sidecar',apply);
 },[username]);
 useEffect(()=>{
  if(mode==='off')return;
  let disposed=false;const timer=setTimeout(()=>{void import('../lib/visualPhysics.mjs').then(({startVisualPhysics})=>{if(!disposed){const root=document.getElementById('root');if(root)controls.current=startVisualPhysics(root,mode);}});},350);
  return()=>{disposed=true;clearTimeout(timer);controls.current?.destroy();controls.current=null;};
 },[mode]);
 const enableSensors=async()=>{
  try{
   const constructors=[(window as any).DeviceOrientationEvent,(window as any).DeviceMotionEvent].filter(Boolean);
   if(!constructors.length){setSensorMessage('この端末には傾きセンサーがありません。「揺らす」を使えます。');return;}
   const results=await Promise.all(constructors.map(type=>typeof type.requestPermission==='function'?type.requestPermission():Promise.resolve('granted')));
   setSensorGranted(results.some(value=>value==='granted'));setSensorMessage(results.some(value=>value==='granted')?'センサーを有効にしました。端末を傾けたり、軽く振ってください。':'センサーの利用が許可されませんでした。「揺らす」を使えます。');
  }catch{setSensorMessage('ブラウザまたはGASの制限によりセンサーを使えません。「揺らす」を使えます。');}
 };
 if(mode==='off'||mode==='jelly'||mode==='spin'||!requiresPermission||sensorGranted)return null;
 return <aside data-effect-controls className="fixed bottom-3 right-3 z-[290] max-w-xs rounded-xl bg-white p-2 text-xs shadow"><button onClick={()=>void enableSensors()}>傾き操作を許可</button>{sensorMessage&&<p role="status">{sensorMessage}</p>}</aside>;
}
