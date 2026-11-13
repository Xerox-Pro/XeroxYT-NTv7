import {fillLoginField,pressLoginButton} from './fill-field.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const official=(url,service)=>{try{const u=new URL(url),host=service==='instagram'?'instagram.com':'tiktok.com';return u.protocol==='https:'&&(u.hostname===host||u.hostname.endsWith('.'+host));}catch{return false;}};
export function loginPageState(){
 const visible=el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
 const text=(document.body?.innerText||'').toLowerCase();
 const inputs=[...document.querySelectorAll('input')].filter(visible);
 if(/パスワード.*正しく|パスワード.*間違|ユーザーネーム.*正しく|incorrect password|invalid.*password|password.*incorrect|コード.*正しく|コード.*間違|invalid.*code|incorrect.*code/.test(text))return 'invalid_credentials';

 if([...document.querySelectorAll('iframe')].some(el=>visible(el)&&/captcha|recaptcha|hcaptcha/.test(el.src))||/パズル|ロボットでは|画像を選択|complete the puzzle|drag the slider/.test(text))return 'captcha_required';
 if(inputs.some(el=>/one-time-code|verification.?code|security.?code|otp|code|認証コード|確認コード/.test([el.autocomplete,el.name,el.placeholder,el.getAttribute('aria-label')].join(' ').toLowerCase())))return 'code_required';
 if(/別のデバイス|アプリで.*承認|ログインリクエスト.*承認|check your notifications|approve.*another device/.test(text))return 'approval_required';
 return 'pending';
}
export async function inspectLogin(page,service){
 if(!['instagram','tiktok'].includes(service))throw Error('LOGIN_INPUT');
 if(!official(page.url(),service))return {state:'unsupported',message:'公式サイト以外に移動したため接続を停止しました。'};
 const cdp=await page.createCDPSession();
 try{const result=await cdp.send('Network.getCookies',{urls:[service==='instagram'?'https://www.instagram.com/':'https://www.tiktok.com/']});const cookies=new Map(result.cookies.map(c=>[c.name,c.value]));if((cookies.get('sessionid')||cookies.get('sessionid_ss'))&&(service!=='instagram'||cookies.get('csrftoken')))return {state:'authenticated'};}finally{await cdp.detach();}
 for(const frame of page.frames()){if(!official(frame.url(),service))continue;const state=await frame.evaluate(loginPageState).catch(()=> 'pending');if(state!=='pending')return {state};}
 return {state:'pending'};
}
async function choosePasswordLogin(page,service){
 if(service!=='tiktok')return;
 const labels=[/^(電話番号[／/]メール[／/]ユーザー名を使う|use phone\s*\/\s*email\s*\/\s*username)$/i,/^(メール[／/]ユーザー名でログイン|メールアドレス[／/]ユーザー名でログイン|log in with email or username|email\s*\/\s*username)$/i];
 for(const pattern of labels){for(const frame of page.frames()){if(!official(frame.url(),service))continue;const handle=await frame.evaluateHandle(source=>{const re=new RegExp(source,'i');const elements=[...document.querySelectorAll('button,a,[role=button],[role=tab]')].filter(el=>el.getClientRects().length&&re.test((el.innerText||el.getAttribute('aria-label')||'').trim()));return elements.length===1?elements[0]:null;},pattern.source);const element=handle.asElement();try{if(element){await element.click();await pause(400);}}finally{await handle.dispose();}}}
}
export async function submitCredentials(page,{service,username,password}){
 if(!['instagram','tiktok'].includes(service)||typeof username!=='string'||!username.trim()||username.length>300||typeof password!=='string'||!password||password.length>500)throw Error('LOGIN_INPUT');
 await page.waitForFunction(()=>/instagram\.com$|tiktok\.com$/.test(location.hostname)&&document.readyState!=='loading',{timeout:8000}).catch(()=>{});
 const existing=await inspectLogin(page,service);if(['authenticated','code_required','captcha_required','approval_required'].includes(existing.state))return existing;
 await choosePasswordLogin(page,service);
 await fillLoginField(page,{service,field:'username',value:username.trim()});
 try{await fillLoginField(page,{service,field:'password',value:password});}catch(error){if(error.message!=='LOGIN_FIELD_NOT_FOUND')throw error;await pressLoginButton(page,{service,button:'next'});await pause(500);await fillLoginField(page,{service,field:'password',value:password});}
 await pressLoginButton(page,{service,button:'login'});await pause(700);return inspectLogin(page,service);
}
export async function submitVerification(page,{service,code}){
 if(typeof code!=='string'||!code.trim()||code.length>32)throw Error('LOGIN_INPUT');
 await fillLoginField(page,{service,field:'code',value:code.replace(/\s+/g,'')});
 // Some providers submit a split code automatically.
 const state=await inspectLogin(page,service);if(state.state==='authenticated')return state;
 try{await pressLoginButton(page,{service,button:'verify'});}catch(error){if(error.message!=='LOGIN_BUTTON_NOT_FOUND')throw error;}
 await pause(700);return inspectLogin(page,service);
}
