import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';
async function withHome(run,{linked=false,statusFails=false}={}){
 const dir=await mkdtemp(path.resolve('node_modules/.home-recovery-'));
 await build({entryPoints:['src/MainApp.tsx'],outfile:path.join(dir,'app.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'view-boundaries',setup(b){
  b.onLoad({filter:/[\\/]src[\\/]utils\.ts$/},()=>({loader:'js',contents:'export const fetchJSON=(...args)=>window.__api(...args);export const parseYouTubeUrl=()=>null;'}));
  b.onLoad({filter:/[\\/]src[\\/]components[\\/]/},args=>({loader:'js',contents:args.path.endsWith('AccountGate.tsx')?'export const useSiteAccount=()=>({username:"qa"});':args.path.endsWith('VideoCard.tsx')?'import React from "react";export default p=>React.createElement("p",null,p.video.title);':args.path.endsWith('ShortsShelf.tsx')?'import React from "react";export const shortsQuery=()=>new URLSearchParams();export default ()=>React.createElement("p",null,"Public Shorts shelf");':'export default ()=>null;'}));
 }}]});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://site.test/',pretendToBeVisual:true});
 const keys=['window','document','HTMLElement','Event','CustomEvent','localStorage','sessionStorage','IntersectionObserver'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const k of keys.slice(0,-1))Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 globalThis.IntersectionObserver=class{observe(){}disconnect(){}};window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.scrollTo=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 if(linked){localStorage.setItem('xerox_youtube_linked','1');localStorage.setItem('xerox_user_info',JSON.stringify({name:'Linked Google user'}));}
 const video=(videoId,title)=>({videoId,title,author:'creator',videoThumbnails:[],viewCount:1,lengthSeconds:10});let attempts=0;
 const calls=[];window.__api=async url=>{calls.push(url);if(url==='/api/auth/status'){if(statusFails)throw Object.assign(Error('temporary'),{status:503});return {connected:linked,user:linked?{name:'Linked Google user'}:null};}if(url.startsWith('/api/user/feed/home?')){if(url.endsWith('continuation='))return {videos:[video('abcdefghijk','Account page one')],hasMore:true,continuation:'account-page-2'};if(++attempts===1)throw Object.assign(Error('Temporary account feed failure'),{status:503});return {videos:[video('bcdefghijkl','Account page two')],hasMore:false,continuation:''};}if(url.startsWith('/api/recommendations?'))return {videos:[video('abcdefghijk','Recovered home video')],hasMore:false};return {categories:[]};};
 const {default:React,act}=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom');
 const App=(await import(pathToFileURL(path.join(dir,'app.mjs')))).default,root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(App))));await act(async()=>{await new Promise(r=>setTimeout(r,50));});await run({calls,act});}
 finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(dir,{recursive:true,force:true});}
}
test('an unlinked account still loads the public home after a failed status check',()=>withHome(async({calls})=>{assert.ok(calls.some(url=>url.startsWith('/api/recommendations?')));assert.match(document.body.textContent,/Recovered home video/);assert.match(document.body.textContent,/Public Shorts shelf/);},{statusFails:true}));
for(const statusFails of [false,true])test('linked home retries the same personal continuation without replacing it with a public feed; status failure='+statusFails,()=>withHome(async({calls,act})=>{
 assert.match(document.body.textContent,/Account page one/);
 await act(async()=>{window.dispatchEvent(new Event('scroll'));await new Promise(r=>setTimeout(r,30));});
 assert.match(document.body.textContent,/Temporary account feed failure/);assert.match(document.body.textContent,/Account page one/);
 const retry=[...document.querySelectorAll('button')].find(b=>/再試行/.test(b.textContent));assert.ok(retry);
 await act(async()=>{retry.click();await new Promise(r=>setTimeout(r,30));});
 assert.match(document.body.textContent,/Account page two/);assert.match(document.body.textContent,/Account page one/);
 assert.equal(calls.filter(url=>url==='/api/user/feed/home?continuation=account-page-2').length,2);
 assert.ok(!calls.some(url=>url.startsWith('/api/recommendations')||url==='/api/trending'));assert.equal(localStorage.getItem('xerox_youtube_linked'),'1');
},{linked:true,statusFails}));
