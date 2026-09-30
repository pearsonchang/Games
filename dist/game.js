'use strict';
const $=id=>document.getElementById(id),game=document.querySelector('.game');
const ROWS=9,COLS=6,COUNT=54,MINE_COUNT=10;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const mineFX=new MineEffects(game,$('board'),reducedMotion);
let paused=false,roundCounter=0,roundId='',renderSnapshot=[],motionOrigin=0;
let state='tutorial',step=0,board=[],started=false,mode='reveal',seconds=0,reward=0,claimed=false,tutorialFlag=false,toastTimeout;
let resultTimer=0,pendingResult=null,lastInteraction=Date.now();
function animateNode(node,frames,options={}){return mineFX.play(node,frames,options);}
function clearEffects(){mineFX.clear();}
function platformEvent(type,extra={}){if(window.parent!==window)window.parent.postMessage({type,roundId,...extra},location.origin);}
function cancelResult(){clearTimeout(resultTimer);resultTimer=0;pendingResult=null;}
function flushResult(){if(!pendingResult||paused||document.hidden)return;const show=pendingResult;cancelResult();show();}
function presentResult(show,delay){cancelResult();const id=roundId;pendingResult=()=>{if(roundId===id)show();};if(reducedMotion?.matches)flushResult();else resultTimer=setTimeout(flushResult,delay);}
function setPaused(value){paused=value;game.classList.toggle('motion-paused',value);if(value){mineAudio.leave();clearEffects();clearTimeout(resultTimer);resultTimer=0;}else flushResult();}
function returnToLobby(){mineAudio.leave();if(window.parent!==window){setPaused(true);platformEvent('game-return');}else location.href='./';}
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='platform-pause')setPaused(!!e.data.paused);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){mineAudio.stop();clearEffects();clearTimeout(resultTimer);resultTimer=0;}else flushResult();});
// Coin color is decoration based only on position, never adjacent mines.
function coinType(i){return i%3===1?'green':'gold';}
function art(type,i){return `<span class="art art-${type}" aria-hidden="true" style="--coin-delay:${(i%11)*.61}s">${type==='gold'||type==='green'?'<span class="coin-value">✦</span>':''}</span>`;}
function clearIdleHint(){document.querySelectorAll('.idle-hint').forEach(n=>n.classList.remove('idle-hint'));}
function resetIdle(){lastInteraction=Date.now();clearIdleHint();}
function updateIdle(){if(paused||document.hidden||reducedMotion?.matches||$('dialog').open||state!=='playing'||started||mode!=='reveal'||Date.now()-lastInteraction<3000)return;const index=board.findIndex((c,i)=>i>=14&&!c.flagged);if(index>=0)$('board').children[index]?.classList.add('idle-hint');}
game.addEventListener('pointerdown',()=>{resetIdle();mineAudio.unlock();});
game.addEventListener('keydown',()=>{resetIdle();mineAudio.unlock();});
$('mine-sound').onclick=()=>{const on=mineAudio.toggle();$('mine-sound').setAttribute('aria-pressed',on);$('mine-sound').setAttribute('aria-label',on?'关闭音效':'开启音效');$('mine-sound').textContent=on?'♪':'♩';};
function resetPresentation(){cancelResult();clearEffects();resetIdle();renderSnapshot=[];game.classList.remove('is-lost','is-won','can-claim');$('round-status').textContent='';$('progress-fill').style.width='0%';}
function tutorial(){
 resetPresentation();mineAudio.stop();state='tutorial';step=0;tutorialFlag=false;game.classList.remove('playing');game.classList.add('is-waiting');
 $('stats').hidden=true;$('exploration').hidden=true;$('modes').hidden=true;$('notice').hidden=true;
 $('board-label').textContent='教程演示';$('title').textContent='每一格，都是新选择';$('description').textContent='54 格藏着 10 颗雷。逐格揭开，第一格也可能踩雷。';$('primary').textContent='下一步';$('secondary').textContent='跳过教程';renderTutorial();
}
function renderTutorial(){
 const revealed={3:'gold',8:'bomb',9:'gold',13:'green',14:'gold',19:'green',25:'green',28:'green',29:'gold'};
 $('board').innerHTML=Array.from({length:COUNT},(_,i)=>`<button class="cell${revealed[i]?' is-open':''}${i===8&&tutorialFlag?' is-flagged':''}" data-i="${i}" aria-label="第 ${Math.floor(i/6)+1} 行，第 ${i%6+1} 列，${i===8?'教程地雷':revealed[i]?'教程已揭开':'未揭开'}">${art(revealed[i]||'cube',i)}${i===8&&tutorialFlag?'<span class="flagMark" aria-hidden="true">⚑</span>':''}</button>`).join('');
 if(tutorialFlag)mineFX.flag($('board').children[8]);
}
function setMode(m){mode=m;clearIdleHint();for(const x of ['flag','reveal']){$(x).classList.toggle('active',x===m);$(x).setAttribute('aria-pressed',String(x===m));}if(state==='playing')$('board-label').textContent=m==='flag'?'插旗模式 · 再点一次取消':'揭开模式';}
function start(){
 mineAudio.stop();resetPresentation();paused=false;game.classList.remove('motion-paused');game.classList.add('playing','is-waiting');
 roundId=String(++roundCounter);state='playing';started=false;seconds=0;reward=0;claimed=false;board=Array.from({length:COUNT},()=>({mine:false,revealed:false,flagged:false}));seed();
 $('stats').hidden=false;$('exploration').hidden=false;$('modes').hidden=false;$('notice').hidden=false;
 $('title').textContent='发现下一枚金币';$('description').textContent='每次揭开一格。没有数字提示，第一格也可能踩雷。';
 $('primary').textContent='新的一局';$('secondary').textContent='玩法说明';$('notice').textContent='本局得分待通关领取 · 踩雷归零';
 setMode('reveal');$('dialog').close();render();
}
function seed(){
 const pool=Array.from({length:COUNT},(_,i)=>i);
 for(let n=0;n<MINE_COUNT;n++){const j=n+Math.floor(Math.random()*(pool.length-n));[pool[n],pool[j]]=[pool[j],pool[n]];board[pool[n]].mine=true;}
}
function render(){
 const root=$('board'),fresh=renderSnapshot.length!==COUNT;let flags=0,coins=0;const newReveals=[];
 if(fresh){root.replaceChildren();for(let i=0;i<COUNT;i++){const button=document.createElement('button');button.className='cell';button.dataset.i=i;root.append(button);}}
 board.forEach((c,i)=>{
  if(c.flagged)flags++;if(c.revealed&&!c.mine)coins++;
  const key=c.revealed?`open:${c.mine}`:`closed:${c.flagged}`,changed=renderSnapshot[i]!==key,node=root.children[i];node.disabled=state!=='playing';
  node.classList.toggle('is-open',c.revealed);node.classList.toggle('is-flagged',c.flagged&&!c.revealed);node.classList.toggle('detonated',state==='lost'&&i===motionOrigin);
  if(changed){
   const type=c.revealed?(c.mine?'bomb':coinType(i)):'cube';
   node.innerHTML=art(type,i)+(c.flagged&&!c.revealed?'<span class="flagMark" aria-hidden="true">⚑</span>':'');
   node.setAttribute('aria-label',`第 ${Math.floor(i/6)+1} 行，第 ${i%6+1} 列，${c.revealed?(c.mine?'地雷':'安全金币'):c.flagged?'已插旗':'未揭开'}`);
   if(fresh)animateNode(node,[{transform:'translateY(5px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:220,delay:Math.floor(i/6)*15+i%6*5});
   else if(c.revealed&&!c.mine)newReveals.push(i);
   else if(c.flagged)mineFX.flag(node);
  }
  renderSnapshot[i]=key;
 });
 $('mines').textContent=MINE_COUNT-flags;$('coins').textContent=state==='lost'?0:coins*10;$('opened').textContent=coins;$('progress-fill').style.width=coins/(COUNT-MINE_COUNT)*100+'%';updateTimer();
 if(newReveals.length){mineFX.reveal(newReveals,motionOrigin);$('round-status').textContent=`揭开 ${newReveals.length} 格，本局得分 ${coins*10}`;}
}
function updateTimer(){$('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function act(i,flag=false){
 if(state!=='playing'||paused||!Number.isInteger(i)||i<0||i>=COUNT)return;const c=board[i];if(c.revealed)return;motionOrigin=i;
 if(flag){if(!c.flagged&&board.filter(x=>x.flagged).length>=MINE_COUNT){toast('10 面旗帜已用完，请先取消一处标记。');return;}c.flagged=!c.flagged;mineAudio.flag();render();return;}
 if(c.flagged)return;if(!started){started=true;clearIdleHint();game.classList.remove('is-waiting');}
 if(c.mine){
  // Settle immediately. Only presentation waits for the local blast to finish.
  clearEffects();mineAudio.lose();c.revealed=true;state='lost';reward=0;game.classList.add('is-lost');platformEvent('game-finished',{won:false,seconds});
  board.forEach(cell=>{if(cell.mine)cell.revealed=true;});render();$('title').textContent='踩到地雷了';$('description').textContent='本局得分已归零，再来一次。';$('round-status').textContent='踩到地雷，本局得分已归零';mineFX.explode($('board').children[i]);
  presentResult(()=>{showDialog('差一点点，再试一次','本局踩到了地雷，得分已归零。\n每局固定 10 颗雷，第一格也可能踩雷。',[['再玩一局',start],['查看棋盘',()=>{}],['返回大厅',returnToLobby]]);mineFX.dialog(false);},680);return;
 }
 mineAudio.reveal(coinType(i)==='green');c.revealed=true;
 const won=board.every(cell=>cell.mine||cell.revealed);
 if(won){state='won';reward=440;game.classList.add('is-won','can-claim');platformEvent('game-finished',{won:true,seconds});$('title').textContent='全部安全格，已揭开';$('description').textContent='440 积分等待领取。';$('primary').textContent='领取 440 积分';}
 render();
 if(won){mineAudio.win();mineFX.win();$('round-status').textContent='成功通关，可以领取 440 模拟积分';presentResult(()=>{showDialog('漂亮的一局','已揭开全部 44 个安全方块。\n你的通关奖励：440 模拟积分。',[['领取模拟积分',claim],['查看棋盘',()=>{}]]);mineFX.dialog(true);},850);}
}
function claim(){if(state!=='won'||claimed)return;cancelResult();claimed=true;game.classList.remove('can-claim');mineAudio.win();platformEvent('game-reward');showDialog('积分已领取','本局已领取 440 模拟积分。\n可在大厅的「奖励」中查看。',[['再玩一局',start],['返回大厅',returnToLobby]]);$('primary').textContent='新的一局';$('notice').textContent='440 模拟积分已领取';mineFX.dialog(true);}
function showDialog(title,body,actions){cancelResult();clearEffects();$('dialogTitle').textContent=title;$('dialogText').textContent=body;$('dialogActions').replaceChildren();actions.forEach(([label,fn])=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('dialog').close();fn();};$('dialogActions').append(b);});if(!$('dialog').open)$('dialog').showModal();}
function toast(text){clearTimeout(toastTimeout);$('toast').textContent=text;$('toast').classList.add('show');toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2400);}
function newRound(){if(state==='playing'&&started)showDialog('开始新的一局？','当前棋盘将重置。',[['新的一局',start],['继续游戏',()=>{}]]);else start();}
$('board').onclick=e=>{const b=e.target.closest('[data-i]');if(!b)return;const i=Number(b.dataset.i);if(state==='tutorial'){if(i===8){tutorialFlag=!tutorialFlag;renderTutorial();toast(tutorialFlag?'旗帜是手动标记，不会探测地雷。':'已取消标记。');}else toast('金色和绿色金币都计 10 分，颜色不提供雷区线索。');return;}act(i,mode==='flag');};
$('board').oncontextmenu=e=>{const b=e.target.closest('[data-i]');if(b){e.preventDefault();act(Number(b.dataset.i),true);}};
$('primary').onclick=()=>{if(state==='tutorial'){if(step++===0){tutorialFlag=true;renderTutorial();$('title').textContent='找到金币，避开地雷';$('description').textContent='金币都计 10 分，颜色不提供线索。踩雷归零，揭开全部安全格即可通关。';$('primary').textContent='开始游戏';}else start();}else if(state==='won'&&!claimed)claim();else newRound();};
$('secondary').onclick=()=>{if(state==='tutorial')start();else showDialog('玩法说明','54 格中固定藏着 10 颗雷，每局开始时随机生成，过程中不会移动。\n\n每次只揭开一格，没有数字提示或自动连开，第一格也可能踩雷。金色和绿色金币均计 10 分，颜色不提供雷区线索。旗帜仅供手动标记。\n\n免费开局。揭开全部 44 个安全格后可领取 440 模拟积分；踩雷则本局得分归零。',[['继续',()=>{}]]);};
$('reveal').onclick=()=>setMode('reveal');$('flag').onclick=()=>setMode('flag');$('dismiss').onclick=()=>$('dialog').close();
$('menu').onclick=()=>showDialog('游戏菜单','6 × 9 棋盘 · 10 颗地雷\n通关可领取 440 模拟积分，不涉及真实资产。',[['新的一局',newRound],['重新查看教程',tutorial],['继续',()=>{}]]);
$('close').onclick=returnToLobby;
setInterval(()=>{updateIdle();if(state==='playing'&&started&&!paused&&!document.hidden){seconds++;updateTimer();}},1000);
tutorial();
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'read_game',description:'Read visible game status without exposing hidden mines or adjacency clues.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({state,seconds,coins:state==='tutorial'||state==='lost'?0:board.filter(c=>c.revealed&&!c.mine).length*10,cells:board.map((c,i)=>({index:i,flagged:c.flagged,revealed:c.revealed,...(c.revealed?{mine:c.mine}:{})}))})});}catch{}}
