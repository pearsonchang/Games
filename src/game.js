'use strict';
const $=id=>document.getElementById(id),game=document.querySelector('.game');
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)'),mineFX=new MineEffects(game,$('board'),reducedMotion);
let model=null,paused=false,busy=false,mode='reveal',pendingResult=null,resultTimer=0,toastTimeout=0,lastInteraction=Date.now();
const embedded=window.parent!==window;
function points(n){return Number(n||0).toLocaleString('zh-CN',{maximumFractionDigits:2});}
function compact(n){if(n>=1e12)return (n/1e12).toFixed(2)+'万亿';if(n>=1e8)return (n/1e8).toFixed(2)+'亿';if(n>=1e5)return (n/1e4).toFixed(2)+'万';return points(n);}
function coinType(i){return i%3===1?'green':'gold';}
function art(type,i){return '<span class="art art-'+type+'" aria-hidden="true" style="--coin-delay:'+(i%11)*.61+'s">'+(['gold','green'].includes(type)?'<span class="coin-value">✦</span>':'')+'</span>';}
function cancelResult(){clearTimeout(resultTimer);resultTimer=0;pendingResult=null;}
function flushResult(){if(!pendingResult||paused||document.hidden)return;const show=pendingResult;cancelResult();show();}
function presentResult(show,delay){cancelResult();const id=model.roundId;pendingResult=()=>{if(model.roundId===id)show()};if(reducedMotion?.matches)flushResult();else resultTimer=setTimeout(flushResult,delay);}
function setPaused(value){paused=value;game.classList.toggle('motion-paused',value);if(value){mineAudio.leave();mineFX.clear();clearTimeout(resultTimer);resultTimer=0;}else flushResult();}
function resetIdle(){lastInteraction=Date.now();game.classList.remove('awaiting-pick');document.querySelectorAll('.idle-hint').forEach(n=>n.classList.remove('idle-hint'));}
function request(type,index){
 if(busy)return;resetIdle();busy=true;updateHUD();
 const data={type,roundId:model?.roundId||'',revision:model?.revision||0,...(index===undefined?{}:{index})};
 if(embedded){window.parent.postMessage(data,location.origin);return;}
 toast('请从游戏大厅进入。');
}
function receive(next){
 if(next.type!=='mines-state'||!Array.isArray(next.cells)||next.cells.length!==54)return;
 const old=model;model=next;busy=false;
 const changed=!old||old.revision!==next.revision||old.roundId!==next.roundId;
 if(changed){
  if(!old||old.roundId!==next.roundId){cancelResult();mineFX.clear();$('dialog').close();resetIdle();mode='reveal';}
  render(old);
 }
 updateHUD();
 if(!changed||!old||old.state!=='playing')return;
 if(next.state==='lost'){
  mineAudio.lose();mineFX.explode($('board').children[next.detonated]);$('round-status').textContent='踩到地雷，本局奖励归零。';
  presentResult(()=>{showDialog('踩到地雷了','本局奖励归零，已消耗 50 积分。\n每局雷区固定，第一格也可能踩雷。',[['再玩一局 · 50 积分',start],['查看棋盘',()=>{}],['返回大厅',returnToLobby]]);mineFX.dialog(false)},680);
 }else if(next.state==='collected'){
  mineAudio.win();mineFX.win();$('round-status').textContent='已收取 '+points(next.payout)+' 积分，已到账。';
  presentResult(()=>{showDialog(next.autoCollected?'全部揭开，已自动收取':'积分已收取','已到账 '+points(next.payout)+' 积分（含本局投入）。\n本局净收益 '+(next.payout>=50?'+':'')+points(next.payout-50)+' 积分。',[['再玩一局 · 50 积分',start],['查看棋盘',()=>{}],['返回大厅',returnToLobby]]);mineFX.dialog(true)},next.autoCollected?900:720);
 }else if(next.state==='forfeited'){toast('本局已结束，50 积分开局消耗不退还。');}
}
function render(old){
 const root=$('board'),fresh=!old||old.roundId!==model.roundId||root.children.length!==54;
 if(fresh){root.replaceChildren();for(let i=0;i<54;i++){const b=document.createElement('button');b.className='cell';b.dataset.i=i;root.append(b);}}
 const newReveals=[];
 model.cells.forEach((c,i)=>{
  const node=root.children[i],before=fresh?null:old.cells[i],changed=!before||c.revealed!==before.revealed||c.flagged!==before.flagged;
  node.classList.toggle('is-open',c.revealed);node.classList.toggle('is-flagged',c.flagged&&!c.revealed);node.classList.toggle('detonated',model.state==='lost'&&i===model.detonated);
  if(changed){node.innerHTML=art(c.revealed?(c.mine?'bomb':coinType(i)):'cube',i)+(c.flagged&&!c.revealed?'<span class="flagMark" aria-hidden="true">⚑</span>':'');node.setAttribute('aria-label','第 '+(Math.floor(i/6)+1)+' 行，第 '+(i%6+1)+' 列，'+(c.revealed?(c.mine?'地雷':'安全金币'):c.flagged?'已插旗':'未揭开'));
   if(!fresh&&c.revealed&&!c.mine)newReveals.push(i);else if(!fresh&&c.flagged&&!before.flagged){mineAudio.flag();mineFX.flag(node);}
  }
 });
 if(newReveals.length){const i=newReveals[0];mineAudio.reveal(coinType(i)==='green');mineFX.reveal(newReveals,i,points(Math.max(0,Math.round((model.payout-(old?.payout||0))*100)/100)));$('round-status').textContent='已揭开 '+model.opened+' 格，可收取 '+points(model.payout)+' 积分。';}
}
function updateHUD(){
 if(!model)return;const active=model.state==='playing',collectible=active&&model.opened>0;
 game.classList.toggle('is-lost',model.state==='lost');game.classList.toggle('is-won',model.state==='collected');game.classList.toggle('can-claim',collectible);game.classList.toggle('is-waiting',active&&model.opened===0);
 $('balance-value').textContent=compact(model.balance);$('balance-value').setAttribute('aria-label',points(model.balance)+' 积分');
 $('mines').textContent=10-model.cells.filter(c=>c.flagged).length;$('timer').textContent=String(Math.floor(model.seconds/60)).padStart(2,'0')+':'+String(model.seconds%60).padStart(2,'0');
 $('coins').textContent=compact(model.payout);$('coins').setAttribute('aria-label',points(model.payout)+' 积分，含本局投入');$('payout-label').textContent=model.state==='collected'?'本局已收取':'可收取 · 含投入';
 $('opened').textContent=model.opened;$('progress-fill').style.width=model.opened/44*100+'%';
 $('next-payout').textContent=model.nextPayout===null?'已全部揭开':compact(model.nextPayout)+' 积分';$('next-risk').textContent=model.nextRisk===null?'—':(model.nextRisk*100).toFixed(2)+'%';
 $('next-step').hidden=!active&&model.state!=='idle';
 $('title').textContent=model.state==='lost'?'踩到地雷了':model.state==='collected'?'奖励已到账':model.state==='forfeited'?'本局已结束':collectible?'宝藏已发现，随时收取':'揭开封印，发现宝藏';
 $('description').textContent=active?'逐格揭开，随时收取。第一格也可能踩雷。':model.state==='idle'?'每局 50 积分，成功揭开后可随时收取。':model.state==='collected'?'本局已收取 '+points(model.payout)+' 积分。':'本局奖励为 0，开局消耗 50 积分。';
 $('board-label').textContent=active?(mode==='flag'?'插旗模式 · 再点取消':'揭开模式'):'54 格 · 10 颗雷';
 for(const m of ['reveal','flag']){$(m).classList.toggle('active',mode===m);$(m).setAttribute('aria-pressed',String(mode===m));$(m).disabled=busy||!active;}
 for(const node of $('board').children)node.disabled=busy||!active;
 $('primary').disabled=busy||(active&&!collectible)||(!active&&model.balance<50);
 $('primary').textContent=busy?'处理中…':active?(collectible?'收取 '+compact(model.payout)+' 积分':'先揭开一格'):(model.balance<50?'积分不足 · 需 50 积分':(model.state==='idle'?'开始游戏':'再玩一局')+' · 50 积分');
 $('primary').setAttribute('aria-label',active&&collectible?'收取 '+points(model.payout)+' 积分':$('primary').textContent);
 $('round-end').hidden=!active;$('round-end').disabled=busy;
 $('notice').textContent=active?'收取金额含投入 · 踩雷奖励归零':'模拟积分 · 刷新后可恢复';
}
function start(){if(model?.state==='playing')return;cancelResult();mineFX.clear();mineAudio.stop();request('mines-start');}
function collect(){if(model?.state==='playing'&&model.opened>0)request('mines-collect');}
function returnToLobby(){mineAudio.leave();if(embedded){setPaused(true);window.parent.postMessage({type:'game-return'},location.origin)}else location.href='./';}
function showDialog(title,body,actions){cancelResult();mineFX.clear();$('dialogTitle').textContent=title;$('dialogText').textContent=body;$('dialogActions').replaceChildren();for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{$('dialog').close();fn()};$('dialogActions').append(b)}if(!$('dialog').open)$('dialog').showModal();}
function toast(text){clearTimeout(toastTimeout);$('toast').textContent=text;$('toast').classList.add('show');toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2400);}
function rules(){showDialog('玩法与奖励','每局消耗 50 模拟积分，54 格中固定随机放置 10 颗雷。没有数字提示或首次保护，每次只揭开一格。金币颜色和旗帜不提供雷区线索。\n\n成功揭开至少一格后可随时收取；收取金额包含本局投入。踩雷则本局奖励归零，50 积分开局消耗不退还。全部 44 个安全格揭开后自动收取。\n\n奖励按 97% 理论返还率计算，保留两位小数并向下取整，实际返还率略低。以收取或踩雷结束时，长期平均每局净消耗约 1.5 积分；主动放弃会增加损耗，短期结果会波动。\n\n返回大厅会保留当前局；刷新会恢复当前游客的积分和进度；清除浏览器数据或会话过期会重建体验。',[['知道了',()=>{}]]);}
$('board').onclick=e=>{const b=e.target.closest('[data-i]');if(!b||paused||!model||model.state!=='playing')return;request(mode==='flag'?'mines-flag':'mines-reveal',Number(b.dataset.i));};
$('board').oncontextmenu=e=>{const b=e.target.closest('[data-i]');if(b){e.preventDefault();if(model?.state==='playing'&&!paused)request('mines-flag',Number(b.dataset.i));}};
for(const m of ['reveal','flag'])$(m).onclick=()=>{mode=m;resetIdle();updateHUD();};
$('primary').onclick=()=>model?.state==='playing'?collect():start();$('secondary').onclick=rules;$('menu').onclick=rules;$('close').onclick=returnToLobby;$('dismiss').onclick=()=>$('dialog').close();
$('round-end').onclick=()=>{const actions=model.opened>0?[['收取并结束',collect],['放弃奖励，结束本局',()=>request('mines-forfeit')],['继续游戏',()=>{}]]:[['结束本局',()=>request('mines-forfeit')],['继续游戏',()=>{}]];showDialog('结束当前局？','开局已消耗 50 积分，不会退还。'+(model.opened>0?'\n当前可以收取 '+points(model.payout)+' 积分；放弃则归零。':''),actions);};
$('mine-sound').onclick=()=>{const on=mineAudio.toggle();$('mine-sound').setAttribute('aria-pressed',on);$('mine-sound').setAttribute('aria-label',on?'关闭音效':'开启音效');$('mine-sound').textContent=on?'♪':'♩';};
game.addEventListener('pointerdown',()=>{resetIdle();mineAudio.unlock()});game.addEventListener('keydown',()=>{resetIdle();mineAudio.unlock()});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent)return;const d=e.data;if(d?.type==='platform-offline'){busy=true;updateHUD();toast(d.message||'连接中断，请重新连接。')}else if(d?.type==='platform-pause')setPaused(!!d.paused);else if(d?.type==='mines-state')receive(d);else if(d?.type==='mines-error'){busy=false;updateHUD();toast(d.message)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){mineAudio.stop();mineFX.clear();clearTimeout(resultTimer);resultTimer=0;}else flushResult()});
setInterval(()=>{if(model?.state==='playing'&&model.opened===0&&!paused&&!document.hidden&&!reducedMotion?.matches&&!$('dialog').open&&Date.now()-lastInteraction>3000)game.classList.add('awaiting-pick')},1000);
request('mines-ready');
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'read_game',description:'Read only visible cash-out values and cells. No hidden mines or adjacency clues.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>model?{state:model.state,opened:model.opened,payout:model.payout,balance:model.balance,nextPayout:model.nextPayout,nextRisk:model.nextRisk,cells:model.cells}:{state:'loading'}})}catch{}}
