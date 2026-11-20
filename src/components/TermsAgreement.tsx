import {apiFetch} from '../lib/apiTransport.mjs';
import {useEffect,useState,type ReactNode} from 'react';
type Document={version:string;sections:[string,string][];accepted:boolean};
async function request(body?:unknown){const response=await apiFetch('/api/account/terms',{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Error(data.error||'規約を取得できませんでした。');return data;}
export function TermsContent({document}:{document:Document}){return <article className="terms-content"><h2>利用規約</h2><p>規約版：{document.version}</p>{document.sections.map(([title,body])=><section key={title}><h3>{title}</h3><p>{body}</p></section>)}</article>;}
export function RegistrationTerms({onChange}:{onChange:(version:string)=>void}){const [document,setDocument]=useState<Document|null>(null),[error,setError]=useState(''),[checked,setChecked]=useState(false);useEffect(()=>{void request().then(setDocument).catch(e=>setError(e.message));},[]);return <div className="registration-terms">{document?<><details><summary>利用規約を確認する</summary><TermsContent document={document}/></details><label><input type="checkbox" checked={checked} required onChange={e=>{setChecked(e.target.checked);onChange(e.target.checked?document.version:'');}}/>利用規約を確認し、同意します。未成年の場合は保護者等の同意を得ています。</label></>:<p role="status">{error||'利用規約を読み込んでいます…'}</p>}</div>;}
export default function TermsGate({children,onAccepted,onLogout,alreadyAccepted=false}:{children:ReactNode;alreadyAccepted?:boolean;onAccepted:()=>void;onLogout:()=>void}){
 const [document,setDocument]=useState<Document|null>(null),[accepted,setAccepted]=useState(false),[checked,setChecked]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>request().then(data=>{setDocument(data);setAccepted(data.accepted===true);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{
  if(!alreadyAccepted){void load();return;}
  setAccepted(false);
  setDocument(null);
  setChecked(false);
  setError('');
 },[alreadyAccepted]);
 if(alreadyAccepted||accepted)return children;
 if(!document&&!error)return null;
 return <main className="terms-gate"><div className="terms-card"><header><p>CONTINUE TO XEROXYT</p><h1>{document?'利用規約をご確認ください':'利用規約を取得できませんでした'}</h1><p>既存のアカウントも、現在の規約への同意が必要です。同意前に通常機能は利用できません。</p></header>{document&&<TermsContent document={document}/>}<form onSubmit={e=>{e.preventDefault();if(!document||!checked)return;setBusy(true);void request({version:document.version,accepted:true}).then(()=>{setAccepted(true);onAccepted();}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{document&&<label className="terms-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>規約を確認し、同意します。未成年の場合は保護者等の同意を得ています。</label>}{error&&<p role="alert" className="terms-error">{error}</p>}<div className="terms-actions"><button disabled={!document||!checked||busy}>同意して続ける</button><button type="button" onClick={onLogout}>同意せずログアウト</button>{!document&&<button type="button" onClick={()=>void load()}>再取得</button>}</div></form></div></main>;
}
