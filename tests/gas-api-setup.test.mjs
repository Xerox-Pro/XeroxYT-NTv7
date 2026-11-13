import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
test('self-host preparation removes fixed browser URL, rejects missing destination and preserves DB configuration',async()=>{
 const target=await mkdtemp(path.join(tmpdir(),'gas-api-'));
 try{
  await mkdir(path.join(target,'cloudflare/social'),{recursive:true});
  await writeFile(path.join(target,'package.json'),JSON.stringify({name:'xeroxyt-ntv7-apiv1'}));
  await writeFile(path.join(target,'cloudflare/social/browser-login.mjs'),"async function vercelBrowser(env,body){return fetch('https://authors-test.example/api/social-browser',{body:JSON.stringify(body)});}");
  const script=new URL('../gas/prepare-api.mjs',import.meta.url);
  execFileSync(process.execPath,[script.pathname,target]);
  const source=await readFile(path.join(target,'cloudflare/social/browser-login.mjs'),'utf8');
  assert.equal(source.includes('authors-test.example'),false);assert.match(source,/SOCIAL_BROWSER_URL/);
  const context={URL,fail:(code,message)=>Object.assign(new Error(message),{code})};vm.createContext(context);vm.runInContext(source,context);
  assert.throws(()=>context.selfHostedBrowserUrl({}),{code:'LOGIN_NOT_CONFIGURED'});
  for(const value of ['http://own.example/api/social-browser','https://user:pass@own.example/api/social-browser','https://own.example/other','https://own.example/api/social-browser?x=1'])assert.throws(()=>context.selfHostedBrowserUrl({SOCIAL_BROWSER_URL:value}));
  assert.equal(context.selfHostedBrowserUrl({SOCIAL_BROWSER_URL:'https://own.example/api/social-browser'}),'https://own.example/api/social-browser');
  const file=path.join(target,'wrangler.gas.jsonc'),config=JSON.parse(await readFile(file,'utf8'));
  assert.equal(config.vars.REQUIRE_PROXY_SECRET,'true');assert.equal(config.vars.SOCIAL_BROWSER_PROVIDER,'cloudflare');config.d1_databases[0].database_id='my-existing-database';await writeFile(file,JSON.stringify(config));
  execFileSync(process.execPath,[script.pathname,target]);assert.equal(JSON.parse(await readFile(file,'utf8')).d1_databases[0].database_id,'my-existing-database');
 }finally{await rm(target,{recursive:true,force:true});}
});
