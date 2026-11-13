import puppeteer from 'puppeteer';
import {writeFile} from 'node:fs/promises';
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],userDataDir:'/vercel/sandbox/browser-profile',dumpio:false});
await writeFile('/vercel/sandbox/browser-connection.json',JSON.stringify({endpoint:browser.wsEndpoint()}),{mode:0o600});
process.on('SIGTERM',()=>void browser.close());
