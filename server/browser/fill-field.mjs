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
