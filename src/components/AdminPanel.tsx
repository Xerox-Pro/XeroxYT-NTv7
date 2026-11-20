import {useAccountRealtime,useRealtimeRefresh} from '../lib/accountRealtime';
import {apiFetch,getApiPreference,setApiPreference} from '../lib/apiTransport.mjs';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useSiteAccount} from './AccountGate';
import ReleaseStatus from './ReleaseStatus';
import AdminActionHistory,{type Entry} from './AdminActionHistory';
import SystemLogPanel from './SystemLogPanel';

type Account={id:string;username:string;created_at:number;banned:number;traffic_stopped:number;requests:number;videos:number;searches:number;last_seen?:number;visual_mode?:string;monitoring?:boolean;is_master?:boolean;viewing?:boolean;viewing_last_seen?:number;viewing_page?:string;viewing_title?:string};
async function request(path:string,method='GET',body?:unknown){
 const response=await apiFetch(path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'操作に失敗しました。');return data;
}
export default function AdminPanel(){
 const [preferredApi,setPreferredApi]=useState(getApiPreference);
 const [clock,setClock]=useState(Date.now);
 const [sort,setSort]=useState('communication');
 const loadSeq=useRef(0);
 const [search,setSearch]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[modeFilter,setModeFilter]=useState('all');
 const [logUserId,setLogUserId]=useState('');
 const [auditRevision,setAuditRevision]=useState(0);
 const refreshAudit=()=>setAuditRevision(value=>value+1);
 const account=useSiteAccount(),[accountRows,setAccounts]=useState<Account[]>([]),[passwords,setPasswords]=useState<Record<string,string>>({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[source,setSource]=useState<{configured:boolean;user?:{name?:string}}|null>(null);
 const isOwner=account?.username?.toLowerCase()==='xerox0521';
 const load=useCallback(async(silent=false):Promise<Account[]>=>{
   if(!account?.isMaster)return [];
   const seq=++loadSeq.current;
   let rows:Account[];
   try{
     const list=await request('/api/account/admin/accounts');
     if(!Array.isArray(list.accounts))throw new Error('ユーザー一覧の形式が不正です。');
     rows=list.accounts;
     if(seq===loadSeq.current){setClock(Date.now());setAccounts(rows);if(!silent)setMessage('');}
   }catch(error){
     if(!silent&&seq===loadSeq.current)setMessage(error instanceof Error?error.message:'管理情報を取得できません。');
     throw error;
   }
   if(!silent&&account.username.toLowerCase()==='xerox0521'){
     try{const next=await request('/api/user/admin/recommendation-source');if(seq===loadSeq.current)setSource(next);}
     catch{if(seq===loadSeq.current)setSource(null);}
   }
   return rows;
 },[account?.isMaster,account?.username]);
 useEffect(()=>{void load().catch(()=>{});},[load]);
 useAccountRealtime('admin',!!account?.isMaster,account?.username);
 useRealtimeRefresh('admin',['accounts'],async()=>{if(!busy)await load(true);},!!account?.isMaster,false);

 useEffect(()=>{
  const next=accountRows.reduce((earliest,row)=>{
   const expiry=(row.viewing_last_seen??0)+90000;
   return expiry>clock?Math.min(earliest,expiry):earliest;
  },Infinity);
  if(!Number.isFinite(next))return;
  const timer=setTimeout(()=>setClock(Date.now()),Math.max(1,next-Date.now()));
  return()=>clearTimeout(timer);
 },[accountRows,clock]);

 const accounts=accountRows.map(row=>row.viewing_last_seen&&row.viewing_last_seen+90000<=clock?{...row,viewing:false,viewing_page:'',viewing_title:''}:row).sort((a,b)=>sort==='viewing'?Number(!!b.viewing)-Number(!!a.viewing)||(b.last_seen||0)-(a.last_seen||0):sort==='communication'?(b.last_seen||0)-(a.last_seen||0)||b.created_at-a.created_at:sort==='oldest'?a.created_at-b.created_at:b.created_at-a.created_at);
 const searchText=search.trim().toLowerCase();
 const filteredAccounts=accounts.filter(item=>(!searchText||item.username.toLowerCase().includes(searchText))&&(statusFilter==='all'||(statusFilter==='banned'&&!!item.banned)||(statusFilter==='traffic'&&!!item.traffic_stopped)||(statusFilter==='active'&&!item.banned&&!item.traffic_stopped)||(statusFilter==='master'&&!!item.is_master)||(statusFilter==='viewing'&&!!item.viewing)||(statusFilter==='offline'&&!item.viewing))&&(modeFilter==='all'||(item.visual_mode||'off')===modeFilter));
 if(!account?.isMaster)return null;
 const action=async(item:Account,body:Record<string,unknown>)=>{
   if(busy)return;
   const key=item.id+String(body.action);setBusy(key);setMessage('');
   ++loadSeq.current; // Discard a stale presence refresh that started before the change.
   let saved=false;
   try{
     const result=await request('/api/account/admin/accounts/'+item.id,'POST',body);
     if(result.ok!==true)throw new Error('APIが保存完了を確認できませんでした。');
     saved=true;
     refreshAudit();
     setPasswords(value=>({...value,[item.id]:''}));
     if(body.action==='visualMode')window.dispatchEvent(new Event('xerox-visual-mode-updated'));
     const rows=await load(true);
     const current=rows.find(row=>row.id===item.id);
     const expected=body.action==='ban'?current?.banned===Number(body.enabled===true)
       :body.action==='traffic'?current?.traffic_stopped===Number(body.enabled===true)
       :body.action==='visualMode'?current?.visual_mode===body.mode
       :body.action==='monitoring'?current?.monitoring===body.enabled
       :body.action==='master'?current?.is_master===body.enabled
       :body.action==='delete'?!current:true;
     setMessage(result.auditRecorded===false?'設定を保存しましたが、操作履歴を記録できませんでした。':expected?'更新しました。':'保存処理は成功しましたが、一覧への反映を確認できません。更新ボタンで再確認してください。');
   }catch(error){
     const reason=error instanceof Error?error.message:'不明なエラー';
     setMessage(saved?'変更は保存されましたが、一覧の再取得に失敗しました。更新ボタンで確認してください。('+reason+')':'設定を変更できませんでした。'+reason);
   }finally{setBusy('');}
 };
 const sourceAction=async(action:'useCurrent'|'remove')=>{
   if(busy)return;
   setBusy('source');setMessage('');
   try{
     const next=await request('/api/user/admin/recommendation-source','POST',{action});
     setSource(next);refreshAudit();
     setMessage(next.auditRecorded===false?'設定を保存しましたが、操作履歴を記録できませんでした。':'推薦用アカウントの設定を更新しました。');
   }catch(error){setMessage(error instanceof Error?error.message:'推薦用アカウントを更新できませんでした。');}
   finally{setBusy('');}
 };
 const canApply=(entry:Entry,value:Entry['before'])=>{
   if(value===null)return false;
   if(entry.action==='systemMonitor')return typeof value==='boolean';
   if(entry.action==='recommendationSource')return isOwner&&value===false;
   const target=accountRows.find(row=>row.id===entry.target_id);
   if(!target)return false;
   if(entry.action==='monitoring')return typeof value==='boolean';
   if(target.username.toLowerCase()==='xerox0521')return false;
   if(entry.action==='visualMode')return typeof value==='string';
   if(entry.action==='master')return target.username!==account.username&&(isOwner||value===false);
   return ['ban','traffic'].includes(entry.action)&&(!target.is_master||value===false);
 };
 const applyHistory=async(entry:Entry,value:Entry['before'])=>{
   if(busy||!canApply(entry,value))return;
   if(entry.action==='recommendationSource'){await sourceAction('remove');return;}
   if(entry.action==='systemMonitor'){
     setBusy('systemMonitor');setMessage('');
     try{
       const next=await request('/api/account/admin/system-monitor','POST',{enabled:value});
       window.dispatchEvent(new Event('xerox-system-monitor-updated'));refreshAudit();
       setMessage(next.auditRecorded===false?'設定を保存しましたが、操作履歴を記録できませんでした。':'通信モニター設定を更新しました。');
     }catch(error){setMessage(error instanceof Error?error.message:'通信モニター設定を変更できませんでした。');}
     finally{setBusy('');}
     return;
   }
   const target=accountRows.find(row=>row.id===entry.target_id);
   if(target)await action(target,{action:entry.action,...(entry.action==='visualMode'?{mode:value}:{enabled:value})});
 };
 return <section className="my-section rounded-2xl border border-gray-200 p-5" aria-label="システム管理">
  <div className="my-section-heading"><h2>システム管理</h2><button onClick={()=>void load().catch(()=>{})}>更新</button></div>
  <label className="my-3 flex flex-wrap items-center gap-2 text-sm">
   接続先
   <select className="rounded-lg border px-2 py-1" value={preferredApi} disabled={!!busy}
    onChange={event=>{
     setApiPreference(event.target.value);setPreferredApi(getApiPreference());
     void load().catch(()=>{});refreshAudit();
     window.dispatchEvent(new Event('xerox-system-monitor-updated'));
    }}>
    <option value="auto">自動</option><option value="2">予備APIを優先</option>
   </select>
  </label>
  <div className="my-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" role="search" aria-label="管理対象アカウントの絞り込み">
   <label className="flex min-w-[170px] flex-1 flex-col gap-1">ユーザー名検索<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="ユーザー名の一部を入力" className="w-full rounded-lg border bg-white p-2"/></label>
   <label className="flex flex-col gap-1">アカウント状態<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="rounded-lg border bg-white p-2"><option value="all">すべて</option><option value="banned">BAN中</option><option value="traffic">通信停止中</option><option value="active">有効</option><option value="master">マスター</option><option value="viewing">閲覧中</option><option value="offline">オフライン</option></select></label>
   <label className="flex flex-col gap-1">画面モード<select value={modeFilter} onChange={event=>setModeFilter(event.target.value)} className="rounded-lg border bg-white p-2"><option value="all">すべて</option><option value="off">通常</option><option value="chaos">カオス</option><option value="chaos2">カオス2</option><option value="jelly">ゼリー</option><option value="spin">スピン</option><option value="quake">地震</option><option value="zero">無重力</option><option value="mirror">ミラー</option><option value="burning">バーニング</option></select></label>
   <label className="flex flex-col gap-1">表示順<select value={sort} onChange={event=>setSort(event.target.value)} className="rounded-lg border bg-white p-2"><option value="viewing">閲覧中を先に表示</option><option value="communication">最終通信が新しい順</option><option value="registered">登録が新しい順</option><option value="oldest">登録が古い順</option></select></label>
   <button type="button" className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={!search&&statusFilter==='all'&&modeFilter==='all'} onClick={()=>{setSearch('');setStatusFilter('all');setModeFilter('all');}}>絞り込み解除</button>
  </div>
  <p className="text-xs text-gray-500" role="status">{filteredAccounts.length} / {accountRows.length} アカウント表示</p>
  {isOwner&&<div className="rounded-xl bg-gray-50 p-4 text-sm"><h3 className="font-bold">推薦用Googleアカウント</h3><p className="mt-2 text-xs text-gray-600">一般アカウントには接続情報を公開せず、ホームとShortsの読み取りだけに使用します。高評価・登録・コメントなどの操作には使用されません。</p><p className="mt-2">{source?.configured?`${source.user?.name||'Googleアカウント'}を使用中`:'未設定'}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy==='source'} className="rounded-full bg-gray-900 px-4 py-2 text-xs text-white disabled:opacity-50" onClick={()=>void sourceAction('useCurrent')}>現在のGoogle連携を推薦用に設定</button>{source?.configured&&<button disabled={busy==='source'} className="rounded-full bg-gray-200 px-4 py-2 text-xs disabled:opacity-50" onClick={()=>void sourceAction('remove')}>解除</button>}</div></div>}
  {message&&<p role="status" className="my-3 text-sm">{message}</p>}
  <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b"><th className="p-2">アカウント</th><th className="p-2">利用量</th><th className="p-2">最終通信</th><th className="p-2">状態</th><th className="p-2">閲覧状態</th><th className="p-2">パスワード再設定</th><th className="p-2">画面モード・会話</th><th className="p-2">操作</th></tr></thead><tbody>{filteredAccounts.map(item=><tr key={item.id} className="border-b align-top"><td className="p-2"><b>{item.username}</b>{item.username.toLowerCase()==='xerox0521'?<small className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900">保護対象</small>:null}{item.is_master?<small className="ml-2 rounded bg-purple-100 px-2 py-0.5 text-purple-800">マスター</small>:null}<small className="block text-gray-500">{new Date(item.created_at).toLocaleString('ja-JP')}</small></td><td className="p-2">通信 {item.requests||0}<br/>動画 {item.videos||0}・検索 {item.searches||0}</td><td className="whitespace-nowrap p-2">{item.last_seen?new Date(item.last_seen).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'記録なし'}</td><td className="p-2">{item.banned?'BAN中':item.traffic_stopped?'通信停止中':'有効'}</td><td className="p-2"><span className={item.viewing?'font-semibold text-green-700':'text-gray-500'}>{item.viewing?'● 閲覧中':'オフライン'}</span>{item.viewing&&<div className="mt-1 max-w-64 text-xs"><span className="block text-gray-600">{item.viewing_page||'ページ情報を取得中'}</span>{item.viewing_title&&<span className="mt-1 block break-words font-medium text-gray-800" title={item.viewing_title}>{item.viewing_title}</span>}</div>}</td><td className="p-2"><input type="password" minLength={12} value={passwords[item.id]||''} onChange={event=>setPasswords(value=>({...value,[item.id]:event.target.value}))} placeholder="新しいパスワード（12文字以上）" className="w-56 rounded-lg border px-2 py-1.5"/><button disabled={(passwords[item.id]||'').length<12||!!busy||item.username.toLowerCase()==='xerox0521'||!!item.is_master} className="ml-2 rounded-lg bg-gray-200 px-3 py-1.5 disabled:opacity-40" onClick={()=>void action(item,{action:'resetPassword',password:passwords[item.id]})}>変更</button></td><td className="p-2"><div className="flex max-w-xs flex-wrap gap-2"><button type="button" role="switch" aria-checked={!!item.monitoring} disabled={!!busy} className="rounded-lg border px-3 py-2 aria-checked:bg-amber-200 aria-checked:text-black" onClick={()=>void action(item,{action:'monitoring',enabled:!item.monitoring})}>1分監視 {item.monitoring?'オン':'オフ'}</button>{[['off','通常'],['chaos','カオス'],['chaos2','カオス2'],['jelly','ゼリー'],['spin','スピン'],['quake','地震'],['zero','無重力'],['mirror','ミラー'],['burning','バーニング']].map(([mode,label])=><button key={mode} type="button" aria-pressed={(item.visual_mode||'off')===mode} disabled={!!busy||item.username.toLowerCase()==='xerox0521'} className="rounded-lg border px-3 py-2 aria-pressed:bg-purple-200" onClick={()=>void action(item,{action:'visualMode',mode})}>{label}</button>)}<button type="button" className="rounded-lg bg-indigo-100 px-3 py-2" onClick={()=>window.dispatchEvent(new CustomEvent('xerox-open-dm',{detail:{target:item.username}}))}>会話</button></div></td><td className="p-2"><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-sky-100 px-3 py-1.5" onClick={()=>{setLogUserId(item.id);document.getElementById('system-live-logs')?.scrollIntoView({behavior:'smooth',block:'start'});}}>通信ログ</button><button title={!item.is_master&&account?.username?.toLowerCase()!=='xerox0521'?'マスター付与はXerox0521のみ実行できます':undefined} disabled={!!busy||item.username===account?.username||item.username.toLowerCase()==='xerox0521'||(!item.is_master&&account?.username?.toLowerCase()!=='xerox0521')} className="rounded-lg bg-purple-100 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" onClick={()=>{if(confirm(`${item.username} のマスター権限を${item.is_master?'取り消し':'付与'}しますか？`))void action(item,{action:'master',enabled:!item.is_master});}}>{item.is_master?'マスター解除':'マスター付与'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||(!!item.is_master&&!item.traffic_stopped)} className="rounded-lg bg-amber-100 px-3 py-1.5" onClick={()=>void action(item,{action:'traffic',enabled:!item.traffic_stopped})}>{item.traffic_stopped?'通信再開':'通信停止'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||(!!item.is_master&&!item.banned)} className="rounded-lg bg-red-100 px-3 py-1.5" onClick={()=>void action(item,{action:'ban',enabled:!item.banned})}>{item.banned?'BAN解除':'BAN'}</button><button disabled={!!busy||item.username.toLowerCase()==='xerox0521'||!!item.is_master} className="rounded-lg border border-red-300 px-3 py-1.5 text-red-700" onClick={()=>{if(confirm(`${item.username} を削除しますか？この操作は元に戻せません。`))void action(item,{action:'delete'});}}>削除</button></div></td></tr>)}</tbody></table></div>
 {!filteredAccounts.length&&<p className="mt-3 text-sm text-gray-500">条件に一致するアカウントはありません。</p>}
 <AdminActionHistory revision={auditRevision} busy={!!busy} canApply={canApply} apply={(entry,value)=>void applyHistory(entry,value)}/>
 <SystemLogPanel onSettingChange={refreshAudit} accounts={accountRows} selectedUserId={logUserId} onUserChange={setLogUserId}/>
 <ReleaseStatus/></section>;
}
