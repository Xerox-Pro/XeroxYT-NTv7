export function classifyPrivateMode({localStorageWorks,indexedDbWorks,chromiumQuota}){
  if(!localStorageWorks||indexedDbWorks===false)return true;
  return Number.isFinite(chromiumQuota)&&chromiumQuota>0&&chromiumQuota<120*1024*1024;
}

function localStorageProbe(){
  try{const key='__xerox_private_probe__';localStorage.setItem(key,'1');const ok=localStorage.getItem(key)==='1';localStorage.removeItem(key);return ok;}catch{return false;}
}

function indexedDbProbe(){
  return new Promise(resolve=>{
    if(!globalThis.indexedDB){resolve(null);return;}
    const name='__xerox_private_probe__'+Date.now();let settled=false;
    const finish=value=>{if(settled)return;settled=true;try{indexedDB.deleteDatabase(name);}catch{}resolve(value);};
    try{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('probe');request.onsuccess=()=>{request.result.close();finish(true);};request.onerror=()=>finish(false);request.onblocked=()=>finish(false);setTimeout(()=>finish(false),2500);}catch{finish(false);}
  });
}

export async function detectPrivateMode(){
  const localStorageWorks=localStorageProbe();
  const indexedDbWorks=await indexedDbProbe();
  let chromiumQuota;
  if(/(?:Chrome|Chromium|CriOS|EdgA?|OPR)\//.test(navigator.userAgent)&&navigator.storage?.estimate){
    try{chromiumQuota=(await navigator.storage.estimate()).quota;}catch{}
  }
  return classifyPrivateMode({localStorageWorks,indexedDbWorks,chromiumQuota});
}
