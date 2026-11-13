import {build} from 'vite';
import {readFile,writeFile,readdir,copyFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await build({configFile:'gas/vite.config.ts'});
await mkdir('gas/web/app-icons',{recursive:true});
for(const name of await readdir('public/app-icons'))await copyFile('public/app-icons/'+name,'gas/web/app-icons/'+name);
const files=await readdir('gas/web');
const entry=files.find(n=>/^app-.*\.js$/.test(n)),css=files.find(n=>n.endsWith('.css'));
if(!entry||!css)throw new Error('GAS build files missing');
// Catch accidental reintroduction of the browser's origin-discovery transport.
const js=await readFile('gas/web/'+entry,'utf8');
if(js.includes('/api/transport-config')||js.includes('/api/account/cloudflare-session'))throw new Error('Direct API transport leaked into GAS bundle');
await writeFile('gas/web/release.json',JSON.stringify({version:1,entry,css,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()},null,2)+'\n');
console.info('GAS assets ready:',entry,css);
