import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';
test('a failed Google status check still loads the public home and exposes its Shorts shelf',async()=>{
 const dir=await mkdtemp(path.resolve('node_modules/.home-recovery-'));
 await build({entryPoints:['src/MainApp.tsx'],outfile:path.join(dir,'app.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'view-boundaries',setup(b){
  b.onLoad({filter:/[\\/]src[\\/]utils\.ts$/},()=>({loader:'js',contents:'export const fetchJSON=(...args)=>window.__api(...args);export const parseYouTubeUrl=()=>null;'}));
  b.onLoad({filter:/[\\/]src[\\/]components[\\/]/},args=>({loader:'js',contents:args.path.endsWith('AccountGate.tsx')?'export const useSiteAccount=()=>({username:"qa"});':args.path.endsWith('VideoCard.tsx')?'import React from "react";export default p=>React.createElement("p",null,p.video.title);':args.path.endsWith('ShortsShelf.tsx')?'import React from "react";export const shortsQuery=()=>new URLSearchParams();export default ()=>React.createElement("p",null,"Public Shorts shelf");':'export default ()=>null;'}));
 }}]});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://site.test/',pretendToBeVisual:true});
 const keys=['window','document','HTMLElement','Event','CustomEvent','localStorage','sessionStorage','IntersectionObserver'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys.slice(0,-1))Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 globalThis.IntersectionObserver=class{observe(){}disconnect(){}};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const calls=[];window.__api=async url=>{calls.push(url);if(url==='/api/auth/status')throw Object.assign(Error('temporary'),{status:503});if(url.startsWith('/api/recommendations?'))return {videos:[{videoId:'abcdefghijk',title:'Recovered home video',author:'creator',videoThumbnails:[],viewCount:1,lengthSeconds:10}],hasMore:false};return {categories:[]};};
 const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom');
 const App=(await import(pathToFileURL(path.join(dir,'app.mjs')))).default,root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(App))));await act(async()=>{await new Promise(r=>setTimeout(r,50));});assert.ok(calls.some(url=>url.startsWith('/api/recommendations?')));assert.match(document.body.textContent,/Recovered home video/);assert.match(document.body.textContent,/Public Shorts shelf/);}
 finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(dir,{recursive:true,force:true});}
});
