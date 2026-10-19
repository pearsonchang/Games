'use strict';
const $=id=>document.getElementById(id),embedded=window.parent!==window;
const sprite='slots-symbols.svg',audio=new SlotsAudio(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const reels=[...document.querySelectorAll('.reel')];
let model=null,pending=false,paused=false,seenRound='',seenResult='',shown=[null,null,null],history=[];
const localWallet=embedded?null:new PointsWallet();
const localRound=embedded?null:new SlotsRound({charge:n=>localWallet.charge(n,'星际老虎机 · 转动消耗'),credit:n=>localWallet.credit(n,'星际老虎机 · 转轴奖励')});
const effectNodes=prefix=>({machine:$(prefix+'machine'),confetti:$(prefix+'confetti'),burst:$(prefix+'win-burst'),title:$(prefix+'win-title'),amount:$(prefix+'win-amount'),caption:$(prefix+'win-caption'),reduced});
const effects=new SlotsEffects(effectNodes('')),previewEffects=new SlotsEffects(effectNodes('preview-'));
const points=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
function symbol(index){return '<svg class="symbol" viewBox="0 0 100 100" aria-hidden="true"><use href="'+sprite+'#'+SLOT_SYMBOLS[index].id+'"></use></svg>';}
function setReel(index,value){reels[index].querySelector('.reel-strip').innerHTML=[(value+4)%6,value,(value+2)%6].map(id=>'<div class="reel-cell">'+symbol(id)+'</div>').join('');}
function startReels(){
  shown=[null,null,null];clearCelebration();$('machine').dataset.outcome='';
  reels.forEach((reel,index)=>{
    reel.classList.remove('stopped','winner');
    reel.querySelector('.reel-strip').innerHTML=Array.from({length:15},(_,i)=>'<div class="reel-cell">'+symbol((i+index*2)%6)+'</div>').join('');
    reel.classList.add('spinning');
  });
  if(!paused&&!document.hidden)audio.roll(model.elapsed);
}
function stopReel(index,value,animate){
  const reel=reels[index];reel.classList.remove('spinning');setReel(index,value);
  if(animate&&!paused&&!document.hidden){reel.classList.add('stopped');if(index===2)audio.stop();audio.land(index);}
  shown[index]=value;
}
function controls(){
  const spinning=model?.state==='spinning',locked=pending||!model||spinning;
  $('fx-open').disabled=locked;
  $('examples-open').disabled=locked;
  $('spin').disabled=locked||model.balance<50;
  $('spin-label').textContent=!model?'连接中…':pending?'准备中…':spinning?'好运转动中…':model.balance<50?'积分不足':'转动好运';
  $('spin').setAttribute('aria-label',locked?$('spin-label').textContent:model.balance<50?'积分不足，需 50 积分':'转动好运，消耗 50 积分');
}
function request(type){
  const data={type,roundId:model?.roundId||''};
  if(embedded){window.parent.postMessage(data,location.origin);return;}
  if(type==='slots-spin'&&!localRound.start(data.roundId)){
    pending=false;controls();return;
  }
  receive(localRound.snapshot(localWallet.points));
}
function spin(){
  if(pending||paused||document.hidden||$('fx-preview').open||!model||model.state==='spinning'||model.balance<50)return;
  audio.unlock();pending=true;controls();request('slots-spin');
}
function renderResult(result){
  const pair=result.kind==='pair',win=result.kind==='triple';
  $('machine').dataset.outcome=result.kind;
  $('machine').dataset.reward=slotFeedback(result).id;
  const title=win?(result.values[0]===5?'星际徽章 · 100×':'三连命中 · '+result.multiplier+'×'):pair?'两同号 · 返还投入':'这一转，擦肩而过';
  $('result').dataset.kind=result.kind;
  $('result').innerHTML='<span class="result-icon" aria-hidden="true">'+(win?'✦':pair?'↺':'✧')+'</span><div class="slot-result-copy"><strong>'+title+'</strong><p>净收益 '+(result.amount>50?'+':'')+points(result.amount-50)+' 积分</p></div><div class="slot-result-payout"><span>本局到账</span><strong>'+points(result.amount)+'</strong><small>积分</small></div>';
  $('round-tag').textContent=win?'好运命中':pair?'投入已返还':'本局已结束';
  reels.forEach((reel,i)=>{
    const matched=win||(pair&&result.values.filter(v=>v===result.values[i]).length===2);
    reel.classList.toggle('winner',matched);
  });
  document.querySelectorAll('.prize-row').forEach(row=>row.classList.toggle('hit',win&&Number(row.dataset.symbol)===result.values[0]));
  $('pair-rule').classList.toggle('hit',pair);
  history.unshift(result);history=history.slice(0,6);
  $('history').innerHTML=history.map(r=>'<li data-kind="'+r.kind+'" aria-label="'+r.values.map(v=>SLOT_SYMBOLS[v].name).join('、')+'，到账 '+r.amount+' 积分"><div class="symbols">'+r.values.map(symbol).join('')+'</div><b>'+(r.kind==='pair'?'返还 50':r.kind==='miss'?'未命中':'+'+points(r.amount))+'</b></li>').join('');
}
function clearCelebration(){
  effects.clear();reels.forEach(reel=>reel.classList.remove('win-motion'));
}
function receive(next){
  if(next.type!=='slots-state'||!Array.isArray(next.stopped)||next.stopped.length!==3)return;
  const old=model,newRound=next.roundId!==seenRound;model=next;pending=false;
  $('balance').textContent=points(next.balance);$('machine').dataset.state=next.state;
  if(newRound){
    seenRound=next.roundId;seenResult='';shown=[null,null,null];
    document.querySelectorAll('.prize-row').forEach(row=>row.classList.remove('hit'));$('pair-rule').classList.remove('hit');
    if(next.state==='spinning'){
      startReels();$('round-tag').textContent='转动中';$('result').dataset.kind='';
      $('result').innerHTML='<span class="result-icon" aria-hidden="true">↻</span><div><strong>正在穿越星轨</strong><p>三列星际信号将依次落定</p></div>';
    }
  }
  next.stopped.forEach((value,index)=>{if(value!==null&&value!==shown[index])stopReel(index,value,!!old&&next.state==='spinning');});
  const count=next.stopped.filter(value=>value!==null).length;
  $('reel-status').textContent=next.state==='spinning'?'停轮 '+count+' / 3':'3 ORBITS · 1 LINE';
  $('reels').setAttribute('aria-label',next.state==='spinning'?'三列转轴转动中，已停 '+count+' 列':next.result?'中间横线：'+next.result.values.map(v=>SLOT_SYMBOLS[v].name).join('、'):'三列转轴预览');
  if(next.result&&seenResult!==next.roundId){
    seenResult=next.roundId;audio.stop();renderResult(next.result);
    if(old?.state==='spinning'&&!paused&&!document.hidden){
      audio.result(slotFeedback(next.result).id);effects.show(next.result);
    }
  }
  controls();
}
function visibility(){
  const stopped=paused||document.hidden;document.body.classList.toggle('motion-paused',stopped);audio.stop();
  if(stopped){clearCelebration();previewEffects.clear();if($('fx-preview').open)$('fx-preview').close();reels.forEach(reel=>reel.classList.remove('stopped'));}
  else if(model?.state==='spinning'&&shown.some(value=>value===null))audio.roll(model.elapsed);
}
reels.forEach((_,index)=>setReel(index,[0,5,4][index]));
$('prize-list').innerHTML=[...SLOT_SYMBOLS.keys()].reverse().map(i=>'<div class="prize-row" data-symbol="'+i+'"><div class="symbols">'+symbol(i).repeat(3)+'</div><span>'+SLOT_SYMBOLS[i].name+'</span><b>'+SLOT_SYMBOLS[i].multiplier+'×</b></div>').join('');
$('spin').onclick=spin;
function toggleSound(){audio.unlock();const enabled=audio.toggle();for(const id of ['sound','fx-sound']){$(id).textContent='音效 '+(enabled?'开':'关');$(id).setAttribute('aria-label',enabled?'关闭音效':'开启音效');$(id).setAttribute('aria-pressed',String(enabled));}}
$('sound').onclick=toggleSound;$('fx-sound').onclick=toggleSound;
$('back').onclick=()=>{audio.leave();if(embedded)window.parent.postMessage({type:'game-return'},location.origin);else location.href='./';};
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.repeat&&!event.target.closest('button,a,summary,input,select,textarea')){event.preventDefault();spin();}});
document.addEventListener('visibilitychange',visibility);
reduced.addEventListener?.('change',()=>{if(reduced.matches){clearCelebration();previewEffects.clear();}});
// Preview is a separate presentation surface. It never starts or settles a game.
function renderPreviewExample(index){
  const values=index===-2?[0,1,2]:index===-1?[0,4,0]:[index,index,index];
  const cost=model?.cost??50,result={values,...slotPrize(values),cost};
  result.amount=result.multiplier*cost;
  $('preview-reels').innerHTML=result.values.map(i=>'<div class="preview-symbol">'+symbol(i)+'</div>').join('');
  $('preview-machine').dataset.outcome=result.kind;
  $('preview-label').textContent=(result.kind==='miss'?'三个不同':result.kind==='pair'?'任意两个相同（含首尾）':SLOT_SYMBOLS[index].name+'三连')+' · '+result.multiplier+'×';
  $('example-cost').textContent=points(cost);$('example-multiplier').textContent=points(result.multiplier);$('example-total').textContent=points(result.amount);
  const net=result.amount-cost;
  $('example-net').textContent=(net>0?'+':net<0?'−':'')+points(Math.abs(net))+' 积分';
  $('preview-math').dataset.kind=result.kind;
  $('example-note').textContent=result.kind==='miss'?'未命中，本局投入不返还':'总返还已包含投入的 '+points(cost)+' 积分';
  $('fx-options').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.previewSymbol)===index)));
  return result;
}
function playPreview(index){
  if(!Number.isInteger(index)||index < -2||index>5||!$('fx-preview').open)return;
  previewEffects.clear();audio.stop();audio.unlock();
  const result=renderPreviewExample(index);
  previewEffects.show(result,{preview:true});audio.result(slotFeedback(result).id);
}
$('fx-options').innerHTML='<button type="button" data-preview-symbol="-2" aria-pressed="false">三个不同 <b>0×</b></button><button type="button" data-preview-symbol="-1" aria-pressed="false">返还投入 <b>1×</b></button>'+SLOT_SYMBOLS.map((s,i)=>'<button type="button" data-preview-symbol="'+i+'" aria-pressed="false">'+s.name+' <b>'+s.multiplier+'×</b></button>').join('');
function openExamples(){if(!model||model.state==='spinning'||pending||paused)return;clearCelebration();previewEffects.clear();audio.stop();renderPreviewExample(0);$('fx-preview').showModal();}
$('fx-open').onclick=openExamples;$('examples-open').onclick=openExamples;
$('fx-options').onclick=event=>{const button=event.target.closest('button[data-preview-symbol]');if(button)playPreview(Number(button.dataset.previewSymbol));};
$('fx-close').onclick=()=>$('fx-preview').close();
$('fx-preview').addEventListener('close',()=>{previewEffects.clear();audio.stop();});
window.addEventListener('pagehide',()=>{clearCelebration();previewEffects.clear();audio.leave();});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||!event.data)return;
  const data=event.data;
  if(data.type==='slots-state')receive(data);
  else if(data.type==='slots-error'){pending=false;controls();$('round-tag').textContent=data.message;}
  else if(data.type==='platform-pause'){paused=!!data.paused;visibility();}
});
if(!embedded)setInterval(()=>{localRound.tick();receive(localRound.snapshot(localWallet.points));},100);
request('slots-ready');
