'use strict';
// Decorative scenery has its own clock; it never affects a round or its outcome.
const rocketScenery=(()=>{
 const layer=document.getElementById('space-scenery'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 const planet=`<svg viewBox="0 0 220 220" focusable="false"><defs><linearGradient id="orbit-planet-color" x2=".8" y2="1"><stop stop-color="var(--orbit-planet-light)"/><stop offset="1" stop-color="var(--orbit-planet-deep)"/></linearGradient><clipPath id="orbit-planet-clip"><circle cx="110" cy="110" r="94"/></clipPath></defs><circle cx="110" cy="110" r="100" fill="none" stroke="var(--orbit-cyan)" stroke-opacity=".09" stroke-width="6"/><circle cx="110" cy="110" r="94" fill="url(#orbit-planet-color)"/><g clip-path="url(#orbit-planet-clip)" transform="rotate(-24 110 110)" fill="none"><path d="M0 61 Q80 38 225 75 M-10 100 Q80 78 230 117" stroke="var(--orbit-ice)" stroke-opacity=".13" stroke-width="13"/><path d="M-10 147 Q75 117 230 155 M0 173 Q85 151 220 185" stroke="var(--orbit-shadow)" stroke-opacity=".28" stroke-width="20"/></g><path d="M29 159 A94 94 0 0 1 148 24" fill="none" stroke="var(--orbit-cyan)" stroke-opacity=".6" stroke-width="1.4"/><circle cx="110" cy="110" r="94" fill="none" stroke="var(--orbit-ice)" stroke-opacity=".18"/></svg>`;
 const ringed=`<svg viewBox="0 0 260 180" focusable="false"><defs><linearGradient id="orbit-ring-color" x2=".9" y2="1"><stop stop-color="var(--orbit-ring-light)"/><stop offset="1" stop-color="var(--orbit-ring-deep)"/></linearGradient></defs><g transform="rotate(-24 130 90)"><ellipse cx="130" cy="90" rx="119" ry="30" fill="none" stroke="var(--orbit-violet)" stroke-width="9" stroke-opacity=".16"/><ellipse cx="130" cy="90" rx="112" ry="26" fill="none" stroke="var(--orbit-cyan)" stroke-width="1.2" stroke-opacity=".65"/><circle cx="130" cy="90" r="54" fill="url(#orbit-ring-color)"/><path d="M83 65 Q133 85 178 65 M78 86 Q130 106 183 86" fill="none" stroke="var(--orbit-lilac)" stroke-opacity=".12" stroke-width="8"/><path d="M91 53 A54 54 0 0 1 173 57" fill="none" stroke="var(--orbit-lilac)" stroke-opacity=".55"/><path d="M18 90 A112 26 0 0 0 242 90" fill="none" stroke="var(--orbit-cyan)" stroke-opacity=".65" stroke-width="3"/><path d="M11 95 A119 30 0 0 0 249 95" fill="none" stroke="var(--orbit-violet)" stroke-opacity=".24" stroke-width="6"/></g></svg>`;
 const moon=`<svg viewBox="0 0 80 80" focusable="false"><circle cx="40" cy="40" r="29" fill="var(--orbit-moon)"/><path d="M26 15 A29 29 0 0 1 61 60 A27 27 0 0 0 26 15" fill="var(--orbit-shadow)"/><circle cx="32" cy="28" r="6" fill="var(--orbit-ice)" opacity=".4"/><circle cx="26" cy="45" r="4" fill="var(--orbit-moon-crater)" opacity=".4"/><circle cx="44" cy="51" r="7" fill="var(--orbit-moon-crater)" opacity=".3"/><path d="M14 52 A29 29 0 0 1 48 12" fill="none" stroke="var(--orbit-cyan)" stroke-opacity=".45"/></svg>`;
 const rock=`<svg viewBox="0 0 64 64" focusable="false"><path d="M17 8 39 5 56 21 58 39 43 57 20 56 7 39 9 20Z" fill="var(--orbit-rock)" stroke="var(--orbit-rock-edge)" stroke-opacity=".42" stroke-width="1.1"/><path d="M17 8 32 20 9 20 7 39 22 34 20 56 43 57 37 38 58 39 56 21 39 5 37 24 32 20Z" fill="var(--orbit-rock-shadow)"/><path d="M17 8 39 5 37 24 32 20 9 20Z" fill="var(--orbit-rock-light)" opacity=".55"/><path d="m22 34 10-14 5 18-17 18Z" fill="var(--orbit-ice)" opacity=".13"/><path d="m43 57-6-19 21 1Z" fill="var(--orbit-shadow)"/><path d="m17 8 15 12 7-15M7 39l15-5" fill="none" stroke="var(--orbit-rock-edge)" stroke-opacity=".2"/></svg>`;
 const items=[
  {kind:'planet',art:planet,x:.04,y:.99,size:.4,max:310,speed:.035,opacity:.8},
  {kind:'ringed',art:ringed,x:.88,y:.25,size:.27,max:220,speed:.055,opacity:.8},
  {kind:'moon',art:moon,x:.17,y:.47,size:.095,max:74,speed:.08,opacity:.62},
  ...[
   [.11,.62,.064,.66,.68], [.9,.73,.09,1.2,.8], [.7,.88,.038,.5,.52],
   [.96,.43,.045,.8,.58], [.34,.94,.026,.4,.42], [.08,.25,.025,.36,.42]
  ].map(([x,y,size,speed,opacity],i)=>({kind:'rock',art:rock,x,y,size,max:68,speed,opacity,spin:i%2?1:-1}))
 ];
 for(const item of items){
  const node=document.createElement('div');node.className='orbit-scenery-object orbit-'+item.kind;
  node.innerHTML=(item.kind==='rock'?'<i class="meteor-trail"></i>':'')+'<div class="scenery-art">'+item.art+'</div>';
  layer.append(node);item.node=node;item.artNode=node.querySelector('.scenery-art');item.rotation=0;
 }
 let flying=false,elapsed=0,clock=0,last=0,distance=0,speed=0,handle=0,width=0,height=0;
 function layout(){width=layer.clientWidth;height=layer.clientHeight;for(const item of items){item.pixels=Math.min(item.max,width*item.size);item.node.style.width=item.pixels+'px';}}
 new ResizeObserver(layout).observe(layer);layout();
 function draw(now){
  handle=0;if(document.hidden)return;
  handle=requestAnimationFrame(draw);
  if(now-last<1000/30)return;
  const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
  if(!width||!height)return;
  if(!motion.matches){
   clock+=dt;const target=flying?115+Math.min(elapsed,10)*10:0;
   speed+=(target-speed)*(1-Math.exp(-dt*4));distance+=dt*speed;
  }
  for(let i=0;i<items.length;i++){
   const item=items[i],r=item.pixels*.65;
   const initial=width+r-item.x*width;
   const travel=(initial+(motion.matches?0:distance*item.speed))%(width+2*r);
   const x=width+r-travel,y=item.y*height+(travel-initial)*.42;
   const bob=motion.matches?0:Math.sin(clock*.3+i*1.7)*(item.kind==='rock'?3:5);
   // Keep the central multiplier calm while scenery passes behind it.
   const nearHud=x+r>width*.28&&x-r<width*.7&&y+r>height*.13&&y-r<height*.46;
   item.node.style.opacity=String(item.opacity*(nearHud?.2:1));
   item.node.style.transform=`translate3d(${x-item.pixels/2}px,${y-item.pixels/2+bob}px,0)`;
   if(item.kind==='rock'){
    if(!motion.matches)item.rotation+=dt*(2+speed*.055)*item.spin;
    item.artNode.style.transform=`rotate(${i*43+item.rotation}deg)`;
   }
  }
 }
 function resume(){if(!handle&&!document.hidden){last=0;handle=requestAnimationFrame(draw);}}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(handle);handle=0;}else resume();});
 resume();
 return {setFlight(active,seconds){flying=active;elapsed=seconds;}};
})();
