import {apiFetch} from '../lib/apiTransport.mjs';
import {useEffect,useRef,useState} from 'react';

type AccountOption={id:string;username:string};
type LogEntry={
 id:number|string;at:number;route:string;method:string;status:number;duration_ms:number;
 user_id:string|null;username:string|null;
};

async function monitorSetting(enabled?: boolean, signal?: AbortSignal): Promise<{enabled:boolean;auditRecorded?:boolean}> {
 const response=await apiFetch('/api/account/admin/system-monitor',{
  credentials:'same-origin',cache:'no-store',signal:signal??AbortSignal.timeout(10000),
  ...(enabled===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})}),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||typeof data.enabled!=='boolean')throw new Error(data.error||'監視設定を取得できませんでした。');
 return data;
}

export default function SystemLogPanel({
 accounts,selectedUserId,onUserChange,onSettingChange,
}:{
 accounts:AccountOption[];selectedUserId:string;onUserChange:(id:string)=>void;onSettingChange:()=>void;identity:string;initialMode:'manual'|'live';
}){
 const [enabled,setEnabled]=useState<boolean|null>(null);
 const [changing,setChanging]=useState(false);
 const [settingsError,setSettingsError]=useState('');
 const [logs,setLogs]=useState<LogEntry[]>([]);
 const [manualRefresh,setManualRefresh]=useState(0);
 const handledRefresh=useRef(0);
 const [errorsOnly,setErrorsOnly]=useState(false);
 const [methodFilter,setMethodFilter]=useState('all');
 const [error,setError]=useState('');
 const [updatedAt,setUpdatedAt]=useState(0);
 const [loading,setLoading]=useState(false);

 useEffect(()=>{
  const controller=new AbortController();
  const refresh=()=>void monitorSetting(undefined,controller.signal)
   .then(value=>{
    if(controller.signal.aborted)return;
    setEnabled(value.enabled);
   })
   .catch(cause=>{if(!controller.signal.aborted)setSettingsError(cause.message);});
  refresh();
  window.addEventListener('xerox-system-monitor-updated',refresh);
  return()=>{controller.abort();window.removeEventListener('xerox-system-monitor-updated',refresh);};
 },[]);

 const toggleMonitoring=async()=>{
  if(changing)return;
  setChanging(true);setSettingsError('');
  try{
   const next=await monitorSetting(enabled===null?undefined:!enabled);
   setEnabled(next.enabled);
   onSettingChange();
   if(next.auditRecorded===false)setSettingsError('設定を保存しましたが、操作履歴を記録できませんでした。');
  }
  catch(cause){setSettingsError(cause instanceof Error?cause.message:'監視設定を変更できませんでした。');}
  finally{setChanging(false);}
 };

 useEffect(()=>{
  setLogs([]);setUpdatedAt(0);setError('');
 },[enabled,selectedUserId,errorsOnly]);

 useEffect(()=>{
  const requested=manualRefresh!==handledRefresh.current;
  handledRefresh.current=manualRefresh;
  setLoading(false);
  if(!enabled||!requested)return;
  const controller=new AbortController();
  const merge=(incoming:LogEntry[])=>{
   if(incoming.length)setLogs(previous=>{
    const rows=new Map(previous.map(log=>[log.id,log]));
    for(const log of incoming)rows.set(log.id,log);
    return [...rows.values()].sort((a,b)=>b.at-a.at).slice(0,200);
   });
   setUpdatedAt(Date.now());setError('');
  };
  const poll=async()=>{
   setLoading(true);
   try{
    const params=new URLSearchParams();
    if(selectedUserId)params.set('userId',selectedUserId);
    if(errorsOnly)params.set('errors','1');
    const response=await apiFetch('/api/account/admin/system-logs?'+params.toString(),{
     credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'通信ログを取得できませんでした。');
    if(!Array.isArray(data.logs))throw new Error('ログデータの形式が不正です。');
    if(controller.signal.aborted)return;
    const incoming=data.logs as LogEntry[];
    setLogs([]);
    merge(incoming);
   }catch(cause){
    if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'通信ログを取得できませんでした。');
   }finally{
    if(!controller.signal.aborted)setLoading(false);
   }
  };
  void poll();
  return()=>controller.abort();
 },[enabled,manualRefresh,selectedUserId,errorsOnly]);

 useEffect(()=>{
  if(!logs.length)return;
  const expires=Math.min(...logs.map(log=>log.at))+600000;
  const timer=setTimeout(()=>setLogs(previous=>previous.filter(log=>log.at>Date.now()-600000)),Math.max(0,expires-Date.now()));
  return()=>clearTimeout(timer);
 },[logs]);

 const displayed=logs.filter(log=>methodFilter==='all'||log.method===methodFilter);
 return <section id="system-live-logs" className="mt-6 rounded-2xl border border-gray-200 p-4" aria-label="システムの通信ログ">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h3 className="text-base font-bold">通信ログ</h3>
    <p className="mt-1 text-xs text-gray-500">「更新」で履歴を取得します。</p>
   </div>
   <div className="flex items-center gap-2 text-xs">
    <span className={error?'text-red-700':'text-gray-500'} role="status">
     {enabled===null?'● 設定未取得':!enabled?'● 無効':error?'● 取得エラー':loading?'● 取得中':'● 手動更新'}
    </span>
    <button type="button" disabled={changing} className="rounded-lg border px-3 py-1.5" onClick={()=>void toggleMonitoring()}>
     {enabled===null?'設定を再取得':enabled?'モニターを無効化':'モニターを有効化'}
    </button>
   </div>
  </div>
  {settingsError&&<p className="mt-3 text-sm text-red-700" role="alert">{settingsError}</p>}
  {enabled&&<>
   <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-gray-50 p-3 text-sm">
    <label className="flex min-w-[180px] flex-1 flex-col gap-1">ユーザー
     <select value={selectedUserId} onChange={event=>onUserChange(event.target.value)} className="rounded-lg border bg-white p-2">
      <option value="">全ユーザー・未ログイン</option>
      {accounts.map(item=><option key={item.id} value={item.id}>@{item.username}</option>)}
     </select>
    </label>
    <label className="flex flex-col gap-1">HTTPメソッド
     <select value={methodFilter} onChange={event=>setMethodFilter(event.target.value)} className="rounded-lg border bg-white p-2">
      {['all','GET','POST','PUT','PATCH','DELETE','HEAD'].map(method=><option key={method} value={method}>{method==='all'?'すべて':method}</option>)}
     </select>
    </label>
    <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
     <input type="checkbox" checked={errorsOnly} onChange={event=>setErrorsOnly(event.target.checked)}/>
     エラーのみ（400以上）
    </label>
    <button type="button" disabled={loading} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50" onClick={()=>setManualRefresh(value=>value+1)}>更新</button>
    <button type="button" className="rounded-lg border bg-white px-3 py-2" onClick={()=>setLogs([])}>表示をクリア</button>
   </div>
   <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
    <span>表示 {displayed.length}件（直近最大200件）</span>
    <span>{updatedAt?'最終確認 '+new Date(updatedAt).toLocaleTimeString('ja-JP'):'取得待機中'}</span>
   </div>
   {error&&<p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
   <div className="mt-2 max-h-[420px] overflow-auto rounded-lg border">
    <table className="w-full min-w-[700px] text-left text-xs">
     <thead className="sticky top-0 bg-gray-100"><tr><th className="p-2">時刻</th><th className="p-2">ユーザー</th><th className="p-2">操作</th><th className="p-2">API</th><th className="p-2">応答</th><th className="p-2">処理時間</th></tr></thead>
     <tbody>{displayed.map(log=><tr key={log.id} className="border-t">
      <td className="whitespace-nowrap p-2">{new Date(log.at).toLocaleString('ja-JP')}</td>
      <td className="p-2">{log.username?'@'+log.username:'未ログイン'}</td>
      <td className="p-2 font-mono">{log.method}</td>
      <td className="break-all p-2 font-mono">{log.route}</td>
      <td className={'p-2 font-semibold '+(log.status>=500?'text-red-700':log.status>=400?'text-amber-700':'text-gray-800')}>{log.status}</td>
      <td className="whitespace-nowrap p-2">{log.duration_ms} ms</td>
     </tr>)}</tbody>
    </table>
    {!displayed.length&&!error&&<p className="p-5 text-center text-sm text-gray-500">{loading?'通信ログを読み込んでいます。':updatedAt?'条件に合う通信はまだありません。':mode==='live'?'「再生」で受信を開始します。':'「更新」でログを取得します。'}</p>}
   </div>
   <p className="mt-3 text-xs text-gray-500">Cloudflare APIに到達した通信のメタデータだけを記録します。検索語句、DM本文、Cookie、IPアドレス、パスワードは記録しません。直近10分の履歴を表示します。</p>
  </>}
 </section>;
}
