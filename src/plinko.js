'use strict';
const $=id=>document.getElementById(id),send=d=>parent.postMessage(d,location.origin);
const canvas=$('board'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let lane=2,state='idle',balance=0,connected=false,pending=false,roundId='',path=null;
let clock=0,elapsed=0,hitCursor=0,preview=true,history=[],trail=[],flashes=new Map(),bursts=[];
let finishFx=null,launchFx=null,impactShake=null,buddyMotion=null,lastBuddyHit=0;
function moveBuddy(kind='bounce'){
 const buddy=$('volt-buddy');if(reduced.matches||document.hidden||!buddy?.animate)return;
 buddyMotion?.cancel();
 const frames=kind==='catch'?[{transform:'translateY(0)'},{transform:'translateY(-11px) rotate(-9deg)',offset:.32},{transform:'translateY(0)',offset:.64},{transform:'translateY(-4px) rotate(4deg)',offset:.8},{transform:'translateY(0)'}]:[{transform:'translateY(0)'},{transform:'translateY(-4px) rotate(-5deg)',offset:.45},{transform:'translateY(0)'}];
 buddyMotion=buddy.animate(frames,{duration:kind==='catch'?640:280,easing:'cubic-bezier(.2,.7,.2,1)'});
}
let charging=false,chargeTimer=0,chargeStarted=0,energyLinks=[],echoes=new Map(),lastContact=null;
const neighbors=PLINKO_PEGS.map(peg=>PLINKO_PEGS.map((other,i)=>({i,d:Math.hypot(other.x-peg.x,other.y-peg.y)})).filter(n=>n.d>0&&n.d<59).slice(0,4));
function clearEnergy(){buddyMotion?.cancel();buddyMotion=null;document.body.classList.remove('reward-arrived');energyLinks=[];echoes.clear();lastContact=null;$('reward-pop').className='reward-pop';}
function cancelCharge(){clearTimeout(chargeTimer);chargeTimer=0;if(charging)$('status').textContent=`入口 ${lane+1} · 准备释放`;charging=false;document.body.classList.remove('charging');}

function select(){
 for(const el of document.querySelectorAll('[data-lane]')){el.setAttribute('aria-pressed',Number(el.dataset.lane)===lane);el.disabled=state==='dropping'||pending||charging;}
 const busy=state==='dropping'||pending||charging;
 $('launch').disabled=!connected||busy||balance<50;
 $('launch-label').textContent=!connected?'连接中…':charging?'能量蓄积中…':busy?'弹珠飞行中…':balance<50?'积分不足':'释放弹珠';
 document.body.classList.toggle('in-flight',state==='dropping');
 $('message').textContent=balance<50&&!busy?'积分不足 50，可返回大厅查看模拟积分。':'落袋后自动到账，奖励包含本局投入。';
}
for(const id of ['lanes']){
 $(id).innerHTML=PLINKO_LANES.map((x,i)=>`<button data-lane="${i}" ${id==='lanes'?`style="left:${x/7}%"`:''} aria-pressed="${i===lane}" aria-label="落球入口 ${i+1}">${i+1}</button>`).join('');
 $(id).onclick=e=>{
  const button=e.target.closest('[data-lane]');if(!button||state==='dropping'||pending||charging)return;
  lane=Number(button.dataset.lane);preview=true;trail=[];bursts=[];flashes.clear();finishFx=null;launchFx=null;impactShake=null;clearEnergy();
  $('status').textContent=`入口 ${lane+1} · 准备释放`;
  canvas.setAttribute('aria-label',`弹珠位于第 ${lane+1} 个入口，等待释放`);
  document.querySelectorAll('.slot').forEach(el=>el.classList.remove('hit'));
  document.querySelector('.arena').classList.remove('big-win');
  $('result').className='';$('result').innerHTML='<span>能量已就绪</span><small>选择一个发射口，开启下一次弹跳。</small>';select();
 };
}
$('slots').innerHTML=PLINKO_MULT.map((m,i)=>`<div class="slot ${m>=3?'high':m>=1?'medium':''}" data-slot="${i}">${m}×</div>`).join('');
$('probability-chart').innerHTML=PLINKO_PROBS.map((p,i)=>`<div class="probability-column" aria-label="第 ${i+1} 槽，${PLINKO_MULT[i]} 倍，概率 ${(p*100).toFixed(2)}%"><span>${(p*100).toFixed(1)}%</span><i style="height:${p/PLINKO_PROBS[4]*64}px" aria-hidden="true"></i><small>${PLINKO_MULT[i]}×</small></div>`).join('');
$('launch').onclick=()=>{
 if(!connected||pending||charging||state==='dropping'||balance<50)return;
 plinkoAudio.unlock();plinkoAudio.charge();charging=true;chargeStarted=performance.now();
 preview=true;trail=[];finishFx=null;flashes.clear();bursts=[];clearEnergy();
 document.querySelectorAll('.slot').forEach(el=>el.classList.remove('hit'));
 document.querySelector('.arena').classList.remove('big-win');
 $('result').className='';$('result').innerHTML='<span>能量已就绪</span><small>选择一个发射口，开启下一次弹跳。</small>';
 document.body.classList.add('charging');$('status').textContent=`入口 ${lane+1} · 蓄能中`;select();
 // Charge is presentation only: the parent remains the sole owner of debit and settlement.
 chargeTimer=setTimeout(()=>{
  cancelCharge();
  if(!connected||state==='dropping'||balance<50){select();return;}
  pending=true;select();send({type:'plinko-drop',lane,roundId});
 },220);
};
$('back').onclick=()=>{cancelCharge();select();plinkoAudio.leave();send({type:'game-return'});};
$('volt-sound').onclick=()=>{plinkoAudio.unlock();const on=plinkoAudio.toggle();$('volt-sound').setAttribute('aria-pressed',on);$('volt-sound').setAttribute('aria-label',on?'关闭音效':'开启音效');$('volt-sound').textContent=on?'♪':'♩';};
document.addEventListener('visibilitychange',()=>{if(document.hidden){buddyMotion?.cancel();plinkoAudio.stop();if(charging){cancelCharge();$('status').textContent=`入口 ${lane+1} · 准备释放`;select();}}});
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==parent||!e.data)return;
 const d=e.data;
 if(d.type==='platform-offline'){connected=false;cancelCharge();select();$('message').textContent=d.message||'连接中断。';return;}
 if(d.type==='plinko-error'){cancelCharge();pending=false;select();$('message').textContent=d.message;return;}
 if(d.type!=='plinko-state')return;
 connected=true;if(d.state==='dropping')pending=false;balance=d.balance;$('balance').textContent=balance.toLocaleString();
 if(Object.hasOwn(d,'path'))path=d.path;
 elapsed=d.elapsed;clock=performance.now();
 const newRound=d.roundId!==roundId,changed=d.state!==state||newRound;
 if(newRound){
  roundId=d.roundId;hitCursor=0;preview=false;trail=[];flashes.clear();bursts=[];finishFx=null;impactShake=null;clearEnergy();
  document.querySelectorAll('.slot').forEach(el=>el.classList.remove('hit'));
 }
 state=d.state;
 if(state==='dropping'){
  cancelCharge();lane=d.lane;preview=false;$('status').textContent=`入口 ${lane+1} · 弹跳中`;
  if(changed){
   plinkoAudio.launch();launchFx={time:performance.now(),x:PLINKO_LANES[lane]};
   canvas.setAttribute('aria-label',`弹珠从第 ${lane+1} 个入口释放，正在碰撞钉阵`);
   $('result').className='';document.querySelector('.arena').classList.remove('big-win');
   $('result').innerHTML='<span>能量穿行中</span><small>穿过钉阵，等待落袋。</small>';
  }
 }
 if(changed&&d.result){
  const r=d.result;moveBuddy('catch');document.body.classList.add('reward-arrived');plinkoAudio.land(r.multiplier);finishFx={time:performance.now(),slot:r.slot,big:r.multiplier>=3};
  const pop=$('reward-pop');pop.className=`reward-pop${r.multiplier>=3?' big':''}`;pop.textContent=`+${r.amount} 积分`;
  const boardWidth=canvas.clientWidth||700,edge=pop.offsetWidth/2+10;
  pop.style.left=`${Math.max(edge,Math.min(boardWidth-edge,(r.slot+.5)*boardWidth/9))}px`;void pop.offsetWidth;pop.classList.add('show');
  document.querySelector('.arena').classList.toggle('big-win',r.multiplier>=3);
  $('status').textContent='已落袋 / '+r.multiplier+'×';
  canvas.setAttribute('aria-label',`弹珠落入第 ${r.slot+1} 个奖励槽，${r.multiplier} 倍`);
  $('result').className=r.amount>r.cost?'win':'';
  $('result').innerHTML=`<span>${r.multiplier}× · 到账 ${r.amount} 积分</span><small>本局净${r.amount>=r.cost?'得':'损失'} ${Math.abs(r.amount-r.cost)} 积分 · 奖励已自动入账</small>`;
  document.querySelector(`[data-slot="${r.slot}"]`).classList.add('hit');history.unshift(r);history=history.slice(0,6);
  $('history').innerHTML=history.map(h=>`<b class="${h.multiplier>=3?'reward-high':''}" title="到账 ${h.amount} 积分">${h.multiplier}×</b>`).join('');
 }
 select();
});
function impact(frame,now){
 const [time,x,y,peg,power=.4,nx=0,ny=-1]=frame;
 if(peg>=0){
  flashes.set(peg,{time:now,power});
  if(!reduced.matches){
   const node=PLINKO_PEGS[peg];
   if(lastContact&&now-lastContact.time<800){energyLinks.push({x:lastContact.x,y:lastContact.y,x2:node.x,y2:node.y,time:now,power});if(energyLinks.length>8)energyLinks.shift();}
   lastContact={x:node.x,y:node.y,time:now};
   if(power>.55)for(const n of neighbors[peg]){echoes.set(n.i,{time:now,power:power*.5});energyLinks.push({x:node.x,y:node.y,x2:PLINKO_PEGS[n.i].x,y2:PLINKO_PEGS[n.i].y,time:now,power:power*.32,echo:true});}
  }
 }
 const burst={time:now,x:x-nx*PLINKO_BALL_RADIUS,y:y-ny*PLINKO_BALL_RADIUS,nx,ny,power,seed:peg+time*23};
 if(!reduced.matches){bursts.push(burst);if(bursts.length>16)bursts.shift();if(power>.6)impactShake=burst;}
 if(power>.55&&now-lastBuddyHit>240){moveBuddy();lastBuddyHit=now;}
 plinkoAudio.hit(peg,now,power);
}
function drawImpacts(now){
 bursts=bursts.filter(fx=>now-fx.time<460);
 if(reduced.matches)return;
 for(const fx of bursts){
  const age=(now-fx.time)/1000,t=age/.46,fade=1-t,p=fx.power,warm=p>.7;
  ctx.save();ctx.globalAlpha=fade;ctx.lineCap='round';
  const color=warm?'#ffd784':'#71e4ef';ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=3+p*4;
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
  for(let k=0;k<7+Math.floor(p*5);k++){
   const a=fx.seed*.73+k*2.399,speed=75+p*140+(k%3)*24;
   const dx=Math.cos(a)*speed+fx.nx*80,dy=Math.sin(a)*speed+fx.ny*80;
   const x=fx.x+dx*age,y=fx.y+dy*age+age*age*180,length=.02+p*.015;
   ctx.strokeStyle=k%3===0?'#eefaff':k%2?'#b39afa':color;
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-dx*length*(1-t),y-dy*length*(1-t));ctx.stroke();
  }
  ctx.restore();
 }
}
function drawChamber(now){
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 // Quiet inlaid circuits keep the playfield recessed and leave the ball in front.
 ctx.lineWidth=1;ctx.strokeStyle='#527aa91a';
 for(let side=0;side<2;side++){
  ctx.save();if(side){ctx.translate(700,0);ctx.scale(-1,1);}
  for(let i=0;i<5;i++){
   const y=116+i*82;ctx.beginPath();ctx.moveTo(37,y);ctx.lineTo(64,y);ctx.lineTo(81,y+17);ctx.lineTo(81,y+42);ctx.stroke();
   ctx.fillStyle='#789bc332';ctx.fillRect(79,y+41,4,4);
  }
  ctx.strokeStyle='#263b5a';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(21,57);ctx.lineTo(21,491);ctx.lineTo(36,518);ctx.lineTo(36,528);ctx.stroke();
  ctx.strokeStyle='#040b17';ctx.lineWidth=7;ctx.stroke();
  const rail=ctx.createLinearGradient(0,57,0,528);rail.addColorStop(0,'#8c7eda99');rail.addColorStop(.45,'#4dabc17d');rail.addColorStop(1,'#7485d9b3');
  ctx.strokeStyle=rail;ctx.lineWidth=2;ctx.stroke();
  for(let i=0;i<6;i++){ctx.fillStyle=i%2?'#8395df40':'#5bcae047';ctx.fillRect(17,81+i*69,8,12);}
  if(!reduced.matches){
   const progress=(now%4600)/4600,y=64+progress*425;ctx.fillStyle='#a1edff';ctx.shadowColor='#6bd7ff';ctx.shadowBlur=8;ctx.globalAlpha=.35;ctx.fillRect(19,y,4,19);ctx.globalAlpha=1;ctx.shadowBlur=0;
  }
  ctx.restore();
 }
 ctx.strokeStyle='#688aaf2b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(49,533);ctx.lineTo(651,533);ctx.stroke();
 for(let i=0;i<9;i++){const x=(i+.5)*700/9;ctx.fillStyle=i===0||i===8?'#ffc85742':'#87acda21';ctx.fillRect(x-10,535,20,2);}
 ctx.restore();
}
function drawPorts(now){
 const cycle=reduced.matches?0:(Math.sin(now/850)+1)/2;
 for(let i=0;i<PLINKO_LANES.length;i++){
  const x=PLINKO_LANES[i],active=i===lane,waiting=active&&(preview||charging);
  ctx.save();ctx.strokeStyle=active?'#77dfffaa':'#6584ad42';ctx.lineWidth=active?1.5:1;
  ctx.fillStyle=active?'#233d5966':'#0a192c';ctx.beginPath();ctx.ellipse(x,PLINKO_DROP_Y+3,18,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle=active?'#c4f4ff':'#6687b380';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-19,PLINKO_DROP_Y-4);ctx.lineTo(x-19,PLINKO_DROP_Y+4);ctx.moveTo(x+19,PLINKO_DROP_Y-4);ctx.lineTo(x+19,PLINKO_DROP_Y+4);ctx.stroke();
  if(waiting){
   ctx.globalAlpha=.12+cycle*.1;ctx.fillStyle='#68d8ff';ctx.beginPath();ctx.ellipse(x,PLINKO_DROP_Y+4,24+cycle*3,10+cycle*2,0,0,Math.PI*2);ctx.fill();
  }
  if(active&&charging&&!reduced.matches){
   const t=Math.min(1,(now-chargeStarted)/220);ctx.globalAlpha=.3+t*.7;ctx.strokeStyle='#bbf2ff';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc(x,PLINKO_DROP_Y,30-t*17,0,Math.PI*2);ctx.stroke();
   for(let j=0;j<6;j++){const a=j*Math.PI/3+t;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(39-t*21),PLINKO_DROP_Y+Math.sin(a)*(39-t*21));ctx.lineTo(x+Math.cos(a)*(31-t*21),PLINKO_DROP_Y+Math.sin(a)*(31-t*21));ctx.stroke();}
  }
  ctx.restore();
 }
}
function drawEnergy(now){
 if(reduced.matches)return;
 energyLinks=energyLinks.filter(f=>now-f.time<(f.echo?260:560));
 ctx.save();ctx.lineCap='round';
 for(const link of energyLinks){
  const t=(now-link.time)/(link.echo?260:560);ctx.globalAlpha=(1-t)*(link.echo?.45:.5);ctx.strokeStyle=link.echo?'#a391ef':'#7ad9ef';ctx.lineWidth=link.echo?1:1.5;ctx.beginPath();ctx.moveTo(link.x,link.y);ctx.lineTo(link.x2,link.y2);ctx.stroke();
  if(!link.echo&&t<.45){ctx.fillStyle='#b4efff';ctx.beginPath();ctx.arc(link.x+(link.x2-link.x)*t/.45,link.y+(link.y2-link.y)*t/.45,2,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();
}
function drawPeg(peg,i,now){
 const fx=flashes.get(i),echo=echoes.get(i),age=fx?now-fx.time:1000,echoAge=echo?now-echo.time:1000;
 const hit=age<330,echoOn=echoAge<220,violet=Math.round((peg.y-92)/47)%3===2;
 const light=hit?1-age/330:echoOn?(1-echoAge/220)*.5:0;
 const bounce=hit&&!reduced.matches?Math.sin(Math.min(1,age/330)*Math.PI)*fx.power*2.4:0;
 const r=PLINKO_PEG_RADIUS;ctx.save();ctx.translate(peg.x,peg.y);
 // The footprint is unchanged; only the inset cap compresses on contact.
 ctx.fillStyle='#050f25';ctx.beginPath();ctx.arc(0,2,r+1.5,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=violet?'#7062b88c':'#3287a18c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r+2,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle=hit?(fx.power>.7?'#ffe3a3':'#d1fcff'):violet?'#9984de':'#64c2d0';
 ctx.beginPath();ctx.ellipse(0,bounce,r,r-bounce*.45,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=hit?'#fff4d2':violet?'#d1c0ff':'#a3e8ed';ctx.lineWidth=1;ctx.stroke();
 ctx.fillStyle=hit?'#fff8de':violet?'#6650a5':'#287d9e';ctx.beginPath();ctx.arc(0,bounce,2,0,Math.PI*2);ctx.fill();
 if(light>0&&!reduced.matches){ctx.globalAlpha=light*.7;ctx.strokeStyle=echoOn?'#b79cff':fx?.power>.7?'#ffd37a':'#7ae5f1';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,0,r+4+(1-light)*9,0,Math.PI*2);ctx.stroke();}
 ctx.restore();if(fx&&!hit)flashes.delete(i);if(echo&&!echoOn)echoes.delete(i);
}
function drawBall(ball,now){
 const x=ball[1],y=ball[2],r=PLINKO_BALL_RADIUS;ctx.save();
 // A warm, matte core stays distinct from the cool pegs, without changing collision size.
 ctx.fillStyle='#ffc85715';ctx.beginPath();ctx.arc(x,y,r+7,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#ffd16f';ctx.strokeStyle='#fff0b5';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.translate(x,y);ctx.fillStyle='#a36420';ctx.beginPath();ctx.moveTo(1,-5);ctx.lineTo(-3.5,1);ctx.lineTo(0,1);ctx.lineTo(-1,5);ctx.lineTo(3.5,-1);ctx.lineTo(0,-1);ctx.closePath();ctx.fill();
 if(!reduced.matches){ctx.rotate(now/850);ctx.globalAlpha=.65;ctx.strokeStyle='#ffe6a1';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r+4,0,Math.PI*.65);ctx.stroke();}
 ctx.restore();
}
function drawLaunch(now){
 if(!launchFx||reduced.matches)return;const t=(now-launchFx.time)/500;if(t>=1)return;
 ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#a3ecff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(launchFx.x,PLINKO_DROP_Y,12+t*40,6+t*20,0,0,Math.PI*2);ctx.stroke();
 for(let k=0;k<5;k++){ctx.fillStyle='#7de2ff';ctx.fillRect(launchFx.x+(k-2)*10,PLINKO_DROP_Y-t*(35+Math.abs(k-2)*8),2,9);}ctx.restore();
}
function drawFinish(now){
 if(!finishFx||reduced.matches)return;const duration=finishFx.big?1400:700,t=(now-finishFx.time)/duration;if(t>=1)return;
 const x=(finishFx.slot+.5)*700/9,big=finishFx.big,color=big?'#ffda89':'#98e8ff';
 ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=color;ctx.lineWidth=2.5;
 ctx.beginPath();ctx.ellipse(x,543,17+t*(big?125:65),5+t*22,0,0,Math.PI*2);ctx.stroke();
 if(big){
  const beam=ctx.createLinearGradient(0,220,0,548);beam.addColorStop(0,'#ffc85700');beam.addColorStop(.65,'#ffd78a20');beam.addColorStop(1,'#ffe3a587');
  ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(x-18,548);ctx.lineTo(x-45,220);ctx.lineTo(x+45,220);ctx.lineTo(x+18,548);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#ffecb5';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,543,12+t*180,4+t*46,0,0,Math.PI*2);ctx.stroke();
 }
 const count=big?32:10;
 for(let i=0;i<count;i++){
  const a=i*2.4,spread=big?125:55,px=x+Math.cos(a)*t*spread,py=537-Math.sin(i*1.7)**2*t*(big?220:90)+t*t*100;
  ctx.fillStyle=i%3===0?'#f4fbff':color;ctx.save();ctx.translate(px,py);ctx.rotate(a+t*3);ctx.fillRect(-1,-3,i%3===0?3:2,6*(1-t)+1);ctx.restore();
 }
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
 drawChamber(now);drawPorts(now);drawLaunch(now);drawEnergy(now);
 for(let i=0;i<PLINKO_PEGS.length;i++)drawPeg(PLINKO_PEGS[i],i,now);
 if(state==='dropping'&&!reduced.matches){
  trail.push({x:ball[1],y:ball[2],time:now});trail=trail.filter(p=>now-p.time<210);
  ctx.save();ctx.lineCap='round';ctx.shadowColor='#ffd176';ctx.shadowBlur=3;
  for(let i=1;i<trail.length;i++){const alpha=i/trail.length;ctx.strokeStyle=`rgba(255,212,126,${alpha*.65})`;ctx.lineWidth=1.5+alpha*5;ctx.beginPath();ctx.moveTo(trail[i-1].x,trail[i-1].y);ctx.lineTo(trail[i].x,trail[i].y);ctx.stroke();}ctx.restore();
 }
 drawImpacts(now);drawFinish(now);
 drawBall(ball,now);ctx.restore();
 requestAnimationFrame(draw);
}
select();requestAnimationFrame(draw);send({type:'plinko-ready'});
