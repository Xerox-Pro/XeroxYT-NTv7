import {useLayoutEffect,useRef,useState} from 'react';
import './burning.css';

const targets='video,iframe,canvas,button,input,select,a,img,h1,h2,h3,p,li,article,header,nav,aside,footer,section,.video-card,.watch-channel-name,.watch-actions,.shorts-player-row,.mini-player-body,.watch-details-row';
const atomic='video,iframe,canvas,button,input,select,a';
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const edge=(x:number,p:number,seed:number)=>100-124*p+Math.min(1,p*12)*8*(Math.sin(x*.19+seed)+.45*Math.sin(x*.49+seed));

export function Campfire(){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [finished,finish]=useState(false);
 useLayoutEffect(()=>{
  const layer=canvas.current!, ctx=layer.getContext('2d');
  const root=document.getElementById('root');
  if(!root||!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const candidates=[...root.querySelectorAll<HTMLElement>(targets)].filter(el=>{
   const r=el.getBoundingClientRect();
   return r.width>12&&r.height>12&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
  });
  const surfaces=candidates.filter(el=>el.matches('img')||!el.parentElement?.closest(atomic));
  const pieces=surfaces.filter(el=>!surfaces.some(child=>child!==el&&el.contains(child)));
  if(!pieces.length)pieces.push(root);
  pieces.sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom);
  const sheet=pieces.map((el,i)=>({el,i,progress:-1,anim:el.animate([
   {transform:'perspective(680px) rotateX(0deg)',filter:'sepia(0)'},
   {transform:'perspective(680px) rotateX(12deg) rotateY(5deg)',filter:'sepia(.95) brightness(.86)',offset:.44},
   {transform:'perspective(680px) translate3d(0,-18px,45px) rotateX(47deg) rotateY(-16deg)',filter:'sepia(.85) brightness(.38)'}
  ],{duration:1000,fill:'both'}),clip:el.style.clipPath}));
  sheet.forEach(s=>s.anim.pause());
  const ashes:{x:number;y:number;vx:number;vy:number;life:number;angle:number}[]=[];
  let frame=0,last=-100,elapsed=0,done=false;
  function draw(now:number){
   if(now-last<32){frame=requestAnimationFrame(draw);return;}
   elapsed+=Math.min(64,now-last);last=now;
   const w=innerWidth,h=innerHeight;
   const scale=Math.min(window.devicePixelRatio||1,3840/Math.max(w,h),2160/Math.min(w,h));
   const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
   if(layer.width!==width||layer.height!==height){layer.width=width;layer.height=height}
   ctx!.setTransform(width/w,0,0,height/h,0,0);
   let consumed=0;
   ctx!.clearRect(0,0,w,h);
   for(const s of sheet){
    const p=reduced?1:clamp((elapsed-450-4500*s.i/Math.max(1,sheet.length-1))/3350);
    consumed+=p;
    if(p===s.progress)continue;
    s.progress=p;s.anim.currentTime=p*1000;
    const rim=Array.from({length:21},(_,j)=>[100-j*5,edge(100-j*5,p,s.i)]);
    s.el.style.clipPath='polygon(0 0,100% 0,'+rim.map(([x,y])=>x+'% '+Math.max(0,y)+'%').join(',')+')';
    if(p>0&&p<1){
     const r=s.el.getBoundingClientRect();
     for(let j=0;j<6;j++){
      const phase=elapsed*.004+s.i*2.4+j*1.73;
      const u=(j+.5+.23*Math.sin(phase*.6))*100/6,x=r.left+r.width*u/100,y=r.top+r.height*edge(u,p,s.i)/100;
      const width=Math.min(23,r.width/8)*(1+.15*Math.sin(phase));
      const height=width*(1.8+.65*Math.sin(phase*1.7))*(.65+Math.sin(p*Math.PI));
      const bend=width*(.55*Math.sin(phase)+.32*Math.sin(phase*2.3));
      const flame=ctx!.createLinearGradient(x,y,x,y-height);
      flame.addColorStop(0,'#fff4ad');flame.addColorStop(.24,'#ffc04c');
      flame.addColorStop(.65,'#ff6123cc');flame.addColorStop(1,'#b5351200');
      ctx!.fillStyle=flame;ctx!.beginPath();ctx!.moveTo(x-width*.5,y);
      ctx!.bezierCurveTo(x-width,y-height*.4,x+bend+width*.4,y-height*.64,x+bend,y-height);
      ctx!.bezierCurveTo(x+bend+width,y-height*.52,x+width,y-height*.2,x+width*.5,y);
      ctx!.closePath();ctx!.fill();
      if(j===0&&ashes.length<130)ashes.push({x,y,vx:Math.random()*2-1,vy:-1-Math.random()*2,life:1,angle:x});
     }
    }
   }
   const fuel=consumed/sheet.length;
   ctx!.fillStyle='rgba(16,11,9,'+(.08+.92*fuel**3)+')';ctx!.fillRect(0,0,w,h);
   const fw=w*1.1,fh=h*(1.2+.55*fuel),base=h+8;
   const glow=ctx!.createRadialGradient(w/2,base,0,w/2,base,fw*.78);
   glow.addColorStop(0,'#d85a2266');glow.addColorStop(1,'#a83e0800');ctx!.fillStyle=glow;ctx!.fillRect(0,0,w,h);
   // Draw curved flame fronts directly at the display resolution.
   const time=elapsed/1000;
   for(let band=0;band<3;band++){
    const count=18+band*9;
    for(let i=0;i<count;i++){
     const phase=i*2.39996+band*1.7;
     const sway=Math.sin(time*1.8+phase);
     const x=w*(i+.5+.25*sway)/count;
     const radius=w/count*(1.2+.35*Math.sin(phase));
     const rise=fh*(.52+.18*Math.sin(phase*3)+.13*Math.sin(time*2.4+phase))/(1+band*.6);
     const tip=x+radius*(sway+.55*Math.sin(time*3+phase));
     const y=base-rise;
     const gradient=ctx!.createLinearGradient(x,base,tip,y);
     gradient.addColorStop(0,['#ff5a12','#ffae29','#fff6b0'][band]);
     gradient.addColorStop(.65,['#ff360ec9','#ff801bea','#ffca50ec'][band]);
     gradient.addColorStop(1,['#ee300800','#ff610d55','#ffc22655'][band]);
     ctx!.fillStyle=gradient;
     ctx!.beginPath();ctx!.moveTo(x-radius,base);
     ctx!.bezierCurveTo(x-radius*.8,base-rise*.48,tip+radius*sway,y+rise*.3,tip,y);
     ctx!.bezierCurveTo(tip-radius*sway,y+rise*.28,x+radius,base-rise*.42,x+radius,base);
     ctx!.closePath();ctx!.fill();
    }
   }
   for(const tilt of [-.14,.12]){
    ctx!.save();ctx!.translate(w/2,base-2);ctx!.rotate(tilt);
    const log=ctx!.createLinearGradient(0,-6,0,8);log.addColorStop(0,'#ffa148');log.addColorStop(.2,'#67321f');log.addColorStop(.7,'#2b1812');log.addColorStop(1,'#160f0d');
    ctx!.fillStyle=log;ctx!.beginPath();ctx!.roundRect(-fw*.32,-6,fw*.64,14,6);ctx!.fill();ctx!.restore();
   }
   for(let i=ashes.length-1;i>=0;i--){
    const a=ashes[i];a.x+=a.vx;a.y+=a.vy;a.life-=.016;a.angle+=.14;
    if(a.life<=0){ashes.splice(i,1);continue}
    ctx!.save();ctx!.translate(a.x,a.y);ctx!.rotate(a.angle);ctx!.fillStyle='rgba(154,143,131,'+a.life+')';ctx!.fillRect(-2,-1,4,1+2*Math.abs(Math.cos(a.angle)));ctx!.restore();
   }
   if(fuel===1&&!done){done=true;finish(true)}
   if(!reduced)frame=requestAnimationFrame(draw);
  }
  draw(performance.now());
  const resize=()=>{if(reduced)draw(performance.now()+64)};
  window.addEventListener('resize',resize);
  return()=>{window.removeEventListener('resize',resize);cancelAnimationFrame(frame);for(const s of sheet){s.anim.cancel();s.el.style.clipPath=s.clip}};
 },[]);
 return <div className="burn-scene"><canvas ref={canvas} aria-hidden="true"/>{finished&&<p role="status">チルしましょう</p>}</div>;
}
