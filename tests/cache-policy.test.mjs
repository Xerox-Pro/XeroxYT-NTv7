import test from 'node:test';
import assert from 'node:assert/strict';
import {getPublicCachePolicy,isPublicCacheFresh} from '../src/lib/publicCachePolicy.mjs';

test('public video and short metadata are persisted without expiry',()=>{
 for(const url of ['/api/video/dQw4w9WgXcQ','/api/shorts/dQw4w9WgXcQ?details=2']){
  const policy=getPublicCachePolicy(url,{title:'Video',isLive:false});
  assert.equal(policy.permanent,true);
  assert.equal(policy.ttlMs,Infinity);
  assert.equal(isPublicCacheFresh({timestamp:1,data:{}},policy,Date.now()),true);
 }
});

test('live, upcoming and player-only video details are never frozen',()=>{
 const url='/api/video/dQw4w9WgXcQ';
 for(const data of [{isLive:true},{isUpcoming:true},{isLiveContent:true},{isPlayerOnly:true},{error:'not found'}])
  assert.equal(getPublicCachePolicy(url,data),null);
});

test('private and changing endpoints are not cached permanently',()=>{
 for(const url of ['/api/account/session','/api/account/ban-status','/api/account/sidecar','/api/account/dm','/api/auth/status','/api/user/feed/home','/api/shorts?page=2','/api/home/categories','/api/video/dQw4w9WgXcQ/live-chat','/api/stream/dQw4w9WgXcQ']){
  assert.equal(getPublicCachePolicy(url),null,url);
 }
 const channel=getPublicCachePolicy('/api/channel/UC123?v=2');
 assert.equal(channel.permanent,false);
 assert.equal(isPublicCacheFresh({timestamp:1},channel,3600002),false);
 assert.equal(getPublicCachePolicy('/api/recommendations').ttlMs,300000);
});
