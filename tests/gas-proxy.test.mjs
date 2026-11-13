import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../gas/Code.gs',import.meta.url),'utf8');
function harness(){
 const settings={API_BASE_URL:'https://private.example.com',ACCOUNT_BASE_URL:'https://account.example.com',UPSTREAM_ORIGIN:'https://front.example.com',API_SHARED_SECRET:'top-secret-value'};
 const cache=new Map(),calls=[];let reply={status:200,headers:{'Content-Type':'application/json'},body:{ok:true}};
 const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>settings[k]})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>[...createHash('sha256').update(v).digest()]},UrlFetchApp:{fetch:(url,opts)=>{calls.push({url,...opts});if(reply.throw)throw new Error('https://private.example.com/secret');return {getResponseCode:()=>reply.status,getAllHeaders:()=>reply.headers,getContentText:()=>typeof reply.body==='string'?reply.body:JSON.stringify(reply.body)};}}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {sandbox,calls,cache,settings,reply:r=>{reply=r;},request:(path='/api/search?q=hello',session='a'.repeat(64),extra={})=>sandbox.gasRequest({path,session,method:'GET',headers:{},...extra})};
}
test('strict paths reject traversal, cross-origin and privileged calls',()=>{
 const h=harness();for(const path of ['https://evil.example/api/search','//evil.example/api/search','/api/../internal','/api/%2e%2e/internal','/api/%252e%252e/internal','/api/search%0d%0aHost:evil','/api/transport-config','/api/account/cloudflare-session','/api/debug/search','/api/search#bad'])assert.equal(h.request(path).status,400,path);
 assert.equal(h.calls.length,0);
 for(const path of ['/api/playlist/test','/api/shorts-ranking?x=1','/api/instagram/public/feed'])assert.equal(h.request(path).status,200,path);
});
test('server chooses fixed URL, origin, shared secret and ignores caller credentials',()=>{
 const h=harness();const r=h.request('/api/search?q=test','a'.repeat(64),{headers:{authorization:'evil',cookie:'other',origin:'https://evil.example'}});
 assert.equal(r.status,200);assert.equal(h.calls[0].url,'https://private.example.com/api/search?q=test');assert.equal(h.calls[0].headers.Authorization,'Bearer top-secret-value');assert.equal(h.calls[0].headers.Origin,'https://front.example.com');assert.equal(h.calls[0].headers.Cookie,undefined);assert.equal(h.calls[0].followRedirects,false);
});
test('site cookies stay server-side and are isolated per browser session',()=>{
 const h=harness(),cookie='f'.repeat(64);h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session='+cookie+'; Path=/; Secure; HttpOnly'},body:{user:{id:'one'}}});
 const login=h.request('/api/account/login','a'.repeat(64),{method:'POST',headers:{'content-type':'application/json'},body:'{"username":"one"}'});assert.equal(JSON.stringify(login).includes(cookie),false);
 h.reply({status:200,headers:{'Content-Type':'application/json'},body:{ok:true}});
 h.request('/api/account/session');assert.equal(h.calls.at(-1).headers.Cookie,'__Host-xy_session='+cookie);
 h.request('/api/user/feed/home');assert.equal(h.calls.at(-1).headers.Cookie,'__Host-xy_session='+cookie);
 h.request('/api/user/feed/home','b'.repeat(64));assert.equal(h.calls.at(-1).headers.Cookie,undefined);
 h.reply({status:200,headers:{'Content-Type':'application/json','Set-Cookie':'__Host-xy_session=; Max-Age=0'},body:{ok:true}});h.request('/api/account/logout','a'.repeat(64),{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(h.cache.size,0);
});
test('redacts upstream URLs, encoded hosts, nested data, keys and secrets',()=>{
 const h=harness();h.reply({status:200,headers:{'Content-Type':'application/json','x-daily-usage-token':'https://private.example.com'},body:{url:'https://private.example.com/a',nested:[{error:'account.example.com top-secret-value'}],encoded:encodeURIComponent('https://private.example.com'), 'https://private.example.com':'private.example.com'}});
 const data=JSON.stringify(h.request());for(const hidden of ['private.example.com','account.example.com','top-secret-value'])assert.equal(data.includes(hidden),false);
});
test('blocks non-JSON streams, redirects, oversized payloads and exception URL leakage',()=>{
 const h=harness();for(const reply of [{status:302,headers:{Location:'https://private.example.com'},body:''},{status:200,headers:{'Content-Type':'video/mp4'},body:'binary'},{throw:true},{status:200,headers:{'Content-Type':'application/json'},body:'invalid'}]){h.reply(reply);const r=h.request();assert.equal(r.status,502);assert.equal(JSON.stringify(r).includes('private.example.com'),false);}
 assert.equal(h.request('/api/user/action','a'.repeat(64),{method:'POST',body:'a'.repeat(131073)}).status,413);
 assert.equal(h.request('/api/user/action','a'.repeat(64),{method:'POST',body:'{}'}).status,415);
});
test('loader follows latest manifest while pinning JS and CSS to one immutable revision',()=>{
 const h=harness();let current;
 h.sandbox.HtmlService={createTemplateFromFile:()=>{current={evaluate(){return this;},setTitle(){return this;},addMetaTag(){return this;}};return current;},createHtmlOutput:()=>({setTitle(){return this;}})};
 h.sandbox.ScriptApp={getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/stable/exec'})};
 const release=revision=>({status:200,headers:{},body:{revision,entry:'app-hash.js',css:'style-hash.css'}});
 h.reply(release('1'.repeat(40)));h.sandbox.doGet({parameter:{route:'/watch?v=test'}});const first=JSON.parse(current.assetConfig);assert.ok(first.js.includes('@'+'1'.repeat(40)));assert.equal(first.js.split('/gas/web/')[0],first.css.split('/gas/web/')[0]);assert.equal(first.route,'/watch?v=test');
 h.reply(release('2'.repeat(40)));h.sandbox.doGet({parameter:{}});const second=JSON.parse(current.assetConfig);assert.ok(second.js.includes('@'+'2'.repeat(40)));assert.equal(first.webAppUrl,second.webAppUrl);assert.equal(JSON.stringify(second).includes('private.example.com'),false);
});
