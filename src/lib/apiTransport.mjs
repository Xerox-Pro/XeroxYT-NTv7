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
  return fetch(target,{...options,credentials:'same-origin'});
}

// Legacy name retained for the social clients; requests never go to Cloudflare
// from the browser, including authenticated and public social endpoints.
export function cloudflareOnlyFetch(path,options={}){
  const target=sameOriginPath(path);
  if(!/^\/api\/(instagram|tiktok)(\/|$)/.test(target)) throw new Error('サービスの接続先が無効です。');
  if(typeof sessionStorage!=='undefined'&&sessionStorage.getItem('xerox_guest')==='true'
     &&!/^\/api\/(instagram|tiktok)\/public\//.test(target))
    return Promise.resolve(Response.json({error:'連携にはサイトへのログインが必要です。',code:'SITE_SESSION_REQUIRED'},{status:401}));
  return fetch(target,{...options,credentials:'same-origin'});
}
