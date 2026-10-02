'use strict';
// Decorative scenery has its own clock; it never affects a round or its outcome.
const rocketScenery=(()=>{
 const layer=document.getElementById('space-scenery'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 const rock=`<svg viewBox="0 0 64 64" focusable="false"><path d="M17 8 39 5 56 21 58 39 43 57 20 56 7 39 9 20Z" fill="var(--orbit-rock)" stroke="var(--orbit-rock-edge)" stroke-opacity=".42" stroke-width="1.1"/><path d="M17 8 32 20 9 20 7 39 22 34 20 56 43 57 37 38 58 39 56 21 39 5 37 24 32 20Z" fill="var(--orbit-rock-shadow)"/><path d="M17 8 39 5 37 24 32 20 9 20Z" fill="var(--orbit-rock-light)" opacity=".55"/><path d="m22 34 10-14 5 18-17 18Z" fill="var(--orbit-ice)" opacity=".13"/><path d="m43 57-6-19 21 1Z" fill="var(--orbit-shadow)"/><path d="m17 8 15 12 7-15M7 39l15-5" fill="none" stroke="var(--orbit-rock-edge)" stroke-opacity=".2"/></svg>`;
 const items=[
  ...[
   [.11,.62,.064,.66,.68], [.9,.73,.09,1.2,.8], [.7,.88,.038,.5,.52],
   [.96,.43,.045,.8,.58], [.34,.94,.026,.4,.42], [.08,.25,.025,.36,.42]
  ].map(([x,y,size,speed,opacity],i)=>({kind:'rock',art:rock,x,y,size,max:48,speed,opacity,spin:i%2?1:-1}))
 ];
 for(const item of items){
  const node=document.createElement('div');node.className='orbit-scenery-object orbit-'+item.kind;
  node.innerHTML=(item.kind==='rock'?'<i class="meteor-trail"></i>':'')+'<div class="scenery-art">'+item.art+'</div>';
  layer.append(node);item.node=node;item.artNode=node.querySelector('.scenery-art');item.rotation=0;
 }
 let paused=false,flying=false,elapsed=0,clock=0,last=0,distance=0,speed=0,handle=0,width=0,height=0;
 function layout(){width=layer.clientWidth;height=layer.clientHeight;for(const item of items){item.pixels=Math.min(item.max,width*item.size);item.node.style.width=item.pixels+'px';}}
 new ResizeObserver(layout).observe(layer);layout();
 function draw(now){
  handle=0;if(document.hidden||paused)return;
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
 function resume(){if(!handle&&!document.hidden&&!paused){last=0;handle=requestAnimationFrame(draw);}}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(handle);handle=0;}else resume();});
 resume();
 return {setFlight(active,seconds){flying=active;elapsed=seconds;},setPaused(value){paused=value;if(paused){cancelAnimationFrame(handle);handle=0;}else resume();}};
})();
