'use strict';
const $=id=>document.getElementById(id),send=d=>parent.postMessage(d,location.origin);
let mode='size',target='small',state='idle',balance=0,connected=false,pending=false,lastId='',history=[],settling=false,platformPaused=false;
const pipPositions={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
function pipFace(n){return '<span class="pip-face" aria-hidden="true">'+pipPositions[n].map(p=>'<i style="grid-area:'+Math.ceil(p/3)+' / '+((p-1)%3+1)+'"></i>').join('')+'</span>'}
function targetLabel(m,t){return m==='size'?(t==='small'?'小 · 4–10 点':'大 · 11–17 点'):m==='sum'?'总点数 '+t+' 点':'任意三同号'}
function makeIcons(){
 document.querySelector('[data-mode-art="size"]').innerHTML=pipFace(1)+pipFace(6);
 document.querySelector('[data-mode-art="sum"]').innerHTML='<span class="target-icon">12</span>';
 document.querySelector('[data-mode-art="triple"]').innerHTML=pipFace(3)+pipFace(3)+pipFace(3);
 $('floating-faces').innerHTML=[4,2,5,6].map((v,i)=>'<span class="floating-face floating-'+i+'">'+pipFace(v)+'</span>').join('');
}
const diceVisual=new DiceVisual($('dice-row')),diceAudio=new DiceAudio();
diceVisual.onLand=i=>{if(!document.hidden&&!platformPaused)diceAudio.land(i)};
$('sound').onclick=()=>{diceAudio.unlock();const on=diceAudio.toggle();$('sound').textContent='音效 '+(on?'开':'关');$('sound').setAttribute('aria-pressed',on);$('sound').setAttribute('aria-label',on?'关闭音效':'开启音效')};
function updateMotion(){const paused=document.hidden||platformPaused;document.body.classList.toggle('motion-paused',paused);if(paused)diceAudio.stop()}
document.addEventListener('visibilitychange',updateMotion);
function options(){
 document.body.dataset.mode=mode;
 document.querySelectorAll('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('options').innerHTML=mode==='size'?`<div class="size-options" role="group" aria-label="选择大小"><button data-size="small" aria-pressed="${target==='small'}">小<small>4–10 点</small></button><button data-size="big" aria-pressed="${target==='big'}">大<small>11–17 点</small></button></div>`:mode==='sum'?`<div class="sum-label">选择目标总点数</div><div class="sum-options" role="group" aria-label="选择目标总点数">${Array.from({length:16},(_,i)=>`<button data-sum="${i+3}" aria-label="总点数 ${i+3} 点" aria-pressed="${target===i+3}">${i+3}</button>`).join('')}</div>`:`<div class="triple-preview"><span aria-hidden="true">${pipFace(3)+pipFace(3)+pipFace(3)}</span><span>任意相同顶面</span><b>1–6 均可</b></div>`;
 $('rule').textContent=mode==='size'?'顶面点数之和落在所选范围即命中，三同号不计大小。':mode==='sum'?'顶面点数之和等于目标即命中，包含三同号。':'三颗骰子顶面相同即命中，例如 2 + 2 + 2。';
 $('target-label').textContent=targetLabel(mode,target);$('action-target').textContent=targetLabel(mode,target);
 $('prize').textContent=dicePrize(mode,target).toLocaleString();$('net').textContent='+'+(dicePrize(mode,target)-50).toLocaleString();controls();
}
function controls(){
 const locked=state==='rolling'||pending||settling;
 document.querySelectorAll('button[data-mode],[data-size],[data-sum]').forEach(b=>b.disabled=locked);
 $('roll').disabled=!connected||locked||balance<50;
 $('roll').textContent=!connected?'连接中…':pending?'准备中…':settling?'点数落定…':state==='rolling'?'掷骰中…':balance<50?'积分不足':'掷出骰子';
 $('roll').setAttribute('aria-label',!connected?'正在连接游戏平台':locked?$('roll').textContent:balance<50?'积分不足，需 50 积分':'掷出骰子，消耗 50 积分');
 $('hint').textContent=balance<50&&!locked?'需要 50 模拟积分才能开局。':locked?'本局目标已锁定 · 奖励自动结算':'未命中则无奖励';
}
$('modes').onclick=e=>{const b=e.target.closest('button[data-mode]');if(!b||state==='rolling'||pending||settling)return;mode=b.dataset.mode;target=mode==='size'?'small':mode==='sum'?10:null;options();};
$('options').onclick=e=>{if(state==='rolling'||pending||settling)return;const b=e.target.closest('[data-size],[data-sum]');if(!b)return;target=b.dataset.size||Number(b.dataset.sum);options();};
$('roll').onclick=()=>{if(!connected||pending||settling||state==='rolling'||balance<50)return;diceAudio.unlock();pending=true;controls();send({type:'dice-roll',mode,target});};
$('back').onclick=()=>{diceAudio.leave();send({type:'game-return'})};
function showResult(r,roundId){
 settling=false;document.body.classList.remove('is-rolling','is-settling');document.body.classList.toggle('round-won',r.won);document.body.classList.toggle('round-lost',!r.won);
 if(!document.hidden&&!platformPaused)diceAudio.result(r.won);
 $('roll-charge').style.transform='scaleX(1)';$('dice-row').classList.toggle('hit',r.won);
 $('dice-row').setAttribute('aria-label','三颗骰子顶面：'+r.values.join('、')+'，总计 '+r.sum+' 点');
 $('round-label').textContent='第 '+roundId.split('-')[1]+' 局 · 已结算';
 $('result').classList.toggle('won',r.won);$('result').classList.add('revealed');
 $('result').innerHTML=`<div class="score-equation" aria-label="顶面 ${r.values.join(' 加 ')}，总计 ${r.sum} 点">${r.values.map(v=>`<span class="score-face">${pipFace(v)}<b>${v}</b></span>`).join('<span class="math-symbol">+</span>')}<span class="math-symbol">=</span><b class="score-total">${r.sum}</b><span class="score-unit">点</span></div><div class="score-outcome"><strong>${r.won?'命中 · 到账 '+r.amount.toLocaleString()+' 积分':'未命中 · 奖励 0 积分'}</strong><p>本局：${targetLabel(r.mode,r.target)} · 净收益 ${r.amount>=r.cost?'+':''}${r.amount-r.cost} 积分</p></div>`;
 history.unshift(r);history=history.slice(0,7);
 $('history').innerHTML=history.map((h,i)=>`<div class="history-round ${h.won?'hit':''} ${i===0?'newest':''}" aria-label="${h.values.join(' 加 ')} 等于 ${h.sum}，${h.won?'命中，到账 '+h.amount+' 积分':'未命中'}"><span class="history-dice">${h.values.map(pipFace).join('')}</span><span class="history-sum">${h.sum}<small>点</small></span><span class="history-outcome">${h.won?'命中':'未中'}</span></div>`).join('');controls();
}
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==parent||!e.data)return;const d=e.data;
 if(d.type==='platform-pause'){platformPaused=!!d.paused;updateMotion();return}
 if(d.type==='dice-error'){pending=false;controls();$('hint').textContent=d.message;return}if(d.type!=='dice-state')return;
 connected=true;pending=false;balance=d.balance;$('balance').textContent=balance.toLocaleString();
 const changed=d.state!==state||d.roundId!==lastId;state=d.state;lastId=d.roundId;
 if(state==='rolling')$('roll-charge').style.transform='scaleX('+Math.min(.8,Math.max(.05,(d.elapsed||0)/1600*.8))+')';
 if(changed){
  if(state==='rolling'){
   mode=d.mode;target=d.target;options();if(!document.hidden&&!platformPaused)diceAudio.roll();diceVisual.roll();
   document.body.classList.remove('round-won','round-lost');document.body.classList.add('is-rolling');$('round-label').textContent='第 '+d.roundId.split('-')[1]+' 局 · 掷骰中';
   $('result').classList.remove('won','revealed');$('result').innerHTML='<div class="result-idle"><span class="rolling-glyph" aria-hidden="true">'+pipFace(5)+'</span><div><strong>等待三颗骰子落定…</strong><p>'+targetLabel(mode,target)+' · 按顶面点数结算</p></div></div>';
  }else if(d.result){diceAudio.stop();settling=true;document.body.classList.remove('is-rolling');document.body.classList.add('is-settling');$('roll-charge').style.transform='scaleX(.9)';diceVisual.settle(d.result.values,()=>showResult(d.result,d.roundId));}
 }
 controls();
});
makeIcons();options();$('hint').textContent='正在连接游戏平台…';send({type:'dice-ready'});
