const MODE_KEY='xerox_api_transport_v1',AUTO_KEY='xerox_api_auto_proxy_until_v1';
let configured;
export function readTransportState(){let mode='auto',automatic=false;try{const saved=localStorage.getItem(MODE_KEY);if(['auto','direct','proxy'].includes(saved))mode=saved;automatic=Number(localStorage.getItem(AUTO_KEY)||0)>Date.now();}catch{}return {mode,automatic};}
export function setTransportMode(mode){if(!['auto','direct','proxy'].includes(mode))return;localStorage.setItem(MODE_KEY,mode);localStorage.removeItem(AUTO_KEY);window.dispatchEvent(new Event('xerox-transport-changed'));}
function origins() {
  if (!configured) {
    configured = fetch('/api/transport-config', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(4000),
    }).then(async response => {
      if (!response.ok) throw new Error('API configuration unavailable');
      const data = await response.json();
      if (!Array.isArray(data?.origins)) throw new Error('Invalid API configuration');
      return data.origins.flatMap(value => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && url.origin === value ? [url.origin] : [];
        } catch {
          return [];
        }
      });
    }).catch(() => {
      configured = undefined;
      return null;
    });
  }
  return configured;
}
// Google credentials never enter the browser. Only a five-minute site-scoped ticket is kept in memory.
let privateTicket,privateTicketRequest,privateScope;
async function googleFetch(path,options){
 const scope=(()=>{try{return localStorage.getItem('xerox_last_account_id')||'';}catch{return '';}})();
 if(privateScope!==scope){privateScope=scope;privateTicket=undefined;privateTicketRequest=undefined;}
 if(!privateTicket||privateTicket.expiresAt<Date.now()+15000){
  if(!privateTicketRequest){const currentScope=scope;const task=fetch('/api/account/cloudflare-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{
   if(!response.ok)throw new Error('Cloudflareへの接続を確認できませんでした。再読み込みしてください。');const data=await response.json();const origin=new URL(data.origin);
   if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev')||!data.token||data.expiresAt<=Date.now())throw new Error('Cloudflareの接続設定が無効です。');
   if(privateScope!==currentScope)throw new Error('ログイン状態が変わりました。');privateTicket={...data,origin:origin.origin};return privateTicket;
  }).finally(()=>{if(privateTicketRequest===task)privateTicketRequest=undefined;});privateTicketRequest=task;}
  await privateTicketRequest;
 }
 options.signal?.throwIfAborted();
 const ticket=privateTicket,headers=new Headers(options.headers);headers.set('Authorization','XYT '+ticket.token);
 const response=await fetch(ticket.origin+path,{...options,headers,credentials:'omit',mode:'cors',cache:'no-store',redirect:'error'});
 if(response.status===401&&response.headers.get('content-type')?.includes('application/json')){const data=await response.clone().json().catch(()=>null);if(data?.code==='SITE_SESSION_REQUIRED')privateTicket=undefined;}
 return response;
}
export async function apiFetch(path,options={}){
 if(/^\/api\/(auth|user)(\/|$)/.test(path))return googleFetch(path,options);
 if(!path.startsWith('/api/')||/^\/api\/(account|auth|user)(\/|$)/.test(path)||(options.method&&options.method!=='GET'))return fetch(path,options);
 const state=readTransportState();if(state.mode==='proxy'||(state.mode==='auto'&&state.automatic))return fetch(path,{...options,credentials:'same-origin'});
 const list=await origins();
 options.signal?.throwIfAborted();
 if(list === null && state.mode === 'auto')return fetch(path,{...options,credentials:'same-origin'});
 for(const origin of list || []){try{const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);const response=await fetch(origin+path,{...options,credentials:'include',mode:'cors',signal});if(response.ok && !response.headers.get('content-type')?.includes('text/html'))return response;await response.body?.cancel();}catch(error){if(options.signal?.aborted)throw error;}}
 if(state.mode==='direct')throw new Error('APIへ直接接続できません。マイページの接続設定を「自動」か「サーバー経由」に変更してください。');
 try{localStorage.setItem(AUTO_KEY,String(Date.now()+10*60*1000));window.dispatchEvent(new Event('xerox-transport-changed'));}catch{}
 return fetch(path,{...options,credentials:'same-origin'});
}
