(() => {
  'use strict';
  const $=id=>document.getElementById(id),embedded=window.parent!==window;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),origin=location.origin;
  const board=$('board'),layer=$('tiles'),cells=[],buttons=[...document.querySelectorAll('[data-direction]')];
  const swipe=new FusionSwipe();
  let state=null,pending=false,paused=false,queued=null,settleTimer=0,waitTimer=0,animating=false,animations=[];
  let resultSeen='',best=0,persistent=true,sound=false,audio=null,voices=[],renderedSpawnStage=null,spawnTimer=0;
  const coreNames=['微光星核','跃迁晶核','脉冲星核','星光初现','轨道之心','超新星'];
  let renderedCore=-1,shownCore=-1,coreTimer=0;
  const coreLevel=value=>value>=2048?5:value>=1024?4:value>=512?3:value>=128?2:value>=32?1:0;
  function renderCore(){
    const level=coreLevel(state.highest);
    if(level===renderedCore)return;
    renderedCore=level;document.body.dataset.coreLevel=level;text('core-name',coreNames[level]);
  }
  function celebrateCore(level){
    if(reduced.matches||paused||document.hidden)return;
    text('core-milestone-name',coreNames[level]);$('core-milestone').hidden=false;
    animate($('core-milestone'),[{opacity:0,transform:'translate(-50%,8px) scale(.9)'},{opacity:1,transform:'translate(-50%,0) scale(1.03)',offset:.2},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.7},{opacity:0,transform:'translate(-50%,-8px) scale(.98)'}],{duration:900,easing:'ease-out'});
    animate(document.querySelector('.bench-trim'),[{opacity:.45},{opacity:1,transform:'scale(1.015)',offset:.3},{opacity:1,transform:'scale(1)'}],{duration:500,easing:'ease-out'});
    animate(document.querySelector('.mission-emblem'),[{transform:'scale(.85)'},{transform:'scale(1.12)',offset:.4},{transform:'scale(1)'}],{duration:420,easing:'ease-out'});
    coreTimer=setTimeout(()=>{$('core-milestone').hidden=true;},920);
  }
  try {best=Math.max(0,Number(localStorage.getItem('playroom.2048.best.v1'))||0);sound=localStorage.getItem('playroom.2048.sound')==='on';}catch{persistent=false;}
  if(!Number.isFinite(best))best=0;
  const wallet=embedded?null:new PointsWallet();
  const round=embedded?null:new FusionRound({
    charge:amount=>wallet.charge(amount,'星际 2048 · 挑战入场',`2048:${round.counter+1}:debit`),
    credit:amount=>wallet.credit(amount,'星际 2048 · 数字奖励',`2048:${round.id}:credit`),
    onFinish:result=>{if(!result.amount)wallet.credit(0,'星际 2048 · 本局到账 0',`2048:${result.id}:loss`);}
  });
  function text(id,value){const node=$(id);if(node.textContent!==String(value))node.textContent=String(value);}
  function say(message,error=false){text('status',message);$('status').classList.toggle('error',error);}
  function format(value){return value.toLocaleString('zh-CN');}
  function openPanel(id){
    queued=null;swipe.cancel();
    document.querySelectorAll('dialog[open]').forEach(panel=>panel.close());
    $(id).showModal();
  }
  const spawnValues=[...new Set(FUSION_SPAWN_STAGES.flatMap(stage=>stage.weights.map(w=>w.value)))];
  $('spawn-rules-table').tabIndex=0;$('spawn-rules-table').setAttribute('aria-label','刷新概率表，窄屏可左右滚动查看');
  $('spawn-rules-table').innerHTML=`<table><thead><tr><th scope="col">最高数字</th>${spawnValues.map(value=>`<th scope="col">${value}</th>`).join('')}</tr></thead><tbody>${FUSION_SPAWN_STAGES.map(stage=>`<tr><th scope="row">${stage.minTile?`≥ ${stage.minTile}`:`&lt; ${FUSION_SPAWN_STAGES[1].minTile}`}</th>${spawnValues.map(value=>{const outcome=stage.weights.find(w=>w.value===value);return `<td>${outcome?outcome.chance+'%':'—'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  function renderSpawnPool(){
    const profile=state.spawnProfile;
    if(renderedSpawnStage===profile.minTile)return;
    renderedSpawnStage=profile.minTile;
    text('spawn-stage',profile.minTile?`${profile.minTile} 阶段`:'基础刷新');
    const fragment=document.createDocumentFragment();
    profile.outcomes.forEach(({value,chance})=>{
      const chip=document.createElement('span');chip.className='spawn-chip';chip.setAttribute('aria-label',`生成 ${value} 的概率 ${chance}%`);
      const tile=document.createElement('b');tile.className=`t${value}`;tile.textContent=value;
      const probability=document.createElement('small');probability.textContent=`${chance}%`;chip.append(tile,probability);fragment.append(chip);
    });$('spawn-pool').replaceChildren(fragment);
    const next=FUSION_SPAWN_STAGES.find(stage=>stage.minTile===profile.nextUnlock),maximum=next?.weights.at(-1).value;
    text('spawn-next',next?`合出 ${next.minTile}，解锁新格子 ${maximum}`:'全部刷新数字已解锁 · 20% 概率刷出 64 或更大');
  }
  for(let row=0;row<4;row++) {
    const rowNode=document.createElement('div');rowNode.className='board-row';rowNode.setAttribute('role','row');
    for(let col=0;col<4;col++) {
      const cell=document.createElement('div');cell.className='cell';cell.setAttribute('role','gridcell');
      cell.setAttribute('aria-rowindex',row+1);cell.setAttribute('aria-colindex',col+1);
      const value=document.createElement('span');value.className='sr-value';cell.append(value);rowNode.append(cell);cells.push(cell);
    }
    board.append(rowNode);
  }
  function makeTile(value,index){
    const tile=document.createElement('div');tile.className=`tile t${value}`;tile.dataset.value=value;
    tile.style.setProperty('--c',index%4);tile.style.setProperty('--r',Math.floor(index/4));
    const number=document.createElement('span');number.className='tile-number';number.textContent=value;tile.append(number);return tile;
  }
  function animate(node,frames,options){if(reduced.matches||paused||document.hidden)return;const a=node.animate(frames,options);animations.push(a);return a;}
  function stopAnimations(){clearTimeout(settleTimer);clearTimeout(spawnTimer);clearTimeout(coreTimer);animations.forEach(a=>a.cancel());animations=[];animating=false;$('spawn-sparks').replaceChildren();$('spawn-banner').hidden=true;$('core-milestone').hidden=true;}
  function spawnBurst(value,index){
    if(reduced.matches||paused||document.hidden)return;
    text('spawn-banner',`${value>=128?'星际空投':'高能刷新'} · ${value}`);$('spawn-banner').hidden=false;
    animate($('spawn-banner'),[{opacity:0,transform:'translate(-50%,8px) scale(.85)'},{opacity:1,transform:'translate(-50%,0) scale(1.04)',offset:.18},{opacity:1,transform:'translate(-50%,0) scale(1)',offset:.68},{opacity:0,transform:'translate(-50%,-7px) scale(.98)'}],{duration:760,easing:'ease-out'});
    const fragment=document.createDocumentFragment();
    for(let i=0;i<10;i++){
      const particle=document.createElement('i');particle.className=`spawn-spark t${value}`;
      particle.style.left=`${(index%4+.5)*25}%`;particle.style.top=`${(Math.floor(index/4)+.5)*25}%`;fragment.append(particle);
      const angle=i*Math.PI/5,distance=38+i%3*12;
      animate(particle,[{opacity:1,transform:'translate(-50%,-50%) scale(.7)'},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(angle)*distance}px),calc(-50% + ${Math.sin(angle)*distance}px)) scale(.1) rotate(100deg)`}],{duration:520+i%3*60,easing:'ease-out'});
    }
    $('spawn-sparks').replaceChildren(fragment);spawnTimer=setTimeout(()=>{$('spawn-sparks').replaceChildren();$('spawn-banner').hidden=true;},780);
  }
  function paintTiles(celebrate=false){
    const fragment=document.createDocumentFragment(),move=state.lastMove;
    state.board.forEach((value,i)=>{
      if(!value)return;
      const node=makeTile(value,i);fragment.append(node);
      if(celebrate) {
        const merged=move?.merges.some(m=>m.index===i),spawned=move?.spawn?.index===i;
        if(merged){node.classList.add('merged-tile');animate(node,[{transform:'scale(.91)'},{transform:'scale(1.08)',offset:.42},{transform:'scale(1)'}],{duration:170,easing:'ease-out'});}
        else if(spawned){
          if(value>=8){
            node.classList.add('boost-spawn');
            animate(node,[{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1.12)',offset:.5},{opacity:1,transform:'scale(1)'}],{duration:260,easing:'ease-out'});
          }else animate(node,[{opacity:0,transform:'scale(.65)'},{opacity:1,transform:'scale(1)'}],{duration:145,easing:'ease-out'});
        }
      }
    });layer.replaceChildren(fragment);
    if(celebrate&&move?.spawn?.value>=32)spawnBurst(move.spawn.value,move.spawn.index);
    const level=coreLevel(state.highest);
    if(celebrate&&level>shownCore)celebrateCore(level);
    shownCore=level;
  }
  function paintCells(){
    state.board.forEach((value,i)=>{cells[i].setAttribute('aria-label',`第 ${Math.floor(i/4)+1} 行，第 ${i%4+1} 列，${value||'空格'}`);cells[i].firstChild.textContent=value||'空格';});
  }
  function paymentControls(){
    const poor=!state||state.balance<FUSION_COST,playing=state?.state==='playing';
    $('start').disabled=poor||pending||playing;
    $('again').disabled=poor||pending;
    $('restart').disabled=poor||pending||!state||state.state==='idle';
    $('confirm-restart').disabled=poor||pending;
    buttons.forEach(b=>b.disabled=!playing||paused);
  }
  function hud(){
    text('balance',format(state.balance));text('score',format(state.score));text('best',format(best));text('moves',state.moves);text('highest',state.highest||'—');
    const idle=state.state==='idle',finished=state.state==='finished',reward=state.result?.amount??state.reward;
    if(!idle&&$('entry').open)$('entry').close();
    $('round-open').hidden=state.state==='playing';
    text('round-open',idle?'开始挑战 · 50 积分 ↗':'查看本局结算 ↗');
    document.body.dataset.phase=state.state;
    text('phase',idle?'等待点火':finished?'本局已结算':'滑动合并，点亮星轨');
    text('reward',reward);text('reward-label',finished?'本局已到账':'当前达标奖励');
    text('reward-timing',finished?`净收益 ${state.result.net>0?'+':''}${state.result.net} 积分`:'本局结束时到账');
    const next=FUSION_REWARDS.find(t=>t.tile>state.highest);
    text('next-tile',next?.tile??'2048');
    text('next-note',finished?state.result.reason==='target'?'2048 已达成，最高档奖励已到账。':'本局结束，准备迎接下一次挑战。':next?`合出 ${next.tile}，结算可到账 ${next.amount} 积分。`:'最高档奖励已达成。');
    $('progress').firstChild.style.transform=`scaleX(${Math.min(1,Math.max(0,(Math.log2(state.highest||2)-1)/10))})`;
    $('progress').setAttribute('aria-valuenow',state.highest);
    $('progress').setAttribute('aria-valuetext',`最高数字 ${state.highest}，${window.PlayroomI18n?.sourceText($('next-note')) ?? $('next-note').textContent}`);
    document.querySelectorAll('[data-tier]').forEach(node=>{
      const reached=state.highest>=Number(node.dataset.tier);
      node.classList.toggle('reached',reached);node.classList.toggle('next-tier',!finished&&Number(node.dataset.tier)===next?.tile);
      node.setAttribute('aria-label',`${node.dataset.tier}，${window.PlayroomI18n?.sourceText(node.querySelector('strong')) ?? node.querySelector('strong').textContent}${reached?'，已达成':''}`);
    });
    text('restart',finished?'再挑战 · 50 积分':'放弃重开 · 50 积分');
    text('save-note',embedded?'返回大厅保留本局；积分与存档方式请查看大厅说明。':'独立试玩积分 · 返回后重新进入会重置');
    if(!persistent)text('save-note',(window.PlayroomI18n?.sourceText($('save-note')) ?? $('save-note').textContent)+' · 最佳仅本次有效');
    renderCore();renderSpawnPool();paymentControls();paintCells();
  }
  function showResult(force=false){
    if(state.state!=='finished'||(!force&&resultSeen===state.roundId)||paused)return;
    resultSeen=state.roundId;const r=state.result;
    text('result-kicker',r.reason==='target'?'SUPERNOVA ACHIEVED':'ORBIT COMPLETE');
    text('result-title',r.reason==='target'?'2048！超新星时刻':'这趟星旅，收工了');
    text('result-summary',`最高数字 ${r.highest} · 本局得分 ${format(r.score)}`);
    text('result-amount',r.amount);text('result-net',`投入 50 积分 · 净收益 ${r.net>0?'+':''}${r.net} 积分`);
    openPanel('result');
    say(`本局结束，最高数字 ${r.highest}，到账 ${r.amount} 积分，净收益 ${r.net} 积分。`);
    if(!$('again').disabled)$('again').focus({preventScroll:true});else $('inspect').focus({preventScroll:true});
    tone(r.reason==='target'?'win':'end');
  }
  function flushQueue(){const direction=queued;queued=null;if(direction&&state.state==='playing'&&!paused)move(direction);}
  function settle(){
    // Discard finished animation objects between moves; no idle animation loop.
    stopAnimations();paintTiles(true);showResult();flushQueue();
  }
  function slide(){
    stopAnimations();animating=true;
    const pitch=layer.getBoundingClientRect().width/4,fragment=document.createDocumentFragment();
    state.lastMove.transitions.forEach(t=>{
      const tile=makeTile(t.value,t.to);fragment.append(tile);
      animate(tile,[{transform:`translate(${(t.from%4-t.to%4)*pitch}px,${(Math.floor(t.from/4)-Math.floor(t.to/4))*pitch}px)`},{transform:'translate(0,0)'}],{duration:110,easing:'cubic-bezier(.18,.72,.28,1)',fill:'both'});
    });layer.replaceChildren(fragment);settleTimer=setTimeout(settle,115);
  }
  function receive(next){
    const previous=state,newRound=!previous||previous.roundId!==next.roundId;
    if(previous&&!newRound&&next.revision<previous.revision)return;
    const changed=!previous||newRound||next.revision!==previous.revision;
    pending=false;clearTimeout(waitTimer);state=next;
    if(state.score>best){best=state.score;try{localStorage.setItem('playroom.2048.best.v1',String(best));}catch{persistent=false;}}
    if(newRound){queued=null;swipe.cancel();resultSeen='';if($('result').open)$('result').close();stopAnimations();}
    hud();
    if(changed){
      const moving=!newRound&&state.lastMove&&!reduced.matches&&!paused&&!document.hidden;
      if(moving)slide();else{stopAnimations();paintTiles();showResult();}
      if(newRound&&state.state==='playing'){say('滑动棋盘，合并相同数字。也支持方向键与 WASD。');board.focus({preventScroll:true});tone('start');}
      else if(!newRound&&state.lastMove?.gain){
        const gain=state.lastMove.gain;text('gain',`+${gain}`);
        animate($('gain'),[{opacity:1,transform:'translateY(2px)'},{opacity:0,transform:'translateY(-18px)'}],{duration:650,easing:'ease-out'});
        if(state.state==='playing')say(`合并 +${gain} 分${state.lastMove.spawn?.value>=8?` · 刷出 ${state.lastMove.spawn.value}`:''}${state.reward>(previous?.reward??0)?` · ${state.reward} 积分奖励档已达成`:''}${state.spawnProfile.minTile>(previous?.spawnProfile?.minTile??0)?' · 刷新池已升级':''}`);
        tone(state.lastMove.spawn?.value>=32?'rare':gain>=128?'tier':'merge');
      }else if(!newRound&&state.state==='playing'&&state.lastMove?.spawn?.value>=8){
        say(`刷出 ${state.lastMove.spawn.value}！继续合并，向更高数字进发。`);tone(state.lastMove.spawn.value>=32?'rare':'tier');
      }
    }else if(!animating){showResult();flushQueue();}
    if(state.state==='idle')say(state.balance>=50?'每局 50 模拟积分 · 按最高数字结算':'积分不足，本局需要 50 积分。',state.balance<50);
    if(!previous&&state.state==='idle')openPanel('entry');
    if(newRound&&state.state==='playing'&&state.balance<50)say('本局已开始。剩余积分不足以再次重开，可继续完成本局。');
  }
  function send(type,data={}){
    if(!state||pending)return;
    const payload={type,roundId:state.roundId,revision:state.revision,...data};pending=true;paymentControls();
    if(embedded){
      window.parent.postMessage(payload,origin);
      waitTimer=setTimeout(()=>{queued=null;pending=false;paymentControls();say('正在重新同步本局，请稍候…');window.parent.postMessage({type:'2048-ready'},origin);},3000);
    }else{
      const ok=type==='2048-start'?round.start(payload.roundId):type==='2048-restart'?round.restart(payload.roundId,payload.revision):round.move(payload.direction,payload.roundId,payload.revision);
      receive(round.snapshot(wallet.points));
      if(!ok)say(wallet.points<50?'积分不足，本局需要 50 积分。':'本次操作未生效，请重试。',true);
    }
  }
  function move(direction){
    if(!state||state.state!=='playing'||paused||document.hidden||document.querySelector('dialog[open]'))return;
    if(pending||animating){queued=direction;return;}
    if(!fusionSlide(state.board,direction)?.changed)return;
    send('2048-move',{direction});
  }
  function start(){unlockAudio();send('2048-start');}
  function restart(){if(state?.state==='playing')openPanel('confirm');else{document.querySelectorAll('dialog[open]').forEach(panel=>panel.close());start();}}
  function leave(){
    pause(true);
    if(embedded)window.parent.postMessage({type:'game-return'},origin);else location.href='./#games';
  }
  function pause(value){paused=value;queued=null;swipe.cancel();stopAudio();stopAnimations();if(state){paintTiles();paymentControls();if(!value)showResult();}}
  $('start').addEventListener('click',start);$('again').addEventListener('click',start);$('restart').addEventListener('click',restart);
  $('confirm-restart').addEventListener('click',()=>{$('confirm').close();unlockAudio();send('2048-restart');});
  $('inspect').addEventListener('click',()=>{$('result').close();board.focus({preventScroll:true});});
  $('back').addEventListener('click',leave);$('return').addEventListener('click',leave);
  document.querySelector('.wordmark').addEventListener('click',event=>{event.preventDefault();leave();});
  $('help').addEventListener('click',()=>openPanel('rules'));
  $('menu-open').addEventListener('click',()=>openPanel('settings'));
  $('spawn-open').addEventListener('click',()=>openPanel('spawn-info'));
  $('round-open').addEventListener('click',()=>state?.state==='idle'?openPanel('entry'):showResult(true));
  let controls=false;
  try{controls=localStorage.getItem('playroom.2048.controls')==='on';}catch{}
  function controlsButton(){
    document.body.classList.toggle('show-controls',controls);
    $('controls-toggle').setAttribute('aria-pressed',String(controls));text('controls-copy',controls?'已开启':'已关闭');
  }
  controlsButton();
  $('controls-toggle').addEventListener('click',()=>{controls=!controls;controlsButton();try{localStorage.setItem('playroom.2048.controls',controls?'on':'off');}catch{}});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  const keys={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'};
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
    const direction=keys[event.key]||keys[event.key.toLowerCase()];
    if(!direction||state?.state!=='playing'||paused)return;
    event.preventDefault();unlockAudio();move(direction);
  });
  buttons.forEach(button=>button.addEventListener('click',()=>{unlockAudio();move(button.dataset.direction);}));
  board.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false||state?.state!=='playing'||paused||document.querySelector('dialog[open]'))return;
    swipe.begin(event.pointerId,event.clientX,event.clientY);board.setPointerCapture(event.pointerId);unlockAudio();
  });
  board.addEventListener('pointermove',event=>{const direction=swipe.update(event.pointerId,event.clientX,event.clientY);if(direction)move(direction);});
  board.addEventListener('pointerup',event=>{
    const direction=swipe.end(event.pointerId,event.clientX,event.clientY);if(direction)move(direction);
  });
  board.addEventListener('pointercancel',()=>swipe.cancel());board.addEventListener('lostpointercapture',()=>swipe.cancel());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){queued=null;swipe.cancel();stopAudio();stopAnimations();if(state)paintTiles();}else if(!paused&&state)showResult();});
  window.addEventListener('resize',()=>{if(animating){stopAnimations();paintTiles();showResult();flushQueue();}});
  reduced.addEventListener('change',()=>{stopAnimations();if(state){paintTiles();showResult();flushQueue();}});

  // Short, quiet synth cues are gesture-unlocked and release all nodes on completion.
  function soundButton(){$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');text('sound-copy',sound?'已开启':'已关闭');}
  function unlockAudio(){
    if(!sound)return;
    try{const Context=window.AudioContext||window.webkitAudioContext;if(Context&&!audio)audio=new Context();if(audio?.state==='suspended')audio.resume().catch(()=>{});}catch{sound=false;soundButton();}
  }
  function stopAudio(){voices.forEach(v=>{try{v.stop();}catch{}});voices=[];}
  function tone(kind){
    if(!sound||!audio||audio.state!=='running'||paused||document.hidden)return;
    stopAudio();
    const notes=kind==='win'?[523,659,784,1047]:kind==='rare'?[392,587,784,1175]:kind==='tier'?[440,659,880]:kind==='start'?[330,494]:kind==='end'?[330,262]:[523,659];
    notes.forEach((frequency,i)=>{
      const oscillator=audio.createOscillator(),gain=audio.createGain(),at=audio.currentTime+i*.065;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045,at+.009);gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();voices=voices.filter(v=>v!==oscillator);};voices.push(oscillator);oscillator.start(at);oscillator.stop(at+.2);
    });
  }
  $('sound').addEventListener('click',()=>{sound=!sound;soundButton();try{localStorage.setItem('playroom.2048.sound',sound?'on':'off');}catch{}if(sound){unlockAudio();tone('start');}else stopAudio();});
  soundButton();
  if(embedded){
    window.addEventListener('message',event=>{
      if(event.origin!==origin||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
      if(event.data.type==='2048-state')receive(event.data);
      else if(event.data.type==='2048-error'){queued=null;say(event.data.message,true);}
      else if(event.data.type==='platform-pause')pause(!!event.data.paused);
    });
    window.parent.postMessage({type:'2048-ready'},origin);
  }else receive(round.snapshot(wallet.points));
})();
