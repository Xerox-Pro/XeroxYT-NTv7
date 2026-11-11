import {readPlayerPreferences,usePlayerPreferences} from '../lib/playerPreferences';
import {useEffect,useRef,useState,type ReactNode,type PointerEvent,type KeyboardEvent} from 'react';
import {Pause,Play,X,Maximize2,PictureInPicture2} from 'lucide-react';
type Box={x:number;y:number;width:number;height:number};
type Point={x:number;y:number};
const key='xerox_mini_player_layout_v3';
const DEFAULT_ASPECT=16/9;
export function fitMiniPlayer(box:Box,viewportWidth:number,viewportHeight:number,aspectRatio=DEFAULT_ASPECT):Box{
 const ratio=Number.isFinite(aspectRatio)&&aspectRatio>0?aspectRatio:DEFAULT_ASPECT;
 const maxW=Math.max(80,viewportWidth-16),maxH=Math.max(60,viewportHeight-88);
 const limit=Math.min(maxW,maxH*ratio);
 const width=Math.min(limit,Math.max(Math.min(180,limit),box.width));
 const height=width/ratio;
 const visibleWidth=Math.min(64,width),visibleHeight=Math.min(64,height);
 return {width,height,x:Math.max(-width+visibleWidth,Math.min(viewportWidth-visibleWidth,box.x)),y:Math.max(-height+visibleHeight,Math.min(viewportHeight-visibleHeight,box.y))};
}
const savedLayout=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&['x','y','width','height'].every(k=>Number.isFinite(value[k])))return value;}catch{}return null;};
const initialAspect=()=>{const saved=savedLayout();return saved&&Number.isFinite(saved.aspectRatio)&&saved.aspectRatio>0?saved.aspectRatio:DEFAULT_ASPECT;};
const initialBox=(aspectRatio:number):Box=>{const w=window.innerWidth,h=window.innerHeight,saved=savedLayout();const width=Math.min(w*.58,480);return fitMiniPlayer(saved||{x:w-width-16,y:h-width/aspectRatio-100,width,height:width/aspectRatio},w,h,aspectRatio);};
export default function FloatingPlayerFrame({mini,children,onRestore,onClose}:{mini:boolean;children:ReactNode;onRestore:()=>void;onClose:()=>void}){
 const prefs=usePlayerPreferences();
 const [aspectRatio,setAspectRatio]=useState(initialAspect);const aspectRef=useRef(aspectRatio);aspectRef.current=aspectRatio;
 const [box,setBox]=useState(()=>initialBox(aspectRef.current));const boxRef=useRef(box);boxRef.current=box;
 const [playing,setPlaying]=useState(true);
 const [pipError,setPipError]=useState('');
 const sectionRef=useRef<HTMLElement>(null);
 const points=useRef(new Map<number,Point>());
 const gesture=useRef<{mode:'move'|'resize'|'pinch';box:Box;point:Point;distance:number}|null>(null);
 const lastTap=useRef(0);const moved=useRef(false);
 const update=(next:Box,persist=false)=>{let fitted=fitMiniPlayer(next,window.innerWidth,window.innerHeight,aspectRef.current);
 if(persist&&readPlayerPreferences().miniSnap){const gap=24;if(Math.abs(fitted.x)<gap)fitted.x=8;if(Math.abs(window.innerWidth-fitted.x-fitted.width)<gap)fitted.x=window.innerWidth-fitted.width-8;if(Math.abs(fitted.y)<gap)fitted.y=8;if(Math.abs(window.innerHeight-fitted.y-fitted.height)<gap)fitted.y=window.innerHeight-fitted.height-8;}boxRef.current=fitted;setBox(fitted);if(persist)try{localStorage.setItem(key,JSON.stringify({...fitted,aspectRatio:aspectRef.current}));}catch{}};
 useEffect(()=>{const resize=()=>update(boxRef.current);const state=(e:Event)=>setPlaying(Boolean((e as CustomEvent).detail));const aspect=(e:Event)=>{const ratio=Number((e as CustomEvent).detail);if(!Number.isFinite(ratio)||ratio<.2||ratio>5)return;aspectRef.current=ratio;setAspectRatio(ratio);update({...boxRef.current,height:boxRef.current.width/ratio});};window.addEventListener('resize',resize);window.addEventListener('xerox-mini-play-state',state);window.addEventListener('xerox-mini-player-aspect-change',aspect);return()=>{window.removeEventListener('resize',resize);window.removeEventListener('xerox-mini-play-state',state);window.removeEventListener('xerox-mini-player-aspect-change',aspect);};},[]);
 useEffect(()=>{if(!mini){points.current.clear();gesture.current=null;setPipError('');}},[mini]);
 const openPip=()=>{
  // Keep the live iframe mounted: browser PiP cannot control this cross-origin player.
  update({...boxRef.current,x:window.innerWidth-boxRef.current.width-16,y:window.innerHeight-boxRef.current.height-96},true);
  setPipError('画面内PiPで再生中です。ドラッグで移動・右下でサイズ変更できます。');
 };
 const rebase=(mode:'move'|'resize'|'pinch')=>{const p=[...points.current.values()];if(!p.length){gesture.current=null;return;}gesture.current={mode,box:boxRef.current,point:p.length>1?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}:p[0],distance:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};};
 const start=(e:PointerEvent<HTMLElement>,mode:'move'|'resize')=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.current.size===1)moved.current=false;if(points.current.size>1){moved.current=true;rebase('pinch');}else rebase(mode);};
 const move=(e:PointerEvent<HTMLElement>)=>{if(!points.current.has(e.pointerId))return;points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g)return;const p=[...points.current.values()];if(g.mode==='pinch'&&p.length>1){const midpoint={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};const scale=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)/Math.max(1,g.distance);const width=g.box.width*scale;const height=width/aspectRef.current;update({...g.box,width,height,x:g.box.x+(g.box.width-width)/2+midpoint.x-g.point.x,y:g.box.y+(g.box.height-height)/2+midpoint.y-g.point.y});return;}const dx=p[0].x-g.point.x,dy=p[0].y-g.point.y;if(Math.hypot(dx,dy)>4)moved.current=true;update(g.mode==='resize'?{...g.box,width:g.box.width+Math.max(dx,dy*aspectRef.current),height:(g.box.width+Math.max(dx,dy*aspectRef.current))/aspectRef.current}:{...g.box,x:g.box.x+dx,y:g.box.y+dy});};
 const end=(e:PointerEvent<HTMLElement>)=>{if(!points.current.delete(e.pointerId))return;if(points.current.size){rebase('move');return;}const isTap=!moved.current&&gesture.current?.mode==='move'&&e.type==='pointerup';gesture.current=null;update(boxRef.current,true);if(isTap){const now=Date.now();if(now-lastTap.current<320){lastTap.current=0;onRestore();}else lastTap.current=now;}};
 const keyboard=(event:KeyboardEvent,resize=false)=>{const d=event.shiftKey?20:5;const delta={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]}[event.key];if(!delta)return;event.preventDefault();const b=boxRef.current;update(resize?{...b,width:b.width+delta[0]+delta[1]*aspectRef.current,height:(b.width+delta[0]+delta[1]*aspectRef.current)/aspectRef.current}:{...b,x:b.x+delta[0],y:b.y+delta[1]},true);};
 return <section ref={sectionRef} aria-label={mini?'ミニプレイヤー':'動画プレイヤー'} className={mini?'persistent-mini-player floating-mini-player':'w-full'} style={mini?{left:box.x,top:box.y,width:box.width,height:box.height,opacity:prefs.miniOpacity/100,right:'auto',bottom:'auto'}:undefined}>
  <div className={mini?'mini-player-body':undefined}>{children}</div>
  {mini&&<>
   <div className="mini-player-gesture" role="button" tabIndex={0} aria-label="ドラッグで移動、2本指で拡大縮小、ダブルタップで動画に戻る" onPointerDown={e=>start(e,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={e=>{if(e.key==='Enter'){onRestore();return;}keyboard(e);}}/>
   <div className="mini-player-overlay-controls">
    <button type="button" className="mini-player-pause" aria-label={playing?'一時停止':'再生'} onClick={()=>window.dispatchEvent(new CustomEvent('xerox-mini-toggle-play'))}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button>
    <button type="button" aria-label="画面内PiPを使う" title="同じ動画を画面内の小窓で再生" onClick={openPip}><PictureInPicture2 size={19}/></button>
    <button type="button" className="mini-player-restore" aria-label="動画ページに戻る" onClick={onRestore}><Maximize2 size={17}/></button>
    <button type="button" aria-label="ミニプレイヤーを閉じて再生を終了" onClick={onClose}><X size={22}/></button>
   </div>
   <button type="button" className="mini-player-resize" aria-label="縦横比を保ってサイズ変更" title="縦横比を保ってサイズ変更" onPointerDown={e=>start(e,'resize')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={e=>keyboard(e,true)}><span/></button>
   {pipError&&<p role="status" className="absolute z-[5] left-1.5 right-1.5 bottom-1.5 m-0 rounded-md bg-neutral-900/95 p-2 text-[11px] leading-snug text-white pointer-events-none">{pipError}</p>}
  </>}
 </section>;
}
