import {useEffect,useRef,useState} from 'react';
import {QrCode,RefreshCw,ShieldCheck,ExternalLink} from 'lucide-react';
import {socialRequest} from './client';

type QR={flowId:string;qrCodeUrl:string;qrImage?:string;expiresAt:number;status:string};
export default function TikTokQrLogin({onConnected}:{onConnected:()=>void}){
 const [consent,setConsent]=useState(false),[qr,setQr]=useState<QR|null>(null),[status,setStatus]=useState(''),[error,setError]=useState(''),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false);
 const inFlight=useRef(false),done=useRef(false);
 const start=async()=>{if(busy||!consent)return;setBusy(true);setError('');setStatus('');
  try{const data=await socialRequest('tiktok','qr/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});done.current=false;setQr(data);setStatus('TikTokアプリでQRコードを読み取って承認してください。');}
  catch(e:any){setQr(null);setBlocked(e.code==='QR_UPSTREAM_FORBIDDEN');setError(e.message||'QRコードを取得できませんでした。');}
  finally{setBusy(false);}
 };
 useEffect(()=>{if(!qr?.flowId)return;let cancelled=false;
  const poll=async()=>{if(cancelled||done.current||inFlight.current||document.hidden)return;
   if(Date.now()>=qr.expiresAt){setQr(null);setStatus('QRコードの期限が切れました。再発行してください。');return;}
   inFlight.current=true;
   try{const result=await socialRequest('tiktok','qr/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flowId:qr.flowId})});
    if(cancelled)return;
    if(result.status==='confirmed'&&result.connected){done.current=true;setQr(null);setStatus('TikTokアカウントを接続しました。');onConnected();}
    else if(result.status==='expired'){setQr(null);setStatus('QRコードが期限切れです。再発行してください。');}
    else if(result.status==='scanned')setStatus('スキャンを確認しました。TikTokアプリで承認してください。');
   }catch(e:any){if(!cancelled){setQr(null);setError(e.message||'ログイン確認ができませんでした。');}}
   finally{inFlight.current=false;}
  };
  const timer=setInterval(()=>void poll(),3500);
  const onFocus=()=>void poll();window.addEventListener('focus',onFocus);
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',onFocus);};
 },[qr?.flowId,qr?.expiresAt,onConnected]);
 return <section className="tiktok-qr-login">
  <header><QrCode size={21}/><strong>TikTokアプリでQRログイン</strong></header>
  <p>ログイン情報はTikTokの認証画面で承認します。この機能は非公式APIに依存し、利用できない環境もあります。</p>
  {!qr&&!blocked&&<label className="social-check"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>自分のアカウントを接続し、非公式APIによる認証のリスクに同意します</label>}
  {!qr&&!blocked?<button className="social-primary" disabled={!consent||busy} onClick={()=>void start()}><QrCode size={18}/>{busy?'発行中…':'QRコードを発行'}</button>:qr?<div className="tiktok-qr-code">
    {qr.qrImage?<img src={qr.qrImage} alt="TikTokアプリでスキャンするログイン用QRコード"/>:<p>この接続先からQR画像を取得できませんでした。公式リンクからログインを行えます。</p>}
    <a href={qr.qrCodeUrl} target="_blank" rel="noopener noreferrer">TikTokの認証リンクを開く <ExternalLink size={15}/></a>
    <button className="social-secondary" onClick={()=>{setQr(null);setStatus('');}}><RefreshCw size={15}/>別のQRコードを発行する</button>
   </div>:null}
  {status&&<p role="status"><ShieldCheck size={15}/> {status}</p>}
  {error&&<div role="alert" className="social-alert">
   <p>{error}</p>
   {blocked&&<p>非公式QR発行先がアクセスを拒否しています。同じ接続を繰り返しても解決しないため、公式のTikTok Login Kitによる認証を利用してください。公式連携には開発者アプリの登録・承認とサーバー側の設定が必要です。</p>}
   {blocked&&<a href="https://developers.tiktok.com/docs/en/login-kit-qr-code-authorization" target="_blank" rel="noopener noreferrer">TikTok公式QR認証の開発者向け説明 <ExternalLink size={14}/></a>}
  </div>}
  <small>ログイン状態の確認はQR発行後だけ行います。ログイン用セッションはサーバー側で一時保存し、未承認のまま期限切れになった情報は連携に使いません。</small>
 </section>;
}
