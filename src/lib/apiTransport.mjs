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
let privateTicket,privateTicketRequest,privateScope,privateProxy=false;
const privateReads=new Map();
let activePrivate=0,privateBlockedUntil=0;const privateQueue=[];
async function limitedPrivate(work){if(activePrivate>=4){if(privateQueue.length>=40)throw new Error('通信が集中しています。少し待ってから操作してください。');await new Promise(resolve=>privateQueue.push(resolve));}else activePrivate++;try{if(Date.now()<privateBlockedUntil)throw new Error('リクエストが集中しています。少し待ってから再試行してください。');const response=await work();if(response.status===429){const retry=Number(response.headers.get('retry-after'));privateBlockedUntil=Date.now()+Math.min(60000,Math.max(1000,Number.isFinite(retry)&&retry>0?retry*1000:10000));}return response;}finally{const next=privateQueue.shift();if(next)next();else activePrivate--;}}
async function googleFetchRequest(path,options,directOnly=false){
 const state=directOnly?{mode:'direct',automatic:false}:readTransportState();
 if(!directOnly&&(state.mode==='proxy'||privateProxy||(state.mode==='auto'&&state.automatic)))return fetch(path,{...options,credentials:'same-origin'});
 const proxy=()=>{privateProxy=true;return fetch(path,{...options,credentials:'same-origin'});};
 try{
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
 const readonly=!options.method||['GET','HEAD'].includes(options.method);const timeout=readonly?AbortSignal.timeout(8000):undefined;const signal=timeout?(options.signal?AbortSignal.any([options.signal,timeout]):timeout):options.signal;
 let response;try{response=await fetch(ticket.origin+path,{...options,signal,headers,credentials:'omit',mode:'cors',cache:'no-store',redirect:'error'});}catch(error){if(options.signal?.aborted)throw error;if(state.mode==='auto'&&(!options.method||['GET','HEAD'].includes(options.method)))return proxy();throw error;}
 if(state.mode==='auto'&&readonly&&!response.headers.get('content-type')?.includes('application/json')){await response.body?.cancel();return proxy();}
 if(response.status===401&&response.headers.get('content-type')?.includes('application/json')){const data=await response.clone().json().catch(()=>null);if(data?.code==='SITE_SESSION_REQUIRED')privateTicket=undefined;}
 return response;
 }catch(error){if(options.signal?.aborted)throw error;if(state.mode==='auto'&&!privateTicket)return proxy();throw error;}
}
function googleFetch(path,options){
 const readonly=!options.method||options.method==='GET';
 let scope='';try{scope=localStorage.getItem('xerox_last_account_id')||'';}catch{}
 const key=scope+'|'+path;
 const work=()=>{options.signal?.throwIfAborted();let current='';try{current=localStorage.getItem('xerox_last_account_id')||'';}catch{}if(current!==scope)throw new Error('ログイン状態が変わりました。');return googleFetchRequest(path,options);};
 if(!readonly||options.signal)return limitedPrivate(work);
 let task=privateReads.get(key);if(!task){task=limitedPrivate(work).finally(()=>{if(privateReads.get(key)===task)privateReads.delete(key);});privateReads.set(key,task);}
 return task.then(response=>response.clone());
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

export function cloudflareOnlyFetch(path,options={}){if(!/^\/api\/(instagram|tiktok)(\/|$)/.test(path))throw new Error('サービスの接続先が無効です。');return limitedPrivate(()=>googleFetchRequest(path,options,true));}
