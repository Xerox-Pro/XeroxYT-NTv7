// Public player configuration is fetched directly by the browser, never by our API.
const SOURCE='https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json';
let lastParams='';
let refreshedAt=0;
let inFlight=null;
const CONFIG_TTL=15*60*1000;
const CONFIG_KEY='xerox_gas_public_embed_config_v1';
try{
 const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');
 if(saved&&typeof saved.params==='string'&&saved.params.length<64000&&!/[<>]/.test(saved.params)&&saved.params.includes('=')&&Number.isFinite(saved.at)&&saved.at<=Date.now()&&Date.now()-saved.at<CONFIG_TTL){lastParams=saved.params;refreshedAt=saved.at;}
}catch{}
function withCancellation(task,signal){
  if(!signal)return task;
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const cancel=()=>{signal.removeEventListener('abort',cancel);reject(signal.reason||new Error('Aborted'));};
    signal.addEventListener('abort',cancel,{once:true});
    task.then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});
  });
}
async function playerParams(signal){
  if(lastParams&&Date.now()-refreshedAt<CONFIG_TTL)return lastParams;
  // All simultaneously prepared Shorts share one config request. A cancelled
  // slide must not abort the request needed by the remaining slides.
  if(!inFlight)inFlight=(async()=>{
    const response=await fetch(SOURCE,{credentials:'omit',cache:'no-cache',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('Configuration unavailable');
    let text=(await response.text()).replace(/&amp;/g,'&').trim();
    if(text.startsWith('{')){const data=JSON.parse(text);if(typeof data.params!=='string')throw new Error('Invalid configuration');text=data.params.replace(/&amp;/g,'&').trim();}
    const index=text.indexOf('?');if(index>=0)text=text.slice(index+1);else text=text.replace(/^[?&]/,'');
    if(!text||/[<>]/.test(text)||!text.includes('='))throw new Error('Invalid configuration');
    lastParams=text;refreshedAt=Date.now();
    try{localStorage.setItem(CONFIG_KEY,JSON.stringify({params:lastParams,at:refreshedAt}));}catch{}
    return text;
  })().finally(()=>{inFlight=null;});
  try{return await withCancellation(inFlight,signal);}catch(error){if(signal?.aborted)throw error;return lastParams;}
}
export function warmDeviceEmbedConfig(){void playerParams().catch(()=>{});}
export async function getDeviceEmbedUrl(id,signal) {
  signal?.throwIfAborted();
  const params=await playerParams(signal);
  const url=new URL(`https://${params?'www.youtubeeducation.com':'www.youtube-nocookie.com'}/embed/${encodeURIComponent(id)}`);
  url.search=params||'rel=0';
  return url.toString();
}

export function invalidateDeviceEmbedConfig(){refreshedAt=0;lastParams='';try{localStorage.removeItem(CONFIG_KEY);}catch{}}
