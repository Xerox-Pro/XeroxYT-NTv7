import {useCallback,useEffect,useState} from 'react';

export type Entry={
 id:number;at:number;actor:string;target_id:string|null;target:string|null;
 action:string;before:boolean|string|null;after:boolean|string|null;
};
const labels:Record<string,string>={
 ban:'BAN',traffic:'通信停止',visualMode:'画面モード',monitoring:'1分監視',
 master:'マスター権限',resetPassword:'パスワード再設定',delete:'アカウント削除',
 systemMonitor:'リアルタイム通信モニター',recommendationSource:'推薦用Googleアカウント',
};
export const modeLabels:Record<string,string>={
 off:'通常',chaos:'カオス',chaos2:'カオス2',jelly:'ゼリー',spin:'スピン',
 quake:'地震',zero:'無重力',mirror:'ミラー',burning:'バーニング',
};
const display=(value:Entry['before'])=>typeof value==='boolean'?(value?'オン':'オフ'):value===null?'':modeLabels[value]??value;
const date=new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Tokyo'});

export default function AdminActionHistory({revision,busy,canApply,apply}:{
 revision:number;busy:boolean;canApply:(entry:Entry,value:Entry['before'])=>boolean;
 apply:(entry:Entry,value:Entry['before'])=>void;
}){
 const [entries,setEntries]=useState<Entry[]>([]);
 const [cursor,setCursor]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const load=useCallback(async (before?:number,signal?:AbortSignal)=>{
  setLoading(true);setError('');
  try{
   const response=await fetch('/api/account/admin/action-history'+(before?'?before='+before:''),{
    cache:'no-store',credentials:'same-origin',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),
   });
   const data=await response.json();
   if(!response.ok||!Array.isArray(data.entries))throw new Error(data.error||'管理操作履歴を取得できませんでした。');
   if(signal?.aborted)return;
   setEntries(previous=>before?[...previous,...data.entries]:data.entries);
   setCursor(data.nextBefore);
  }catch(cause){
   if(!signal?.aborted)setError(cause instanceof Error?cause.message:'管理操作履歴を取得できませんでした。');
  }finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  void load(undefined,controller.signal);
  return()=>controller.abort();
 },[load,revision]);
 return <section className="my-6 rounded-2xl border border-gray-400/30 p-4" aria-label="管理操作履歴">
  <div className="my-section-heading"><h3>管理操作履歴</h3><button disabled={loading} onClick={()=>void load()}>更新</button></div>
  {error&&<p role="alert">{error}</p>}
  {!entries.length&&!error&&<p role="status">{loading?'読み込み中…':'管理操作の記録はまだありません。'}</p>}
  <ul className="divide-y divide-gray-400/30">
   {entries.map(entry=><li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
    <div>
     <time dateTime={new Date(entry.at).toISOString()}>{date.format(entry.at)}</time>
     <span className="ml-2">{entry.actor} → {entry.target??'システム'}</span>
     <p className="mt-1 font-semibold">{labels[entry.action]??entry.action}{entry.before!==null?'　'+display(entry.before)+' → '+display(entry.after):''}</p>
    </div>
    <div className="flex flex-wrap gap-2">
     {canApply(entry,entry.before)&&<button className="rounded-lg border px-2 py-1" disabled={busy||loading}
      onClick={()=>{if(confirm((entry.target??'システム')+'の「'+labels[entry.action]+'」を '+display(entry.before)+' に変更しますか？'))apply(entry,entry.before);}}>変更前に戻す</button>}
     {canApply(entry,entry.after)&&<button className="rounded-lg border px-2 py-1" disabled={busy||loading}
      onClick={()=>{if(confirm((entry.target??'システム')+'の「'+labels[entry.action]+'」を '+display(entry.after)+' に変更しますか？'))apply(entry,entry.after);}}>再適用</button>}
     {['delete','resetPassword'].includes(entry.action)&&<span className="opacity-70">履歴のみ</span>}
    </div>
   </li>)}
  </ul>
  {cursor!==null&&<button disabled={loading} className="rounded-lg border px-3 py-2" onClick={()=>void load(cursor)}>以前の履歴を表示</button>}
 </section>;
}
