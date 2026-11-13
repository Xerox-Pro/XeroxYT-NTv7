import puppeteer from 'puppeteer';
import {fillLoginField,pressLoginButton} from './fill-field.mjs';
import {readFile,writeFile,unlink} from 'node:fs/promises';
const [input,output]=process.argv.slice(2);let browser;
try{
 const body=JSON.parse(await readFile(input,'utf8'));await unlink(input);
 const allowed=['Xerox.pressLoginButton','Xerox.fillLoginField','Page.captureScreenshot','Network.getCookies','Runtime.evaluate','Emulation.setDeviceMetricsOverride','Input.dispatchMouseEvent','Input.dispatchKeyEvent','Input.insertText'];
 if(!allowed.includes(body.method))throw Error('method');
 if(body.method==='Runtime.evaluate'&&body.params?.expression!=='navigator.userAgent')throw Error('expression');
 if(body.method==='Network.getCookies'&&(!Array.isArray(body.params?.urls)||!body.params.urls.every(url=>['https://www.instagram.com/','https://www.tiktok.com/'].includes(url))))throw Error('cookie origin');
 const {endpoint}=JSON.parse(await readFile('/vercel/sandbox/browser-connection.json','utf8'));
 browser=await puppeteer.connect({browserWSEndpoint:endpoint});
 const pages=await browser.pages(),page=pages[0];if(!page)throw Error('page');
 const cdp=await page.createCDPSession();let result;
 try{result=body.method==='Xerox.fillLoginField'?await fillLoginField(page,body.params||{}):body.method==='Xerox.pressLoginButton'?await pressLoginButton(page,body.params||{}):await cdp.send(body.method,body.params||{});}finally{await cdp.detach();}
 await writeFile(output,JSON.stringify({result}),{mode:0o600});
}catch(error){await writeFile(output,JSON.stringify({error:['LOGIN_BUTTON_NOT_FOUND','LOGIN_FIELD_NOT_FOUND','LOGIN_INPUT'].includes(error.message)?error.message:'BROWSER_COMMAND_FAILED'}),{mode:0o600});}
finally{browser?.disconnect();await unlink(input).catch(()=>{});}
