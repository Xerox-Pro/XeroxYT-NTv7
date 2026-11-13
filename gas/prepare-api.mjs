/** Run against a fresh clone of the API repo; never needs account credentials. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const target=path.resolve(process.argv[2]||'../XeroxYT-NTv7-APIv1');
const pkg=JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
if(pkg.name!=='xeroxyt-ntv7-apiv1')throw new Error('Specify a clone of XeroxYT-NTv7-APIv1.');
const sourcePath=path.join(target,'cloudflare/social/browser-login.mjs');
let source=await readFile(sourcePath,'utf8');
const literal=/fetch\('https:\/\/[^']+\/api\/social-browser',/g;
if(literal.test(source)){
 literal.lastIndex=0;
 source=source.replace(literal,'fetch(selfHostedBrowserUrl(env),');
 source=`function selfHostedBrowserUrl(env){
 let url;try{url=new URL(env.SOCIAL_BROWSER_URL);}catch{throw fail('LOGIN_NOT_CONFIGURED','自分のログインブラウザURLを設定してください。',503);}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.pathname!=='/api/social-browser'||url.search||url.hash)throw fail('LOGIN_NOT_CONFIGURED','ログインブラウザURLの設定が不正です。',503);
 return url.href;
}
`+source;
 await writeFile(sourcePath,source);
}else if(!source.includes('selfHostedBrowserUrl(env)'))throw new Error('API source changed; review the browser bridge configuration manually.');
// Update the API's mocked Vercel tests to supply an explicit self-host test URL.
const testFile=path.join(target,'tests/social-browser-login.test.mjs');
try{
 let fixture=await readFile(testFile,'utf8');
 fixture=fixture.replace(/https:\/\/[^'"\s]+\/api\/social-browser/g,'https://browser.example.test/api/social-browser');
 fixture=fixture.replace(/SOCIAL_BROWSER_PROVIDER:\s*'vercel',(?!(?:\s*)SOCIAL_BROWSER_URL:)/g,"SOCIAL_BROWSER_PROVIDER:'vercel',SOCIAL_BROWSER_URL:'https://browser.example.test/api/social-browser',");
 await writeFile(testFile,fixture);
}catch(error){if(error.code!=='ENOENT')throw error;}
// Separate config: never copy a deployed database ID or an author's Vercel provider.
const config={name:'xeroxyt-ntv7-apiv1',main:'cloudflare/api/bundle.mjs',no_bundle:true,
 compatibility_date:'2026-11-02',compatibility_flags:['nodejs_compat'],
 d1_databases:[{binding:'DB',database_name:'xeroxyt-accounts',database_id:'REPLACE_WITH_YOUR_D1_DATABASE_ID'}],
 vars:{NODE_ENV:'production',ALLOWED_ORIGINS:'https://script.google.com',REQUIRE_PROXY_SECRET:'true',SOCIAL_BROWSER_PROVIDER:'cloudflare',SOCIAL_UNOFFICIAL_ENABLED:'false'},
 observability:{enabled:true,head_sampling_rate:0.1}};
const destination=path.join(target,'wrangler.gas.jsonc');
try{await readFile(destination);console.info('Kept existing wrangler.gas.jsonc (database settings preserved).');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(destination,JSON.stringify(config,null,2)+'\n');}
console.info('Self-host configuration prepared. Set your own D1 ID and secrets before deploying.');
