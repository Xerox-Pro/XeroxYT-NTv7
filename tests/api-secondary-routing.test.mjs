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
