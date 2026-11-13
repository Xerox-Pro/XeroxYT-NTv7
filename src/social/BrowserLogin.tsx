import {useRef,useState} from 'react';
import {LogIn,RefreshCw} from 'lucide-react';
import {Service,socialRequest} from './client';
type Phase='credentials'|'code'|'pending';
export default function BrowserLogin({service,enabled,onConnected}:{service:Service;enabled:boolean;onConnected:()=>void}){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[consent,setConsent]=useState(false),[active,setActive]=useState(false),[phase,setPhase]=useState<Phase>('credentials'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const lock=useRef(false);
 const post=(route:string,body:object={})=>socialRequest(service,'login/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const accept=(result:any,preserveForm=false)=>{
  if(result.connected){setActive(false);setPhase('credentials');setPassword('');setCode('');setMessage('ログインが完了しました。');onConnected();return true;}
  setMessage(result.message||'ログイン結果を確認しています。');
  if(result.state==='code_required')setPhase('code');
  else if(result.state==='invalid_credentials'){setError(result.message);setPhase(phase==='code'?'code':'credentials');}
  else if(['captcha_required','unsupported'].includes(result.state)){setError(result.message);if(!preserveForm)setPhase('credentials');}
  else if(!preserveForm)setPhase('pending');
  return result.state!=='pending';
 };
 const run=async(operation:'credentials'|'verify'|'check'|'cancel')=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage(operation==='check'?'ログイン状態を確認中…':'認証中…');
  const credentials={username:username.trim(),password},verification={code};if(operation==='credentials')setPassword('');if(operation==='verify')setCode('');
  try{
   if(operation==='cancel'){await post('cancel');setPassword('');setCode('');setActive(false);setPhase('credentials');setMessage('ログインを中止しました。');return;}
   if(operation==='credentials'&&!active){await post('start',{consent});setActive(true);}
   const complete=async(result:any)=>result.state==='authenticated'?await post('finish'):result;
   let result=await complete(await post(operation,operation==='credentials'?credentials:operation==='verify'?verification:{}));
   for(let attempt=0;attempt<3;attempt++){if(accept(result,operation==='check'||attempt>0))return;await new Promise(resolve=>setTimeout(resolve,1200));result=await complete(await post('check'));}accept(result,true);if(result.state==='pending')setMessage('まだ認証が完了していません。公式アプリへの承認通知も確認し、「ログイン状態を確認」を押してください。');
  }catch(e:any){setError(e.message||'ログインに失敗しました。もう一度お試しください。');}
  finally{lock.current=false;setBusy(false);}
 };
 return <section className="social-browser-login"><h3>{service==='instagram'?'Instagram':'TikTok'}にログイン</h3><p>ユーザーIDとパスワードで接続します。追加認証が必要な場合は認証コードを入力してください。</p><p>サーバー上で公式サイトの認証を行い、ログイン後のCookieだけを暗号化保存します。パスワード・認証コードは保存しません。</p>{!enabled?<p>この環境ではログイン機能が有効になっていません。</p>:<><label className="social-check"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={active||busy}/>サーバーでの認証とCookieの保存に同意します</label><div className="social-login-fields">{phase==='credentials'&&<form onSubmit={event=>{event.preventDefault();void run('credentials');}}><label htmlFor="social-login-username">ユーザーID・メールアドレス</label><input id="social-login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event=>setUsername(event.target.value)} maxLength={300} disabled={busy} required/><label htmlFor="social-login-password">パスワード</label><input id="social-login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} maxLength={500} disabled={busy} required/><button className="social-primary" disabled={!consent||!username.trim()||!password||busy}><LogIn size={17}/>ログイン</button></form>}{phase==='code'&&<form onSubmit={event=>{event.preventDefault();void run('verify');}}><label htmlFor="social-login-code">認証コード</label><input id="social-login-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} value={code} onChange={event=>setCode(event.target.value)} maxLength={32} disabled={busy} required autoFocus/><button className="social-primary" disabled={!code.trim()||busy}>認証してログイン</button></form>}</div>{active&&<div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><button type="button" className="social-secondary" disabled={busy} onClick={()=>void run('check')}><RefreshCw size={16}/>ログイン状態を確認</button><button type="button" className="social-secondary" disabled={busy} onClick={()=>void run('cancel')}>中止してやり直す</button></div>}</>}{message&&<p role="status" aria-live="polite">{message}</p>}{error&&<p className="social-alert" role="alert">{error}</p>}<p>画像認証など、このフォームで処理できない本人確認が必要な場合は接続できません。</p></section>;
}
