import {Link} from 'react-router-dom';
export default function AppSwitcher({compact=false,label}:{compact?:boolean;label?:string}){return <Link to="/" aria-label="YouTubeホーム" className="flex items-center gap-2 font-bold whitespace-nowrap"><img src="/app-icons/youtube.jpeg" alt="" style={{width:36,height:36,objectFit:'contain'}}/>{!compact&&<span>{label||'XeroxYT-NTv7'}</span>}</Link>;}
