import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';

test('checking login preserves draft credentials, verification code and the current form without starting a new session',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://site.test'});
 const keys=['window','document','navigator','HTMLElement','HTMLInputElement','Event','IS_REACT_ACT_ENVIRONMENT','loginFakeRequest'],saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperties(globalThis,{window:{value:dom.window,configurable:true},document:{value:dom.window.document,configurable:true},navigator:{value:dom.window.navigator,configurable:true},HTMLElement:{value:dom.window.HTMLElement,configurable:true},HTMLInputElement:{value:dom.window.HTMLInputElement,configurable:true},Event:{value:dom.window.Event,configurable:true},IS_REACT_ACT_ENVIRONMENT:{value:true,writable:true,configurable:true}});
 const folder=await mkdtemp(path.resolve('node_modules/.login-check-')),out=path.join(folder,'ui.mjs');let root;
 try{
  await build({entryPoints:['src/social/BrowserLogin.tsx'],outfile:out,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'login-client-stub',setup(api){api.onResolve({filter:/^\.\/client$/},()=>({path:'login-client',namespace:'stub'}));api.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const socialRequest=(...args)=>globalThis.loginFakeRequest(...args);'}));}}]});
  const {createRoot}=await import('react-dom/client');const BrowserLogin=(await import(pathToFileURL(out))).default;
  const calls=[];let state='invalid_credentials';globalThis.loginFakeRequest=async(service,route,options)=>{calls.push({route,body:JSON.parse(options.body)});return route==='login/start'?{ready:true}:{state,message:'テスト用の状態'};};
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(BrowserLogin,{service:'instagram',enabled:true,onConnected:()=>{throw Error('Not authenticated in this test')}})));
  const edit=async(selector,value)=>{await act(async()=>{const input=document.querySelector(selector);assert.ok(input);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
  const submit=async()=>{await act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));};
  const check=async()=>{await act(async()=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes('ログイン状態を確認')).click());};
  await act(async()=>document.querySelector('input[type=checkbox]').click());await edit('[name=username]','test-user');await edit('[name=password]','sent-secret');await submit();assert.equal(document.querySelector('[name=password]').value,'');
  await edit('[name=password]','draft-secret');const before=calls.length;await check();assert.equal(document.querySelector('[name=password]').value,'draft-secret');assert.equal(document.querySelector('[name=username]').value,'test-user');assert.deepEqual(calls.slice(before),[{route:'login/check',body:{}}]);
  state='code_required';await submit();await edit('[name=code]','123456');const codeCalls=calls.length;await check();assert.equal(document.querySelector('[name=code]').value,'123456');assert.deepEqual(calls.slice(codeCalls),[{route:'login/check',body:{}}]);
  state='unsupported';await check();assert.ok(document.querySelector('[name=code]'));assert.equal(document.querySelector('[name=code]').value,'123456');assert.equal(calls.filter(row=>row.route==='login/start').length,1);assert.equal(calls.some(row=>row.route==='login/cancel'),false);
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();for(const key of keys){const descriptor=saved.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}await rm(folder,{recursive:true,force:true});}
});
