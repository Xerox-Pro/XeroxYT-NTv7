const $ = s => document.querySelector(s);
const labels = {home:"ホーム",reels:"リール",inbox:"メッセージ",search:"検索",profile:"プロフィール",suggestions:"おすすめ"};
let account, thread, revision=0;
const memory=new Map();
async function api(action, fields={}) {
  const r=await fetch("/api/xerogram",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,action})});
  const result=await r.json();
  if(!r.ok) throw Error(result.error || "通信に失敗しました");
  return result;
}
function button(label, click) {
  const b=document.createElement("button"); b.textContent=label; b.onclick=click; return b;
}
function showAccount(id){
  account=id; $("#login").hidden=true; $("nav").hidden=false; openPage("home");
}
async function openPage(page, fields={}, fresh=false){
  const version=++revision;
  $("#search").hidden=page!=="search"; $("#send").hidden=page!=="messages";
  $("h1").textContent=labels[page] || "メッセージ";
  $("section").replaceChildren(); $('[role=status]').textContent="";
  if(page==="search" && !fields.query)return;
  const key=JSON.stringify([account,page,fields]);
  try{
    const rows=(!fresh && memory.get(key)) || (await api(page,{...fields,refresh:fresh})).rows;
    if(version!==revision)return;
    memory.set(key,rows);
    $("section").append(button("更新",()=>openPage(page,fields,true)));
    for(const row of rows){
      const article=document.createElement("article"), title=document.createElement("h3");
      title.textContent=row.title; article.append(title);
      if(page==="inbox")article.append(button("会話を開く",()=>{thread=row.id;openPage("messages",{id:thread})}));
      const url=row.video || row.image;
      if(url && /^https:\/\//.test(url)){
        const el=document.createElement(row.video?"video":"img");
        if(row.video){el.controls=true;el.preload="none"}else el.loading="lazy";
        el.src=url;article.append(el);
      }
      if(row.body){const body=document.createElement("p");body.textContent=row.body;article.append(body)}
      $("section").append(article);
    }
    if(!rows.length)$('[role=status]').textContent="表示する項目がありません";
  }catch(e){if(version===revision)$('[role=status]').textContent=e.message}
}
for(const [key,label] of Object.entries(labels))$("nav").append(button(label,()=>openPage(key)));
$("nav").append(button("ログアウト",async()=>{try{await api("logout");memory.clear();location.reload()}catch(e){$('[role=status]').textContent=e.message}}));
function onForm(id, action){
  $(id).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector("button");b.disabled=true;
    try{await action(Object.fromEntries(new FormData(f)),f)}catch(err){$('[role=status]').textContent=err.message}finally{b.disabled=false}};
}
onForm("#login",async(data,f)=>{const result=await api("login",data);f.reset();showAccount(result.account)});
onForm("#search",data=>openPage("search",data));
onForm("#send",async(data,f)=>{const id=thread;await api("send",{...data,id});f.reset();if(thread===id&&!$("#send").hidden)await openPage("messages",{id},true)});
document.documentElement.classList.toggle("light",localStorage.theme==="light");
$("#theme").onclick=()=>{localStorage.theme=document.documentElement.classList.toggle("light")?"light":"dark"};
api("session").then(r=>showAccount(r.account)).catch(()=>{});
