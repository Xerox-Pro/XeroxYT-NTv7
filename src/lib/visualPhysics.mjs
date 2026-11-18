import Matter from 'matter-js';

const {Engine,Bodies,Body,Composite,Vector}=Matter;
const selector='[data-physics-piece],.shorts-frame,.animate-shimmer,.video-description-preview,button,a,input,select,textarea,img,iframe,video,canvas,h1,h2,h3,h4,p,label,summary,[role="button"],[role="tab"]';
const excluded='[data-effect-controls],[aria-label="システム管理"],[role="dialog"],dialog,[role="alert"],[role="status"]';
const properties=['translate','rotate','scale','border-radius','will-change','transform-origin','filter','box-shadow'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export function tiltGravity(beta,gamma,angle=0){
 const x=Math.sin(clamp(gamma,-90,90)*Math.PI/180),y=Math.sin(clamp(beta,-90,90)*Math.PI/180),a=angle*Math.PI/180;
 return {x:clamp(x*Math.cos(a)+y*Math.sin(a),-1,1),y:clamp(-x*Math.sin(a)+y*Math.cos(a),-1,1)};
}

// The original DOM elements stay mounted: event handlers, focus and player
// state survive. Individual CSS transforms compose with React/Motion transforms.
export function startVisualPhysics(root,mode){
 const win=root.ownerDocument.defaultView,doc=root.ownerDocument;
 const engine=Engine.create({enableSleeping:false,positionIterations:10,velocityIterations:8});
 const spinning=mode==='spin';
 const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.position='absolute';svg.style.pointerEvents='none';svg.setAttribute('aria-hidden','true');const defs=doc.createElementNS(ns,'defs');svg.appendChild(defs);if(mode==='jelly')doc.body.appendChild(svg);
 const jellyFilter=index=>{
  const filter=doc.createElementNS(ns,'filter'),id='jelly-'+Math.random().toString(36).slice(2)+'-'+index;filter.id=id;for(const [key,value]of Object.entries({x:'-60%',y:'-80%',width:'220%',height:'260%','color-interpolation-filters':'sRGB'}))filter.setAttribute(key,value);
  const node=(name,attrs,parent=filter)=>{const element=doc.createElementNS(ns,name);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,String(value));parent.appendChild(element);return element;};
  node('feTurbulence',{type:'fractalNoise',baseFrequency:'0.012 0.018',numOctaves:2,seed:index+1,result:'noise'});
  const displacement=node('feDisplacementMap',{in:'SourceGraphic',in2:'noise',scale:8,xChannelSelector:'R',yChannelSelector:'G',result:'gel'});
  node('feGaussianBlur',{in:'SourceAlpha',stdDeviation:4,result:'bevel'});
  const lighting=node('feSpecularLighting',{in:'bevel',surfaceScale:12,specularConstant:0.8,specularExponent:22,'lighting-color':'#ffffff',result:'shine'});node('fePointLight',{x:-80,y:-120,z:180},lighting);
  node('feComposite',{in:'shine',in2:'gel',operator:'in',result:'highlight'});node('feComposite',{in:'gel',in2:'highlight',operator:'arithmetic',k1:0,k2:1,k3:0.65,k4:0,result:'lit'});
  node('feDropShadow',{in:'lit',dx:3,dy:12,stdDeviation:6,'flood-color':'#33205e','flood-opacity':0.3});defs.appendChild(filter);return {id,displacement};
 };
 let pieces=[],walls=[],frame=0,last=null,accumulator=0,scanTimer=0,disposed=false,gravity={x:0,y:1};
 const now=()=>win.performance.now();
 const restore=piece=>{for(const [name,value,priority]of piece.saved){if(value)piece.el.style.setProperty(name,value,priority);else piece.el.style.removeProperty(name);}};
 const visible=el=>{if(el.closest(excluded))return false;const r=el.getBoundingClientRect();return r.width>=12&&r.height>=12&&r.width<=win.innerWidth&&r.height<=win.innerHeight&&r.bottom>0&&r.top<win.innerHeight&&r.right>0&&r.left<win.innerWidth&&win.getComputedStyle(el).visibility!=='hidden';};
 const collect=()=>{
  const nodes=[...root.querySelectorAll(selector)].filter(visible);
  const candidates=new Set(nodes);
  return nodes.filter(el=>{let parent=el.parentElement;while(parent&&parent!==root){if(candidates.has(parent))return false;parent=parent.parentElement;}return true;});
 };
 const rebuild=(force=false)=>{
  if(disposed)return;
  if(force)pieces.forEach(restore);
  const nodes=collect();
  if(force){pieces.forEach(restore);Composite.clear(engine.world,false);pieces=[];walls=[];defs.replaceChildren();}
  for(const p of pieces.filter(p=>!p.el.isConnected||p.el.closest(excluded))){restore(p);Composite.remove(engine.world,p.body);doc.getElementById(p.gel?.id)?.remove();}
  pieces=pieces.filter(p=>p.el.isConnected&&!p.el.closest(excluded));
  const existing=new Set(pieces.map(p=>p.el));
  const width=win.innerWidth,height=win.innerHeight,thickness=200;
  if(!walls.length){walls=[Bodies.rectangle(width/2,height+thickness/2,width+400,thickness,{isStatic:true}),Bodies.rectangle(-thickness/2,height/2,thickness,height+400,{isStatic:true}),Bodies.rectangle(width+thickness/2,height/2,thickness,height+400,{isStatic:true}),Bodies.rectangle(width/2,-thickness/2,width+400,thickness,{isStatic:true})];
  Composite.add(engine.world,walls);}
  for(const el of nodes){
   if(existing.has(el)||el.querySelector(selector)&&pieces.some(p=>el.contains(p.el)))continue;
   const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
   const body=Bodies.rectangle(clamp(x,r.width/2,width-r.width/2),clamp(y,r.height/2,height-r.height/2),r.width,r.height,{restitution:mode==='chaos2'?0.88:0.29,friction:0.42,frictionAir:mode==='chaos2'?0.015:0.012});
   const gel=mode==='jelly'?jellyFilter(pieces.length):null;
   pieces.push({el,body,x,y,width:r.width,height:r.height,saved:properties.map(name=>[name,el.style.getPropertyValue(name),el.style.getPropertyPriority(name)]),j:0,jv:0,held:false,gel});
   if(gel){el.style.setProperty('filter',`url("#${gel.id}")`);el.style.setProperty('box-shadow','inset 5px 7px 12px #ffffff66, inset -7px -9px 16px #6432aa44, 0 14px 18px #34205a33');}
   el.style.setProperty('will-change',mode==='jelly'?'scale, rotate, border-radius':'translate, rotate');
   Composite.add(engine.world,body);
   if(mode==='chaos2'){Body.setVelocity(body,{x:(Math.random()-0.5)*3,y:-Math.random()*3});Body.setAngularVelocity(body,(Math.random()-0.5)*0.03);}
  }
 };
 const schedule=()=>{
  if(scanTimer)return;
  scanTimer=win.setTimeout(()=>{scanTimer=0;rebuild();},250);
 };
 const reset=()=>rebuild(true);
 const impulse=(x,y,strength=1)=>{for(const p of pieces){if(mode==='jelly'){const distance=Math.hypot(p.x-x,p.y-y);p.jv+=0.075*strength*Math.exp(-distance/300);continue;}const delta=Vector.sub(p.body.position,{x,y}),distance=Math.max(40,Vector.magnitude(delta)),direction=Vector.normalise(delta);Body.applyForce(p.body,p.body.position,Vector.mult(direction,p.body.mass*0.018*strength*Math.exp(-distance/650)));Body.setAngularVelocity(p.body,clamp(p.body.angularVelocity+(Math.random()-0.5)*0.12*strength,-0.3,0.3));}};
 const shake=()=>impulse(win.innerWidth/2,win.innerHeight/2,2);
 const down=event=>{
  if(spinning||event.target?.closest?.(excluded))return;
  if(mode==='chaos2')impulse(event.clientX,event.clientY,0.65);
  for(const p of pieces){if(p.el===event.target||p.el.contains(event.target)){p.held=true;if(mode==='jelly'){p.jv+=0.14;p.j=clamp(p.j+0.15,-0.4,0.4);impulse(event.clientX,event.clientY,0.5);}else Body.setStatic(p.body,true);}}
 };
 const up=()=>{for(const p of pieces){if(!p.held)continue;p.held=false;if(mode==='jelly')p.jv-=0.13;else Body.setStatic(p.body,false);}};
 let lastOrientation=-Infinity;
 const screenAngle=()=>Number(win.screen?.orientation?.angle??win.orientation??0);
 const orientation=event=>{if(Number.isFinite(event.beta)&&Number.isFinite(event.gamma)){lastOrientation=now();gravity=tiltGravity(event.beta,event.gamma,screenAngle());}};
 let lastShake=0;
 const motion=event=>{const g=event.accelerationIncludingGravity;if(g&&now()-lastOrientation>1500&&Number.isFinite(g.x)&&Number.isFinite(g.y)){const angle=screenAngle()*Math.PI/180,x=-g.x/9.81,y=g.y/9.81;gravity={x:clamp(x*Math.cos(angle)+y*Math.sin(angle),-1,1),y:clamp(-x*Math.sin(angle)+y*Math.cos(angle),-1,1)};}const a=event.acceleration;if(!a)return;const magnitude=Math.hypot(a.x||0,a.y||0,a.z||0);if(magnitude>9&&now()-lastShake>350){lastShake=now();shake();}};
 const tick=time=>{
  if(disposed)return;
  frame=win.requestAnimationFrame(tick);
  if(doc.hidden){last=time;accumulator=0;return;}
  const delta=last===null?1000/60:Math.min(50,time-last);
  last=time;
  if(!spinning&&mode!=='jelly'){
   engine.gravity.x=gravity.x;engine.gravity.y=gravity.y;engine.gravity.scale=mode==='chaos2'?0.00018:0.00135;
   const step=1000/120;
   accumulator+=delta;
   while(accumulator>=step){
    if(mode==='chaos2'){for(const p of pieces)if(!p.held)Body.applyForce(p.body,p.body.position,{x:Math.sin(time/1700+p.x)*p.body.mass*0.000045,y:Math.cos(time/2100+p.y)*p.body.mass*0.000045});}
    Engine.update(engine,step);
    accumulator-=step;
   }
  }
  const reducedSpin=spinning&&(doc.documentElement.dataset.prefReduceMotion==='true'||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  for(const p of pieces){
   if(!p.el.isConnected)continue;
   if(spinning){
    if(reducedSpin){if(p.el.style.rotate!==p.saved.find(([name])=>name==='rotate')[1])restore(p);continue;}
    p.el.style.setProperty('rotate',`${(time*1.2+p.x)%360}deg`);
   }else if(mode==='jelly'){
    p.jv+=(-p.j*0.095-(p.held?-0.055:0));p.jv*=0.87;p.j=clamp(p.j+p.jv,-0.58,0.68);
    const wave=Math.sin(time/850+p.x*0.01)*0.008;
    p.el.style.setProperty('scale',`${1+p.j+wave} ${1-p.j*0.72-wave}`);p.el.style.setProperty('rotate',`${p.j*16}deg`);p.el.style.setProperty('border-radius',`${25+Math.abs(p.j)*70}% ${18+Math.abs(p.j)*48}% / ${18+Math.abs(p.j)*50}% ${28+Math.abs(p.j)*60}%`);p.gel?.displacement.setAttribute('scale',String(8+Math.abs(p.j)*Math.min(150,p.width*.7)));
   }else{
    const body=p.body,limitX=Math.max(0,(win.innerWidth-p.width)/2),limitY=Math.max(0,(win.innerHeight-p.height)/2);
    if(!Number.isFinite(body.position.x)||!Number.isFinite(body.position.y)){Body.setPosition(body,{x:p.x,y:p.y});Body.setVelocity(body,{x:0,y:0});}
    if(body.position.x< -p.width||body.position.x>win.innerWidth+p.width||body.position.y< -p.height||body.position.y>win.innerHeight+p.height){Body.setPosition(body,{x:clamp(body.position.x,win.innerWidth/2-limitX,win.innerWidth/2+limitX),y:clamp(body.position.y,win.innerHeight/2-limitY,win.innerHeight/2+limitY)});Body.setVelocity(body,{x:0,y:0});}
    const angle=body.angle;
    const zoom=Number.parseFloat(doc.documentElement.style.zoom)||1;
    p.el.style.setProperty('translate',`${(body.position.x-p.x)/zoom}px ${(body.position.y-p.y)/zoom}px`);p.el.style.setProperty('rotate',`${angle}rad`);
   }
  }
 };
 rebuild();frame=win.requestAnimationFrame(tick);
 const observer=new win.MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','open']});
 doc.addEventListener('pointerdown',down,{passive:true});doc.addEventListener('pointerup',up,{passive:true});doc.addEventListener('pointercancel',up,{passive:true});
 win.addEventListener('deviceorientation',orientation,{passive:true});win.addEventListener('devicemotion',motion,{passive:true});win.addEventListener('scroll',schedule,{passive:true,capture:true});win.addEventListener('resize',reset,{passive:true});win.addEventListener('blur',up);
 const autoShake=mode==='jelly'||spinning?null:win.setInterval(()=>{if(!doc.hidden)shake();},10000);
 return {shake,reset,destroy(){disposed=true;if(autoShake!==null)win.clearInterval(autoShake);win.cancelAnimationFrame(frame);win.clearTimeout(scanTimer);observer.disconnect();svg.remove();doc.removeEventListener('pointerdown',down);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',up);win.removeEventListener('deviceorientation',orientation);win.removeEventListener('devicemotion',motion);win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',reset);win.removeEventListener('blur',up);pieces.forEach(restore);Composite.clear(engine.world,false);Engine.clear(engine);},getPieces:()=>pieces};
}
