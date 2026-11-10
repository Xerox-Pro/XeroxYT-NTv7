import test from 'node:test';import assert from 'node:assert/strict';
import {readPlaybackPosition,savePlaybackPosition} from '../src/lib/playbackPosition.mjs';
test('resume positions are isolated by video and account and do not resume completed videos',()=>{
 const old=globalThis.localStorage;const data=new Map();globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(k,v)=>data.set(k,v)};
 try{savePlaybackPosition('abcdefghijk',123.8,400,1000);savePlaybackPosition('lmnopqrstuv',52,200,1000);assert.equal(readPlaybackPosition('abcdefghijk',2000),123);assert.equal(readPlaybackPosition('lmnopqrstuv',2000),52);data.set('xerox_last_account_id','other');assert.equal(readPlaybackPosition('abcdefghijk',2000),0);data.delete('xerox_last_account_id');savePlaybackPosition('abcdefghijk',398,400,2000);assert.equal(readPlaybackPosition('abcdefghijk',2000),0);assert.equal(readPlaybackPosition('lmnopqrstuv',100*86400000),0);savePlaybackPosition('invalid',88,100,2000);assert.equal(readPlaybackPosition('invalid',2000),0);data.set('xerox_playback_positions_v1_local','broken');assert.equal(readPlaybackPosition('abcdefghijk'),0);}finally{globalThis.localStorage=old;}
});
