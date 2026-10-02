'use strict';
const $=id=>document.getElementById(id),root=document.querySelector('.rocket-game');let current={state:'idle',balance:0},connected=false,pending=false,returnAfter=false,lastState='',lastRound='';const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
let explosionTimer,impactAnimation;
function clearExplosion(){clearTimeout(explosionTimer);$('burst').replaceChildren();impactAnimation?.cancel();impactAnimation=null;}
function explode(){clearExplosion();if(reduce.matches||document.hidden)return;const burst=$('burst');for(const cls of ['blast-core','shock-ring','shock-ring second']){const part=document.createElement('i');part.className=cls;burst.append(part)}for(let i=0;i<24;i++){const part=document.createElement('i'),angle=i*Math.PI*2/24,range=45+(i*23)%85;part.className=i%3===0?'blast-fragment':'blast-spark';part.style.setProperty('--dx',Math.cos(angle)*range+'px');part.style.setProperty('--dy',Math.sin(angle)*range+26+'px');part.style.setProperty('--spin',(i%2?1:-1)*(130+i*21)+'deg');part.style.setProperty('--life',520+(i%6)*95+'ms');part.style.setProperty('--delay',(i%4)*14+'ms');burst.append(part)}for(let i=0;i<6;i++){const puff=document.createElement('i');puff.className='blast-smoke';puff.style.setProperty('--dx',((i*29)%90-45)+'px');puff.style.setProperty('--dy',(-25-i*9)+'px');puff.style.setProperty('--delay',(100+i*35)+'ms');burst.append(puff)}impactAnimation=$('space').animate?.([{translate:'0 0'},{translate:'-4px 2px'},{translate:'4px -2px'},{translate:'-2px 1px'},{translate:'0 0'}],{duration:280,easing:'ease-out'});explosionTimer=setTimeout(clearExplosion,1600);}
function send(type){if(type==='game-return'){rocketAudio.leave();setPaused(true);}if(window.parent!==window)window.parent.postMessage({type},location.origin)}
let paused=false,rewardTimer,celebrationAnimations=[];
function clearRewards(){clearTimeout(rewardTimer);for(const animation of celebrationAnimations)animation.cancel();celebrationAnimations=[];$('reward-particles').replaceChildren();}
function celebrate(){
 clearRewards();if(paused||reduce.matches||document.hidden)return;
 const ship=$('rocket').getBoundingClientRect(),wallet=$('balance').getBoundingClientRect();
 const x=ship.left+ship.width/2,y=ship.top+ship.height/2,tx=wallet.left+wallet.width/2,ty=wallet.top+wallet.height/2;
 for(let i=0;i<9;i++){
  const dot=document.createElement('i');dot.className='reward-dot';dot.style.left=x+'px';dot.style.top=y+'px';$('reward-particles').append(dot);
  const animation=dot.animate?.([{transform:'translate(0,0) scale(.5)',opacity:0},{transform:`translate(${(i-4)*13}px,${-24-i%3*14}px) scale(1)`,opacity:1,offset:.25},{transform:`translate(${tx-x}px,${ty-y}px) scale(.45)`,opacity:0}],{duration:850,delay:i*45,easing:'ease-in',fill:'both'});
  if(animation)celebrationAnimations.push(animation);
 }
 const cat=$('port-cat').animate?.([{translate:'0 0'},{translate:'0 -9px',offset:.35},{translate:'0 0',offset:.65},{translate:'0 -3px',offset:.8},{translate:'0 0'}],{duration:600,easing:'ease-out'});
 if(cat)celebrationAnimations.push(cat);
 rewardTimer=setTimeout(clearRewards,1400);
}
function setPaused(value){
 paused=!!value;root.classList.toggle('motion-paused',paused||document.hidden);rocketScenery.setPaused(paused||document.hidden);
 if(paused||document.hidden){rocketAudio.stop();clearExplosion();clearRewards();}
}
function render(d){
 const changed=lastState!==d.state||lastRound!==d.roundId;
 const justCrashed=d.state==='crashed'&&changed,justCollected=d.state==='collected'&&changed;
 if(d.roundId!==lastRound){clearExplosion();clearRewards();}
 current=d;connected=true;pending=false;
 const thrust=d.thrust||{power:0,phase:'off'},flying=d.state==='flying',crashed=d.state==='crashed',collected=d.state==='collected';
 const presented=!paused&&!document.hidden;
 rocketScenery.setFlight(flying,d.elapsed);
 root.className='rocket-game '+d.state+' thrust-'+thrust.phase+(!presented?' motion-paused':'');
 root.style.setProperty('--thrust',String(Math.max(0,Math.min(1,thrust.power))));
 $('balance').textContent=d.balance.toLocaleString();
 $('multiplier').innerHTML=d.multiplier.toFixed(2)+'<span>×</span>';
 $('payout-caption').textContent=collected?'本局已到账':crashed?'本局奖励':'当前可收取';
 $('payout').textContent=d.state==='idle'?'—':d.payout+' 积分';
 $('status').textContent=flying?(thrust.phase==='ignition'?'引擎点火 · 推力增强':thrust.phase==='weakening'?'推力衰减 · 注意收取':'稳定飞行 · 随时收取'):crashed?'火箭坠毁':collected?'已安全收取':'准备发射';
 $('flight-time').textContent=d.state==='idle'?'飞得越久，收取得分越高':'本次飞行 '+d.elapsed.toFixed(1)+' 秒';
 $('flight-label').textContent=flying?'飞行中':collected?'已收取':crashed?'飞行结束':'待命中';
 $('port-caption').textContent=flying?'离港飞行 · 奖励尚未入账':collected?'奖励已回航 · 本局结束':crashed?'航站待命 · 准备再次出发':'航站就绪 · 等待点火';
 $('guide-copy').textContent=flying?(thrust.phase==='weakening'?'注意推力，及时收取':'记得带奖励回来'):collected?'收到啦，欢迎回航！':crashed?'航站等你再出发':'准备好就出发吧';
 $('action').disabled=!flying&&d.balance<d.cost;
 $('action').textContent=flying?'立即收取 · '+d.payout+' 积分':d.balance<d.cost?'积分不足 · 需要 '+d.cost+' 积分':d.state==='idle'?'发射火箭 · '+d.cost+' 积分':'再飞一次 · '+d.cost+' 积分';
 if(flying&&presented)rocketAudio.enginePower(thrust.power);else rocketAudio.stopEngine();
 if(changed){
  if(presented){if(flying)rocketAudio.ignition();else if(crashed)rocketAudio.crash();else if(collected)rocketAudio.collect();}
  const net=d.payout-d.cost;
  $('message').textContent=flying?'奖励还未入账，坠毁前点击「立即收取」。':crashed?'本局未收取奖励归零，已消耗的 '+d.cost+' 积分不退还。':collected?'已到账 '+d.payout+' 积分，本局净得 '+net+' 积分。':'每次发射消耗 '+d.cost+' 积分；坠毁前主动收取。';
  lastState=d.state;lastRound=d.roundId;
 }
 root.style.setProperty('--flight-energy',flying?String(Math.min(1,d.elapsed/1.2)):'0');
 root.style.setProperty('--danger',thrust.phase==='weakening'?String(1-thrust.power):'0');
 const x=reduce.matches?55:27+39*(1-Math.exp(-d.elapsed/1.8)),y=reduce.matches?65:70-12*(1-Math.exp(-d.elapsed/2.2));
 for(const id of ['rocket','burst','recovery']){$(id).style.left=x+'%';$(id).style.top=y+'%';}
 $('route').setAttribute('d',`M 170 480 Q 420 440 ${x*10} ${y*6}`);
 if(justCrashed&&presented)explode();if(justCollected&&presented)celebrate();
 if(returnAfter&&!flying){returnAfter=false;send('game-return');}
}
window.addEventListener('message',e=>{
 if(e.source!==window.parent||e.origin!==location.origin||!e.data)return;
 if(e.data.type==='platform-pause'){setPaused(e.data.paused);return;}
 if(e.data.type==='rocket-state')render(e.data);
 if(e.data.type==='rocket-error'){pending=false;$('message').textContent=e.data.message;$('action').disabled=current.state!=='flying'&&current.balance<(current.cost||50);}
});
$('action').onclick=()=>{if(!connected||pending)return;rocketAudio.unlock();pending=true;$('action').disabled=true;send(current.state==='flying'?'rocket-collect':'rocket-launch')};
function modal(title,text,actions){$('dialog-title').textContent=title;$('dialog-text').textContent=text;$('dialog-actions').replaceChildren();for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('dialog').close();fn()};$('dialog-actions').append(b)}$('dialog').showModal()}
$('rocket-sound').onclick=()=>{rocketAudio.unlock();const on=rocketAudio.toggle();$('rocket-sound').setAttribute('aria-pressed',on);$('rocket-sound').setAttribute('aria-label',on?'关闭音效':'开启音效');$('rocket-sound').textContent=on?'♪':'♩'};document.addEventListener('visibilitychange',()=>setPaused(paused));reduce.addEventListener('change',()=>{clearExplosion();clearRewards();});
$('rules').onclick=()=>modal('小火箭怎么玩？','每局消耗 50 模拟积分，起飞后倍率持续增长。\n随时点击收取，到账积分 = 50 × 当前倍率（向下取整，含本局投入）。\n火箭会在随机时刻坠毁；如果尚未收取，本局奖励为 0，发射积分不退还。\n起飞后喷焰增强，接近坠毁时会逐渐减弱；可观察喷焰判断收取时机。\n切出页面或打开说明不会暂停飞行。',[['知道了',()=>{}]]);
$('back').onclick=()=>{if(current.state==='flying')modal('飞行仍在继续','返回大厅不会暂停火箭。你可以先收取当前积分，再返回。',[['收取并返回',()=>{returnAfter=true;send('rocket-collect')}],['继续看火箭',()=>{}],['直接返回大厅',()=>send('game-return')]]);else send('game-return')};
for(let i=0;i<35;i++){const s=document.createElement('i');s.className='star';s.style.left=((i*37)%100)+'%';s.style.top=((i*61)%100)+'%';s.style.opacity=.15+(i%4)*.12;s.style.setProperty('--star-delay',(-i*.19)+'s');s.style.setProperty('--star-duration',(1.5+i%4*.55)+'s');$('stars').append(s)}
for(let i=0;i<18;i++){const line=document.createElement('i');line.className='speed-line';line.style.top=(8+(i*47)%85)+'%';line.style.left=(30+(i*31)%90)+'%';line.style.setProperty('--line-delay',(-i*.137)+'s');line.style.setProperty('--line-duration',(.55+(i%4)*.16)+'s');line.style.setProperty('--line-width',(26+(i%5)*16)+'px');$('speed-lines').append(line)}
if(window.parent===window){$('message').textContent='请从 PLAYROOM 大厅打开小火箭。';$('action').textContent='返回游戏大厅';$('action').disabled=false;$('action').onclick=()=>location.href='./'}else send('rocket-ready');
