import {lazy, Suspense, useEffect} from 'react';
import {Routes, Route, Navigate, useLocation} from 'react-router-dom';
import MainApp from './MainApp';
import AccountGate from './components/AccountGate';
import PWAUpdateIndicator from './components/PWAUpdateIndicator';
import PrivateModeGate from './components/PrivateModeGate';
import {watchTheme} from './lib/theme.mjs';
import './theme.css';
import './theme-surfaces.css';
import './display-settings.css';
import './xerogram/xerogram.css';

const GuestReels = lazy(() => import('./xerogram/GuestReels'));
const Xerogram = lazy(() => import('./xerogram/Xerogram'));

export default function App() {
  useEffect(()=>watchTheme(),[]);
  const location = useLocation();
  useEffect(() => {
    try {
      const page = location.pathname + location.search + location.hash;
      localStorage.setItem('xerox_last_page', page);
      const service = /^\/xerogram(?:\/|$)/.test(location.pathname) ? 'xerogram' : 'youtube';
      localStorage.setItem('xerox_last_service', service);
      sessionStorage.setItem('xerox_service_page_' + service, page);
      if (service === 'xerogram') return;
      const historyKey = 'xerox_service_history_youtube';
      const parsed = JSON.parse(sessionStorage.getItem(historyKey) || '[]');
      const history = Array.isArray(parsed) ? parsed : [];
      if (!history.some(entry => entry.key === location.key)) {
        sessionStorage.setItem(historyKey, JSON.stringify([...history, {key:location.key, path:page}].slice(-100)));
      }
    } catch {
      // Browsing works when storage is unavailable.
    }
  }, [location.pathname, location.search, location.hash, location.key]);

  if (/^\/xerogram\/guest\/?$/.test(location.pathname)) {
    return <Suspense fallback={<p role="status">Xerogramを読み込み中…</p>}><GuestReels /></Suspense>;
  }
  return (
    <>
      <PWAUpdateIndicator />
      <PrivateModeGate><AccountGate><Routes>
        <Route path="/xerogram/*" element={<Suspense fallback={<p role="status">Xerogramを読み込み中…</p>}><Xerogram /></Suspense>} />
        <Route path="/instagram/*" element={<Navigate to="/xerogram" replace />} />
        {['tiktok','x'].map(service => <Route key={service} path={'/' + service + '/*'} element={<Navigate to="/" replace/>}/>)}
        <Route path="/*" element={<MainApp/>} />
      </Routes></AccountGate></PrivateModeGate>
    </>
  );
}
