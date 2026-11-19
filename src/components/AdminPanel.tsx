import {useCallback,useEffect,useState} from 'react';
import {useSiteAccount} from './AccountGate';
import ReleaseStatus from './ReleaseStatus';

type LogEntry={id:number;at:number;route:string;method:string;status:number;duration_ms:number};
type Account={id:string;username:string;created_at:number;banned:number;traffic_stopped:number;requests:number;videos:number;searches:number;last_seen?:number;visual_mode?:string;is_master?:boolean};
async function request(path:string,method='GET',body?:unknown){
 const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'操作に失敗しました。');return data;
}
export default function AdminPanel(){
 const [sort,setSort]=useState('communication');
 const [search,setSearch]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[modeFilter,setModeFilter]=useState('all');
 const [logUser,setLogUser]=useState<Account|null>(null),[logs,setLogs]=useState<LogEntry[]>([]),[logError,setLogError]=useState('');
 const account=useSiteAccount(),[accountRows,setAccounts]=useState<Account[]>([]),[passwords,setPasswords]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[source,setSource]=useState<{configured:boolean;user?:{name?:string}}|null>(null);
 const isOwner=account?.username?.toLowerCase()==='xerox0521';
 const load=useCallback(async()=>{
  if(!account?.isMaster)return;
  // Account management must not depend on an owner-only recommendation-source request.
  try{
   const list=await request('/api/account/admin/accounts');
   setAccounts(Array.isArray(list.accounts)?list.accounts:[]);
   setMessage('');
  }catch(error){
   setMessage(error instanceof Error?error.message:'管理情報を取得できません。');
   return;
  }
  if(account.username.toLowerCase()!=='xerox0521'){setSource(null);return;}
  try{setSource(await request('/api/user/admin/recommendation-source'));}
  catch{setSource(null);}
 },[account?.isMaster,account?.username]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!logUser||!account?.isMaster)return;
  let stopped=false,busy=false,after=0;
  setLogs([]);setLogError('');
  const poll=async()=>{
   if(stopped||busy||document.hidden)return;
   busy=true;
   try{
    const data=await request('/api/account/admin/logs?userId='+encodeURIComponent(logUser.id)+'&after='+after);
    if(stopped)return;
    const incoming=(data.logs||[]) as LogEntry[];
    if(incoming.length){after=data.nextAfter||incoming[incoming.length-1].id;setLogs(previous=>[...previous,...incoming].slice(-200));}
    setLogError('');
   }catch(error){if(!stopped)setLogError(error instanceof Error?error.message:'通信ログを取得できません。');}
   finally{busy=false;}
  };
  void poll();
  const timer=setInterval(()=>void poll(),2000);
  const focus=()=>void poll();window.addEventListener('focus',focus);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',focus);};
 },[logUser?.id,account?.isMaster]);
 const accounts=[...accountRows].sort((a,b)=>sort==='communication'?(b.last_seen||0)-(a.last_seen||0)||b.created_at-a.created_at:sort==='oldest'?a.created_at-b.created_at:b.created_at-a.created_at);
 const searchText=search.trim().toLowerCase();
 const filteredAccounts=accounts.filter(item=>(!searchText||item.username.toLowerCase().includes(searchText))&&(statusFilter==='all'||(statusFilter==='banned'&&!!item.banned)||(statusFilter==='traffic'&&!!item.traffic_stopped)||(statusFilter==='active'&&!item.banned&&!item.traffic_stopped)||(statusFilter==='master'&&!!item.is_master))&&(modeFilter==='all'||(item.visual_mode||'off')===modeFilter));
 if(!account?.isMaster)return null;
 const action=async(item:Account,body:Record<string,unknown>)=>{const key=item.id+String(body.action);setBusy(key);setMessage('');try{await request('/api/account/admin/accounts/'+item.id,'POST',body);setPasswords(value=>({...value,[item.id]:''}));await load();if(body.action==='visualMode')window.dispatchEvent(new Event('xerox-visual-mode-updated'));setMessage('更新しました。');}catch(error){setMessage(error instanceof Error?error.message:'更新できませんでした。');}finally{setBusy('');}};
 const sourceAction=async(action:'useCurrent'|'remove')=>{setBusy('source');setMessage('');try{setSource(await request('/api/user/admin/recommendation-source','POST',{action}));setMessage(action==='useCurrent'?'現在連携中のGoogleアカウントを推薦用に設定しました。':'推薦用アカウントを解除しました。');}catch(error){setMessage(error instanceof Error?error.message:'推薦用アカウントを更新できませんでした。');}finally{setBusy('');}};
 return <section className="my-section rounded-2xl border border-gray-200 p-5" aria-label="システム管理">
  <div className="my-section-heading"><h2>システム管理</h2><button onClick={()=>void load()}>更新</button></div>
  <div className="my-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" role="search" aria-label="管理対象アカウントの絞り込み">
   <label className="flex min-w-[170px] flex-1 flex-col gap-1">ユーザー名検索<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="ユーザー名の一部を入力" className="w-full rounded-lg border bg-white p-2"/></label>
   <label className="flex flex-col gap-1">アカウント状態<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="rounded-lg border bg-white p-2"><option value="all">すべて</option><option value="banned">BAN中</option><option value="traffic">通信停止中</option><option value="active">有効</option><option value="master">マスター</option></select></label>
   <label className="flex flex-col gap-1">画面モード<select value={modeFilter} onChange={event=>setModeFilter(event.target.value)} className="rounded-lg border bg-white p-2"><option value="all">すべて</option><option value="off">通常</option><option value="chaos">カオス</option><option value="chaos2">カオス2</option><option value="jelly">ゼリー</option><option value="spin">スピン</option><option value="quake">地震</option><option value="zero">無重力</option><option value="mirror">ミラー</option></select></label>
   <label className="flex flex-col gap-1">表示順<select value={sort} onChange={event=>setSort(event.target.value)} className="rounded-lg border bg-white p-2"><option value="communication">最終通信が新しい順</option><option value="registered">登録が新しい順</option><option value="oldest">登録が古い順</option></select></label>
   <button type="button" className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={!search&&statusFilter==='all'&&modeFilter==='all'} onClick={()=>{setSearch('');setStatusFilter('all');setModeFilter('all');}}>絞り込み解除</button>
  </div>
  <p className="text-xs text-gray-500" role="status">{filteredAccounts.length} / {accountRows.length} アカウント表示</p>
  {isOwner&&<div className="rounded-xl bg-gray-50 p-4 text-sm"><h3 className="font-bold">推薦用Googleアカウント</h3><p className="mt-2 text-xs text-gray-600">一般アカウントには接続情報を公開せず、ホームとShortsの読み取りだけに使用します。高評価・登録・コメントなどの操作には使用されません。</p><p className="mt-2">{source?.configured?`${source.user?.name||'Googleアカウント'}を使用中`:'未設定'}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy==='source'} className="rounded-full bg-gray-900 px-4 py-2 text-xs text-white disabled:opacity-50" onClick={()=>void sourceAction('useCurrent')}>現在のGoogle連携を推薦用に設定</button>{source?.configured&&<button disabled={busy==='source'} className="rounded-full bg-gray-200 px-4 py-2 text-xs disabled:opacity-50" onClick={()=>void sourceAction('remove')}>解除</button>}</div></div>}
  {message&&<p role="status" className="my-3 text-sm">{message}</p>}
  <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b"><th className="p-2">アカウント</th><th className="p-2">利用量</th><th className="p-2">状態</th><th className="p-2">パスワード再設定</th><th className="p-2">画面モード・会話</th><th className="p-2">操作</th></tr></thead><tbody>{filteredAccounts.map(item=><tr key={item.id} className="border-b align-top"><td className="p-2"><b>{item.username}</b>{item.username.toLowerCase()==='xerox0521'?<small className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900">保護対象</small>:null}{item.is_master?<small className="ml-2 rounded bg-purple-100 px-2 py-0.5 text-purple-800">マスター</small>:null}<small className="block text-gray-500">{new Date(item.created_at).toLocaleString('ja-JP')}</small></td><td className="p-2">通信 {item.requests||0}<br/>動画 {item.videos||0}・検索 {item.searches||0}{item.last_seen?<small className="block text-gray-500">最終 {new Date(item.last_seen).toLocaleString('ja-JP')}</small>:null}</td><td className="p-2">{item.banned?'BAN中':item.traffic_stopped?'通信停止中':'有効'}</td><td className="p-2"><input type="password" minLength={12} value={passwords[item.id]||''} onChange={event=>setPasswords(value=>({...value,[item.id]:event.target.value}))} placeholder="新しいパスワード（12文字以上）" className="w-56 rounded-lg border px-2 py-1.5"/><button disabled={(passwords[item.id]||'').length<12||!!busy} className="ml-2 rounded-lg bg-gray-200 px-3 py-1.5 disabled:opacity-40" onClick={()=>void action(item,{action:'resetPassword',password:passwords[item.id]})}>変更</button></td><td className="p-2"><div className="flex max-w-xs flex-wrap gap-2">{[['off','通常'],['chaos','カオス'],['chaos2','カオス2'],['jelly','ゼリー'],['spin','スピン'],['quake','地震'],['zero','無重力'],['mirror','ミラー']].map(([mode,label])=><button key={mode} type="button" aria-pressed={(item.visual_mode||'off')===mode} disabled={!!busy||item.username.toLowerCase()==='xerox0521'} className="rounded-lg border px-3 py-2 aria-pressed:bg-purple-200" onClick={()=>void action(item,{action:'visualMode',mode})}>{label}</button>)}<button type="button" className="rounded-lg bg-indigo-100 px-3 py-2" onClick={()=>window.dispatchEvent(new CustomEvent('xerox-open-dm',{detail:{target:item.username}}))}>会話</button></div></td><td className="p-2"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-sky-100 px-3 py-1.5" onClick={()=>setLogUser(item)}>通信ログ</button><button title={!item.is_master&&account?.username?.toLowerCase()!=='xerox0521'?'マスター付与はXerox0521のみ実行できます':undefined} disabled={!!busy||item.username===account?.username||item.username.toLowerCase()==='xerox0521'||(!item.is_master&&account?.username?.toLowerCase()!=='xerox0521')} className="rounded-lg bg-purple-100 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>{if(confirm(`${item.username} のマスター権限を${item.is_master?'取り消し':'付与'}しますか？`))void action(item,{action:'master',enabled:!item.is_master});}}>{item.is_master?'マスター解除':'マスター付与'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||(!!item.is_master&&!item.traffic_stopped)} className="rounded-lg bg-amber-100 px-3 py-1.5" onClick={()=>void action(item,{action:'traffic',enabled:!item.traffic_stopped})}>{item.traffic_stopped?'通信再開':'通信停止'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||(!!item.is_master&&!item.banned)} className="rounded-lg bg-red-100 px-3 py-1.5" onClick={()=>void action(item,{action:'ban',enabled:!item.banned})}>{item.banned?'BAN解除':'BAN'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||!!item.is_master} className="rounded-lg border border-red-300 px-3 py-1.5 text-red-700" onClick={()=>{if(confirm(`${item.username} を削除しますか？この操作は元に戻せません。`))void action(item,{action:'delete'});}}>削除</button></div></td></tr>)}</tbody></table></div>
 {!filteredAccounts.length&&<p className="mt-3 text-sm text-gray-500">条件に一致するアカウントはありません。</p>}
 {logUser&&<section className="mt-6 rounded-xl border p-4" aria-label="ユーザー別リアルタイム通信ログ">
   <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">@{logUser.username} の通信ログ（約2秒ごとに更新）</h3><button className="rounded-lg border px-3 py-1.5 text-sm" onClick={()=>setLogUser(null)}>閉じる</button></div>
   <p className="mb-3 text-xs text-gray-500">APIの種類・時刻・応答コード・処理時間のみ表示します。認証情報や検索語句は保存しません。最大200件表示、保存期間は最大7日間です。</p>
   {logError&&<p role="alert" className="text-sm text-red-700">{logError}</p>}
   <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">時刻</th><th className="p-2">操作</th><th className="p-2">API</th><th className="p-2">状態</th><th className="p-2">時間</th></tr></thead><tbody>{logs.map(log=><tr key={log.id} className="border-t"><td className="p-2 whitespace-nowrap">{new Date(log.at).toLocaleTimeString('ja-JP')}</td><td className="p-2">{log.method}</td><td className="p-2 break-all">{log.route}</td><td className="p-2">{log.status}</td><td className="p-2">{log.duration_ms} ms</td></tr>)}</tbody></table>{!logs.length&&!logError&&<p className="p-4 text-sm text-gray-500">通信ログを待機しています。</p>}</div>
  </section>}
 <ReleaseStatus/></section>;
}
