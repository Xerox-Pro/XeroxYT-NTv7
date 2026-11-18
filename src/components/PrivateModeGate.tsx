import {useEffect,useState,type ReactNode} from 'react';
import {detectPrivateMode} from '../lib/privateMode.mjs';

export default function PrivateModeGate({children}:{children:ReactNode}){
 const [state,setState]=useState<'checking'|'allowed'|'blocked'>('checking');
 useEffect(()=>{let active=true;void detectPrivateMode().then(value=>{if(active)setState(value?'blocked':'allowed');}).catch(()=>{if(active)setState('blocked');});return()=>{active=false;};},[]);
 if(state==='checking')return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><p role="status" className="text-sm text-gray-500">ブラウザの保存環境を確認しています…</p></main>;
 if(state==='blocked')return <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-5"><section role="alert" className="w-full max-w-md rounded-3xl border border-red-900 bg-gray-900 p-8 text-center shadow-2xl"><div aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950 text-3xl">!</div><h1 className="mt-5 text-2xl font-bold">プライベートモードでは利用できません</h1><p className="mt-3 text-sm leading-6 text-gray-300">通常のブラウザウィンドウで開き直してください。端末の保存機能が無効になっている場合も利用できません。</p></section></main>;
 return children;
}
