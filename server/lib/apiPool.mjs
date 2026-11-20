export function apiPool(env) {
 const entries=Object.entries(env).filter(([key,value])=>/^API_BASE_URL(?:_\d+)?$/.test(key)&&typeof value==='string'&&value.trim()).sort(([a],[b])=>{const ai=a==='API_BASE_URL'?0:Number(a.split('_').at(-1)),bi=b==='API_BASE_URL'?0:Number(b.split('_').at(-1));return ai-bi;});
 return [...new Set(entries.map(([key,value])=>{const input=value.trim();const bare=/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::443)?\/?$/i.test(input);let url;try{url=new URL(bare?'https://'+input:input);}catch{throw new Error(`${key} must be an HTTPS origin`);}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error(`${key} must be an HTTPS origin`);return url.origin;}))];
}
export function canRetry(method,path,status,sharedAccount=false){
 return ['GET','HEAD'].includes(method)
  && (sharedAccount || !/^\/api\/(account|auth)(\/|$)/.test(path))
  && [408,500,502,503,504].includes(status);
}

export function orderApiPool(pool, secondary, preference) {
 return secondary && preference==='2' && pool.includes(secondary)
  ? [secondary,...pool.filter(origin=>origin!==secondary)]
  : pool;
}

// 1027 is returned by Cloudflare before the Worker can execute the request.
export async function workerQuotaExceeded(response) {
 if(response.ok||!response.headers.has('cf-ray')||response.headers.has('x-xeroxyt-proxy'))return false;
 const type=response.headers.get('content-type')||'';
 if(type.includes('json')){
  const data=await response.clone().json().catch(()=>null);
  return data?.cloudflare_error===true&&data.error_code===1027;
 }
 if(!response.body||!/(?:html|plain)/i.test(type))return false;
 const reader=response.clone().body.getReader();
 const decoder=new TextDecoder();
 let prefix='';
 try{
  while(prefix.length<8192){
   const {value,done}=await reader.read();
   if(done)break;
   prefix+=decoder.decode(value,{stream:true});
  }
  return /\bError(?:\s+(?:code|number))?\s*(?:[:#]\s*)?1027\b|\b1027\s*[:—-]\s*Worker/i.test(prefix.slice(0,8192));
 }catch{return false;}
 finally{void reader.cancel().catch(()=>{});}
}
