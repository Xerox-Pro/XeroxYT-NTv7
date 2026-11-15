import {Routes,Route,Navigate} from 'react-router-dom';
import MainApp from './MainApp';
import AccountGate from './components/AccountGate';
import PWAUpdateIndicator from './components/PWAUpdateIndicator';
export default function App(){return <><PWAUpdateIndicator/><Routes><Route path="/instagram/*" element={<Navigate to="/" replace/>}/><Route path="/tiktok/*" element={<Navigate to="/" replace/>}/><Route path="/*" element={<AccountGate><MainApp/></AccountGate>}/></Routes></>;}
