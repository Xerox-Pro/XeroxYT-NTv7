import {useEffect} from 'react';
import {Routes, Route, Navigate, useLocation} from 'react-router-dom';
import MainApp from './MainApp';
import AccountGate from './components/AccountGate';
import PWAUpdateIndicator from './components/PWAUpdateIndicator';
import PrivateModeGate from './components/PrivateModeGate';
import {watchTheme} from './lib/theme.mjs';
import './theme.css';
import './theme-surfaces.css';
import './display-settings.css';

function OpenXerogram() {
  useEffect(() => { window.location.replace('https://xeroxapp047.vercel.app/'); }, []);
  return <a href="https://xeroxapp047.vercel.app/">Xerogram を開く</a>;
}

export default function App() {
  useEffect(()=>watchTheme(),[]);
  const location = useLocation();
  useEffect(() => {
    try {
      const page = location.pathname + location.search + location.hash;
      localStorage.setItem('xerox_last_page', page);
      localStorage.setItem('xerox_last_service', 'youtube');
      sessionStorage.setItem('xerox_service_page_youtube', page);
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

  return (
    <>
      <PWAUpdateIndicator />
      <Routes>
        <Route path="/instagram/*" element={<OpenXerogram/>}/>
        <Route path="/xerogram/*" element={<OpenXerogram/>}/>
        {['tiktok','x'].map(service => <Route key={service} path={'/' + service + '/*'} element={<Navigate to="/" replace/>}/>)}
        <Route path="/*" element={<PrivateModeGate><AccountGate><MainApp/></AccountGate></PrivateModeGate>} />
      </Routes>
    </>
  );
}
