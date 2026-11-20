import test from 'node:test';
import assert from 'node:assert/strict';
import {orderApiPool,canRetry} from '../server/lib/apiPool.mjs';
import {createApiSelector} from '../server/lib/apiAvailability.mjs';

test('the secondary can receive account mutations using its own proxy credential',async()=>{
 const primary='https://main.workers.dev';
 const secondary='https://backup.workers.dev';
 const headers=new Headers({Origin:'https://app.example',Authorization:'Bearer main'});
 const secondaryHeaders=new Headers(headers);
 secondaryHeaders.set('Authorization','Bearer backup');
 const seen=[];
 const selector=createApiSelector(async (url,{headers})=>{
  seen.push([url,headers.get('Authorization')]);
  return Response.json({ok:true});
 });
 const pool=orderApiPool([primary,secondary],secondary,'2');
 assert.deepEqual(await selector.plan(pool,headers,origin=>origin===secondary?secondaryHeaders:headers),[secondary,primary]);
 assert.deepEqual(seen[0],[secondary+'/health','Bearer backup']);
 for(const path of ['/api/account/dm/request','/api/account/admin/accounts/target']){
  assert.equal(canRetry('POST',path,503,true),false);
 }
 assert.equal(canRetry('GET','/api/account/admin/action-history',503,true),true);
 assert.equal(canRetry('GET','/api/account/admin/action-history',403,true),false);
});

test('Cloudflare daily quota removes the primary from the pool until reset',async()=>{
 const {workerQuotaExceeded}=await import('../server/lib/apiPool.mjs');
 const primary='https://main.workers.dev';
 const secondary='https://backup.workers.dev';
 const headers=new Headers({Origin:'https://app.example'});
 const exhausted=()=>Response.json({cloudflare_error:true,error_code:1027},{status:503,headers:{'cf-ray':'test'}});
 assert.equal(await workerQuotaExceeded(exhausted()),true);
 assert.equal(await workerQuotaExceeded(new Response('<title>Error 1027</title>',{status:429,headers:{'cf-ray':'test','content-type':'text/html'}})),true);
 assert.equal(await workerQuotaExceeded(Response.json({code:'ACCOUNT_TIMEOUT'},{status:429,headers:{'cf-ray':'test'}})),false);
 let now=0;
 const selector=createApiSelector(async url=>url.startsWith(primary)&&now===0?exhausted():Response.json({ok:true}),()=>now);
 assert.deepEqual(await selector.plan([primary,secondary],headers),[secondary]);
 now=30001;
 assert.deepEqual(await selector.plan([primary,secondary],headers),[secondary]);
 now=86400000;
 assert.deepEqual(await selector.plan([primary,secondary],headers),[primary,secondary]);
});

test('the gateway recognizes the live 1027 response even if CF-Ray is missing',async()=>{
 const {workerQuotaExceeded}=await import('../server/lib/apiPool.mjs');
 const plain=(body,headers={})=>new Response(body,{status:429,headers:{'content-type':'text/plain; charset=UTF-8',...headers}});
 assert.equal(await workerQuotaExceeded(plain('error code: 1027\n')),true);
 assert.equal(await workerQuotaExceeded(plain('error code: 1027\n',{'x-xeroxyt-proxy':'cloudflare'})),false);
 assert.equal(await workerQuotaExceeded(plain('application error code: 1027')),false);
 assert.equal(await workerQuotaExceeded(plain('error code: 1015')),false);
});
