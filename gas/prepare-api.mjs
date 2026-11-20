/** Run against a fresh clone of the API repo; never needs account credentials. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const target=path.resolve(process.argv[2]||'../XeroxYT-NTv7-APIv1');
const pkg=JSON.parse(await readFile(path.join(target,'package.json'),'utf8'));
if(pkg.name!=='xeroxyt-ntv7-apiv1')throw new Error('Specify a clone of XeroxYT-NTv7-APIv1.');
const config={name:'xeroxyt-ntv7-apiv1',main:'cloudflare/api/bundle.mjs',no_bundle:true,
 compatibility_date:'2026-11-02',compatibility_flags:['nodejs_compat'],
 d1_databases:[{binding:'DB',database_name:'xeroxyt-accounts',database_id:'REPLACE_WITH_YOUR_D1_DATABASE_ID'}],
 vars:{NODE_ENV:'production',ALLOWED_ORIGINS:'https://script.google.com',REQUIRE_PROXY_SECRET:'true'},
 observability:{enabled:true,head_sampling_rate:0.1}};
const destination=path.join(target,'wrangler.gas.jsonc');
try{await readFile(destination);console.info('Kept existing wrangler.gas.jsonc (database settings preserved).');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(destination,JSON.stringify(config,null,2)+'\n');}
console.info('Self-host configuration prepared. Set your own D1 ID and secrets before deploying.');
