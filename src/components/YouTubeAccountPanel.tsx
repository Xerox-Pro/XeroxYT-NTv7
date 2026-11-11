import {useEffect,useState} from 'react';
import {Link2,LogOut,ExternalLink} from 'lucide-react';
import type {UserInfo,Video} from '../types';
export default function YouTubeAccountPanel({user,flow,error,featureErrors,liked,notifications,onLink,onCancel,onUnlink,onVideoSelect}:{user:UserInfo|null;flow:{userCode:string;verificationUrl:string;expiresAt?:number}|null;error:string|null;featureErrors:string[];liked:Video[];notifications:{id:string;message:string;videoId?:string}[];onLink:()=>void|Promise<void>;onCancel:()=>void;onUnlink:()=>void;onVideoSelect:(id:string,video?:Video)=>void}){
 const [busy,setBusy]=useState(false);
 useEffect(()=>setBusy(false),[flow,user,error]);
 return <section className="youtube-link-panel"><header><div><h2>YouTubeアカウント連携</h2><p>{user?`${user.name} と連携中`:'Googleアカウントと連携できます'}</p></div>{user?<button onClick={onUnlink}><LogOut size={16}/>連携を解除</button>:!flow&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await onLink();}finally{setBusy(false);}}}><Link2 size={17}/>{busy?'準備中…':'Googleと連携する'}</button>}</header>
 {!user&&!flow&&<p>連携すると、YouTubeの履歴やホームのおすすめ、ホームにあるShorts、登録チャンネル・再生リストを取得できます。初回の連携後は通常そのまま利用できますが、期限切れなどで再連携が必要になる場合があります。</p>}
 {flow&&<div className="youtube-device-code"><p>Googleの画面で次のコードを入力し、表示されるアプリ名と許可内容を確認してください。</p><strong>{flow.userCode}</strong><a href={flow.verificationUrl} target="_blank" rel="noopener noreferrer">Googleの認証画面を開く<ExternalLink size={15}/></a><button onClick={onCancel}>キャンセル</button><p>承認後、自動で連携状態を更新します。</p></div>}
 {error&&<p className="youtube-link-error" role="alert">{error}</p>}
 {user&&<><p>ホーム・履歴・登録チャンネル・再生リスト・後で見る・高評価を連携します。YouTube.jsのGoogle認証はTVクライアント対応のため、利用できない機能もあります。</p>{featureErrors.length>0&&<p role="status">現在取得できない項目：{featureErrors.join('・')}。空のデータとして上書きしていません。</p>}{liked.length>0&&<div className="youtube-liked"><h3>YouTubeの高評価</h3>{liked.slice(0,8).map(video=><button key={video.videoId} onClick={()=>onVideoSelect(video.videoId!,video)}>{video.title}</button>)}</div>}</>}
 {user&&notifications.length>0&&<details><summary>YouTubeの通知（{notifications.length}件）</summary>{notifications.slice(0,20).map((item,index)=><button className="youtube-notification" key={item.id||index} disabled={!item.videoId} onClick={()=>item.videoId&&onVideoSelect(item.videoId)}>{item.message}</button>)}</details>}
 <details><summary>連携で渡す情報・安全性について</summary><p>これはGoogle・YouTubeの公式アプリではありません。パスワードはGoogleの認証画面だけで入力し、このサイトでは受け取りません。許可した範囲のYouTubeデータと、接続用の認証情報を扱います。連携中に高評価・登録・コメント・保存を操作すると、その変更をYouTubeにも送信します。接続するだけでコメントや登録を自動送信することはありません。認証情報は暗号化してサーバー側に保存し、サイトのアカウントごとに分離します。</p><p>暗号化していても、不正アクセスなどのリスクがゼロになるわけではありません。許可画面に表示されるアプリ名・権限に納得できる場合だけ連携してください。「連携を解除」でこのサイトに保存した認証情報を削除できます。Google側のアクセス権も取り消す場合は<a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Googleアカウントの接続一覧</a>から解除してください。</p></details>
 </section>;
}
