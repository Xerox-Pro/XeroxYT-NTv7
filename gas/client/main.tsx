import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import {installBridge} from './bridge.mjs';
import App from '../../src/App';
import '../../src/index.css';
import '../../src/social/switcher.css';
installBridge();
// The GAS iframe URL must stay unchanged during navigation.
const initialRoute=(window as any).__XEROX_GAS_ASSETS__?.route;
if(initialRoute)location.hash=initialRoute;
if(!location.hash.startsWith('#/')){
 let saved='/';try{saved=localStorage.getItem('xerox_last_page')||'/';}catch{}
 location.hash=saved.startsWith('/')&&!saved.startsWith('//')?saved:'/';
}
createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><App/></HashRouter></StrictMode>);
