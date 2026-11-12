import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import MainApp from './MainApp';
import {serviceForPath} from './social/services.mjs';
const SocialApp=lazy(()=>import('./social/SocialApp'));
import AccountGate from './components/AccountGate';
import PWAUpdateIndicator from './components/PWAUpdateIndicator';

class ServiceBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<section role="alert" className="p-10 text-center"><p>アプリを読み込めませんでした。通信環境を確認してください。</p><button className="m-4 underline" onClick={()=>window.location.reload()}>再読み込み</button><Link className="underline" to="/">YouTubeに戻る</Link></section>:this.props.children;}}
export default function App() {
  const location = useLocation();
  const service=serviceForPath(location.pathname);

  useEffect(() => {
    try {
      localStorage.setItem('xerox_last_page', location.pathname + location.search + location.hash);
      localStorage.setItem('xerox_last_service',service);
      sessionStorage.setItem(`xerox_service_page_${service}`,location.pathname+location.search+location.hash);
      const historyKey=`xerox_service_history_${service}`;let history=JSON.parse(sessionStorage.getItem(historyKey)||'[]');if(!Array.isArray(history))history=[];if(!history.some(entry=>entry.key===location.key))history=[...history,{key:location.key,path:location.pathname+location.search+location.hash}].slice(-100);sessionStorage.setItem(historyKey,JSON.stringify(history));
      if(service!=='youtube')document.title=`${service==='instagram'?'Instagram':'TikTok'} · XeroxYT-NTv7`;
    } catch {
      // Browsing still works when storage is unavailable.
    }
  }, [location.pathname, location.search, location.hash]);

  return (
    <>
      <PWAUpdateIndicator />
      <Routes>
        <Route path="/*" element={<AccountGate allowGuest={service!=='youtube'}><MainApp socialContent={service==='youtube'?undefined:<ServiceBoundary key={service}><Suspense fallback={<div role="status" className="p-10 text-center text-gray-500">アプリを読み込み中…</div>}><SocialApp key={service} service={service}/></Suspense></ServiceBoundary>}/></AccountGate>} />
      </Routes>
    </>
  );
}
