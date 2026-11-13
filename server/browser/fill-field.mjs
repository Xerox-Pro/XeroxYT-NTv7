// Runs inside the official page. The caller supplies only a known field kind.
export function focusLoginField(field,index=0){
 const visible=el=>!el.disabled&&!el.readOnly&&el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
 const inputs=[...document.querySelectorAll('input')].filter(visible);
 const meta=el=>[el.name,el.id,el.autocomplete,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('data-e2e')].filter(Boolean).join(' ').toLowerCase();
 let candidates=inputs.filter(el=>{
  const text=meta(el),type=el.type;
  if(field==='password')return type==='password';
  if(field==='code')return type!=='password'&&(/one-time-code|verification.?code|security.?code|otp|認証コード|確認コード|セキュリティコード|6桁/.test(text)||(/code/.test(text)&&!/(country|postal|zip|promo)/.test(text)));
  return !['password','hidden','submit','checkbox','radio'].includes(type)&&!/(search|captcha|code|otp)/.test(text)&&(/username|user.?name|email|phone|ユーザー|メール|電話/.test(text)||type==='email'||type==='tel');
 });
 if(!candidates.length)return {found:false};
 // A single well-labelled field wins. Never guess between unrelated fields.
 const preferred=candidates.filter(el=>field==='username'?el.autocomplete==='username':field==='code'?el.autocomplete==='one-time-code':true);
 if(field==='code'&&candidates.some(el=>el.maxLength===1)){const base=candidates.find(el=>el.maxLength===1);const group=inputs.filter(el=>el.maxLength===1&&el.form===base.form&&!['password','hidden'].includes(el.type));if(group.length>=4&&group.length<=8)candidates=group;}
 if(preferred.length===1&&!(field==='code'&&candidates.every(el=>el.maxLength===1)))candidates=preferred;
 if(field==='code'&&candidates.length>1&&candidates.every(el=>el.maxLength===1)){
  candidates[index].focus();candidates[index].select();return {found:true,split:true,count:candidates.length};
 }
 if(candidates.length!==1)return {found:false};
 const el=candidates[0];el.scrollIntoView({block:'center'});el.focus();el.select();return {found:true,split:false};
}
export async function fillLoginField(page,{service,field,value}){
 if(!['instagram','tiktok'].includes(service)||!['username','password','code'].includes(field)||typeof value!=='string'||!value||value.length>500)throw Error('LOGIN_INPUT');
 const host=service==='instagram'?'instagram.com':'tiktok.com';
 for(const frame of page.frames()){
  let url;try{url=new URL(frame.url());}catch{continue;}
  if(url.protocol!=='https:'||!(url.hostname===host||url.hostname.endsWith('.'+host)))continue;
  const match=await frame.evaluate(focusLoginField,field);
  if(!match.found)continue;
  if(match.split){if(!/^[0-9]+$/.test(value)||value.length!==match.count)throw Error('LOGIN_INPUT');for(let i=0;i<value.length;i++){await frame.evaluate(focusLoginField,field,i);await page.keyboard.type(value[i]);}}
  else await page.keyboard.sendCharacter(value);
  return {success:true,field};
 }
 throw Error('LOGIN_FIELD_NOT_FOUND');
}

export function findLoginButton(action){
 const patterns={login:/^(ログイン|log\s*in|sign\s*in)$/i,next:/^(次へ|続行|続ける|next|continue)$/i,verify:/^(確認|確認する|認証|認証する|送信|verify|confirm|submit)$/i};
 if(!Object.hasOwn(patterns,action))return null;
 const visible=el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
 const inputs=[...document.querySelectorAll('input')].filter(visible);
 if(action==='verify'&&!inputs.some(el=>/one-time-code|code|otp|認証|確認/.test([el.autocomplete,el.name,el.placeholder,el.getAttribute('aria-label')].join(' ').toLowerCase())))return null;
 let matches=[...document.querySelectorAll('button,input[type=submit],input[type=button],[role=button]')].filter(el=>visible(el)&&patterns[action].test((el.getAttribute('aria-label')||el.innerText||el.value||'').replace(/\s+/g,' ').trim()));
 const formButtons=matches.filter(el=>el.closest('form'));if(formButtons.length)matches=formButtons;
 return matches.length===1?matches[0]:null;
}
export async function pressLoginButton(page,{service,button}){
 if(!['instagram','tiktok'].includes(service)||!['login','next','verify'].includes(button))throw Error('LOGIN_INPUT');
 const host=service==='instagram'?'instagram.com':'tiktok.com';
 const candidates=[];
 try{
  for(const frame of page.frames()){
   let url;try{url=new URL(frame.url());}catch{continue;}
   if(url.protocol!=='https:'||!(url.hostname===host||url.hostname.endsWith('.'+host)))continue;
   const handle=await frame.evaluateHandle(findLoginButton,button),element=handle.asElement();
   if(element)candidates.push(element);else await handle.dispose();
  }
  if(candidates.length!==1)throw Error('LOGIN_BUTTON_NOT_FOUND');
  await candidates[0].click();return {success:true,button};
 }finally{for(const element of candidates)await element.dispose();}
}
