const prefix='xerox_playback_positions_v1_';
const scope=()=>{try{return localStorage.getItem('xerox_last_account_id')||'local';}catch{return 'local';}};
const read=()=>{try{const data=JSON.parse(localStorage.getItem(prefix+scope())||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}};
export function readPlaybackPosition(id,now=Date.now()){
 const item=read()[id];
 if(!item||!Number.isFinite(item.time)||item.time<3||now-item.at>90*86400000)return 0;
 if(item.duration>0&&item.duration-item.time<5)return 0;
 return item.time;
}
export function savePlaybackPosition(id,time,duration=0,now=Date.now()){
 if(!/^[\w-]{11}$/.test(id||'')||!Number.isFinite(time)||time<0)return;
 const all=read();
 all[id]={time:Math.floor(time),duration:Number.isFinite(duration)?duration:0,at:now};
 const recent=Object.entries(all).sort((a,b)=>Number(b[1]?.at||0)-Number(a[1]?.at||0)).slice(0,500);
 try{localStorage.setItem(prefix+scope(),JSON.stringify(Object.fromEntries(recent)));}catch{}
}
