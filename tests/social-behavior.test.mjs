import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

test('account feed, DM, comments and notes use private routes; double submissions and uncertain sends are blocked',async()=>{
 const dir=await mkdtemp(path.resolve('node_modules/.social-behavior-'));
 await build({entryPoints:['src/social/SocialApp.tsx'],outfile:path.join(dir,'app.mjs'),bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'api-boundary',setup(b){
  b.onLoad({filter:/[\\/]src[\\/]components[\\/]AccountGate\.tsx$/},()=>({loader:'js',contents:'export function useSiteAccount(){return {username:"QA"}}'}));
  b.onLoad({filter:/[\\/]src[\\/]lib[\\/]apiTransport\.mjs$/},()=>({loader:'js',contents:'export async function cloudflareOnlyFetch(path,options){return window.__api(path,options)}'}));
 }}]});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://site.test/instagram',pretendToBeVisual:true});
 const keys=['window','document','HTMLElement','Event','MouseEvent','CustomEvent','localStorage','sessionStorage','FormData','IntersectionObserver'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const key of keys.slice(0,-1))Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
 globalThis.IntersectionObserver=class{observe(){}disconnect(){}};window.matchMedia=()=>({matches:false});dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const {default:React,act}=await import('react');const {createRoot}=await import('react-dom/client');const {MemoryRouter,useNavigate}=await import('react-router-dom');
 localStorage.setItem('xerox_last_account_id','qa');let sends=0,comments=0,notes=0;const requests=[];
 window.__api=async(path,options={})=>{requests.push({path,options});
  if(path.endsWith('/status'))return Response.json({connected:true,configured:false,mode:'unofficial',unofficialAvailable:true,user:{id:'42',username:'qa'},capabilities:{homeFeed:true,messaging:true,comments:true,likes:true,notes:true,search:true,ownMedia:false}});
  if(path.endsWith('/preferences'))return Response.json({signals:{}});
  if(path.endsWith('/feed'))return Response.json({items:[{id:'ig:123',service:'instagram',kind:'image',media:'https://image.test/p.jpg',author:'bob',profileUsername:'bob',title:'caption',url:'https://www.instagram.com/p/QA123/'}]});
  if(path.startsWith('/api/instagram/threads'))return Response.json({threads:[{id:'123',name:'QA conversation'}]});
  if(path.startsWith('/api/instagram/messages?'))return Response.json({messages:[{id:'m1',senderId:'42',text:'<img onerror=alert(1)>',timestamp:100}],selfId:'42'});
  if(path.endsWith('/messages/send')){sends++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({error:'結果を確認できません',code:'SEND_UNCERTAIN'},{status:409});}
  if(path.startsWith('/api/instagram/comments?'))return Response.json({comments:[{id:'c1',author:'bob',text:'Comment from provider'}]});
  if(path.endsWith('/comments')){comments++;return Response.json({success:true,comment:{id:'c2',author:'qa',text:'Posted comment'}});}
  if(path.endsWith('/notes')){notes++;return Response.json({success:true,id:'note1'});}
  if(path.startsWith('/api/instagram/search?'))return Response.json({users:[{id:'43',username:'search_result',name:'Search result'}]});
  throw Error('Unexpected request '+path);
 };
 let navigate;function Probe(){navigate=useNavigate();return null;}const App=(await import(pathToFileURL(path.join(dir,'app.mjs')))).default,root=createRoot(document.getElementById('root'));
 const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,25))});
 const click=async(node)=>{assert.ok(node);await act(async()=>node.click());await flush();};
 const find=(selector,label)=>[...document.querySelectorAll(selector)].find(node=>node.textContent===label);
 const fill=async(selector,value)=>{const node=document.querySelector(selector);assert.ok(node);const proto=node.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
 try{
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/instagram']},React.createElement(React.Fragment,null,React.createElement(App,{service:'instagram'}),React.createElement(Probe)))));await flush();
  assert.ok(requests.some(row=>row.path==='/api/instagram/feed'));assert.ok(!requests.some(row=>row.path==='/api/instagram/media'));assert.match(document.body.textContent,/caption/);
  await click(document.querySelector('[aria-label="コメント"]'));await flush();assert.match(document.body.textContent,/Comment from provider/);
  await fill('[aria-label="コメント本文"]','test');await click(document.querySelector('[aria-label="コメントを送信"]'));assert.equal(comments,1);assert.match(document.body.textContent,/Posted comment/);await click(document.querySelector('[aria-label="閉じる"]'));
  await click(find('.social-sidebar>button','ノート'));await fill('[aria-label="ノート本文"]','note');await click(find('.social-dialog button','シェア'));assert.equal(notes,1);
  await act(async()=>navigate('/instagram/messages'));await flush();await click(find('.social-thread-list>button','QA conversation会話を開く'));assert.equal(document.querySelectorAll('.social-message img').length,0);assert.match(document.body.textContent,/<img onerror=alert\(1\)>/);
  await fill('[aria-label="メッセージ本文"]','test');const form=document.querySelector('.social-message-compose');await act(async()=>{form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});await flush();assert.equal(sends,1);assert.equal(document.querySelector('[aria-label="メッセージを送信"]').disabled,true);assert.match(document.body.textContent,/送信済みの可能性/);
  window.__api=async(path,options={})=>{requests.push({path,options});
   if(path.endsWith('/status'))return Response.json({connected:true,mode:'unofficial',user:{id:'42',username:'qa'},capabilities:{homeFeed:true,forYou:true,following:true,search:true,ownMedia:false}});
   if(path.endsWith('/preferences'))return Response.json({signals:{}});
   const item=(id,title,timestamp)=>({id:'tt:'+id,service:'tiktok',kind:'video',title,timestamp,author:'creator',url:'https://www.tiktok.com/@creator/video/'+id});
   if(path.endsWith('/feed'))return Response.json({items:[item('1234567890123','For You item',1)]});
   if(path.endsWith('/following'))return Response.json({items:[item('1234567890124','Old followed video',1),item('1234567890125','Newest followed video',3)]});
   if(path.startsWith('/api/tiktok/search?'))return Response.json(new URL('https://site.test'+path).searchParams.get('kind')==='users'?{users:[{id:'43',username:'found_user',name:'Found user'}]}:{items:[item('1234567890126','Semantic result without keyword',2)]});
   throw Error('Unexpected TikTok request '+path);
  };
  await act(async()=>root.render(React.createElement(MemoryRouter,{key:'tiktok',initialEntries:['/tiktok']},React.createElement(React.Fragment,null,React.createElement(App,{service:'tiktok'}),React.createElement(Probe)))));await flush();assert.match(document.body.textContent,/For You item/);
  await act(async()=>navigate('/tiktok/following'));await flush();assert.ok(requests.some(row=>row.path==='/api/tiktok/following'));const titles=[...document.querySelectorAll('.social-video-caption>p')].map(node=>node.textContent);assert.deepEqual(titles,['Newest followed video','Old followed video']);
  await act(async()=>navigate('/tiktok/search'));await flush();await fill('[aria-label="TikTokを検索"]','cat');await click(find('.social-search>button','検索'));assert.match(document.body.textContent,/Semantic result without keyword/);
  await click(find('.social-search-tabs>button','ユーザー'));assert.match(document.body.textContent,/found_user/);assert.equal(document.querySelector('.social-search-results>a').href,'https://site.test/tiktok/profile/found_user');

  let publicFeedCalls=0;
  window.__api=async(path,options={})=>{requests.push({path,options});
   if(path.endsWith('/status'))return Response.json({connected:false,capabilities:{search:true}});
   if(path.endsWith('/preferences'))return Response.json({signals:{}});
   if(path==='/api/instagram/public/feed'){if(++publicFeedCalls===1)return Response.json({error:'Temporary public feed failure'},{status:502});return Response.json({items:[{id:'ig:public',kind:'image',service:'instagram',title:'Recovered public post',author:'creator',profileUsername:'creator',media:'https://image.test/p.jpg',url:'https://www.instagram.com/p/TestPost/'}]});}
   if(path.startsWith('/api/instagram/public/resolve?'))return Response.json({items:[{id:'ig:ExpandedCode',url:'https://www.instagram.com/reel/ExpandedCode/',service:'instagram',kind:'video',author:'creator',title:'Expanded shared reel'}]});
   if(path.startsWith('/api/instagram/public/search?'))return Response.json({users:[{id:'creator',username:'creator',name:'Public creator'}],items:[{id:'ig:profile',kind:'image',service:'instagram',title:'Public profile post',author:'creator',profileUsername:'creator',media:'https://image.test/profile.jpg',url:'https://www.instagram.com/p/ProfilePost/'}]});
   throw Error('Unexpected public request '+path);
  };
  await act(async()=>root.render(React.createElement(MemoryRouter,{key:'public',initialEntries:['/instagram']},React.createElement(React.Fragment,null,React.createElement(App,{service:'instagram'}),React.createElement(Probe)))));await flush();
  assert.match(document.body.textContent,/Temporary public feed failure/);
  await click(find('.social-empty-error button','再試行'));assert.equal(publicFeedCalls,2);assert.match(document.body.textContent,/Recovered public post/);
  await act(async()=>navigate('/instagram/search'));await flush();await fill('[aria-label="Instagramを検索"]','@creator');await click(find('.social-search>button','検索'));
  await click(document.querySelector('.social-search-results>a'));assert.match(document.body.textContent,/Public profile post/);assert.ok(requests.some(r=>r.path==='/api/instagram/public/search?q=%40creator'));

  await act(async()=>navigate('/instagram'));await flush();await click(find('.social-sidebar>button','公開投稿を追加'));await fill('[aria-label="公開投稿のURL"]','https://www.instagram.com/share/reel/Public123/');await click(find('.social-dialog button','追加する'));assert.match(document.body.textContent,/Expanded shared reel/);assert.ok(requests.some(r=>r.path.includes('/public/resolve?url=https%3A%2F%2Fwww.instagram.com%2Fshare%2Freel%2FPublic123%2F')));

 }finally{await act(async()=>root.unmount());dom.window.close();for(const[k,v]of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}delete globalThis.IS_REACT_ACT_ENVIRONMENT;await rm(dir,{recursive:true,force:true});}
});
