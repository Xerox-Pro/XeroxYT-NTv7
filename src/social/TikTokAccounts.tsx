import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,UserRound,Trash2,CheckCircle2,ArrowRightLeft} from 'lucide-react';
import {socialRequest} from './client';
type Account={id:string;username:string;name:string;avatar:string};
type Accounts={accounts:Account[];activeId:string|null};
export default function TikTokAccounts({onChanged}:{onChanged:()=>void}){
 const [data,setData]=useState<Accounts>({accounts:[],activeId:null}),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const result=await socialRequest('tiktok','accounts');setData(result);setError('');}catch(e:any){setError(e.message||'アカウント一覧を取得できません。');}},[]);
 useEffect(()=>{void load();},[load]);
 const change=async(account:Account,action:'activate'|'remove')=>{
  if(busy)return;
  if(action==='remove'&&!window.confirm('@'+account.username+' のTikTok連携をこのサイトから削除しますか？'))return;
  setBusy(account.id+action);setError('');
  try{const result=await socialRequest('tiktok','accounts/'+action,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:account.id})
  });
   setData({accounts:result.accounts||data.accounts,activeId:result.activeId||null});
   onChanged();
  }catch(e:any){setError(e.message||'切り替えに失敗しました。');}
  finally{setBusy('');}
 };
 return <section className="tt-accounts" aria-label="TikTok連携アカウント一覧">
  <header><h3>連携済みアカウント</h3><button type="button" disabled={!!busy} onClick={()=>void load()} aria-label="アカウント一覧を更新"><RefreshCw size={18}/></button></header>
  <p>アカウントごとにおすすめ・検索・DMのセッションを分離します。切り替えはすぐに反映されます。</p>
  {!data.accounts.length&&!error&&<p>連携済みアカウントはありません。下のQRコードから追加できます。</p>}
  {data.accounts.map(account=><div className="tt-account-row" key={account.id}>
   {account.avatar?<img src={account.avatar} alt="" />:<UserRound size={29}/>}
   <div className="tt-account-name"><b>{account.name||account.username}</b><small>@{account.username}</small></div>
   {data.activeId===account.id?<span className="tt-account-active"><CheckCircle2 size={16}/>使用中</span>:<button type="button" disabled={!!busy} onClick={()=>void change(account,'activate')}><ArrowRightLeft size={15}/>切替</button>}
   <button type="button" className="tt-account-remove" disabled={!!busy} title="連携を削除" aria-label={'@'+account.username+'の連携を削除'} onClick={()=>void change(account,'remove')}><Trash2 size={16}/></button>
  </div>)}
  {error&&<p className="social-alert" role="alert">{error}</p>}
 </section>;
}
