import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
test('self-host preparation generates and preserves DB configuration',async()=>{
 const target=await mkdtemp(path.join(tmpdir(),'gas-api-'));
 try{
  await writeFile(path.join(target,'package.json'),JSON.stringify({name:'xeroxyt-ntv7-apiv1'}));
  const script=new URL('../gas/prepare-api.mjs',import.meta.url);
  execFileSync(process.execPath,[fileURLToPath(script),target]);
  const file=path.join(target,'wrangler.gas.jsonc'),config=JSON.parse(await readFile(file,'utf8'));
  assert.equal(config.vars.REQUIRE_PROXY_SECRET,'true');config.d1_databases[0].database_id='my-existing-database';await writeFile(file,JSON.stringify(config));
  execFileSync(process.execPath,[fileURLToPath(script),target]);assert.equal(JSON.parse(await readFile(file,'utf8')).d1_databases[0].database_id,'my-existing-database');
 }finally{await rm(target,{recursive:true,force:true});}
});
