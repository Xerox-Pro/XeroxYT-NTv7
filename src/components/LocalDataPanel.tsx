import {useState} from 'react';

function readSnapshot(){
 try{
  const id=localStorage.getItem('xerox_last_account_id');
  const data=id?JSON.parse(localStorage.getItem('xerox_account_history_'+id)||'null'):null;
  return data&&Array.isArray(data.history)?data:null;
 }catch{return null;}
}

export default function LocalDataPanel(){
 const [snapshot,setSnapshot]=useState(readSnapshot);
 const [error,setError]=useState('');
 function download(){
  try{
   const saved=readSnapshot();
   if(!saved)throw new Error('保存された履歴がありません。');
   const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),history:saved.history,savedAt:saved.savedAt||null},null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='xerox-local-history.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');
  }catch{setError('ローカルデータを書き出せませんでした。');}
 }
 const history=snapshot?.history||[];
 return <details className="my-section" onToggle={()=>setSnapshot(readSnapshot())}>
  <summary className="cursor-pointer font-semibold">ローカルデータ（この端末）</summary>
  <p className="mt-3 text-sm">ログイン中のアカウントの視聴履歴を、このブラウザにも保存しています。通信に失敗した場合は、保存済みの履歴を表示します。</p>
  <p className="mt-2 text-sm">通常動画：{history.filter(item=>item.type!=='short').length}件 ／ Shorts：{history.filter(item=>item.type==='short').length}件</p>
  {snapshot?.savedAt&&<p className="text-sm">最終保存：{new Date(snapshot.savedAt).toLocaleString('ja-JP')}</p>}
  <p className="mt-2 text-xs text-gray-500">動画本体は保存しません。ブラウザのサイトデータ削除やプライベートモードでは、保存内容が失われる場合があります。GASの公開リンクを変更せずに利用してください。</p>
  <button type="button" className="my-back mt-3" onClick={download} disabled={!snapshot}>履歴をJSONで書き出す</button>
  {error&&<p role="alert">{error}</p>}
 </details>;
}
