import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation,useNavigate} from 'react-router-dom';
import {ChevronDown,Check,X} from 'lucide-react';
import {services,serviceForPath} from '../social/services.mjs';
const logos={youtube:'/app-icons/youtube.jpeg',instagram:'/app-icons/instagram.png',tiktok:'/app-icons/tiktok.png'};
const DOUBLE_TAP_MS=320;
export default function AppSwitcher({compact=false}:{compact?:boolean}){
 const location=useLocation(),navigate=useNavigate(),active=serviceForPath(location.pathname);
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),pending=useRef<ReturnType<typeof setTimeout>|null>(null),lastTouch=useRef(0);
 const clearPending=()=>{if(pending.current!==null){clearTimeout(pending.current);pending.current=null;}};
 const home=()=>{clearPending();navigate(services.find(service=>service.id===active)?.home||'/');};
 const showPicker=()=>{clearPending();setOpen(true);};
 const tap=()=>{if(pending.current!==null){showPicker();return;}pending.current=setTimeout(home,DOUBLE_TAP_MS);};
 useEffect(()=>{setOpen(false);clearPending();},[location.pathname]);
 useEffect(()=>()=>clearPending(),[]);
 useEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;node.showModal();return()=>{node.close();trigger.current?.focus();};},[open]);
 return <div className={`app-switcher ${compact?'compact':''}`}><button ref={trigger} data-app-logo type="button" aria-label="ホームに戻る（ダブルタップでアプリを切り替え）" title="1回でホーム、ダブルタップでアプリ切り替え。キーボードは↓で選択。" aria-haspopup="dialog" aria-expanded={open}
 onPointerUp={event=>{if(event.pointerType==='touch'){lastTouch.current=Date.now();tap();}}}
 onClick={event=>{if(Date.now()-lastTouch.current<600)return;if(event.detail===0)home();else tap();}}
 onDoubleClick={showPicker} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();showPicker();}}}>
 <img src={logos[active]} alt=""/><span>{active==='youtube'?'XeroxYT-NTv7':active==='instagram'?'Instagram':'TikTok'}</span><ChevronDown size={16}/></button>
 {open&&createPortal(<dialog ref={dialog} className="app-picker" aria-labelledby="app-picker-title" onCancel={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><div className="app-picker-content"><header><div><small>Xerox apps</small><h2 id="app-picker-title">アプリを選択</h2></div><button aria-label="閉じる" onClick={()=>setOpen(false)}><X size={22}/></button></header><div className="app-picker-grid">{services.map(service=><button key={service.id} aria-current={active===service.id?'page':undefined} onClick={()=>{setOpen(false);if(service.id!==active){window.dispatchEvent(new CustomEvent('xerox-service-switch',{detail:service.id}));navigate(service.home);}}}><img src={logos[service.id]} alt=""/><span>{service.name}</span>{active===service.id&&<Check size={17}/>}</button>)}</div><p>Instagram・TikTok・YouTubeの非公式クライアントです。</p></div></dialog>,document.body)}
 </div>;
}
