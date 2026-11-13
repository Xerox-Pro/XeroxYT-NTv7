import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {fillLoginField,pressLoginButton} from '../../server/browser/fill-field.mjs';
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 const fake={frames:()=>[{url:()=> 'https://www.instagram.com/accounts/login/',evaluate:(...args)=>page.mainFrame().evaluate(...args),evaluateHandle:(...args)=>page.mainFrame().evaluateHandle(...args)}],keyboard:page.keyboard};
 await page.setContent('<form><input name="username"><input type="password"><input name="verificationCode" autocomplete="one-time-code"></form>');
 for(const [field,value,selector]of [['username','qa-user','[name=username]'],['password','synthetic-password','[type=password]'],['code','123456','[name=verificationCode]']]){await fillLoginField(fake,{service:'instagram',field,value});assert.equal(await page.$eval(selector,el=>el.value),value);}
 assert.equal(await page.$eval('[name=username]',el=>el.value),'qa-user');
 await page.setContent('<input type="search" name="search"><input name="email"><input name="phone">');
 await assert.rejects(fillLoginField(fake,{service:'instagram',field:'username',value:'not-entered'}),/LOGIN_FIELD_NOT_FOUND/);assert.equal(await page.$eval('[name=email]',el=>el.value),'');
 await page.setContent('<form>'+Array.from({length:6},(_,i)=>`<input name="code${i}" maxlength="1" ${i===0?'autocomplete="one-time-code"':''}>`).join('')+'</form>');
 await fillLoginField(fake,{service:'instagram',field:'code',value:'123456'});assert.deepEqual(await page.$$eval('input',els=>els.map(el=>el.value)),['1','2','3','4','5','6']);
 await assert.rejects(fillLoginField({...fake,frames:()=>[{url:()=> 'https://example.com',evaluate:()=>{throw Error('foreign frame visited')}}]},{service:'instagram',field:'password',value:'not-entered'}),/LOGIN_FIELD_NOT_FOUND/);
 await page.setContent('<form><input name="username"><input type="password"><button type="button" onclick="window.clicked=(window.clicked||0)+1">ログイン</button></form>');
 await pressLoginButton(fake,{service:'instagram',button:'login'});assert.equal(await page.evaluate(()=>window.clicked),1);
 await page.setContent('<button disabled>次へ</button>');await assert.rejects(pressLoginButton(fake,{service:'instagram',button:'next'}),/LOGIN_BUTTON_NOT_FOUND/);
 await page.setContent('<button>ログイン</button><button>ログイン</button>');await assert.rejects(pressLoginButton(fake,{service:'instagram',button:'login'}),/LOGIN_BUTTON_NOT_FOUND/);
 await page.setContent('<form><input name="verificationCode"><button type="button" onclick="window.verified=true">確認</button></form>');await pressLoginButton(fake,{service:'instagram',button:'verify'});assert.equal(await page.evaluate(()=>window.verified),true);
 console.log('Passed: login/verify clicks, disabled and ambiguous button refusal; username/password/code, ambiguous field refusal, split OTP, foreign origin refusal');
}finally{await browser.close();}
