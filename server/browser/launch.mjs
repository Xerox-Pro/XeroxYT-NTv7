import puppeteer from 'puppeteer';
import {writeFile} from 'node:fs/promises';
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--lang=ja-JP'],userDataDir:'/vercel/sandbox/browser-profile',dumpio:false});
const pages=await browser.pages();await pages[0].setExtraHTTPHeaders({'Accept-Language':'ja-JP,ja;q=0.9'});await pages[0].emulateTimezone('Asia/Tokyo');const cdp=await pages[0].createCDPSession();await cdp.send('Emulation.setLocaleOverride',{locale:'ja-JP'});await cdp.detach();
await writeFile('/vercel/sandbox/browser-connection.json',JSON.stringify({endpoint:browser.wsEndpoint()}),{mode:0o600});
process.on('SIGTERM',()=>void browser.close());
