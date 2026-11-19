import {useEffect,useRef,useState} from 'react';

type AccountOption={id:string;username:string};
type LogEntry={
 id:number;at:number;route:string;method:string;status:number;duration_ms:number;
 user_id:string|null;username:string|null;
};

export default function SystemLogPanel({
 accounts,selectedUserId,onUserChange,
}:{
 accounts:AccountOption[];selectedUserId:string;onUserChange:(id:string)=>void;
}){
 const [logs,setLogs]=useState<LogEntry[]>([]);
 const [enabled,setEnabled]=useState(false);
 const [statusLoading,setStatusLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [paused,setPaused]=useState(false);
 const [errorsOnly,setErrorsOnly]=useState(false);
 const [methodFilter,setMethodFilter]=useState('all');
 const [expanded,setExpanded]=useState(true);
 const [error,setError]=useState('');
 const [updatedAt,setUpdatedAt]=useState(0);
 const [loading,setLoading]=useState(true);
 const cursor=useRef(0);

 // The switch is global, stored on Cloudflare, and OFF by default.
 // Merely opening the admin panel must not start live polling.
 useEffect(()=>{
  let cancelled=false;
  void fetch('/api/account/admin/system-monitor',{
   credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000),
  }).then(async response=>{
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'監視設定を取得できませんでした。');
   if(!cancelled){setEnabled(data.enabled===true);setError('');}
  }).catch(cause=>{
   if(!cancelled)setError(cause instanceof Error?cause.message:'監視設定を取得できませんでした。');
  }).finally(()=>{if(!cancelled)setStatusLoading(false);});
  return()=>{cancelled=true;};
 },[]);

 const toggleMonitor=async()=>{
  if(saving||statusLoading)return;
  const next=!enabled;
  setSaving(true);setError('');
  try{
   const response=await fetch('/api/account/admin/system-monitor',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({enabled:next}),
    signal:AbortSignal.timeout(10000),
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'監視設定を変更できませんでした。');
   if(data.enabled!==next)throw new Error('サーバーの監視状態を確認できませんでした。');
   setEnabled(next);setPaused(false);
   if(next){cursor.current=0;setLogs([]);setLoading(true);}
   else setLoading(false);
  }catch(cause){
   setError(cause instanceof Error?cause.message:'監視設定を変更できませんでした。');
  }finally{setSaving(false);}
 };

 useEffect(()=>{
  cursor.current=0;setLogs([]);setLoading(enabled);setError('');
 },[selectedUserId,errorsOnly,enabled]);

 useEffect(()=>{
  if(!enabled||statusLoading||paused||!expanded)return;
  let closed=false,inFlight=false;
  const poll=async()=>{
   if(closed||inFlight||document.hidden)return;
   inFlight=true;
   try{
    const params=new URLSearchParams();
    if(cursor.current>0)params.set('after',String(cursor.current));
    if(selectedUserId)params.set('userId',selectedUserId);
    if(errorsOnly)params.set('errors','1');
    const response=await fetch('/api/account/admin/system-logs?'+params.toString(),{
     credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'通信ログを取得できませんでした。');
    if(!Array.isArray(data.logs))throw new Error('ログデータの形式が不正です。');
    if(closed)return;
    const incoming=data.logs as LogEntry[];
    if(Number.isInteger(data.nextAfter)&&data.nextAfter>=cursor.current)cursor.current=data.nextAfter;
    if(incoming.length)setLogs(previous=>{
     const known=new Set(previous.map(log=>log.id));
     return [...incoming.filter(log=>!known.has(log.id)).reverse(),...previous].slice(0,200);
    });
    setUpdatedAt(Date.now());setError('');
   }catch(cause){
    if(!closed)setError(cause instanceof Error?cause.message:'通信ログを取得できませんでした。');
   }finally{
    if(!closed)setLoading(false);
    inFlight=false;
   }
  };
  void poll();
  const interval=setInterval(()=>void poll(),2000);
  const visibility=()=>{if(!document.hidden)void poll();};
  document.addEventListener('visibilitychange',visibility);
  return()=>{closed=true;clearInterval(interval);document.removeEventListener('visibilitychange',visibility);};
 },[enabled,statusLoading,paused,expanded,selectedUserId,errorsOnly]);

 const displayed=logs.filter(log=>methodFilter==='all'||log.method===methodFilter);
 return <section id="system-live-logs" className="mt-6 rounded-2xl border border-gray-200 p-4" aria-label="システム全体のリアルタイム通信ログ">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h3 className="text-base font-bold">リアルタイム通信モニター</h3>
    <p className="mt-1 text-xs text-gray-500">初期状態は無効。マスターが有効にしたときだけCloudflareで通信を記録し、約2秒間隔で表示を更新します。</p>
   </div>
   <div className="flex items-center gap-2 text-xs">
    <span className={!enabled?'text-gray-500':paused?'text-gray-500':error?'text-red-700':'text-emerald-700'} role="status">
     {statusLoading?'設定確認中':saving?'設定変更中':!enabled?'● 監視OFF':paused?'● 表示一時停止':error?'● 取得エラー':loading?'● 接続中':'● 監視ON'}
    </span>
    <button type="button" disabled={statusLoading||saving} aria-pressed={enabled} className={enabled?'rounded-lg bg-red-50 px-3 py-1.5 text-red-700 disabled:opacity-50':'rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50'} onClick={()=>void toggleMonitor()}>{enabled?'監視を無効にする':'監視を有効にする'}</button>
    <button type="button" className="rounded-lg border px-3 py-1.5" onClick={()=>setExpanded(value=>!value)}>{expanded?'折りたたむ':'開く'}</button>
   </div>
  </div>
  {expanded&&<>
   {!enabled&&<p className="mt-3 text-sm text-gray-500">監視は停止中です。「監視を有効にする」を押すと記録と自動更新が始まります。過去に記録したログは保持されます。</p>}
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
    <button type="button" disabled={!enabled} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" onClick={()=>setPaused(value=>!value)}>{paused?'表示再開':'表示を一時停止'}</button>
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
    {!displayed.length&&!error&&<p className="p-5 text-center text-sm text-gray-500">{!enabled?'監視が無効です。':loading?'通信ログを読み込んでいます。':'条件に合う通信はまだありません。'}</p>}
   </div>
   <p className="mt-3 text-xs text-gray-500">有効・無効は全マスター共通です。切り替えは数秒以内にCloudflare全体へ反映されます。Cloudflare APIに到達した通信のメタデータだけを記録します。検索語句、DM本文、Cookie、IPアドレス、パスワードは記録しません。履歴は7日を超えると表示されません。</p>
  </>}
 </section>;
}
