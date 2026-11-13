import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {submitCredentials,submitVerification,inspectLogin} from '../../server/browser/credential-login.mjs';
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--lang=ja-JP']});
try{
 const page=await browser.newPage();await page.emulateTimezone('Asia/Tokyo');
 const fake={url:()=> 'https://www.instagram.com/accounts/login/',frames:()=>[{url:()=> 'https://www.instagram.com/accounts/login/',evaluate:(...args)=>page.mainFrame().evaluate(...args),evaluateHandle:(...args)=>page.mainFrame().evaluateHandle(...args)}],keyboard:page.keyboard,createCDPSession:()=>page.createCDPSession(),waitForFunction:async()=>{}};
 await page.setContent(`<form><input name="username"><input type="password"><button type="button" onclick="document.querySelector('form').innerHTML='<input name=verificationCode autocomplete=one-time-code><button type=button onclick=invalidCode()>確認</button>'">ログイン</button></form><script>function invalidCode(){document.body.append('認証コードが正しくありません。')}</script>`);
 const result=await submitCredentials(fake,{service:'instagram',username:'synthetic-user',password:'synthetic-password'});assert.equal(result.state,'code_required');
 const invalid=await submitVerification(fake,{service:'instagram',code:'123456'});assert.equal(invalid.state,'invalid_credentials');
 await page.setContent('<p>公式アプリでログインリクエストを承認してください</p>');assert.equal((await inspectLogin(fake,'instagram')).state,'approval_required');
 await page.setContent('<p>画像を選択してロボットではないことを確認してください</p>');assert.equal((await inspectLogin(fake,'instagram')).state,'captcha_required');
 assert.equal(await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),'Asia/Tokyo');
 assert.equal((await inspectLogin({...fake,url:()=> 'https://example.com'},'instagram')).state,'unsupported');
 console.log('Passed: credentials → code form, invalid-code message, approval/captcha states, Japan timezone, foreign-origin refusal');
}finally{await browser.close();}
