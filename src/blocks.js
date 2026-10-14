'use strict';
(() => {
  const $=id=>document.getElementById(id), embedded=window.parent!==window;
  const localWallet=embedded?null:new PointsWallet();
  const local=embedded?null:new BlocksRound({
    charge:n=>localWallet.charge(n,'星际方块 · 挑战入场',`blocks:${local.counter+1}:debit`),
    credit:n=>localWallet.credit(n,'星际方块 · 得分奖励',`blocks:${local.id}:credit`)
  });
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const cells=[], renderedColors=Array(64).fill(null), placedCells=new Set();
  const slots=[], slotViews=[], slotAnimations=[], effectPool=[], activeEffects=[], rewardNodes=[];
  const rowCounts=new Uint8Array(8), colCounts=new Uint8Array(8), lineRails=[], visibleRails=new Set();
  let state=null, selected=null, pending=false, paused=false, drag=null, suppressClick=false;
  let confirmed=null, inFlight=null, rejected=false, restartQueued=false;
  const placements=[], retiredRounds=new Set();
  let renderedPlaying=null, entryShown=false, inputFrame=0, queuedInput=null, previewKey='', previewValid=false, scoreAnimation, gainAnimation, calloutAnimation;
  let previewGrid=null, outlinePieceKey='', previewTarget=null, previewSizingKey='', outlineMode='';
  let shapeRows=[],shapeCols=[];
  let seen='', roundBest=0, previousBest=0, best=0, persistent=true, soundEnabled=true;
  let effectTimer, resultTimer, calloutTimer, suppressTimer, tierTimer, audioContext, master;
  const tierAnimations=[];
  try {
    const stored=Number(localStorage.getItem('playroom.blocks.challenge.best.v1'));
    if (Number.isSafeInteger(stored)&&stored>=0) best=stored;
    soundEnabled=localStorage.getItem('playroom.blocks.sound.v1')!=='off';
  } catch { persistent=false; }
  function saveBest(snapshot) {
    if (snapshot.score<=best) return;
    best=snapshot.score;
    try { localStorage.setItem('playroom.blocks.challenge.best.v1',String(best)); } catch { persistent=false; }
  }
  function soundButton() {
    $('sound').setAttribute('aria-pressed',String(soundEnabled));
    $('sound').setAttribute('aria-label',soundEnabled?'关闭音效':'开启音效');
    text('sound-copy',soundEnabled?'已开启':'已关闭');
  }
  function unlockAudio() {
    if (!soundEnabled||paused) return;
    try {
      if (!audioContext) {
        const Audio=window.AudioContext||window.webkitAudioContext;
        if (!Audio) return;
        audioContext=new Audio(); master=audioContext.createGain(); master.gain.value=.32; master.connect(audioContext.destination);
      }
      if (audioContext.state==='suspended') audioContext.resume().catch(()=>{});
    } catch { /* Sound is optional; puzzle input remains available. */ }
  }
  function tone(frequency,time,duration=.13,volume=.18,type='sine') {
    if (!soundEnabled||paused||!audioContext||audioContext.state!=='running') return;
    const oscillator=audioContext.createOscillator(), gain=audioContext.createGain(), start=audioContext.currentTime+time;
    oscillator.type=type; oscillator.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(volume,start+.008); gain.gain.exponentialRampToValueAtTime(.001,start+duration);
    oscillator.connect(gain); gain.connect(master); oscillator.start(start); oscillator.stop(start+duration+.02);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  function playSound(kind,combo=1) {
    if (kind==='select') tone(490,0,.065,.1);
    else if (kind==='place') {tone(260,0,.085,.17,'triangle');tone(620,.015,.1,.09);}
    else if (kind==='clear') {
      const shift=Math.min(combo-1,5)*2, ratio=2**(shift/12);
      [523,659,784,1047].forEach((f,i)=>tone(f*ratio,i*.065,.24,.18,'triangle'));
      tone(130,0,.24,.28); if (combo>1) tone(1568*ratio,.22,.4,.12);
    } else if (kind==='error') tone(145,0,.12,.12,'triangle');
    else if (kind==='finish') [660,523,392].forEach((f,i)=>tone(f,i*.14,.3,.16));
  }
  function message(text,error=false) { if($('hint').textContent!==text)$('hint').textContent=text; $('hint').classList.toggle('error',error); }
  function send(type,extra={}) {
    if (pending) return;
    pending=true;paymentControls();
    const data={type,roundId:state?.roundId||'',revision:state?.revision||0,...extra};
    if (embedded) window.parent.postMessage(data,location.origin);
    else {
      let ok;
      if (type==='blocks-start') ok=local.start(data.roundId);
      if (type==='blocks-restart') ok=local.restart(data.roundId,data.revision);
      if (type==='blocks-place') ok=local.place(data.slot,data.row,data.col,data.roundId,data.revision);
      receive(local.snapshot(localWallet.points));
      if (!ok) message(localWallet.points<BLOCK_COST?'积分不足，需要 50 积分。':'本次操作未生效，请重试。',true);
    }
  }
  function pumpPlacements() {
    if(pending||inFlight||!placements.length)return;
    inFlight=placements[0];
    window.parent.postMessage({type:'blocks-place',roundId:confirmed.roundId,revision:confirmed.revision,
      slot:inFlight.slot,row:inFlight.row,col:inFlight.col},location.origin);
  }
  function commitPlacement(slot,row,col) {
    if(!embedded){send('blocks-place',{slot,row,col});return;}
    const next=blockProjectPlacement(state,slot,row,col);
    if(!next)return;
    placements.push({slot,row,col,expected:next});
    displayState(next,true);
    pumpPlacements();
  }
  function sameView(a,b) {
    return a&&a.roundId===b.roundId&&a.revision===b.revision&&a.state===b.state&&a.score===b.score&&
      a.board.every((color,i)=>color===b.board[i])&&JSON.stringify(a.tray)===JSON.stringify(b.tray);
  }
  function pieceMarkup(piece) {
    const anchor=blockPlacementAnchor(piece);
    return `<span class="piece-grid color-${piece.color}" style="--cols:${piece.cols};--rows:${piece.rows}">${piece.cells.map(([r,c])=>`<i class="tile${r===anchor.row&&c===anchor.col?' placement-anchor':''}" style="grid-row:${r+1};grid-column:${c+1}"></i>`).join('')}</span>`;
  }
  function text(id,value) {const node=$(id);if(node.textContent!==value)node.textContent=value;}
  const format=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
  function paymentControls() {
    const balance=confirmed?.balance??0,locked=pending||restartQueued||balance<BLOCK_COST;
    text('balance',format(balance));
    $('start').disabled=locked||state?.state!=='idle';
    $('confirm-restart').disabled=locked;
    $('play-again').disabled=locked;
    $('restart').disabled=locked;
    text('entry-status',pending?'正在准备挑战…':balance<BLOCK_COST?'积分不足：需要 50 积分才能入场。':`当前余额 ${format(balance)} · 入场后 ${format(balance-BLOCK_COST)}`);
    text('result-balance',`余额 ${format(balance)} 积分${balance<BLOCK_COST?' · 不足以再次入场':''}`);
    text('play-again',balance<BLOCK_COST?'积分不足 · 需要 50 积分':'再挑战 · 50 积分 ↗');
  }
  const rewardLabels=['部分返还','回本','净赚 30'];
  BLOCK_REWARDS.slice(1).forEach((tier,i)=>{
    const node=document.createElement('div');node.className='reward-tier';
    node.innerHTML=`<i aria-hidden="true"></i><span>${format(tier.score)} 分${i===1?' · 回本':i===2?' · 净赚 30':''}</span><b>${tier.amount}<small>积分</small></b>`;
    $('reward-tiers').append(node);rewardNodes.push(node);
  });
  $('entry-rewards').innerHTML=BLOCK_REWARDS.slice(1).map((tier,i)=>`<div><span>${format(tier.score)} 分</span><b>${tier.amount}<small>积分</small></b><em>${rewardLabels[i]}</em></div>`).join('');
  text('wallet-note',embedded?'Demo 奖励参数，收益分布尚未校准。':'独立试玩余额，刷新重置；从大厅进入可使用大厅积分。');
  function renderChallenge() {
    const idle=state.state==='idle',finished=state.state==='finished';
    document.body.classList.toggle('challenge-idle',idle);
    if(!idle&&$('entry-panel').open)$('entry-panel').close();
    $('board').inert=idle;
    $('dock-idle').hidden=!idle;
    for(const id of ['tray-heading','tray','hint'])$(id).hidden=idle;
    $('round-open').hidden=state.state==='playing'||state.state==='settling';
    text('round-open',idle?'开始挑战 · 50 积分 ↗':'查看本局结算 ↗');
    text('steps-left',String(state.remaining));
    $('steps-badge').classList.toggle('last-steps',!idle&&state.remaining<=5);
    text('steps-phase',idle?'准备入场':finished?'本局结束':state.state==='settling'?'结算中':state.remaining<=5?`最后 ${state.remaining} 步`:'自由思考');
    text('restart',finished?'再挑战 · 50 积分':'放弃重开 · 50 积分');
    const reward=state.result?.amount??blockReward(state.score);
    text('reward-amount',String(reward));
    text('reward-caption',finished?'本局已到账':'当前达标奖励');
    text('reward-timing',finished?`净收益 ${state.result.net>0?'+':''}${state.result.net}`:'结束时到账');
    const next=BLOCK_REWARDS.find(t=>t.score>state.score);
    rewardNodes.forEach((node,i)=>{
      const tier=BLOCK_REWARDS[i+1];
      node.classList.toggle('current',tier.amount===reward);
      node.classList.toggle('reached',state.score>=tier.score);
      node.classList.toggle('next',next?.score===tier.score&&!finished);
      node.setAttribute('aria-label',`${format(tier.score)} 分，到账 ${tier.amount} 积分，${state.score>=tier.score?'已达成':'未达成'}`);
    });
    text('reward-note',finished?`已到账 ${reward} 积分 · 净收益 ${state.result.net>0?'+':''}${state.result.net}`:
      state.state==='settling'?'挑战完成，正在确认结算…':next?`再得 ${format(next.score-state.score)} 分，结算可到账 ${next.amount} 积分`:'最高奖励档已达成 · 结算可到账 80 积分');
    const score=state.score;
    // Match the three equally-spaced visual stops at 500, 1000 and 2000 points.
    const progress=score<500?score/3000:score<1000?1/6+(score-500)/1500:score<2000?1/2+(score-1000)/3000:1;
    $('progress').setAttribute('aria-valuenow',String(Math.min(score,2000)));
    $('progress').setAttribute('aria-valuetext',`${format(score)} 分，${$('reward-note').textContent}`);
    $('progress').firstElementChild.style.transform=`scaleX(${progress})`;
    paymentControls();
    if(idle&&!entryShown){entryShown=true;openPanel('entry-panel');}
  }
  function clearTierFeedback() {
    clearTimeout(tierTimer);tierAnimations.forEach(a=>a.cancel());tierAnimations.length=0;
    rewardNodes.forEach(node=>node.classList.remove('energized'));
    $('tier-toast').hidden=true;
  }
  function celebrateTier(reward) {
    clearTierFeedback();
    text('tier-toast',reward===50?'回本档达成 · 结算可到账 50':reward===80?'最高档达成 · 结算可到账 80':'20 积分档达成 · 部分返还');
    $('tier-toast').hidden=false;
    if(!reduced.matches) {
      const node=rewardNodes[BLOCK_REWARDS.findIndex(t=>t.amount===reward)-1];
      node.classList.add('energized');
      tierAnimations.push(node.animate([{transform:'translateY(0) scale(1)'},{transform:'translateY(-4px) scale(1.08)',offset:.35},{transform:'translateY(0) scale(1)'}],{duration:560,easing:'ease-out'}));
      tierAnimations.push($('reward-amount').animate([{transform:'scale(1)'},{transform:'scale(1.22)',offset:.35},{transform:'scale(1)'}],{duration:480,easing:'ease-out'}));
      tierAnimations.push($('tier-toast').animate([{opacity:0,transform:'translate(-50%,8px) scale(.94)'},{opacity:1,transform:'translate(-50%,0) scale(1)'}],{duration:220,easing:'ease-out'}));
    }
    tierTimer=setTimeout(clearTierFeedback,1100);
  }
  // Keep the three input targets alive, including across refills and owner acknowledgments.
  for(let slot=0;slot<3;slot++) {
    const button=document.createElement('button');button.type='button';button.className='piece-slot';button.dataset.slot=String(slot);
    $('tray').append(button);slots.push(button);
  }
  function renderTray() {
    state.tray.forEach((piece,slot)=>{
      const button=slots[slot],old=slotViews[slot];
      const key=piece?`${piece.name}:${piece.color}:${piece.cells.map(c=>c.join(',')).join(';')}`:'used';
      const usable=!!piece?.fits&&state.state==='playing',on=usable&&selected===slot;
      if(old?.key!==key) {
        button.innerHTML=piece?`${pieceMarkup(piece)}<span class="slot-note"></span>`:'<span class="used-mark" aria-hidden="true">✓</span><span class="slot-note">已放置</span>';
        slotAnimations[slot]?.cancel();
        if(piece&&!reduced.matches)slotAnimations[slot]=button.firstElementChild.animate([
          {opacity:.4},{opacity:1}
        ],{duration:130,easing:'ease-out'});
      }
      const classes=`piece-slot${piece?(usable?'':' unavailable'):' used'}`;
      if(button.className!==classes)button.className=classes;
      if(!old||old.usable!==usable)button.disabled=!usable;
      if(!old||old.on!==on)button.setAttribute('aria-pressed',String(on));
      const label=piece?`方块 ${slot+1}，${piece.rows} 行 ${piece.cols} 列，${piece.cells.length} 格${piece.fits?'':'，暂无落点'}`:`方块 ${slot+1} 已使用`;
      if(old?.label!==label)button.setAttribute('aria-label',label);
      const note=piece?(usable?(on?'已选中':`${piece.cells.length} 格`):'暂无落点'):'已放置';
      if(button.querySelector('.slot-note').textContent!==note)button.querySelector('.slot-note').textContent=note;
      slotViews[slot]={key,usable,on,label};
    });
  }
  for (let i=0;i<64;i++) {
    const cell=document.createElement('button'); cell.className='cell'; cell.type='button'; cell.setAttribute('role','gridcell');
    cell.dataset.index=i; cell.tabIndex=i===0?0:-1; $('board').append(cell); cells.push(cell);
  }
  // Dedicated overlays never change the 64 settled board cells while aiming.
  for(let i=0;i<16;i++) {
    const rail=document.createElement('i');rail.className='preview-rail';rail.hidden=true;
    rail.style.gridRow=i<8?String(i+1):'1 / -1';rail.style.gridColumn=i<8?'1 / -1':String(i-7);
    $('line-preview').append(rail);lineRails.push(rail);
  }
  function render() {
    const activeCell=document.activeElement?.dataset.index;
    rowCounts.fill(0);colCounts.fill(0);
    state.board.forEach((color,i)=>{
      if(color){rowCounts[Math.floor(i/8)]++;colCounts[i%8]++;}
      if(renderedColors[i]!==color) {
        cells[i].className=`cell${color?` filled color-${color}`:''}`;
        cells[i].setAttribute('aria-label',`第 ${Math.floor(i/8)+1} 行，第 ${i%8+1} 列，${color?'已有方块':'空格'}`);
        renderedColors[i]=color;
      }
      if(renderedPlaying!==state.state) cells[i].setAttribute('aria-disabled',String(state.state!=='playing'));
    });
    renderedPlaying=state.state;
    text('score',state.score.toLocaleString('zh-CN'));text('best',best.toLocaleString('zh-CN'));
    text('lines',String(state.lines).padStart(2,'0'));text('lines-mini',`${state.lines} 条已消除`);
    text('max-combo',`×${state.maxCombo}`);text('moves',String(state.moves).padStart(2,'0'));
    text('combo-label',state.combo>0?`COMBO ×${state.combo} · 连续消除加成`:'拼满一行或一列，即可消除');
    $('combo-label').classList.toggle('has-combo',state.combo>0);
    text('tray-count',`${state.tray.filter(Boolean).length} / 3`);renderTray();
    $('save-note').textContent=persistent?'个人最佳保存在本机':'当前浏览器无法保存，最佳记录仅本次有效';
    renderChallenge();
    if (activeCell!==undefined) cells[Number(activeCell)]?.focus({preventScroll:true});
  }
  function clearEffects() {
    clearTierFeedback();
    clearTimeout(effectTimer); clearTimeout(calloutTimer);
    calloutAnimation?.cancel();
    activeEffects.forEach(item=>item.animation?.cancel());activeEffects.length=0;
    $('effects').replaceChildren(); $('callout').classList.remove('active'); $('board-frame').classList.remove('clearing','combo-flash');
  }
  function stopEffects() {
    clearEffects(); clearTimeout(resultTimer); scoreAnimation?.cancel();gainAnimation?.cancel();
    placedCells.forEach(i=>cells[i].classList.remove('just-placed')); placedCells.clear();
  }
  function receive(next) {
    if(retiredRounds.has(next.roundId))return;
    if(confirmed?.roundId===next.roundId&&next.revision<confirmed.revision)return;
    pending=false;
    const isNew=confirmed?.roundId!==next.roundId,previousReward=blockReward(confirmed?.score||0);
    let rollback=rejected;
    if(isNew) {
      if(confirmed)retiredRounds.add(confirmed.roundId);
      placements.length=0;inFlight=null;restartQueued=false;
    } else if(inFlight&&!rejected) {
      if(next.revision<=confirmed.revision)return;
      const expected=inFlight.expected;
      if(next.revision===expected.revision&&next.score===expected.score&&next.board.every((v,i)=>v===expected.board[i])) {
        placements.shift();inFlight=null;
      } else rollback=true;
    }
    if(rollback){placements.length=0;inFlight=null;}
    confirmed=next;rejected=false;saveBest(next);paymentControls();
    $('best').textContent=best.toLocaleString('zh-CN');
    let projected=next;
    for(const intent of placements) {
      projected=blockProjectPlacement(projected,intent.slot,intent.row,intent.col);
      if(!projected){placements.length=0;inFlight=null;projected=next;rollback=true;break;}
      intent.expected=projected;
    }
    if(rollback){stopEffects();endDrag();seen=next.lastMove?`${next.roundId}:${next.revision}`:'';}
    displayState(projected,placements.length>0,rollback);
    // A confirmed threshold celebrates once, never during an ongoing drag or a rollback.
    if(!isNew&&!rollback&&!placements.length&&next.state==='playing'&&next.reward>previousReward&&!paused&&!document.hidden&&!drag?.moving)celebrateTier(next.reward);
    roundBest=Math.max(roundBest,next.score);
    if(rollback)message('棋盘已同步，请重新选择方块。');
    if(restartQueued&&!placements.length){restartQueued=false;send('blocks-restart');}
    else pumpPlacements();
  }
  function displayState(next,optimistic=false,rollback=false) {
    if(sameView(state,next)&&!rollback){state=next;return;}
    const isNew=state?.roundId!==next.roundId;
    // Remove the old preview before replacing the board that it belongs to.
    endDrag();
    if (isNew) {stopEffects();endDrag();selected=null;previousBest=best;roundBest=0;seen='';}
    state=next; roundBest=Math.max(roundBest,confirmed?.score||0);
    selected=null;
    render();
    if (isNew&&state.state==='playing') message('挑战开始：先把两个长条拼成一行。');
    const key=`${state.roundId}:${state.revision}`;
    if (!rollback&&state.lastMove&&seen!==key) {
      seen=key; animateMove(state.lastMove);
      const move=state.lastMove;
      message(move.lines?`消除 ${move.lines} 条线${move.combo>1?` · ${move.combo} 连击`:''}，+${move.gain} 分！`:`+${move.gain} 分${move.refilled?(optimistic?' · 新方块准备中…':' · 新方块已送达'):' · 继续拼满一行或一列'}`);
    }
    else if(!optimistic&&!rollback&&state.lastMove?.refilled)message(`+${state.lastMove.gain} 分 · 新方块已送达`);
    if (state.state==='finished') {
      message(state.result.reason==='steps'?'30 步挑战完成，奖励已到账。':'没有可用落点了，已按得分结算。');
      resultTimer=setTimeout(showResult,reduced.matches?120:900);
    } else if(state.state==='settling')message('挑战完成，正在确认奖励…');
  }
  function showResult() {
    if (state.state!=='finished'||!state.result) return;
    if (paused||document.hidden) return;
    $('result-score').textContent=state.score.toLocaleString('zh-CN'); $('result-lines').textContent=`消除 ${state.lines} 条线`; $('result-combo').textContent=`最高 ×${state.maxCombo} 连击`;
    text('result-reason',state.result.reason==='steps'?'30 次放置已用完，本局自动结算。':state.result.reason==='abandoned'?'本局已放弃，奖励为 0。':'所有剩余方块都无处可放，已按得分结算。');
    text('result-amount',`${state.result.amount} 积分`);
    text('result-net',`入场 ${state.result.cost} · 净收益 ${state.result.net>0?'+':''}${state.result.net} 积分`);
    paymentControls();
    $('result-eyebrow').textContent=roundBest>previousBest?'NEW PERSONAL BEST':'NICE FLOW';
    if (!$('result-dialog').open) {$('result-dialog').showModal();playSound('finish');}
  }
  function effectNode(className,style,keyframes,options) {
    // A bounded pool survives consecutive clears; animations restart without layout reads.
    const index=activeEffects.length;
    const item=effectPool[index]||(effectPool[index]={node:document.createElement('i')});
    item.node.className=className;item.node.style.cssText='';
    Object.assign(item.node.style,style);
    item.animation=item.node.animate(keyframes,{fill:'both',easing:'ease-out',...options});
    activeEffects.push(item);
    return item.node;
  }
  function animateMove(move) {
    scoreAnimation?.cancel();gainAnimation?.cancel();
    if(paused||document.hidden)return;
    text('score-gain',`+${move.gain}`);
    if(!reduced.matches) {
      scoreAnimation=$('score').animate([
        {transform:'translateY(0)'},{color:'#b6f7ff',transform:'translateY(-2px)',offset:.4},{transform:'translateY(0)'}
      ],{duration:260,easing:'ease-out'});
      gainAnimation=$('score-gain').animate([
        {opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)',offset:.2},
        {opacity:1,transform:'translateY(0)',offset:.65},{opacity:0,transform:'translateY(-7px)'}
      ],{duration:700,easing:'ease-out'});
    }
    placedCells.forEach(i=>cells[i].classList.remove('just-placed')); placedCells.clear();
    move.placed.forEach(i=>{if(state.board[i]){cells[i].classList.add('just-placed');placedCells.add(i);}});
    if (!move.lines) {playSound('place');return;}
    playSound('clear',move.combo); clearEffects();
    const tier=move.combo>1?3:move.lines>1?2:1;
    $('callout').innerHTML=`<small>${move.combo>1?'连续消除 · 能量连锁':move.lines>1?'多线消除 · 星轨爆破':'星轨点亮'}</small><strong>${move.combo>1?`COMBO ×${move.combo}`:move.lines>1?`${move.lines} LINE BLAST`:'STAR CLEAR'}</strong><span>+${move.gain}</span>`;
    $('callout').dataset.tier=tier;
    $('callout').classList.add('active'); calloutTimer=setTimeout(()=>{calloutAnimation?.cancel();$('callout').classList.remove('active');},1000);
    if (!reduced.matches) {
      // Explicitly restart rapid consecutive callouts without forcing a layout flush.
      calloutAnimation=$('callout').animate([
        {opacity:0,transform:'translate(-50%,-35%) scale(.65) rotate(-7deg)'},
        {opacity:1,transform:'translate(-50%,-50%) scale(1.06) rotate(1deg)',offset:.16},
        {opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)',offset:.28},
        {opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)',offset:.65},
        {opacity:0,transform:'translate(-50%,-75%) scale(.97)'}
      ],{duration:1000,fill:'both',easing:'ease-out'});
      // One stable board measurement, instead of reading every animated cell after painting.
      const grid=readGrid(),fragment=document.createDocumentFragment();
      const rect=index=>({left:grid.left-grid.bounds.left+index%8*grid.pitch,
        top:grid.top-grid.bounds.top+Math.floor(index/8)*grid.pitch,width:grid.cell,height:grid.cell});
      // Only transient composited layers move. The board and its hit boxes stay fixed.
      $('effects').dataset.tier=tier;
      const sparkBudget=Math.min(tier===1?12:24,move.cleared.length*2);
      move.cleared.forEach((index,j)=>{
        const r=rect(index),delay=(index%8+Math.floor(index/8))*6;
        const tile=effectNode(`tile clear-tile color-${move.colors[j]}`,
          {left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`},
          [{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(1.1)',offset:.2},
           {opacity:0,transform:'scale(.16) rotate(12deg)'}],{duration:390,delay});
        fragment.append(tile);
        const sparks=Math.floor((j+1)*sparkBudget/move.cleared.length)-Math.floor(j*sparkBudget/move.cleared.length);
        for(let k=0;k<sparks;k++) {
          const angle=index*1.7+k*2.1,distance=34+tier*16,star=(j+k)%3===0;
          fragment.append(effectNode(`spark${star?' fx-star':''} color-${move.colors[j]}`,{
            left:`${r.left+r.width/2}px`,top:`${r.top+r.height/2}px`,width:star?'10px':'4px',height:star?'10px':'4px'
          },[{opacity:1,transform:'translate(0,0) scale(1) rotate(0)'},
            {opacity:0,transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) scale(.15) rotate(130deg)`}],{duration:620,delay:delay+60}));
        }
      });
      for(const [kind,lines] of [['row',move.rows],['col',move.cols]]) for(const index of lines) {
        const r=rect(kind==='row'?index*8:index),horizontal=kind==='row',length=grid.pitch*8-(grid.pitch-grid.cell);
        const axis=horizontal?'X':'Y';
        fragment.append(effectNode(`clear-beam ${horizontal?'horizontal':'vertical'}`,
          {left:`${horizontal?r.left:r.left+r.width/2-2}px`,top:`${horizontal?r.top+r.height/2-2:r.top}px`,
           width:`${horizontal?length:4}px`,height:`${horizontal?4:length}px`},
          [{opacity:0,transform:`scale${axis}(0)`},
           {opacity:1,transform:'scale(1)',offset:.22},{opacity:.8,transform:'scale(1)',offset:.42},{opacity:0,transform:'scale(1)'}],{duration:660}));
        const surge=grid.cell*1.6;
        fragment.append(effectNode(`clear-surge ${horizontal?'horizontal':'vertical'}`,
          {left:`${horizontal?r.left:r.left+r.width/2-surge/2}px`,top:`${horizontal?r.top+r.height/2-surge/2:r.top}px`,width:`${surge}px`,height:`${surge}px`},
          [{opacity:0,transform:`translate${axis}(-${surge/2}px) scale(.5)`},{opacity:1,offset:.18},
           {opacity:0,transform:`translate${axis}(${length-surge/2}px) scale(1.25)`}],{duration:540,delay:40}));
      }
      // A single impact centre, plus at most two rings and eight rays, even for a full-board clear.
      const positions=move.cleared.map(rect),cx=positions.reduce((sum,r)=>sum+r.left+r.width/2,0)/positions.length,
        cy=positions.reduce((sum,r)=>sum+r.top+r.height/2,0)/positions.length,size=Math.min(grid.cell*(tier===1?4:6),240);
      fragment.append(effectNode('clear-aura',{left:`${cx-size/2}px`,top:`${cy-size/2}px`,width:`${size}px`,height:`${size}px`},
        [{opacity:0,transform:'scale(.35)'},{opacity:tier===1?.5:.75,transform:'scale(.8)',offset:.2},{opacity:0,transform:'scale(1.65)'}],{duration:700}));
      for(let i=0;i<(tier===1?1:2);i++)fragment.append(effectNode('impact-ring',
        {left:`${cx-size/2}px`,top:`${cy-size/2}px`,width:`${size}px`,height:`${size}px`},
        [{opacity:0,transform:'scale(.12)'},{opacity:.8,transform:'scale(.4)',offset:.15},{opacity:0,transform:'scale(1.6)'}],{duration:700,delay:i*100}));
      if(tier>1)for(let i=0;i<(tier===2?6:8);i++){
        const angle=i*Math.PI*2/(tier===2?6:8)+.22,dx=Math.cos(angle),dy=Math.sin(angle);
        fragment.append(effectNode('impact-ray',{left:`${cx}px`,top:`${cy}px`,width:`${20+tier*7}px`,height:'2px'},
          [{opacity:0,transform:`translate(${dx*12}px,${dy*12}px) rotate(${angle}rad) scaleX(.2)`},
           {opacity:.9,offset:.2},{opacity:0,transform:`translate(${dx*size*.65}px,${dy*size*.65}px) rotate(${angle}rad) scaleX(.15)`}],{duration:620,delay:80}));
      }
      $('effects').append(fragment);
    }
    $('board-frame').classList.add(tier>1?'combo-flash':'clearing');
    effectTimer=setTimeout(()=>{
      activeEffects.forEach(item=>item.animation?.cancel());activeEffects.length=0;
      $('effects').replaceChildren();$('board-frame').classList.remove('clearing','combo-flash');
    },reduced.matches?100:920);
  }
  function clearPreview() {
    previewKey='';previewTarget=null;
    if(!$('placement-outline').hidden)$('placement-outline').hidden=true;
    $('line-preview').hidden=true;
    visibleRails.forEach(i=>lineRails[i].hidden=true);visibleRails.clear();
  }
  function preparePreview(piece,grid) {
    const key=`${piece.name}:${piece.color}`;
    if(outlinePieceKey!==key) {
      const markup=pieceMarkup(piece);
      $('placement-outline').innerHTML=markup;$('drag-piece').innerHTML=markup;
      outlinePieceKey=key;previewSizingKey='';
      shapeRows=Array(piece.rows).fill(0);shapeCols=Array(piece.cols).fill(0);
      piece.cells.forEach(([r,c])=>{shapeRows[r]++;shapeCols[c]++;});
    }
    sizePreview(grid);
  }
  function sizePreview(grid) {
    const gap=grid.pitch-grid.cell,left=grid.left-grid.bounds.left,top=grid.top-grid.bounds.top;
    const key=`${grid.cell}:${gap}:${left}:${top}`;
    if(previewSizingKey===key)return;
    previewSizingKey=key;
    for(const node of [$('placement-outline'),$('drag-piece')]) {
      node.style.setProperty('--gap',`${gap}px`);
      node.firstElementChild.style.setProperty('--mini',`${grid.cell}px`);
    }
    Object.assign($('line-preview').style,{left:`${left}px`,top:`${top}px`,
      width:`${grid.pitch*8-gap}px`,height:`${grid.pitch*8-gap}px`,gap:`${gap}px`});
  }
  function preview(row,col,inside=true) {
    const key=`${state?.revision}:${selected}:${row}:${col}:${inside}`;
    if(previewKey===key)return previewValid;
    previewKey=key;
    const piece=state?.tray[selected];if(!piece||state.state!=='playing'){clearPreview();return false;}
    const grid=drag?.grid||(previewGrid??=readGrid()),outline=$('placement-outline');
    sizePreview(grid);
    previewValid=inside&&blockFits(state.board,piece,row,col);
    const mode=`placement-outline${previewValid?' valid':''}${drag?'':' pointed'}`;
    if(outlineMode!==mode){outline.className=mode;outlineMode=mode;}
    outline.style.transform=`translate3d(${grid.left+col*grid.pitch}px,${grid.top+row*grid.pitch}px,0)`;
    if(outline.hidden)outline.hidden=false;
    previewTarget={row,col};
    // Count only the rows/columns touched by this piece; no cloned board or full scan.
    const nextRails=new Set();
    if(previewValid) {
      shapeRows.forEach((count,r)=>{if(count&&rowCounts[row+r]+count===8)nextRails.add(row+r);});
      shapeCols.forEach((count,c)=>{if(count&&colCounts[col+c]+count===8)nextRails.add(8+col+c);});
    }
    visibleRails.forEach(i=>{if(!nextRails.has(i)){lineRails[i].hidden=true;visibleRails.delete(i);}});
    nextRails.forEach(i=>{if(!visibleRails.has(i)){lineRails[i].hidden=false;visibleRails.add(i);}});
    const hideRails=visibleRails.size===0;
    if($('line-preview').hidden!==hideRails)$('line-preview').hidden=hideRails;
    return previewValid;
  }
  function previewCell(row,col) {
    const piece=state?.tray[selected];if(!piece)return false;
    const target=blockCellTarget(piece,row,col);
    return preview(target.row,target.col);
  }
  function choose(slot,keyboard=false) {
    if(!state||pending||restartQueued||paused||state.state!=='playing'||!state.tray[slot]?.fits)return;
    cancelInput();
    // Read stable geometry before selection styling or sprite preparation can dirty layout.
    previewGrid=drag?.grid||readGrid();
    unlockAudio();selected=slot;playSound('select');clearPreview();
    preparePreview(state.tray[slot],previewGrid);
    renderTray();
    message(drag?.moving?'松手放到亮起的格子。':'点击目标格，与方块上的亮点对齐。');
    if(keyboard){const anchor=blockPlacementAnchor(state.tray[slot]);focusCell(anchor.row*8+anchor.col);previewCell(anchor.row,anchor.col);}
  }
  function placeAt(row,col,inside=true) {
    if(pending||restartQueued||paused||state?.state!=='playing'||selected===null)return;
    cancelInput();
    if(!inside||!blockInBounds(state.tray[selected],row,col)) {
      clearPreview();message('没有放置：请把整个方块移入棋盘。');return;
    }
    if(!blockFits(state.board,state.tray[selected],row,col)){clearPreview();message('这里放不下，换个空位再试。');return;}
    clearPreview();commitPlacement(selected,row,col);
  }
  function focusCell(index){cells.forEach((cell,i)=>cell.tabIndex=i===index?0:-1);cells[index].focus({preventScroll:true});}
  $('tray').addEventListener('click',event=>{
    const button=event.target.closest('[data-slot]');
    const syntheticDragClick=suppressClick===button&&event.detail!==0;
    suppressClick=null;clearTimeout(suppressTimer);
    if(!syntheticDragClick&&button&&(selected!==Number(button.dataset.slot)||event.detail===0))choose(Number(button.dataset.slot),event.detail===0);
  });
  $('board').addEventListener('click',event=>{
    const cell=event.target.closest('[data-index]');if(!cell)return;
    if(state?.state==='finished'){message('本局已结束，可以重新开始挑战。');return;}
    unlockAudio();if(selected===null){message('先选下方的一个方块。');return;}
    const index=Number(cell.dataset.index),target=blockCellTarget(state.tray[selected],Math.floor(index/8),index%8);
    focusCell(index);placeAt(target.row,target.col);
  });
  $('board').addEventListener('pointermove',event=>{
    if(drag||selected===null||event.pointerType!=='mouse')return;
    const cell=event.target.closest('[data-index]');if(cell){const i=Number(cell.dataset.index);queueInput({row:Math.floor(i/8),col:i%8});}
  });
  $('board').addEventListener('pointerleave',()=>{if(!drag){cancelInput();clearPreview();}});
  $('board').addEventListener('keydown',event=>{
    const index=Number(event.target.dataset.index);if(!Number.isInteger(index))return;
    let row=Math.floor(index/8),col=index%8;
    if(event.key==='ArrowLeft')col=Math.max(0,col-1);else if(event.key==='ArrowRight')col=Math.min(7,col+1);else if(event.key==='ArrowUp')row=Math.max(0,row-1);else if(event.key==='ArrowDown')row=Math.min(7,row+1);else if(event.key==='Escape'){endDrag();selected=null;render();message('已取消选择。');return;}else return;
    event.preventDefault();cancelInput();focusCell(row*8+col);previewCell(row,col);
  });
  function cancelInput() {if(inputFrame)cancelAnimationFrame(inputFrame);inputFrame=0;queuedInput=null;}
  function queueInput(input) {
    queuedInput=input;
    if(!inputFrame)inputFrame=requestAnimationFrame(flushInput);
  }
  function flushInput() {
    inputFrame=0;const input=queuedInput;queuedInput=null;
    if(!input||paused||pending)return;
    if(input.pointer) {
      if(!drag?.moving)return;
      const target=dragTarget(input);
      const ghost=$('drag-piece');
      // The held sprite is prepared at pickup. Frames only translate it and its footprint.
      ghost.style.transform=`translate3d(${target.x}px,${target.y}px,0)`;
      if(ghost.hidden)ghost.hidden=false;
      preview(target.row,target.col,target.inside);
    } else if(!drag) previewCell(input.row,input.col);
  }
  function endDrag() {
    cancelInput();
    drag?.button.classList.remove('is-dragging');
    if(drag?.button.hasPointerCapture(drag.id))drag.button.releasePointerCapture(drag.id);
    drag=null;$('drag-piece').hidden=true;clearPreview();
  }
  function readGrid() {
    // Measure the stable grid, not a cell that may still be scaling in its placement animation.
    const board=$('board'),bounds=board.getBoundingClientRect(),style=getComputedStyle(board);
    const px=name=>parseFloat(style[name])||0,gap=px('columnGap');
    const cell=(bounds.width-px('borderLeftWidth')-px('borderRightWidth')-px('paddingLeft')-px('paddingRight')-7*gap)/8;
    return {left:bounds.left+px('borderLeftWidth')+px('paddingLeft'),top:bounds.top+px('borderTopWidth')+px('paddingTop'),pitch:cell+gap,cell,bounds};
  }
  function dragTarget(event,fresh=false) {
    // Cache for movement; release always measures again so scroll/resize cannot commit a stale target.
    if(fresh||!drag.grid){
      const next=readGrid();
      if(!drag.grid||next.left!==drag.grid.left||next.top!==drag.grid.top||next.pitch!==drag.grid.pitch)drag.lastTarget=null;
      drag.grid=next;
    }
    const grid=drag.grid;
    const target=blockPointerTarget(state.tray[drag.slot],{x:event.clientX,y:event.clientY},
      {x:drag.gripX,y:drag.gripY,touch:drag.touch},grid,drag.lastTarget);
    drag.lastTarget=target;
    return {...target,cell:grid.cell,gap:grid.pitch-grid.cell};
  }
  $('tray').addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-slot]');if(drag||!button||button.disabled||event.button!==0||pending||restartQueued||paused)return;
    suppressClick=null;clearTimeout(suppressTimer);
    const slot=Number(button.dataset.slot),piece=state.tray[slot];
    slotAnimations[slot]?.cancel();
    const rect=button.querySelector('.piece-grid').getBoundingClientRect(),grid=readGrid();
    if(!piece?.fits)return;
    drag={id:event.pointerId,button,slot,grid,startX:event.clientX,startY:event.clientY,moving:false,touch:event.pointerType!=='mouse',
      gripX:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),gripY:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)),miniWidth:rect.width,miniHeight:rect.height};
    button.setPointerCapture(event.pointerId);
    choose(slot);
  });
  $('tray').addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!drag.moving&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<(drag.touch?5:3))return;
    if(!drag.moving){
      drag.moving=true;
      // Old celebration layers yield immediately when the next gesture starts.
      clearEffects();scoreAnimation?.cancel();gainAnimation?.cancel();
      placedCells.forEach(i=>cells[i].classList.remove('just-placed'));placedCells.clear();
      drag.button.classList.add('is-dragging');message('松手放到亮起的格子。');
    }
    event.preventDefault();
    drag.lastPoint={pointer:true,clientX:event.clientX,clientY:event.clientY};
    queueInput(drag.lastPoint);
  });
  $('tray').addEventListener('pointerup',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const moving=drag.moving,button=drag.button,target=moving?dragTarget(event,true):null;
    endDrag();
    if(moving){suppressClick=button;suppressTimer=setTimeout(()=>suppressClick=null,250);placeAt(target.row,target.col,target.inside);}
  });
  $('tray').addEventListener('pointercancel',event=>{if(drag?.id===event.pointerId)endDrag();});
  window.addEventListener('blur',endDrag);window.addEventListener('resize',()=>{previewGrid=null;endDrag();});
  window.addEventListener('scroll',()=>{
    previewGrid=null;previewKey='';
    if(drag){drag.grid=null;drag.lastTarget=null;if(drag.lastPoint)queueInput(drag.lastPoint);}
    else if(previewTarget&&state?.tray[selected]) {
      const anchor=blockPlacementAnchor(state.tray[selected]);
      previewKey='';queueInput({row:previewTarget.row+anchor.row,col:previewTarget.col+anchor.col});
    }
  },true);
  function restart() {unlockAudio();document.querySelectorAll('dialog[open]').forEach(d=>d.close());stopEffects();endDrag();selected=null;
    if(placements.length){restartQueued=true;message('正在开启新一局…');return;}
    send(state?.state==='idle'?'blocks-start':'blocks-restart');
  }
  $('start').onclick=()=>{if(state?.state==='idle'&&!pending)restart();};
  function openPanel(id) {
    endDrag();clearTimeout(resultTimer);
    document.querySelectorAll('dialog[open]').forEach(d=>{if(d.id!==id)d.close();});
    if(!$(id).open)$(id).showModal();
  }
  $('restart').onclick=()=>{unlockAudio();if(state?.state==='playing')openPanel('restart-dialog');else restart();};
  $('confirm-restart').onclick=restart;$('play-again').onclick=restart;
  $('review-board').onclick=()=>$('result-dialog').close();
  $('help').onclick=()=>openPanel('rules-dialog');
  $('menu-open').onclick=()=>openPanel('settings-dialog');
  $('stats-open').onclick=()=>openPanel('stats-dialog');
  $('round-open').onclick=()=>state?.state==='idle'?openPanel('entry-panel'):showResult();
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
  $('back').onclick=()=>{endDrag();if(embedded)window.parent.postMessage({type:'game-return'},location.origin);else location.href='./#games';};
  $('return').onclick=()=>$('back').onclick();
  document.querySelector('.wordmark').onclick=event=>{event.preventDefault();$('back').click();};
  $('sound').onclick=()=>{soundEnabled=!soundEnabled;try{localStorage.setItem('playroom.blocks.sound.v1',soundEnabled?'on':'off');}catch{}soundButton();if(soundEnabled){unlockAudio();playSound('select');}else if(master)master.gain.setTargetAtTime(0,audioContext.currentTime,.02);if(soundEnabled&&master)master.gain.setTargetAtTime(.32,audioContext.currentTime,.02);};
  function setPaused(value){paused=value;document.body.classList.toggle('motion-paused',paused);if(paused){endDrag();stopEffects();if(audioContext?.state==='running')audioContext.suspend().catch(()=>{});}else if(state?.state==='finished')showResult();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){endDrag();stopEffects();if(audioContext?.state==='running')audioContext.suspend().catch(()=>{});}else if(!paused&&state?.state==='finished')showResult();});
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='blocks-state')receive(event.data);
    else if(event.data.type==='blocks-error'){rejected=!!inFlight;pending=rejected;message(event.data.message,true);}
    else if(event.data.type==='platform-pause')setPaused(!!event.data.paused);
  });
  soundButton();$('best').textContent=best.toLocaleString('zh-CN');
  if(embedded)window.parent.postMessage({type:'blocks-ready'},location.origin);else receive(local.snapshot(localWallet.points));
})();
