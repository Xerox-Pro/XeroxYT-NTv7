import test from 'node:test';import assert from 'node:assert/strict';import {createApiSelector} from '../server/lib/apiAvailability.mjs';
test('skips failed peers, shares health probes, and retries recovered peers after cooldown',async()=>{
 let time=0,recovered=false;const calls=[];const headers=new Headers({Origin:'https://site.example',Authorization:'Bearer test',Cookie:'private'});
 const selector=createApiSelector(async(url,options)=>{calls.push(url);assert.equal(options.headers.has('cookie'),false);return url.includes('first')&&!recovered?Response.json({error:'down'},{status:503}):Response.json({status:'ok'});},()=>time);
 const pool=['https://first.example','https://second.example'];const both=await Promise.all([selector.plan(pool,headers),selector.plan(pool,headers)]);assert.deepEqual(both[0],['https://second.example']);assert.equal(calls.length,2);assert.deepEqual(await selector.plan(pool,headers),['https://second.example']);selector.report(pool[1],headers,false);assert.deepEqual(await selector.plan(pool,headers),[]);time=10001;recovered=true;assert.deepEqual(await selector.plan(pool,headers),pool);assert.equal(calls.length,4);
});

test('health checks authenticate each API with its own credential', async () => {
 const pool = ['https://primary.example', 'https://secondary.example'];
 const headers = new Headers({Origin:'https://site.example', Authorization:'Bearer primary', Cookie:'private'});
 const secondaryHeaders = new Headers(headers);
 secondaryHeaders.set('Authorization', 'Bearer secondary');
 const seen = [];
 const selector = createApiSelector(async (url, options) => {
  seen.push([new URL(url).origin, options.headers.get('authorization')]);
  assert.equal(options.headers.has('cookie'), false);
  return Response.json({ok:true});
 });
 assert.deepEqual(await selector.plan(pool, headers, origin => origin === pool[1] ? secondaryHeaders : headers), pool);
 assert.deepEqual(seen, [[pool[0], 'Bearer primary'], [pool[1], 'Bearer secondary']]);
});
