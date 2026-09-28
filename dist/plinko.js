'use strict';
const $=id=>document.getElementById(id),send=d=>parent.postMessage(d,location.origin);
const canvas=$('board'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let lane=2,state='idle',balance=0,connected=false,pending=false,roundId='',path=null;
let clock=0,elapsed=0,hitCursor=0,preview=true,history=[],trail=[],flashes=new Map(),bursts=[];
let finishFx=null,launchFx=null,impactShake=null;
function select(){
 for(const el of document.querySelectorAll('[data-lane]')){el.setAttribute('aria-pressed',Number(el.dataset.lane)===lane);el.disabled=state==='dropping'||pending;}
 const busy=state==='dropping'||pending;
 $('launch').disabled=!connected||busy||balance<50;
 $('launch').textContent=busy?'弹珠飞行中…':balance<50?'积分不足':'释放弹珠 · 50 积分';
 $('message').textContent=balance<50&&!busy?'积分不足 50，可返回大厅玩扫雷赚取积分。':'落袋后自动到账，奖励包含本局投入。';
}
for(const id of ['lanes','lane-controls']){
 $(id).innerHTML=PLINKO_LANES.map((x,i)=>`<button data-lane="${i}" ${id==='lanes'?`style="left:${x/7}%"`:''} aria-pressed="${i===lane}" aria-label="落球入口 ${i+1}">${i+1}</button>`).join('');
 $(id).onclick=e=>{
  const button=e.target.closest('[data-lane]');if(!button||state==='dropping'||pending)return;
  lane=Number(button.dataset.lane);preview=true;trail=[];bursts=[];flashes.clear();finishFx=null;launchFx=null;impactShake=null;
  $('status').textContent=`入口 ${lane+1} · 准备释放`;
  canvas.setAttribute('aria-label',`弹珠位于第 ${lane+1} 个入口，等待释放`);
  document.querySelectorAll('.slot').forEach(el=>el.classList.remove('hit'));
  document.querySelector('.arena').classList.remove('big-win');select();
 };
}
$('slots').innerHTML=PLINKO_MULT.map((m,i)=>`<div class="slot ${m>=3?'high':m>=1?'medium':''}" data-slot="${i}">${m}×</div>`).join('');
$('probability-chart').innerHTML=PLINKO_PROBS.map((p,i)=>`<div class="probability-column" aria-label="第 ${i+1} 槽，${PLINKO_MULT[i]} 倍，概率 ${(p*100).toFixed(2)}%"><span>${(p*100).toFixed(1)}%</span><i style="height:${p/PLINKO_PROBS[4]*64}px" aria-hidden="true"></i><small>${PLINKO_MULT[i]}×</small></div>`).join('');
$('launch').onclick=()=>{if(!connected||pending||state==='dropping'||balance<50)return;plinkoAudio.unlock();pending=true;select();send({type:'plinko-drop',lane});};
$('back').onclick=()=>{plinkoAudio.leave();send({type:'game-return'});};
$('volt-sound').onclick=()=>{plinkoAudio.unlock();const on=plinkoAudio.toggle();$('volt-sound').setAttribute('aria-pressed',on);$('volt-sound').setAttribute('aria-label',on?'关闭音效':'开启音效');$('volt-sound').textContent=on?'♪':'♩';};
document.addEventListener('visibilitychange',()=>{if(document.hidden)plinkoAudio.stop();});
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==parent||!e.data)return;
 const d=e.data;
 if(d.type==='plinko-error'){pending=false;select();$('message').textContent=d.message;return;}
 if(d.type!=='plinko-state')return;
 connected=true;pending=false;balance=d.balance;$('balance').textContent=balance.toLocaleString();
 if(Object.hasOwn(d,'path'))path=d.path;
 elapsed=d.elapsed;clock=performance.now();
 const newRound=d.roundId!==roundId,changed=d.state!==state||newRound;
 if(newRound){
  roundId=d.roundId;hitCursor=0;preview=false;trail=[];flashes.clear();bursts=[];finishFx=null;impactShake=null;
  document.querySelectorAll('.slot').forEach(el=>el.classList.remove('hit'));
 }
 state=d.state;
 if(state==='dropping'){
  lane=d.lane;preview=false;$('status').textContent=`入口 ${lane+1} · 弹跳中`;
  if(changed){
   plinkoAudio.launch();launchFx={time:performance.now(),x:PLINKO_LANES[lane]};
   canvas.setAttribute('aria-label',`弹珠从第 ${lane+1} 个入口释放，正在碰撞钉阵`);
   $('result').className='';document.querySelector('.arena').classList.remove('big-win');
   $('result').innerHTML='<span>下一次碰撞，会改变方向。</span><small>弹珠正在穿过钉阵…</small>';
  }
 }
 if(changed&&d.result){
  const r=d.result;plinkoAudio.land(r.multiplier);finishFx={time:performance.now(),slot:r.slot,big:r.multiplier>=3};
  document.querySelector('.arena').classList.toggle('big-win',r.multiplier>=3);
  $('status').textContent='已落袋 / '+r.multiplier+'×';
  canvas.setAttribute('aria-label',`弹珠落入第 ${r.slot+1} 个奖励槽，${r.multiplier} 倍`);
  $('result').className=r.amount>r.cost?'win':'';
  $('result').innerHTML=`<span>${r.multiplier}× · 到账 ${r.amount} 积分</span><small>本局净${r.amount>=r.cost?'得':'损失'} ${Math.abs(r.amount-r.cost)} 积分 · 奖励已自动入账</small>`;
  document.querySelector(`[data-slot="${r.slot}"]`).classList.add('hit');history.unshift(r);history=history.slice(0,6);
  $('history').innerHTML=history.map(h=>`<b title="到账 ${h.amount} 积分">${h.multiplier}×</b>`).join('');
 }
 select();
});
function glassOrb(x,y,r,violet,lit){
 ctx.save();const g=ctx.createRadialGradient(x-r*.32,y-r*.4,r*.05,x,y,r);
 g.addColorStop(0,'#f0fcff');g.addColorStop(.23,violet?'#d3c7ff':'#b9f4ff');g.addColorStop(.65,violet?'#9082ed':'#50c9f2');g.addColorStop(1,violet?'#5147a5':'#3262bb');
 ctx.fillStyle=g;if(lit){ctx.shadowColor='#67dfff';ctx.shadowBlur=12;}
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#d9edff99';ctx.lineWidth=.8;ctx.stroke();ctx.restore();
}
function impact(frame,now){
 const [time,x,y,peg,power=.4,nx=0,ny=-1]=frame;
 if(peg>=0)flashes.set(peg,{time:now,power});
 const burst={time:now,x:x-nx*PLINKO_BALL_RADIUS,y:y-ny*PLINKO_BALL_RADIUS,nx,ny,power,seed:peg+time*23};
 if(!reduced.matches){bursts.push(burst);if(bursts.length>16)bursts.shift();if(power>.6)impactShake=burst;}
 plinkoAudio.hit(peg,now,power);
}
function drawImpacts(now){
 bursts=bursts.filter(fx=>now-fx.time<460);
 if(reduced.matches)return;
 for(const fx of bursts){
  const age=(now-fx.time)/1000,t=age/.46,fade=1-t,p=fx.power,warm=p>.7;
  ctx.save();ctx.globalAlpha=fade;ctx.lineCap='round';
  const color=warm?'#ffcc75':'#7de6ff';ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=6+p*6;
  ctx.lineWidth=(1-t)*(2+p*2);ctx.beginPath();ctx.arc(fx.x,fx.y,7+t*(24+p*28),0,Math.PI*2);ctx.stroke();
  if(t<.28){
   ctx.globalAlpha=(1-t/.28)*(.5+p*.4);ctx.fillStyle='#f1fcff';ctx.beginPath();ctx.arc(fx.x,fx.y,5+p*7,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=fade;ctx.lineWidth=1.8;
   for(let k=0;k<3;k++){
    const a=fx.seed+k*2.094,dx=Math.cos(a),dy=Math.sin(a),r=17+p*22+t*30;
    ctx.beginPath();ctx.moveTo(fx.x+dx*8,fx.y+dy*8);ctx.lineTo(fx.x+dx*r*.58-dy*4,fx.y+dy*r*.58+dx*4);ctx.lineTo(fx.x+dx*r,fx.y+dy*r);ctx.stroke();
   }
  }
  ctx.shadowBlur=0;ctx.lineWidth=2+p;
  for(let k=0;k<10+Math.floor(p*8);k++){
   const a=fx.seed*.73+k*2.399,speed=75+p*140+(k%3)*24;
   const dx=Math.cos(a)*speed+fx.nx*80,dy=Math.sin(a)*speed+fx.ny*80;
   const x=fx.x+dx*age,y=fx.y+dy*age+age*age*180,length=.02+p*.015;
   ctx.strokeStyle=k%3===0?'#fff3cd':k%2?'#a99aff':color;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx*length*(1-t),y-dy*length*(1-t));ctx.stroke();
  }
  ctx.restore();
 }
}
function drawRails(){
 const rail=ctx.createLinearGradient(20,60,680,530);rail.addColorStop(0,'#a99aff');rail.addColorStop(.5,'#48cfff');rail.addColorStop(1,'#8275e8');
 ctx.save();ctx.strokeStyle=rail;ctx.lineWidth=7;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor='#627eff';ctx.shadowBlur=9;
 ctx.beginPath();ctx.moveTo(20,60);ctx.lineTo(20,512);ctx.quadraticCurveTo(20,530,38,530);ctx.moveTo(680,60);ctx.lineTo(680,512);ctx.quadraticCurveTo(680,530,662,530);ctx.stroke();
 ctx.shadowBlur=0;ctx.strokeStyle='#d8f4ff80';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
}
function drawLaunch(now){
 if(!launchFx||reduced.matches)return;const t=(now-launchFx.time)/500;if(t>=1)return;
 ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#a3ecff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(launchFx.x,PLINKO_DROP_Y,12+t*40,6+t*20,0,0,Math.PI*2);ctx.stroke();
 for(let k=0;k<5;k++){ctx.fillStyle='#7de2ff';ctx.fillRect(launchFx.x+(k-2)*10,PLINKO_DROP_Y-t*(35+Math.abs(k-2)*8),2,9);}ctx.restore();
}
function drawFinish(now){
 if(!finishFx||reduced.matches)return;const t=(now-finishFx.time)/950;if(t>=1)return;
 const x=(finishFx.slot+.5)*700/9;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=finishFx.big?'#fff0b3':'#ffbd45';ctx.lineWidth=3;
 ctx.beginPath();ctx.ellipse(x,543,20+t*95,8+t*28,0,0,Math.PI*2);ctx.stroke();
 if(finishFx.big){
  ctx.strokeStyle='#ffcf72';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,543,10+t*160,4+t*50,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=`rgba(255,192,70,${(1-t)*.12})`;ctx.fillRect(Math.max(0,x-36),80,72,468);
 }
 for(let i=0;i<(finishFx.big?42:18);i++){const a=i*2.4,spread=finishFx.big?120:70;ctx.fillStyle=i%2?'#ffbc45':'#fff0c5';ctx.fillRect(x+Math.cos(a)*t*spread,537-Math.sin(i*1.7)**2*t*130+t*t*100,3,5);}
 ctx.restore();
}
function draw(now){
 const ratio=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth,h=w*600/700;
 if(!w){requestAnimationFrame(draw);return;}
 if(canvas.width!==Math.round(w*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
 ctx.setTransform(canvas.width/700,0,0,canvas.height/600,0,0);ctx.clearRect(0,0,700,600);
 const time=(elapsed+(state==='dropping'?Math.max(0,now-clock):0))/1000;
 const sample=plinkoBallAt(path,time,lane,preview),ball=sample.ball;
 if(path&&!preview){
  for(let i=hitCursor+1;i<=sample.index;i++){
   const frame=path.frames[i];if(frame[3]!==-1&&state==='dropping'&&sample.time-frame[0]<.12)impact(frame,now);
  }
  hitCursor=sample.index;
 }
 ctx.save();
 if(impactShake&&!reduced.matches){const t=(now-impactShake.time)/130;if(t<1){const amount=(1-t)*impactShake.power*2.4;ctx.translate(Math.sin(t*31)*amount,Math.cos(t*26)*amount*.55);}}
 drawRails();drawLaunch(now);
 for(let i=0;i<PLINKO_PEGS.length;i++){
  const peg=PLINKO_PEGS[i],fx=flashes.get(i),age=fx?now-fx.time:1000,hit=age<300;
  const pulse=hit&&!reduced.matches?(1-age/300)*fx.power*2.8:0;
  glassOrb(peg.x,peg.y,PLINKO_PEG_RADIUS+pulse,i%4===0,hit);
  if(fx&&!hit)flashes.delete(i);
 }
 if(state==='dropping'&&!reduced.matches){
  trail.push({x:ball[1],y:ball[2],time:now});trail=trail.filter(p=>now-p.time<170);
  ctx.save();ctx.lineCap='round';ctx.shadowColor='#49cfff';ctx.shadowBlur=8;
  for(let i=1;i<trail.length;i++){const alpha=i/trail.length;ctx.strokeStyle=`rgba(103,224,255,${alpha*.6})`;ctx.lineWidth=2+alpha*7;ctx.beginPath();ctx.moveTo(trail[i-1].x,trail[i-1].y);ctx.lineTo(trail[i].x,trail[i].y);ctx.stroke();}ctx.restore();
 }
 drawImpacts(now);drawFinish(now);
 glassOrb(ball[1],ball[2],PLINKO_BALL_RADIUS,false,true);
 ctx.save();ctx.translate(ball[1],ball[2]);ctx.fillStyle='#fff0ae';ctx.beginPath();ctx.moveTo(1,-6);ctx.lineTo(-4,1);ctx.lineTo(0,1);ctx.lineTo(-1,6);ctx.lineTo(4,-1);ctx.lineTo(0,-1);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
 requestAnimationFrame(draw);
}
select();requestAnimationFrame(draw);send({type:'plinko-ready'});
