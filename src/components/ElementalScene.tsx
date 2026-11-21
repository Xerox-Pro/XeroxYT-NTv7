import {useLayoutEffect,useRef,useState} from 'react';
import Matter from 'matter-js';
import './burning.css';

type Kind='fire'|'water';
const {Bodies,Body,Composite,Engine}=Matter;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const targets='video,iframe,img,canvas,button,input,select,a,h1,h2,h3,p,li,article,header,nav,aside,footer,section,.video-card,.mini-player-body';

export default function ElementalScene({kind}:{kind:Kind}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [finished,finish]=useState(false);
 const fire=kind==='fire';
 useLayoutEffect(()=>{
  const root=document.getElementById('root'),layer=canvas.current;
  if(!root||!layer)return;
  const ctx=layer.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!ctx||reduced){finish(true);return;}
  const engine=Engine.create();
  engine.gravity.y=fire?-.42:1.35;
  const candidates=[...root.querySelectorAll<HTMLElement>(targets)].filter(el=>{
   const r=el.getBoundingClientRect();
   return r.width>1&&r.height>1&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
  });
  const pieces=candidates.filter(el=>!candidates.some(child=>el!==child&&el.contains(child))).map(el=>{
   const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
   const body=Bodies.rectangle(x,y,r.width,r.height,{isStatic:true,collisionFilter:{category:2,mask:1}});
   Composite.add(engine.world,body);
   return {el,r,x,y,body,original:{transform:el.style.transform,filter:el.style.filter,clipPath:el.style.clipPath},released:false};
  });
  const particles:{body:Matter.Body,age:number,life:number,ash:boolean,size:number}[]=[];
  let frame=0,t=0,last=performance.now(),accumulator=0,quiet=0;
  function spawn(x:number,y:number,size:number,ash:boolean){
   if(particles.length>=420)return;
   const body=Bodies.circle(x,y,Math.min(size,5),{frictionAir:fire?.013:.002,restitution:.35,collisionFilter:{category:1,mask:fire?0:2}});
   Body.setVelocity(body,{x:(Math.random()-.5)*(ash?4:2),y:fire?-2-Math.random()*5:5+Math.random()*4});
   Body.setAngularVelocity(body,(Math.random()-.5)*.25);
   Composite.add(engine.world,body);
   particles.push({body,age:0,life:ash?1.6:fire?1.3:3,size,ash});
  }
  function step(){
   t+=1/60;
   const w=innerWidth,h=innerHeight;
   for(const p of pieces){
    const onset=.2+1.8*clamp((fire?h-p.y:p.y)/h);
    const progress=clamp((t-onset)/(fire?3.4:1.5));
    if(progress===0)continue;
    if(!p.released){
     p.released=true;
     if(!fire){Body.setStatic(p.body,false);Body.setVelocity(p.body,{x:Math.sin(p.x*.023)*2,y:2});Body.setAngularVelocity(p.body,Math.sin(p.x)*.025);}
    }
    if(fire){
     const curl=Math.sin(progress*Math.PI);
     p.el.style.transform='perspective(650px) rotateX('+curl*52+'deg) rotateY('+curl*Math.sin(p.x)*27+'deg) skewX('+curl*8+'deg) scale('+(1-.36*progress)+','+(1-.54*progress)+')';
     p.el.style.filter='sepia('+progress+') brightness('+(1-.83*progress)+')';
     const rim=Array.from({length:19},(_,i)=>{const x=100-i*100/18;return x+'% '+100*clamp(1-progress+curl*.07*Math.sin(i*2+p.x+progress*4))+'%';});
     p.el.style.clipPath='polygon(0 0,100% 0,'+rim.join(',')+')';
     if(progress<1&&Math.random()<.35){
      const r=p.el.getBoundingClientRect(),x=r.left+Math.random()*r.width,y=r.top+r.height*(1-progress);
      spawn(x,y,2+Math.random()*5,true);
      spawn(x,y,Math.min(32,r.width*.12),false);
     }
    }else{
     const pos=p.body.position;
     p.el.style.transform='translate('+ (pos.x-p.x)+'px,'+(pos.y-p.y)+'px) rotate('+p.body.angle+'rad)';
    }
   }
   if(t<(fire?5.5:3.4)){
    for(let i=0;i<(fire?7:5);i++)spawn(Math.random()*w,fire?h+8:-15,fire?w*(.014+Math.random()*.045):2+Math.random()*4,false);
   }
   Engine.update(engine,1000/60);
   for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.age+=1/60;
    if(p.age>p.life||p.body.position.y>h+120&&!fire){Composite.remove(engine.world,p.body);particles.splice(i,1);}
   }
  }
  function draw(now:number){
   const w=innerWidth,h=innerHeight;
   const scale=Math.min(devicePixelRatio||1,3840/Math.max(w,h),2160/Math.min(w,h));
   const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
   if(layer!.width!==width||layer!.height!==height){layer!.width=width;layer!.height=height;}
   accumulator+=Math.min(.065,(now-last)/1000);last=now;
   while(accumulator>=1/60){step();accumulator-=1/60;}
   ctx!.setTransform(width/w,0,0,height/h,0,0);ctx!.clearRect(0,0,w,h);
   ctx!.fillStyle=fire?'rgba(14,8,6,'+clamp((t-2)/3)+')':'rgba(230,247,250,'+clamp((t-3)/2)+')';
   ctx!.fillRect(0,0,w,h);
   if(!fire&&t<3.8){
    const front=h*(t*t*.28-.15);
    ctx!.beginPath();ctx!.moveTo(0,front-h*1.5);
    for(let x=0;x<=w+8;x+=8){
     const ripple=Math.sin(x*.012+t*3)*16+Math.sin(x*.037-t*5)*5;
     ctx!.lineTo(x,front+ripple);
    }
    ctx!.lineTo(w,front-h*1.5);ctx!.closePath();
    const sheet=ctx!.createLinearGradient(0,front-h*1.5,0,front+20);
    sheet.addColorStop(0,'#b8e8ef00');sheet.addColorStop(.78,'#62b5c852');
    sheet.addColorStop(.97,'#367d9766');sheet.addColorStop(1,'#e1ffffab');
    ctx!.fillStyle=sheet;ctx!.fill();
   }
   for(const p of particles){
    const {x,y}=p.body.position,k=p.age/p.life;
    ctx!.save();ctx!.translate(x,y);
    if(p.ash){
     ctx!.rotate(p.body.angle);ctx!.fillStyle='rgba(107,90,77,'+(1-k)+')';
     ctx!.beginPath();ctx!.moveTo(-p.size,0);ctx!.lineTo(0,-2);ctx!.lineTo(p.size*Math.cos(k*9),1);ctx!.lineTo(0,3);ctx!.fill();
    }else if(fire){
     const radius=p.size*(1-.55*k);
     ctx!.translate(Math.sin(k*8+x*.012)*radius*.45,-k*k*h*.65);
     ctx!.scale(1,2.6);ctx!.globalCompositeOperation='lighter';
     const g=ctx!.createRadialGradient(0,0,0,0,0,radius);
     g.addColorStop(0,'rgba(255,'+Math.round(195-130*k)+',22,'+(.62*(1-k))+')');
     g.addColorStop(.44,'rgba(246,58,5,'+(.4*(1-k))+')');g.addColorStop(1,'rgba(173,31,4,0)');
     ctx!.fillStyle=g;ctx!.fillRect(-radius,-radius,2*radius,2*radius);
    }else{
     const v=p.body.velocity;ctx!.rotate(-Math.atan2(v.x,v.y));ctx!.scale(1,1+Math.min(5,Math.abs(v.y)*.15));
     const g=ctx!.createRadialGradient(-p.size*.3,-p.size*.3,0,0,0,p.size);
     g.addColorStop(0,'#efffffec');g.addColorStop(.32,'#addfeb88');g.addColorStop(.75,'#3689a774');g.addColorStop(1,'#e6ffffb0');
     ctx!.fillStyle=g;ctx!.beginPath();ctx!.arc(0,0,p.size,0,Math.PI*2);ctx!.fill();
    }
    ctx!.restore();
   }
   if(t>5.6&&!particles.length&&pieces.every(p=>fire||p.body.bounds.min.y>h))quiet++;
   if(quiet>=2){finish(true);return;}
   frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);Composite.clear(engine.world,false);Engine.clear(engine);for(const p of pieces){Object.assign(p.el.style,p.original);}};
 },[fire]);
 return <div className={'elemental-scene '+kind+(finished?' complete':'')}><canvas ref={canvas} aria-hidden="true"/>{finished&&<p role="status">{fire?'チルしましょう':'綺麗になりました！！'}</p>}</div>;
}
