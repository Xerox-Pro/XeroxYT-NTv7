import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {JSDOM} from 'jsdom';

test('linked Shorts skips previously displayed clips, continues past a seen page and preserves provider order',async()=>{
 const folder=await mkdtemp(path.resolve('node_modules/.shorts-sequence-'));
 const output=path.join(folder,'viewer.mjs');
 await build({entryPoints:['src/components/ShortsViewer.tsx'],outfile:output,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'network-boundary',setup(builder){builder.onLoad({filter:/\/src\/utils\.ts$/},()=>({contents:'export const fetchJSON=async(url,options)=>{const response=await fetch(url,options);if(!response.ok){const error=new Error("upstream failed");error.status=response.status;throw error;}return response.json()};export const formatNumberJP=n=>String(n);',loader:'js'}));}}]});
 const {default:ShortsViewer}=await import(pathToFileURL(output));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/shorts',pretendToBeVisual:true});
 const properties=['window','document','HTMLElement','HTMLIFrameElement','Event','CustomEvent','MouseEvent','localStorage','sessionStorage','IntersectionObserver'];
 const old=new Map(properties.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const key of properties.slice(0,-1))Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
 globalThis.IntersectionObserver=class{observe(){}disconnect(){}};
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;

 localStorage.setItem('xerox_youtube_linked','1');
 const video=id=>({videoId:id,title:id,author:'channel',viewCount:0,isShort:true,lengthSeconds:15,publishedText:'',videoThumbnails:[]});
 const seed=video('abcdefghijk'),first=video('lmnopqrstuv'),second=video('12345678901');
 const seen=video('23456789012');
 localStorage.setItem('xerox_shorts_seen_v1_local',JSON.stringify([{id:seen.videoId,at:Date.now()},{id:seed.videoId,at:Date.now()}]));
 const requests=[];let finishAction;const previousFetch=globalThis.fetch;
 globalThis.fetch=async url=>{const value=String(url);
  if(value==='/api/user/action')return new Promise(resolve=>{finishAction=resolve;});
  if(value.startsWith('/api/user/shorts-sequence?')){requests.push(value);return Response.json(requests.length===1?{videos:[seen,seed],hasMore:true,continuation:'sequence-next'}:{videos:[first,seen,second,first],hasMore:false});}
  if(value.startsWith('/api/shorts/'))return Response.json(video(value.split('/').pop().split('?')[0]));
  if(value.startsWith('https://raw.githubusercontent.com/'))return Response.json({params:'?key=sequence-test'});
  throw new Error('Unexpected request '+value);
 };
 const root=createRoot(dom.window.document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/shorts/abcdefghijk?source=home']},React.createElement(ShortsViewer,{initialId:seed.videoId,initialVideo:seed,context:{source:'home'},onRecord:()=>{},onSelectChannel:()=>{}}))));
  for(let i=0;i<4;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  assert.equal(requests.length,2);assert.equal(new URL(requests[0],'https://test').searchParams.get('videoId'),seed.videoId);assert.equal(new URL(requests[1],'https://test').searchParams.get('continuation'),'sequence-next');
  assert.deepEqual([...document.querySelectorAll('article[data-short-id]')].map(n=>n.dataset.shortId),[seed.videoId,first.videoId,second.videoId]);
  const like=document.querySelector('button[aria-label="高評価"]');assert.ok(like);
  await act(async()=>like.click());assert.equal(like.getAttribute('aria-pressed'),'true','animation and state change before the pending response');
  await act(async()=>finishAction(Response.json({error:'failed'},{status:500})));assert.equal(like.getAttribute('aria-pressed'),'false','failure rolls back the optimistic rating');
  await act(async()=>like.click());assert.equal(like.getAttribute('aria-pressed'),'true');
  await act(async()=>finishAction(Response.json({success:true})));assert.equal(like.getAttribute('aria-pressed'),'true');assert.equal(JSON.parse(localStorage.getItem('xerox_shorts_likes_v1'))[seed.videoId],true);

 }finally{
  await act(async()=>root.unmount());globalThis.fetch=previousFetch;dom.window.close();
  for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(folder,{recursive:true,force:true});
 }
});
