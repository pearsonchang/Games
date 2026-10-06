'use strict';
const $=id=>document.getElementById(id),embedded=window.parent!==window;
const audio=typeof SlotsAudio==='function'?new SlotsAudio():null,reduced=matchMedia('(prefers-reduced-motion: reduce)');
const wallet=embedded?null:new PointsWallet();
const round=embedded?null:new MatrixRound({charge:n=>wallet.charge(n,'星际矩阵 · 转动消耗'),credit:n=>wallet.credit(n,'星际矩阵 · 连线奖励')});
let model=null,pending=false,paused=false,seenRound='',seenResult='',shown=[null,null,null,null,null],history=[],guideIndex=0,guidePrize=null;
const points=n=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
const signed=n=>(n>0?'+':n<0?'−':'')+points(Math.abs(n));
const symbol=v=>'<svg class="symbol" viewBox="0 0 100 100" aria-hidden="true"><use href="slots-symbols.svg#'+MATRIX_SYMBOLS[v].id+'"></use></svg>';
function cell(v,c,r,decorative=false){
 return '<div class="matrix-cell'+(v===4?' is-wild':v===5?' is-bonus':'')+'" data-cell="'+c+'-'+r+'"'+(decorative?' aria-hidden="true"':' role="img" aria-label="第 '+(c+1)+' 列，第 '+(r+1)+' 行，'+MATRIX_SYMBOLS[v].name+'"')+'>'+symbol(v)+(v>=4?'<em aria-hidden="true">'+(v===4?'WILD':'BONUS')+'</em>':'')+'</div>';
}
function renderBoard(id,board){$(id).innerHTML=board.map((values,c)=>'<div class="matrix-column"><div class="matrix-strip">'+values.map((v,r)=>cell(v,c,r)).join('')+'</div></div>').join('');}
function pathMarkup(rows,count=5,preview=false){
 const coords=rows.slice(0,count).map((row,col)=>(50+col*100)+','+(50+row*100)).join(' ');
 return '<polyline class="path-under" points="'+coords+'"/><polyline class="path-front'+(preview?' path-preview':'')+'" points="'+coords+'"/>'+(preview?'':rows.slice(0,count).map((r,c)=>'<circle class="path-dot" cx="'+(50+c*100)+'" cy="'+(50+r*100)+'" r="3"/>').join(''));
}
function highlight(boardId,linesId,prize,lineId){
 const cells=$(boardId).querySelectorAll('.matrix-cell');cells.forEach(el=>el.classList.remove('hit','bonus-hit'));
 $(linesId).innerHTML='';
 if(lineId==='bonus'){
  for(const [c,r] of prize.bonus.cells)$(boardId).querySelector('[data-cell="'+c+'-'+r+'"]').classList.add('bonus-hit');return;
 }
 const line=MATRIX_LINES[lineId];if(!line)return;
 const win=prize?.lines.find(l=>l.lineId===lineId);
 $(linesId).innerHTML=pathMarkup(line.rows,win?.count||5,!win);
 if(win)for(const [c,r] of win.cells)$(boardId).querySelector('[data-cell="'+c+'-'+r+'"]').classList.add('hit');
}
function lineDescription(prize,id){
 if(id==='bonus')return '徽章 ×'+prize.bonus.count+' · 返还 '+points(prize.bonus.amount)+' 积分';
 const win=prize?.lines.find(l=>l.lineId===id);
 return win?'L'+(id+1)+' · '+win.count+' 连 · 返还 '+points(win.amount)+' 积分':'L'+(id+1)+' '+MATRIX_LINES[id].name+' · 路径示意';
}
function selectLine(id){
 if(model?.state==='spinning'||pending)return;
 highlight('matrix-board','matrix-lines',model?.result,id);
 $('line-caption').textContent=lineDescription(model?.result,id);
 $('mini-patterns').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.line)===id)));
 $('winning-lines').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.winLine===String(id))));
}
function winEntries(prize){return [...prize.lines].sort((a,b)=>b.amount-a.amount).map(l=>l.lineId).concat(prize.bonus.amount?['bonus']:[]);}
const lineTour=new MatrixLineTour({select:selectLine,
 allowed:()=>!reduced.matches&&!paused&&!document.hidden&&!$('matrix-guide').open&&!$('matrix-rules').open&&model?.state!=='spinning',
 change:({running,index,total})=>{ $('line-tour-controls').hidden=total<2||index<0;$('line-tour-position').textContent=(index+1)+' / '+total;$('line-tour-toggle').textContent=running?'暂停':'重播明细';$('line-tour-toggle').setAttribute('aria-label',running?'暂停中奖明细轮播':'重播中奖明细'); }
});
const guideTour=new MatrixLineTour({select:id=>{highlight('guide-board','guide-lines',guidePrize,id);$('guide-line-caption').textContent=lineDescription(guidePrize,id);},
 allowed:()=>!reduced.matches&&!paused&&!document.hidden&&$('matrix-guide').open,
 change:({running,total})=>{ $('guide-tour-toggle').hidden=total<2;$('guide-tour-toggle').textContent=running?'暂停明细':'重播明细'; }
});
function updateInstruments(snapshot){
 const status=matrixRevealedStatus(snapshot);
 $('reel-lights').querySelectorAll('i').forEach((light,c)=>{light.classList.toggle('is-landed',status.landed[c]);light.classList.toggle('is-tracking',snapshot.state==='spinning'&&!status.landed[c]&&c===status.count);});
 $('reel-status').setAttribute('aria-label',snapshot.state==='idle'?'等待启动':status.count+' / 5 列已落定');
 $('crest-count').textContent=snapshot.state==='idle'?'— / 3':status.crests<3?status.crests+' / 3':status.crests+' 枚';
 $('crest-meter').dataset.active=String(status.crests>=3);
 $('crest-meter').setAttribute('aria-label',snapshot.state==='idle'?'尚未开始，徽章每局独立计数，3 枚起奖励':'本局已揭晓徽章 '+status.crests+' 枚，'+(status.crests>=3?'徽章奖励已激活':'3 枚起奖励'));
 $('crest-lights').querySelectorAll('i').forEach((light,i)=>light.classList.toggle('is-lit',i<status.crests));
}
const effects=new MatrixEffects({host:$('machine'),layer:$('matrix-fx'),allowed:()=>!reduced.matches&&!paused&&!document.hidden});
const guideEffects=new MatrixEffects({host:$('guide-stage'),layer:$('guide-fx'),allowed:()=>!reduced.matches&&!paused&&!document.hidden&&$('matrix-guide').open});
function clearEffects(){effects.clear();guideEffects.clear();}
function cue(prize){return prize.amount===0?'miss':prize.amount<=MATRIX_COST?'return':prize.bonus.amount?'crest':prize.lines.some(l=>l.count===5)?'portal':prize.lines.length>=3?'crystal':'planet';}
function controls(){
 const locked=pending||!model||model.state==='spinning';
 $('spin').disabled=locked||model.balance<MATRIX_COST;
 $('spin-label').textContent=!model?'准备中…':pending?'正在启动…':model.state==='spinning'?'星轨转动中…':model.balance<MATRIX_COST?'积分不足':'转动矩阵';
 $('spin').setAttribute('aria-label',locked?$('spin-label').textContent:model.balance<MATRIX_COST?'积分不足，需 50 积分':'转动矩阵，消耗 50 积分');
 $('guide-open').disabled=locked;$('examples-open').disabled=locked;$('rules-open').disabled=locked;
 $('mini-patterns').querySelectorAll('button').forEach(b=>b.disabled=locked);
}
function request(type){
 const data={type,roundId:model?.roundId||''};
 if(embedded){window.parent.postMessage(data,location.origin);return;}
 if(type==='matrix-spin'&&!round.start(data.roundId)){pending=false;controls();return;}
 round.tick();receive(round.snapshot(wallet.points));
}
function spin(){
 if(pending||paused||document.hidden||$('matrix-guide').open||$('matrix-rules').open||!model||model.state==='spinning'||model.balance<MATRIX_COST)return;
 audio?.unlock();pending=true;controls();request('matrix-spin');
}
function startColumns(){
 shown=[null,null,null,null,null];clearEffects();lineTour.clear();$('machine').dataset.outcome='';$('matrix-lines').innerHTML='';$('winning-lines').innerHTML='';
 $('matrix-result').dataset.kind='';$('result-label').textContent='星轨正在交汇';$('result-total').innerHTML='—<small>积分</small>';
 $('result-detail').textContent='全部 10 条线已开启，五列依次落定。';$('line-caption').textContent='等待五列落定…';$('round-tag').textContent='转动中';
 $('matrix-board').setAttribute('aria-label','五列转轴正在转动');
 $('matrix-board').querySelectorAll('.matrix-column').forEach((col,c)=>{
  col.classList.remove('landed');col.classList.add('spinning');
  col.querySelector('.matrix-strip').innerHTML=Array.from({length:9},(_,r)=>cell((c*2+r)%6,c,r,true)).join('');
 });
 effects.launch();
 if(!paused&&!document.hidden)audio?.roll(model.elapsed);
}
function finishResult(prize,animate){
 $('matrix-result').dataset.kind=prize.kind;$('machine').dataset.outcome=prize.kind;
 $('result-label').textContent=prize.kind==='return'?'本局回本':prize.kind==='partial'?'命中 · 部分返还':prize.bonus.amount?'徽章奖励'+(prize.lines.length?' + '+prize.lines.length+' 线命中':''):prize.lines.length?prize.lines.length+' 条星轨命中':'这次星轨未相连';
 $('result-total').innerHTML=points(prize.amount)+'<small>积分</small>';
 $('result-detail').textContent='总返还 '+points(prize.amount)+' · 投入 50 · 净收益 '+signed(prize.net)+' 积分';
 $('round-tag').textContent=prize.kind==='win'?'星轨共振':prize.kind==='return'?'本局回本':prize.kind==='partial'?'部分返还':'本局结束';
 $('winning-lines').innerHTML=prize.lines.map(l=>'<button data-win-line="'+l.lineId+'" aria-pressed="false">L'+(l.lineId+1)+' · '+MATRIX_SYMBOLS[l.symbol].name+' '+l.count+'连 <b>'+l.amount+'</b></button>').join('')+(prize.bonus.amount?'<button class="bonus-chip" data-win-line="bonus" aria-pressed="false">徽章 ×'+prize.bonus.count+' <b>'+prize.bonus.amount+'</b></button>':'');
 lineTour.start(winEntries(prize),{autoplay:animate});
 if(!prize.lines.length&&!prize.bonus.amount)$('line-caption').textContent='从最左列起连续 3 个，才算命中';
 history.unshift(prize);history=history.slice(0,6);
 $('history').innerHTML=history.map(p=>'<li data-kind="'+(p.won?'triple':p.kind)+'"><span class="history-pattern">'+(p.bonus.amount?'✦':p.lines.length+' LINE')+'</span><b>返还 '+points(p.amount)+'</b><small>净 '+signed(p.net)+'</small></li>').join('');
 if(animate&&!paused&&!document.hidden){audio?.result(cue(prize));effects.play(prize);}
}
function receive(next){
 if(next.type!=='matrix-state'||!Array.isArray(next.stopped)||next.stopped.length!==5)return;
 const old=model,isNew=next.roundId!==seenRound;model=next;pending=false;
 $('balance').textContent=points(next.balance);$('machine').dataset.state=next.state;updateInstruments(next);
 if(isNew){seenRound=next.roundId;seenResult='';if(next.state==='spinning')startColumns();}
 next.stopped.forEach((values,c)=>{
  if(!values||shown[c]!==null)return;
  shown[c]=[...values];const col=$('matrix-board').querySelectorAll('.matrix-column')[c];
  col.classList.remove('spinning');col.querySelector('.matrix-strip').innerHTML=values.map((v,r)=>cell(v,c,r)).join('');
  if(old&&next.state==='spinning'&&!paused&&!document.hidden){col.classList.add('landed');effects.land(c);if(c===4)audio?.stop();audio?.land(Math.min(c,2));}
 });
 if(next.result&&seenResult!==next.roundId){
  seenResult=next.roundId;audio?.stop();renderBoard('matrix-board',next.result.board);
  $('matrix-board').setAttribute('aria-label','五列三行结果，'+next.result.lines.length+' 条线命中，总返还 '+next.result.amount+' 积分');
  finishResult(next.result,old?.state==='spinning');
 }
 controls();
}
function visibility(){
 const stopped=paused||document.hidden;document.body.classList.toggle('motion-paused',stopped);audio?.stop();
 if(stopped){clearEffects();lineTour.pause();guideTour.pause();if($('matrix-guide').open)$('matrix-guide').close();if($('matrix-rules').open)$('matrix-rules').close();}
 else if(model?.state==='spinning'&&shown.some(v=>v===null))audio?.roll(model.elapsed);
}
function guideExample(index){
 guideIndex=index;const example=MATRIX_EXAMPLES[index];if(!example||!$('matrix-guide').open)return;
 const prize=matrixPrize(example.board);guidePrize=prize;renderBoard('guide-board',example.board);
 const entries=winEntries(prize);entries.sort((a,b)=>Number(b===example.focus)-Number(a===example.focus));guideTour.start(entries);guideEffects.play(prize);
 $('guide-caption').textContent=example.name;$('guide-total').textContent='返还 '+points(prize.amount);
 $('guide-detail').textContent=example.detail+' 本例净收益 '+signed(prize.net)+' 积分。';
 $('guide-options').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.example)===index)));
}
function openGuide(){if(!model||pending||paused||model.state==='spinning')return;audio?.stop();clearEffects();lineTour.pause();if($('matrix-rules').open)$('matrix-rules').close();$('matrix-guide').showModal();guideExample(0);}
function openRules(){if(!model||pending||paused||model.state==='spinning')return;audio?.stop();clearEffects();lineTour.pause();$('rules-drawer-body').append($('matrix-paytable'));$('matrix-rules').showModal();}
$('rules-open').onclick=openRules;$('rules-close').onclick=()=>$('matrix-rules').close();
$('matrix-rules').addEventListener('close',()=>$('rules-home').append($('matrix-paytable')));
matchMedia('(max-width: 740px)').addEventListener?.('change',event=>{if(!event.matches&&$('matrix-rules').open)$('matrix-rules').close();});
$('line-tour-toggle').onclick=()=>lineTour.toggle();$('guide-tour-toggle').onclick=()=>guideTour.toggle();
renderBoard('matrix-board',[[0,4,2],[1,2,3],[2,3,0],[3,0,5],[0,1,2]]);
$('mini-patterns').innerHTML=MATRIX_LINES.map(l=>'<button type="button" data-line="'+l.id+'" aria-pressed="false" aria-label="查看 L'+(l.id+1)+' '+l.name+'中奖线"><svg viewBox="0 0 100 60" aria-hidden="true">'+Array.from({length:15},(_,i)=>'<circle cx="'+(10+i%5*20)+'" cy="'+(10+Math.floor(i/5)*20)+'" r="1.8"/>').join('')+'<polyline points="'+l.rows.map((r,c)=>(10+c*20)+','+(10+r*20)).join(' ')+'"/></svg><span>L'+(l.id+1)+'</span></button>').join('');
$('matrix-payrows').innerHTML=MATRIX_SYMBOLS.slice(0,4).map((s,i)=>'<div class="matrix-pay-row"><span>'+symbol(i)+s.name+'</span>'+s.pays.map(p=>'<b>'+p+'×</b>').join('')+'</div>').join('');
$('guide-options').innerHTML=MATRIX_EXAMPLES.map((e,i)=>'<button type="button" data-example="'+i+'" aria-pressed="false">'+e.name+'</button>').join('');
$('mini-patterns').onclick=e=>{const b=e.target.closest('[data-line]');if(b){lineTour.choose(Number(b.dataset.line));if($('matrix-rules').open)$('matrix-rules').close();}};
$('winning-lines').onclick=e=>{const b=e.target.closest('[data-win-line]');if(b)lineTour.choose(b.dataset.winLine==='bonus'?'bonus':Number(b.dataset.winLine));};
$('guide-options').onclick=e=>{const b=e.target.closest('[data-example]');if(b)guideExample(Number(b.dataset.example));};
$('guide-replay').onclick=()=>guideExample(guideIndex);
$('matrix-guide').addEventListener('close',()=>{guideEffects.clear();guideTour.clear();});
$('guide-open').onclick=openGuide;$('examples-open').onclick=openGuide;$('guide-close').onclick=()=>$('matrix-guide').close();
$('spin').onclick=spin;
if(!audio){$('sound').disabled=true;$('sound').textContent='音效暂不可用';$('sound').setAttribute('aria-label','音效暂不可用');$('sound').setAttribute('aria-pressed','false');}
if(embedded)document.querySelector('.classic-link').hidden=true;
$('sound').onclick=()=>{audio?.unlock();const enabled=audio?.toggle();$('sound').textContent='音效 '+(enabled?'开':'关');$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'关闭音效':'开启音效');};
$('back').onclick=()=>{audio?.leave();if(embedded)window.parent.postMessage({type:'game-return'},location.origin);else location.href='./';};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!e.target.closest('button,a,summary,input,textarea,select')){e.preventDefault();spin();}});
document.addEventListener('visibilitychange',visibility);
reduced.addEventListener?.('change',()=>{if(reduced.matches){clearEffects();lineTour.pause();guideTour.pause();}});
window.addEventListener('pagehide',()=>{clearEffects();lineTour.clear();guideTour.clear();audio?.leave();});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||!event.data)return;
 const data=event.data;
 if(data.type==='matrix-state')receive(data);
 else if(data.type==='matrix-error'){pending=false;controls();$('round-tag').textContent=data.message;}
 else if(data.type==='platform-pause'){paused=!!data.paused;visibility();}
});
if(!embedded)setInterval(()=>{round.tick();receive(round.snapshot(wallet.points));},100);
request('matrix-ready');
