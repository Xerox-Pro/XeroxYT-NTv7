import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation,useNavigate} from 'react-router-dom';
import {ChevronDown,Check,X,Play} from 'lucide-react';

export default function AppSwitcher({onYouTube}:{onYouTube?:()=>void}){
 const location=useLocation(),navigate=useNavigate();
 const instagram=location.pathname.startsWith('/instagram');
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{setOpen(false)},[location.pathname]);
 useEffect(()=>{if(!open)return;const d=dialog.current;if(!d)return;d.showModal();return()=>{d.close();trigger.current?.focus()}},[open]);
 const select=(next:'youtube'|'instagram')=>{
   setOpen(false);
   if(next==='youtube'&&onYouTube)onYouTube();else navigate(next==='youtube'?'/':'/instagram');
 };
 return <div className="xy-switcher">
  <button ref={trigger} type="button" className="xy-brand" aria-label="XeroxYT-NTv7 アプリを選択" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
  {instagram?<img src="/app-icons/instagram-beta.webp" width={34} height={34} alt="Instagram"/>:<><img className="app-icon-light object-contain" src="/app-icons/youtube.png" width={48} height={32} alt=""/><img className="app-icon-dark object-contain" src="/app-icons/youtube-dark.png" width={48} height={32} alt=""/></>}
  <span className="xy-brand-text">XeroxYT-NTv7</span><ChevronDown size={15}/></button>
  {open&&createPortal(<dialog ref={dialog} className="xy-picker" aria-labelledby="xy-picker-title" onCancel={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="xy-picker-inner"><header><div><small>XEROX WORKSPACE</small><h2 id="xy-picker-title">アプリを選択</h2></div><button type="button" className="xy-icon-button" aria-label="閉じる" onClick={()=>setOpen(false)}><X/></button></header>
  <button className="xy-app-choice" onClick={()=>select('youtube')}><span className="xy-icon yt"><Play size={23} fill="currentColor"/></span><span><strong>YouTube</strong><small>動画・Shorts</small></span>{!instagram&&<Check size={19}/>}</button>
  <button className="xy-app-choice" onClick={()=>select('instagram')}><span className="xy-icon ig"><img src="/app-icons/instagram-beta.webp" width={48} height={48} alt=""/></span><span><strong>Instagram</strong><small>β版・個人用接続</small></span>{instagram&&<Check size={19}/>}</button>
  </div></dialog>,document.body)}
 </div>;
}
