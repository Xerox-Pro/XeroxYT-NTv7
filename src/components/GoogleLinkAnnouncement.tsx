import {useEffect,useRef,useState} from 'react';
const version='xerox_google_link_announcement_20261111_v1';
export default function GoogleLinkAnnouncement({onOpen}:{onOpen:()=>void}){
 const [open,setOpen]=useState(()=>{try{return !localStorage.getItem(version);}catch{return true;}});
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!open)return;dialog.current?.showModal();try{localStorage.setItem(version,'seen');}catch{}},[open]);
 const close=()=>{dialog.current?.close();setOpen(false);};
 if(!open)return null;
 return <dialog ref={dialog} className="google-link-announcement" aria-labelledby="google-link-update-title" onCancel={close}>
 <h2 id="google-link-update-title">Googleアカウントと連携できるようになりました！</h2>
 <p>YouTubeのおすすめ・履歴・登録チャンネル・高評価・後で見る・再生リストを、このアプリでも利用できます。名前とアイコン、自分のチャンネルも表示します。</p>
 <p>連携は任意です。パスワードはGoogleの公式認証画面だけで入力します。認証情報はサーバーで暗号化して保存し、マイページから解除できます。非公式アプリのため、Google側の対応状況で利用できない機能があります。</p>
 <p>連携する前に、マイページの「連携で渡す情報・安全性について」とGoogleの許可画面を確認してください。</p>
 <div><button onClick={close}>閉じる</button><button onClick={()=>{close();onOpen();}}>マイページで確認する</button></div>
 </dialog>;
}
