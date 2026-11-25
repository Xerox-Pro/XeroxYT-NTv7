import AppSwitcher from '../components/AppSwitcher';
import {Camera,ExternalLink,ShieldCheck,Clapperboard,MessageCircle,Home,Lock} from 'lucide-react';
const apiOrigin='https://xeroxapp047.vercel.app';
export default function InstagramWorkspace(){
 return <div className="xy-ig-workspace"><header className="xy-ig-header"><AppSwitcher/><span className="xy-ig-tag">Instagram ワークスペース</span></header>
 <main className="xy-ig-main"><section className="xy-ig-card"><div className="xy-icon ig xy-large"><Camera size={36}/></div><h1>Instagramにログイン</h1><p>Instagramの公式ページでログインして、フィードやリール、ストーリー、DMを利用できます。</p><a className="xy-primary" href="https://www.instagram.com/" rel="noreferrer">公式Instagramを開く <ExternalLink size={16}/></a>
 <div className="xy-ig-links"><a href="https://www.instagram.com/"><Home/>ホーム・ストーリー</a><a href="https://www.instagram.com/reels/"><Clapperboard/>リール</a><a href="https://www.instagram.com/direct/inbox/"><MessageCircle/>メッセージ</a></div>
 </section><section className="xy-ig-card xy-ig-private"><Lock size={22}/><h2>個人用API（実験版）</h2><p>既存のパスワード保護されたXerox APIを別のページで開きます。このワークスペースではInstagramの認証情報を入力・保存しません。非公式APIには互換性や安全性の制約があります。</p><a className="xy-secondary" href={apiOrigin} rel="noreferrer">個人用APIの接続画面 <ExternalLink size={16}/></a></section>
 <p className="xy-ig-note"><ShieldCheck size={16}/> 公式の閲覧制限・本人確認・安全機能を利用してください。ここではInstagramの投稿やDMをD1に複製しません。</p></main></div>;
}
