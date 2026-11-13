const SESSION_KEY='xerox_gas_bridge_session_v1';
export function sessionToken(storage=localStorage,random=crypto){
 let token=storage.getItem(SESSION_KEY);
 if(!/^[a-f0-9]{64}$/.test(token||'')){token=Array.from(random.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');storage.setItem(SESSION_KEY,token);}
 return token;
}
export function rpcRequest(request,signal,run=globalThis.google?.script?.run){
 if(signal?.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,signal.reason||new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  if(!run){finish(reject,new Error('GASの公開URLから開いてください。'));return;}
  run.withSuccessHandler(value=>finish(resolve,value)).withFailureHandler(()=>finish(reject,new Error('GASへの通信に失敗しました。時間を置いて再試行してください。'))).gasRequest(request);
 });
}
export function installBridge(){
 const nativeFetch=window.fetch.bind(window),token=sessionToken();
 let running=0;const pending=[];
 const drain=()=>{while(running<4&&pending.length){const {work,resolve,reject}=pending.shift();running++;work().then(resolve,reject).finally(()=>{running--;drain();});}};
 const limited=work=>new Promise((resolve,reject)=>{if(pending.length>=40){reject(new Error('通信が集中しています。少し待ってください。'));return;}pending.push({work,resolve,reject});drain();});
 window.fetch=async(input,options={})=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
  const request=new Request(url,input instanceof Request?input:undefined);
  const method=(options.method||request.method||'GET').toUpperCase();
  const signal=options.signal||request.signal;
  const headers=Object.fromEntries(new Headers(options.headers||request.headers));
  let body=options.body;
  if(body===undefined&&!['GET','HEAD'].includes(method))body=await request.text();
  if(body!=null&&typeof body!=='string')throw new Error('GAS版ではJSON形式で送信してください。');
  if(!['GET','HEAD'].includes(method)){if(!headers['content-type'])headers['content-type']='application/json';if(!body)body='{}';}
  const result=await limited(()=>rpcRequest({session:token,path:url.pathname+url.search,method,headers,body:body??null},signal));
  if(!result||!Number.isInteger(result.status))throw new Error('GASからの応答が不正です。');
  return new Response([204,205,304].includes(result.status)?null:result.body,{status:result.status,headers:result.headers});
 };
}
