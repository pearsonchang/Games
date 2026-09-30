'use strict';
const $=id=>document.getElementById(id),embedded=window.parent!==window,audio=new DiceAudio();
let model=null,selected=0,busy=false,paused=false,lastCount=-1,lastPhase='',lastResult='',hoofTimer=0,localBalance=1000;
const localRound=embedded?null:new HorseRound({charge:n=>{if(localBalance<n)return false;localBalance=(Math.round(localBalance*100)-n*100)/100;return true},credit:n=>{localBalance=(Math.round(localBalance*100)+n*100)/100}});
const points=n=>Number(n||0).toLocaleString('zh-CN',{maximumFractionDigits:2});
const options=[],lanes=[],runners=[];
HORSES.forEach((h,i)=>{
 const css='--accent:'+h.color+';--hue:'+h.hue+'deg;--delay:-'+(i*.11)+'s';
 const lane=document.createElement('div');lane.className='lane';lane.style.cssText=css;lane.innerHTML='<span class="lane-label">0'+(i+1)+'<small>'+h.name+'</small></span><div class="runway"><div class="runner" aria-hidden="true"><span class="horse-aura"></span><span class="star-trail"><i></i><i></i><i></i><i></i></span><span class="hoof-dust"><i></i><i></i><i></i></span><span class="horse-sprite"></span><span class="finish-burst"><i></i><i></i><i></i><i></i><i></i></span><span class="finish-badge"></span></div></div>';$('lanes').append(lane);lanes.push(lane);runners.push(lane.querySelector('.runner'));
 const button=document.createElement('button');button.className='horse-option';button.style.cssText=css;button.setAttribute('aria-label','选择 '+(i+1)+' 号 '+h.name+'，夺冠概率 25%');button.innerHTML='<span class="number">0'+(i+1)+'</span><strong>'+h.name+'</strong><small>'+h.code+'</small><span class="mini-horse" aria-hidden="true"><span class="horse-sprite"></span></span>';button.onclick=()=>{if(busy||model?.state==='racing')return;selected=i;audio.tone(420+i*80,.07,0,'sine',.25);updateSelection()};$('horses').append(button);options.push(button);
});
$('prizes').innerHTML=HORSE_PRIZES.map((n,i)=>'<div class="prize"><span>第 '+(i+1)+' 名</span><b>'+n+'</b></div>').join('');
function stopSound(){clearInterval(hoofTimer);hoofTimer=0;audio.stop()}
function canSound(){return !paused&&!document.hidden&&audio.enabled}
function syncAudio(phase,count){
 if(!canSound()){stopSound();return}
 if(phase!==lastPhase){stopSound();if(phase==='race'){audio.tone(720,.22,0,'triangle',.28);hoofTimer=setInterval(()=>{audio.tone(125+Math.random()*25,.035,0,'triangle',.3);audio.tone(175,.025,.065,'triangle',.18)},210)}}
 if(phase==='count'&&count!==lastCount)audio.tone(440,.13,0,'sine',.35);
 lastCount=count;lastPhase=phase;
}
function updateSelection(){
 options.forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===selected));b.disabled=busy||model?.state==='racing';lanes[i].classList.toggle('selected',i===selected)});
 $('chosen-label').textContent='你的赛马 · 0'+(selected+1)+' '+HORSES[selected].name;
 $('selection-state').textContent=model?.state==='racing'?'已锁定':'4 选 1';
}
function send(type){
 if(busy)return;busy=true;updateSelection();updateButton();
 const d={type,selected,roundId:model?.roundId||''};
 if(embedded)window.parent.postMessage(d,location.origin);
 else{if(type==='horse-start'&&!localRound.start(selected,d.roundId))showError('积分不足或本局尚未结束。');localRound.tick();receive(localRound.snapshot(localBalance));}
}
function updateButton(){
 const active=model?.state==='racing';$('start').disabled=busy||!model||active||model.balance<50;
 $('start').textContent=busy?'准备中…':!model?'连接中…':active?(model.countdown>0?'即将开赛…':'比赛进行中…'):model.balance<50?'积分不足 · 需 50 积分':(model.state==='finished'?'再赛一局':'开始比赛')+' · 50 积分';
}
function showError(message){busy=false;$('message').textContent=message;updateSelection();updateButton()}
function renderPositions(){
 if(!model)return;model.positions.forEach((p,i)=>{const runner=runners[i],distance=Math.max(0,runner.parentElement.clientWidth-runner.clientWidth),rank=model.finished.indexOf(i);runner.style.transform='translateX('+(p*distance).toFixed(2)+'px)';runner.classList.toggle('arrived',rank!==-1);runner.querySelector('.finish-badge').textContent=rank===0?'★ 1':rank>0?String(rank+1):'';lanes[i].classList.toggle('winner',rank===0);});
}
function celebrate(){
 if(paused||document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 $('finish-flash').replaceChildren();for(let i=0;i<22;i++){const p=document.createElement('i');p.style.cssText='--spark:'+['#59d8f5','#b29aff','#ffc857','#ffb8a0'][i%4]+';--dx:'+(-20-Math.random()*250)+'px;--dy:'+(-150+Math.random()*300)+'px;animation-delay:'+(Math.random()*.12)+'s';p.addEventListener('animationend',()=>p.remove(),{once:true});$('finish-flash').append(p)}
}
function receive(next){
 if(next.type!=='horse-state'||!Array.isArray(next.positions)||next.positions.length!==4)return;
 const old=model;model=next;busy=false;const newRound=!old||old.roundId!==next.roundId;
 if(next.state==='racing'||newRound)selected=next.selected;
 if(newRound){if(next.state==='racing')window.scrollTo(0,0);$('result').dataset.view='';lastCount=-1;lastPhase='';lastResult='';$('finish-flash').replaceChildren();$('result').classList.remove('win');}
 const active=next.state==='racing',running=active&&next.countdown===0,phase=active?(running?'race':'count'):'idle';
 document.body.classList.toggle('sprint',running&&next.elapsed>12500);$('circuit').classList.toggle('is-racing',running&&!paused&&!document.hidden);
 $('circuit').classList.toggle('kickoff',running&&next.elapsed<3700&&!paused&&!document.hidden);
 $('circuit').classList.toggle('race-done',next.state==='finished');
 $('balance').textContent=points(next.balance);$('phase').textContent=active?(running?(next.elapsed>12500?'最后冲刺':'正在竞速'):'发车倒计时'):next.state==='finished'?'比赛结束':'等待开赛';
 $('countdown').hidden=phase!=='count';if(phase==='count'&&lastCount!==next.countdown){$('countdown').textContent=next.countdown;$('countdown').classList.remove('pop');void $('countdown').offsetWidth;$('countdown').classList.add('pop')}
 syncAudio(phase,next.countdown);
 $('race-caption').textContent=active?(running?'全速前进':'赛马已就位'):next.state==='finished'?'四马冲线 · 名次已确认':'选一匹，一起冲线';
 $('race-clock').textContent=(Math.max(0,next.elapsed-3000)/1000).toFixed(1).padStart(4,'0')+' s';$('progress').style.width=Math.min(100,Math.max(0,(next.elapsed-3000)/129))+'%';
 $('order-label').textContent=active?'即时排名':next.state==='finished'?'最终排名':'参赛阵容';
 const orderKey=next.order.join(',')+':'+selected+':'+next.state;if($('live-order').dataset.order!==orderKey){$('live-order').dataset.order=orderKey;$('live-order').innerHTML=next.order.map((id,i)=>'<li class="'+(id===selected?'picked':'')+'" style="--accent:'+HORSES[id].color+'"><b>'+(i+1)+'</b>'+HORSES[id].name+'</li>').join('')}
 const resultKey=phase+':'+selected;
 if(active&&$('result').dataset.view!==resultKey){$('result').dataset.view=resultKey;$('result').innerHTML='<div><span class="result-label">'+(running?'正在竞速':'即将发车')+'</span><strong>'+HORSES[selected].name+'，冲！</strong></div><p>'+(running?'名次以最终冲线顺序为准。':'四匹赛马，每匹夺冠概率 25%。')+'</p>';$('message').textContent='马匹已锁定，返回大厅也会继续结算。';}
 else if(next.result&&lastResult!==next.roundId){const r=next.result;lastResult=next.roundId;$('result').classList.toggle('win',r.won);$('result').innerHTML='<div><span class="result-label">'+HORSES[r.selected].name+' · 第 '+r.rank+' 名</span><strong class="amount">'+(r.amount?'已到账 '+points(r.amount):'本局奖励 0')+' 积分</strong></div><p>本局净收益 '+(r.amount>=50?'+':'')+points(r.amount-50)+' 积分<br>冠军 · '+HORSES[r.order[0]].name+'</p>';$('message').textContent='结算完成，奖励已计入模拟积分。';if(canSound())audio.result(r.won);celebrate();}
 const prizeNodes=$('prizes').children;for(let i=0;i<4;i++)prizeNodes[i].classList.toggle('hit',!!next.result&&next.result.rank===i+1);
 updateSelection();updateButton();renderPositions();
}
function visibility(){stopSound();lastPhase='';document.body.classList.toggle('motion-paused',paused||document.hidden);if(paused||document.hidden)$('finish-flash').replaceChildren();if(model)receive(model)}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent)return;const d=e.data;if(d?.type==='horse-state')receive(d);else if(d?.type==='horse-error')showError(d.message);else if(d?.type==='platform-pause'){paused=!!d.paused;visibility()}});
$('start').onclick=()=>{if(!busy&&model&&model.state!=='racing'&&model.balance>=50)send('horse-start')};
$('back').onclick=()=>{paused=true;stopSound();audio.leave();if(embedded)window.parent.postMessage({type:'game-return'},location.origin);else location.href='./'};
$('sound').onclick=()=>{const enabled=audio.toggle();$('sound').setAttribute('aria-pressed',enabled);$('sound').setAttribute('aria-label',enabled?'关闭音效':'开启音效');$('sound').textContent=enabled?'♪':'♩';lastPhase='';if(model)receive(model)};
document.addEventListener('pointerdown',()=>audio.unlock());document.addEventListener('keydown',()=>audio.unlock());document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',renderPositions);
setInterval(()=>{if(!embedded){localRound.tick();receive(localRound.snapshot(localBalance))}},100);
updateSelection();send('horse-ready');
