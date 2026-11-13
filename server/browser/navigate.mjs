import puppeteer from 'puppeteer';
import {readFile,unlink} from 'node:fs/promises';
const {url}=JSON.parse(await readFile('/vercel/sandbox/navigate.json','utf8'));await unlink('/vercel/sandbox/navigate.json');
if(!['https://www.instagram.com/accounts/login/','https://www.tiktok.com/login'].includes(url))process.exit(1);
const {endpoint}=JSON.parse(await readFile('/vercel/sandbox/browser-connection.json','utf8'));const browser=await puppeteer.connect({browserWSEndpoint:endpoint});try{const pages=await browser.pages();await pages[0].goto(url,{waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});}finally{browser.disconnect();}
