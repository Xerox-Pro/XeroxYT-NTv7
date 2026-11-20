import {apiFetch} from '../lib/apiTransport.mjs';
import {useEffect,useState} from 'react';
export default function ReleaseStatus(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 const load=async()=>{try{const response=await apiFetch('/api/account/admin/releases',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'取得できませんでした。');setData(result);setError('');}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[]);
 const time=(value:number)=>value?new Date(value).toLocaleString('ja-JP'):'未記録';
 return <section className="mt-6 rounded-xl border border-gray-200 p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">連携中のGAS版・端末バージョン（参考）</h3><button onClick={()=>void load()} className="rounded-lg bg-gray-100 px-3 py-2 text-xs">再取得</button></div>{error&&<p role="status" className="my-2 text-xs text-red-700">{error}</p>}{data&&<><p className="my-3 break-all text-xs">最新公開：{data.latest?.version||'確認待ち'}<br/>公開時刻：{time(data.latest?.published_at)} ／ Cloudflare確認：{time(data.latest?.checked_at)}</p><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr><th>アカウント・端末</th><th>適用バージョン</th><th>適用時刻／最終確認</th><th>状態</th></tr></thead><tbody>{data.devices?.map(d=><tr key={d.username+d.device_id} className="border-t"><td className="py-3">{d.username}<small className="block text-gray-400">{d.device_id.slice(0,8)}</small></td><td className="max-w-xs break-all py-3">{d.version}</td><td>{time(d.applied_at)}<br/>{time(d.last_seen)}</td><td>{d.last_error|| (d.version===data.latest?.version?'最新':'更新待ち')}</td></tr>)}</tbody></table></div></>}</section>;
}
