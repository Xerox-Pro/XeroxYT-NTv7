// All application API requests use the same-origin Vercel proxy.
// The upstream API workers are server-side details, never browser fallbacks.
export function readTransportState(){ return {mode:'proxy', automatic:false}; }
export function setTransportMode(_mode){ /* Direct access is intentionally disabled. */ }

function sameOriginPath(path){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')) throw new Error('APIの接続先が無効です。');
  const url=new URL(path,window.location.origin);
  if(url.origin!==window.location.origin) throw new Error('外部APIへの直接接続は禁止されています。');
  return url.pathname+url.search+url.hash;
}

export function apiFetch(path,options={}){
  const target=sameOriginPath(path);
  if(typeof sessionStorage!=='undefined'&&sessionStorage.getItem('xerox_guest')==='true'
      &&/^\/api\/(auth|user)(\/|$)/.test(target)){
    return Promise.resolve(Response.json({error:'アカウント連携にはログインしてください。',code:'SITE_SESSION_REQUIRED'},{status:401}));
  }
  const headers=new Headers(options.headers);
  const method=(options.method||'GET').toUpperCase();
  if(method==='GET'&&/^\/api\/(?:recommendations|trending|search|suggestions|video|channel|channels|home|mix|shorts|shorts-ranking|user|playlists|playlist|sync)(?:[/?]|$)/.test(target))headers.set('X-XeroxYT-Sidecar','1');
  return fetch(target,{...options,headers,credentials:'same-origin'}).then(response=>{
    const sidecar=response.headers.get('X-XeroxYT-Sidecar');
    if(sidecar){try{window.dispatchEvent(new CustomEvent('xerox-api-sidecar',{detail:JSON.parse(decodeURIComponent(sidecar))}));}catch{}}
    if(response.status===403||response.status===429){void response.clone().json().then(data=>{
      if(data?.code==='ACCOUNT_BANNED')window.dispatchEvent(new CustomEvent('xerox-account-banned'));
      if(data?.code==='ACCOUNT_TIMEOUT')window.dispatchEvent(new CustomEvent('xerox-account-timeout',{detail:data}));
    }).catch(()=>{});}
    return response;
  });
}
