import {get,set,del} from 'idb-keyval';
type BatchRequestItem={key:string;channelId?:string;videoId?:string;author?:string};
export type BatchResponseItem={author?:string;authorAvatar?:string;authorId?:string};
const AVATAR_CACHE_PREFIX='xerox-public-avatar-v2:';
class BatchAvatarFetcher{
 private queue=new Map<string,BatchRequestItem>();private callbacks=new Map<string,Set<(data:BatchResponseItem)=>void>>();private inFlight=new Set<string>();private attempts=new Map<string,number>();private cache=new Map<string,{value:BatchResponseItem;until:number}>();private timer:ReturnType<typeof setTimeout>|null=null;private reading=new Set<string>();
 public invalidate(key:string){this.cache.delete(key);void del(AVATAR_CACHE_PREFIX+key).catch(()=>{});}
 public register(item:BatchRequestItem,callback:(data:BatchResponseItem)=>void){
  if(!item.key)return()=>{};const cached=this.cache.get(item.key);if(cached&&cached.until>Date.now()){callback(cached.value);return()=>{};}
  if(!this.callbacks.has(item.key))this.callbacks.set(item.key,new Set());this.callbacks.get(item.key)!.add(callback);
  if(!this.inFlight.has(item.key)&&!this.reading.has(item.key)){
   this.reading.add(item.key);void this.loadPersisted(item);
  }
  return()=>{const set=this.callbacks.get(item.key);set?.delete(callback);if(!set?.size){this.callbacks.delete(item.key);this.queue.delete(item.key);}};
 }
 private async loadPersisted(item:BatchRequestItem){
  try{
   const saved=await get<BatchResponseItem>(AVATAR_CACHE_PREFIX+item.key);
   if(saved&&typeof saved.authorAvatar==='string'&&saved.authorAvatar&&!saved.authorAvatar.includes('ui-avatars.com')){
    this.cache.set(item.key,{value:saved,until:Infinity});
    if(this.callbacks.has(item.key))this.deliver(item.key,saved);
    return;
   }
  }catch{}finally{this.reading.delete(item.key);}
  if(this.callbacks.has(item.key)&&!this.inFlight.has(item.key)){this.queue.set(item.key,item);this.schedule();}
 }
 private schedule(){if(!this.timer&&this.queue.size)this.timer=setTimeout(()=>void this.flush(),120);}
 private deliver(key:string,info:BatchResponseItem){const set=this.callbacks.get(key);this.callbacks.delete(key);set?.forEach(cb=>cb(info));}
 private async flush(){
  this.timer=null;const items=[...this.queue.values()].slice(0,20);if(!items.length)return;for(const item of items){this.queue.delete(item.key);this.inFlight.add(item.key);}
  let retry=false;
  try{const response=await fetch('/api/channels/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items}),signal:AbortSignal.timeout(12000)});if(!response.ok){retry=[408,429,500,502,503,504].includes(response.status);throw new Error('avatar request failed');}const data=await response.json();
   for(const item of items){const raw=data.results?.[item.key];const info:BatchResponseItem=raw&&typeof raw==='object'?{...raw}:{};if(typeof info.authorAvatar==='string'&&info.authorAvatar.startsWith('//'))info.authorAvatar='https:'+info.authorAvatar;
    if(info.authorAvatar&&!info.authorAvatar.includes('ui-avatars.com')){if(this.cache.size>500)this.cache.clear();this.cache.set(item.key,{value:info,until:Infinity});void set(AVATAR_CACHE_PREFIX+item.key,info).catch(()=>{});}this.attempts.delete(item.key);this.deliver(item.key,info);}
  }catch(error){if(!(error instanceof Error)||!error.message.includes('avatar request failed'))retry=true;for(const item of items){const n=this.attempts.get(item.key)||0;if(retry&&n<1&&this.callbacks.has(item.key)){this.attempts.set(item.key,n+1);this.queue.set(item.key,item);}else{this.attempts.delete(item.key);this.deliver(item.key,{});}}}
  finally{items.forEach(item=>this.inFlight.delete(item.key));this.schedule();}
 }
}
export const batchAvatarFetcher=new BatchAvatarFetcher();
