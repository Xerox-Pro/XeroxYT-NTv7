import test from 'node:test';import assert from 'node:assert/strict';

test('guest public reads go to Cloudflare without site or service cookies; private reads stay blocked',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.sessionStorage,calls=[];
 globalThis.sessionStorage={getItem:key=>key==='xerox_guest'?'true':null};globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url==='/api/transport-config')return Response.json({origins:['https://public-test.workers.dev']});assert.equal(options.credentials,'omit');assert.equal(options.headers?.Authorization,undefined);return Response.json({items:[],anonymous:true});};
 try{const {cloudflareOnlyFetch}=await import('../src/lib/apiTransport.mjs?public-test');const path='/api/tiktok/public/feed';assert.equal((await cloudflareOnlyFetch(path)).status,200);assert.equal(calls.at(-1).url,'https://public-test.workers.dev'+path);const count=calls.length;assert.equal((await cloudflareOnlyFetch('/api/tiktok/threads')).status,401);assert.equal(calls.length,count);assert.throws(()=>cloudflareOnlyFetch(path,{method:'POST'}),/読み取り専用/);}finally{globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldStorage;}
});
