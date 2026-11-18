import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {loadShortsWithFallback} from '../src/lib/shortsFallback.mjs';
const short={videoId:'abcdefghijk',isShort:true};
test('keeps an available personalized feed',async()=>{
 const calls=[];
 const result=await loadShortsWithFallback({personalized:true,primaryUrl:'/private',publicUrl:'/public',load:async url=>(calls.push(url),{videos:[short],hasMore:true})});
 assert.deepEqual(calls,['/private']);assert.equal(result.usedFallback,false);
});
test('empty personalized feed falls back to public Shorts',async()=>{
 const calls=[];
 const result=await loadShortsWithFallback({personalized:true,primaryUrl:'/private',publicUrl:'/public',load:async url=>(calls.push(url),url==='/private'?{videos:[],hasMore:false}:{videos:[short],hasMore:true})});
 assert.deepEqual(calls,['/private','/public']);assert.equal(result.usedFallback,true);assert.equal(result.data.videos.length,1);
});
test('temporary upstream error falls back',async()=>{
 const calls=[];
 const result=await loadShortsWithFallback({personalized:true,primaryUrl:'/private',publicUrl:'/public',load:async url=>{calls.push(url);if(url==='/private')throw Object.assign(new Error('bad gateway'),{status:502});return {videos:[short]};}});
 assert.deepEqual(calls,['/private','/public']);assert.equal(result.usedFallback,true);
});
test('authentication and rate limits are not hidden',async()=>{
 for(const status of [400,401,403,404,429]){
  await assert.rejects(loadShortsWithFallback({personalized:true,primaryUrl:'/private',publicUrl:'/public',load:async()=>{throw Object.assign(new Error('restricted'),{status});}}),error=>error.status===status);
 }
});
test('once fallback is active, only requests public feed',async()=>{
 const calls=[];
 const result=await loadShortsWithFallback({personalized:true,fallbackActive:true,primaryUrl:'/private',publicUrl:'/public',load:async url=>(calls.push(url),{videos:[short]})});
 assert.deepEqual(calls,['/public']);assert.equal(result.usedFallback,true);
});
