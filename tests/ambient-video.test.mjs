import test from 'node:test';import assert from 'node:assert/strict';import {ambientVideoUrl} from '../src/lib/ambientVideo.mjs';
import {build} from 'esbuild';import{mkdtemp,rm}from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';import React,{act}from'react';import{createRoot}from'react-dom/client';import{JSDOM}from'jsdom';
test('background uses the same provider configuration, is always muted and cannot load playlists or arbitrary frames',()=>{
 const url=new URL(ambientVideoUrl('https://www.youtubeeducation.com/embed/abcdefghijk?key=public&list=PLtest&index=3&playlist=old&start=20','lmnopqrstuv','https://site.test'));
 assert.equal(url.pathname,'/embed/lmnopqrstuv');assert.equal(url.searchParams.get('key'),'public');assert.equal(url.searchParams.get('mute'),'1');assert.equal(url.searchParams.get('list'),null);assert.equal(url.searchParams.get('playlist'),null);assert.equal(url.searchParams.get('start'),'20');assert.equal(ambientVideoUrl('https://attacker.test/embed/abcdefghijk','abcdefghijk','https://site.test'),'');
});
test('muted background follows foreground pause, playback rate and seeks, and ignores untrusted messages',async()=>{
 const folder=await mkdtemp(path.resolve('node_modules/.ambient-video-')),out=path.join(folder,'ui.mjs');await build({entryPoints:['src/components/AmbientVideo.tsx'],outfile:out,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic'});
 const {default:Mirror}=await import(pathToFileURL(out));const dom=new JSDOM('<iframe id="source" src="https://www.youtube.com/embed/abcdefghijk"></iframe><div id="root"></div>',{url:'https://site.test',pretendToBeVisual:true});const keys=['window','document','HTMLElement','Event'];const old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const k of keys)Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;const root=createRoot(document.getElementById('root'));const source=document.getElementById('source');let visible=false;const commands=[];
 try{
  await act(async()=>root.render(React.createElement(Mirror,{url:ambientVideoUrl(source.src,'abcdefghijk',window.location.origin),source,onVisible:value=>visible=value})));
  const frame=document.querySelector('.ambient-video-iframe');frame.contentWindow.postMessage=(text)=>commands.push(JSON.parse(text));
  const send=(target,data,origin='https://www.youtube.com')=>window.dispatchEvent(new dom.window.MessageEvent('message',{source:target.contentWindow,origin,data:JSON.stringify(data)}));
  await act(async()=>send(source,{event:'infoDelivery',info:{currentTime:35,playerState:1,playbackRate:1.5}}));await act(async()=>send(frame,{event:'onReady'}));
  assert.ok(commands.some(x=>x.func==='mute'));assert.ok(commands.some(x=>x.func==='seekTo'&&x.args[0]===35));assert.ok(commands.some(x=>x.func==='setPlaybackRate'&&x.args[0]===1.5));assert.ok(commands.some(x=>x.func==='playVideo'));
  await act(async()=>send(frame,{event:'infoDelivery',info:{currentTime:35,playerState:1,muted:true}}));assert.equal(visible,true);
  commands.length=0;await act(async()=>send(source,{event:'onStateChange',info:2}));assert.ok(commands.some(x=>x.func==='pauseVideo'));
  commands.length=0;await act(async()=>send(source,{event:'onStateChange',info:1},'https://attacker.test'));assert.equal(commands.length,0);assert.equal(frame.tabIndex,-1);assert.equal(frame.getAttribute('aria-hidden'),'true');
  await act(async()=>send(frame,{event:'onError',info:150}));assert.equal(visible,false);assert.equal(document.querySelector('.ambient-video-iframe'),null);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(folder,{recursive:true,force:true});}
});
