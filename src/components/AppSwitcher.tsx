import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation,useNavigate} from 'react-router-dom';
import {ChevronDown,Check,X} from 'lucide-react';
import {services,serviceForPath} from '../social/services.mjs';
const logos={youtube:'/favicon.png',instagram:'/app-icons/instagram.png',tiktok:'/app-icons/tiktok.png'};
export default function AppSwitcher({compact=false}:{compact?:boolean}){
 const location=useLocation(),navigate=useNavigate(),active=serviceForPath(location.pathname),[open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>setOpen(false),[location.pathname]);
 useEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;node.showModal();return()=>{node.close();trigger.current?.focus();};},[open]);
 return <div className={`app-switcher ${compact?'compact':''}`}><button ref={trigger} type="button" aria-label="アプリを切り替え" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><img src={logos[active]} alt=""/><span>{active==='youtube'?'XeroxYT-NTv7':active==='instagram'?'Instagram':'TikTok'}</span><ChevronDown size={16}/></button>{open&&createPortal(<dialog ref={dialog} className="app-picker" aria-labelledby="app-picker-title" onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}><div className="app-picker-content"><header><div><small>Xerox apps</small><h2 id="app-picker-title">アプリを選択</h2></div><button aria-label="閉じる" onClick={()=>setOpen(false)}><X size={22}/></button></header><div className="app-picker-grid">{services.map(service=><button key={service.id} aria-current={active===service.id?'page':undefined} onClick={()=>{setOpen(false);if(service.id!==active){window.dispatchEvent(new CustomEvent('xerox-service-switch',{detail:service.id}));navigate(service.home);}}}><img src={logos[service.id]} alt=""/><span>{service.name}</span>{active===service.id&&<Check size={17}/>}</button>)}</div><p>Instagram・TikTok・YouTubeの非公式クライアントです。</p></div></dialog>,document.body)}</div>;
}
