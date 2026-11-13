import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sessionToken,rpcRequest,installBridge} from '../gas/client/bridge.mjs';
test('persistent random session token is separate for each storage',()=>{
 const storage=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};const a=storage(),b=storage();assert.match(sessionToken(a,webcrypto),/^[a-f0-9]{64}$/);assert.equal(sessionToken(a,webcrypto),sessionToken(a,webcrypto));assert.notEqual(sessionToken(a,webcrypto),sessionToken(b,webcrypto));
});
test('RPC ignores late completion after abort and hides server error details',async()=>{
 let success;const controller=new AbortController();const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},gasRequest(){}};
 const request=rpcRequest({path:'/api/search'},controller.signal,run);controller.abort();await assert.rejects(request,{name:'AbortError'});success({status:200});
 const fail={withSuccessHandler(){return this;},withFailureHandler(fn){this.fail=fn;return this;},gasRequest(){this.fail(new Error('https://secret.example.com'));}};
 await assert.rejects(rpcRequest({},undefined,fail),e=>!e.message.includes('secret.example.com'));
});
test('bridge routes JSON through RPC, preserves status and keeps third-party player config direct',async()=>{
 const original={window:globalThis.window,location:globalThis.location,google:globalThis.google,localStorage:globalThis.localStorage};
 const calls=[],direct=[];let complete;
 globalThis.localStorage={getItem:()=>null,setItem(){}};globalThis.location={href:'https://gas.example.com/userCodeAppPanel',origin:'https://gas.example.com'};
 globalThis.window={fetch:async(...args)=>{direct.push(args);return Response.json({external:true});}};
 globalThis.google={script:{run:{withSuccessHandler(fn){complete=fn;return this;},withFailureHandler(){return this;},gasRequest(r){calls.push(r);complete({status:401,body:'{"error":"login required"}',headers:{'content-type':'application/json'}});}}}};
 try{installBridge();const r=await window.fetch('/api/auth/logout',{method:'POST'});assert.equal(r.status,401);assert.equal(calls[0].body,'{}');assert.equal(calls[0].headers['content-type'],'application/json');assert.equal(calls[0].path,'/api/auth/logout');await window.fetch('https://raw.githubusercontent.com/known/config.json');assert.equal(direct.length,1);}finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
