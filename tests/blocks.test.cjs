const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {BlocksRound,BLOCK_SHAPES,blockFits,blockHasMove,blockLines,blockReward,BLOCK_REWARDS,BLOCK_MOVE_LIMIT,blockProjectPlacement}=require('../src/blocks-engine.js');
const {GameBridge}=require('../src/platform-bridge.js');
const {PointsWallet}=require('../src/platform-wallet.js');
const start=options=>{const r=new BlocksRound({charge:()=>true,...options});assert.equal(r.start(''),true);return r;};
const place=(r,slot,row,col)=>r.place(slot,row,col,r.id,r.revision);

test('paid opening, legal bounds, collisions, stale intents and non-mutating snapshots',()=>{
  let transactions=0;
  const r=start({charge:()=>{transactions++;return true;},credit:()=>transactions++});
  assert.equal(r.cost,50);assert.equal(r.score,0);assert.equal(r.board.filter(Boolean).length,0);
  assert.equal(place(r,0,0,0),true);assert.equal(r.score,20);
  const before=r.snapshot();
  for(const [slot,row,col] of [[1,0,0],[1,0,5],[1,-1,0],[1,8,0],[1,0,-1],[3,1,1],[0,2,2],[1,1.2,0],[1,'1',0]])assert.equal(place(r,slot,row,col),false);
  assert.equal(r.place(1,0,4,'blocks-0',r.revision),false);
  assert.equal(r.place(1,0,4,r.id,0),false);
  assert.deepEqual(r.snapshot(),before);
  const copy=r.snapshot();copy.board[4]=5;copy.tray[1].cells[0][0]=100;copy.lastMove.placed[0]=99;
  assert.deepEqual(r.snapshot(),before);
  assert.equal(place(r,1,0,4),true);assert.equal(r.score,140);assert.equal(r.lines,1);assert.equal(r.combo,1);
  assert.equal(r.board.filter(Boolean).length,0);assert.equal(r.tray.filter(Boolean).length,1);
  assert.equal(place(r,2,0,0),true);assert.equal(r.score,160);assert.equal(r.combo,0);assert.equal(r.tray.filter(Boolean).length,3);
  assert.equal(transactions,1);
});

test('crossing row and column clear simultaneously, count once per cell, and escalate combo scoring',()=>{
  const r=start();r.board=Array(64).fill(0);
  for(let i=1;i<8;i++){r.board[i]=1;r.board[i*8]=2;}
  r.tray=[r.piece(0,3),r.piece(0,4),r.piece(0,5)];
  assert.equal(place(r,0,0,0),true);
  assert.equal(r.score,405);assert.equal(r.lines,2);assert.equal(r.lastMove.cleared.length,15);assert.equal(r.board.filter(Boolean).length,0);
  assert.deepEqual(r.lastMove.rows,[0]);assert.deepEqual(r.lastMove.cols,[0]);
  for(let i=1;i<8;i++)r.board[i]=2;
  assert.equal(place(r,1,0,0),true);assert.equal(r.score,610);assert.equal(r.combo,2);assert.equal(r.maxCombo,2);
  assert.equal(place(r,2,2,2),true);assert.equal(r.combo,0);assert.equal(r.maxCombo,2);
});

test('all remaining shapes are checked; refill happens only after the whole hand, and dead boards finish once',()=>{
  let finishes=0;const r=start({random:()=>.99,onFinish:()=>finishes++});
  r.board=Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);
  r.tray=[r.piece(9,1),r.piece(0,2),r.piece(9,3)];
  assert.equal(blockHasMove(r.board,r.tray[0]),false);assert.equal(blockHasMove(r.board,r.tray[1]),true);
  assert.equal(place(r,1,0,1),true);assert.equal(r.state,'finished');assert.equal(r.tray.filter(Boolean).length,2);
  assert.equal(finishes,1);assert.equal(r.result.score,5);assert.equal(r.result.amount,0);
  assert.equal(place(r,0,0,0),false);assert.equal(finishes,1);
  const oldId=r.id;assert.equal(r.restart(oldId,r.revision-1),false);assert.equal(r.restart(oldId,r.revision),true);
  assert.notEqual(r.id,oldId);assert.equal(r.score,0);assert.equal(r.board.filter(Boolean).length,0);
  // An unfit freshly dealt hand also ends immediately, even though the last old piece fitted.
  r.board=Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);
  r.tray=[null,null,r.piece(0,2)];place(r,2,0,1);
  assert.equal(r.lastMove.refilled,true);assert.equal(r.tray.length,3);assert.equal(r.state,'finished');assert.equal(finishes,2);
});

test('seeded playthroughs preserve board, scoring, deal and completion invariants',()=>{
  let seed=93721;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  assert.equal(BLOCK_SHAPES.length,29);
  let finished=0;
  for(let game=0;game<50;game++) {
    const r=start({random,onFinish:()=>finished++});
    for(let step=0;step<500&&r.state==='playing';step++) {
      const legal=[];
      r.tray.forEach((piece,slot)=>{for(let row=0;row<8;row++)for(let col=0;col<8;col++)if(blockFits(r.board,piece,row,col))legal.push([slot,row,col]);});
      assert.ok(legal.length>0);const move=legal[Math.floor(random()*legal.length)],oldScore=r.score,oldCombo=r.combo;
      assert.equal(place(r,...move),true);
      const m=r.lastMove,n=m.rows.length+m.cols.length;
      assert.equal(r.score-oldScore,m.placed.length*5+100*n*n*(n?oldCombo+1:0));
      assert.equal(new Set(m.cleared).size,m.cleared.length);
      assert.deepEqual(blockLines(r.board),{rows:[],cols:[]});assert.equal(r.board.length,64);
      assert.ok(r.board.every(c=>Number.isInteger(c)&&c>=0&&c<=5));
      if(r.state==='finished')assert.ok(r.moves===30||r.tray.every(p=>!blockHasMove(r.board,p)));
      assert.ok(r.moves<=30);
    }
    assert.equal(r.state,'finished');
  }
  assert.equal(finished,50);
});

test('bridge isolates puzzle messages, deduplicates moves and charges the shared balance once',()=>{
  const messages=[],frame={contentWindow:{postMessage:d=>messages.push(d)}},wallet=new PointsWallet(),results=[];
  const bridge=new GameBridge({engines:{blocks:BlocksRound},frames:{blocks:frame},loadedGames:new Set(['blocks']),wallet,origin:'https://test.local',onFinish:r=>results.push(r)});
  const originalLedger=JSON.stringify(wallet.ledger),send=(data,source=frame.contentWindow,origin='https://test.local')=>bridge.handle({data,source,origin});
  send({type:'blocks-ready'});assert.equal(messages.at(-1).state,'idle');
  send({type:'blocks-start',roundId:''});const r=bridge.rounds.blocks;
  const data={type:'blocks-place',slot:0,row:0,col:0,roundId:r.id,revision:0};
  send(data,{});send(data,frame.contentWindow,'https://wrong.local');assert.equal(r.score,0);
  send(data);send(data);assert.equal(r.score,20);assert.equal(r.moves,1);
  bridge.sync('blocks');assert.equal(messages.at(-1).score,20);
  r.board=Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);r.tray=[r.piece(0,1),r.piece(9,1),null];
  send({...data,row:0,col:1,revision:r.revision});bridge.sync('blocks');assert.equal(results.length,1);
  assert.equal(results[0].gameId,'blocks');assert.equal(wallet.points,950);assert.notEqual(JSON.stringify(wallet.ledger),originalLedger);assert.equal(wallet.ledger.filter(e=>e.amount<0).length,1);
});

test('new game appears in all lobby shells and has challenge payout history',()=>{
  for(const file of ['index.html','lobby-demo.html','palette-demo.html']) {
    const html=fs.readFileSync(`src/${file}`,'utf8');assert.match(html,/id="blocks-frame"/);assert.match(html,/src="blocks-engine.js"/);
  }
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync('src/platform-catalog.js','utf8')+'\n'+fs.readFileSync('src/platform-view.js','utf8'),ctx);
  assert.equal(vm.runInContext('catalog.filter(g=>g.available).length',ctx),9);
  assert.equal(vm.runInContext("gameRoutes.blocks",ctx),'blocks.html');
  assert.equal(vm.runInContext("roundSummary({gameId:'blocks',score:1240,lines:8,amount:50,net:0})",ctx),'1,240 分 · 到账 50 积分 · 净收益 0');
});

test('challenge reward boundaries are explicit, non-stacking and capped',()=>{
  assert.deepEqual(BLOCK_REWARDS.map(t=>[t.score,t.amount]),[[0,0],[500,20],[1000,50],[2000,80]]);
  for(const [score,amount] of [[0,0],[499,0],[500,20],[999,20],[1000,50],[1999,50],[2000,80],[1000000,80],[-1,0],[NaN,0],[Infinity,0]])assert.equal(blockReward(score),amount);
});

test('opening requires payment; failed entry or restart preserves the complete state',()=>{
  const denied=new BlocksRound();const idle=denied.snapshot(49);
  assert.equal(denied.start(''),false);assert.deepEqual(denied.snapshot(49),idle);
  const wallet=new PointsWallet(99),r=new BlocksRound({charge:n=>wallet.charge(n,'entry')});
  assert.equal(r.start(''),true);assert.equal(wallet.points,49);place(r,0,0,0);
  const live=r.snapshot(wallet.points);
  assert.equal(r.restart(r.id,r.revision),false);assert.deepEqual(r.snapshot(wallet.points),live);
  assert.equal(r.start(r.id),false);assert.equal(wallet.ledger.length,2);
  assert.equal(place(r,1,0,4),true,'low balance does not block already-paid gameplay');
});

test('exactly 30 successful placements finish once, with no final refill or 31st move',()=>{
  let draws=0,finishes=0;
  const r=start({random:()=>{draws++;return 0;},onFinish:()=>finishes++});r.tray=[r.piece(0,1),r.piece(0,2),r.piece(0,3)];
  for(let move=0;move<30;move++){
    const before=r.snapshot();assert.equal(place(r,move%3,-1,0),false);assert.deepEqual(r.snapshot(),before);
    assert.equal(place(r,move%3,0,move%8),true);
    assert.equal(r.moves,move+1);assert.equal(r.snapshot().remaining,29-move);
  }
  assert.equal(r.state,'finished');assert.equal(r.result.reason,'steps');assert.equal(finishes,1);assert.equal(draws,54);
  assert.equal(r.lastMove.refilled,false);assert.equal(r.result.cost,50);assert.equal(r.result.score,450);assert.equal(r.result.net,-50);
  const settled=r.snapshot();assert.equal(place(r,0,1,0),false);r.finish('steps');assert.deepEqual(r.snapshot(),settled);assert.equal(finishes,1);
});

test('last placement crosses reward thresholds before one-time settlement',()=>{
  for(const [score,amount] of [[499,0],[500,20],[999,20],[1000,50],[1999,50],[2000,80],[100000,80]]){
    const wallet=new PointsWallet(),finished=[];
    const r=start({charge:n=>wallet.charge(n,'entry'),credit:n=>wallet.credit(n,'payout'),onFinish:x=>finished.push(x)});
    r.score=score-5;r.moves=29;r.revision=29;r.tray=[r.piece(0,1),null,null];
    const projected=blockProjectPlacement(r.snapshot(wallet.points),0,0,0);
    assert.equal(projected.state,'settling');assert.equal(projected.moves,30);assert.equal(projected.result,null);assert.equal(wallet.points,950);
    assert.equal(place(r,0,0,0),true);assert.equal(r.result.score,score);assert.equal(r.result.amount,amount);
    assert.equal(wallet.points,950+amount);assert.equal(r.result.net,amount-50);assert.equal(finished.length,1);
    const ledger=wallet.ledger;r.finish('blocked');assert.equal(place(r,0,0,0),false);assert.deepEqual(wallet.ledger,ledger);
  }
});

test('early dead-end settles by earned score and an accepted restart forfeits before charging another round',()=>{
  const wallet=new PointsWallet(),finished=[];
  const r=start({charge:n=>wallet.charge(n,'entry'),credit:n=>wallet.credit(n,'payout'),onFinish:x=>finished.push(x)});
  r.board=Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1);
  r.tray=[r.piece(0,1),r.piece(9,2),null];r.score=995;
  assert.equal(place(r,0,0,1),true);assert.equal(r.result.reason,'blocked');assert.equal(r.result.amount,50);assert.equal(wallet.points,1000);
  assert.equal(r.restart(r.id,r.revision),true);assert.equal(wallet.points,950);
  r.score=2000;const oldId=r.id,revision=r.revision;
  assert.equal(r.restart(oldId,revision),true);assert.equal(wallet.points,900);assert.equal(finished.length,2);
  assert.equal(finished[1].reason,'abandoned');assert.equal(finished[1].amount,0);assert.equal(r.score,0);
  assert.equal(r.restart(oldId,revision),false);assert.equal(wallet.points,900);
});

test('bridge settles once, ignores claimed rewards, and resumes without a second debit',()=>{
  const messages=[],frame={contentWindow:{postMessage:d=>messages.push(d)}},wallet=new PointsWallet(),results=[];
  const bridge=new GameBridge({engines:{blocks:BlocksRound},frames:{blocks:frame},loadedGames:new Set(['blocks']),wallet,origin:'https://test.local',onFinish:r=>results.push(r)});
  const send=data=>bridge.handle({data,source:frame.contentWindow,origin:'https://test.local'});
  send({type:'blocks-ready'});assert.equal(wallet.points,1000);assert.equal(messages.at(-1).state,'idle');
  send({type:'blocks-start',roundId:''});send({type:'blocks-start',roundId:''});assert.equal(wallet.points,950);
  const r=bridge.rounds.blocks,id=r.id;send({type:'game-return'});send({type:'blocks-ready'});assert.equal(wallet.points,950);assert.equal(r.id,id);
  r.moves=29;r.revision=29;r.score=1995;r.tray=[r.piece(0,1),null,null];
  const move={type:'blocks-place',roundId:id,revision:29,slot:0,row:0,col:0,amount:999999,score:999999};
  send(move);send(move);send({type:'blocks-ready'});assert.equal(wallet.points,1030);assert.equal(results.length,1);assert.equal(results[0].amount,80);
  assert.equal(wallet.ledger.filter(e=>e.amount===80).length,1);assert.equal(messages.at(-1).balance,1030);
});
