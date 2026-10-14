'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {FusionRound,fusionSlide,fusionHasMove,fusionReward,FUSION_DIRECTIONS,FUSION_SPAWN_STAGES,fusionSpawnStage,fusionSpawnValue}=require('../src/2048-engine.js');
const {GameBridge}=require('../src/platform-bridge.js');
const {PointsWallet}=require('../src/platform-wallet.js');
const pad=values=>[...values,...Array(16-values.length).fill(0)];
function fixture(balance=1000,random=()=>0){
  const wallet=new PointsWallet(balance),results=[];
  const round=new FusionRound({random,now:()=>1000,charge:n=>wallet.charge(n,'entry'),credit:n=>wallet.credit(n,'reward'),onFinish:r=>results.push(r)});
  return {round,wallet,results};
}

test('2048 compresses gaps and merges each tile at most once, without mutating input',()=>{
  for(const [input,expected,gain] of [
    [[2,2,2,2],[4,4,0,0],8],[[2,2,4,0],[4,4,0,0],4],[[4,4,8,8],[8,16,0,0],24],
    [[2,0,2,2],[4,2,0,0],4],[[2,4,4,2],[2,8,2,0],8],[[2,0,0,2],[4,0,0,0],4]
  ]){
    const board=pad(input),original=board.slice(),out=fusionSlide(board,'left');
    assert.deepEqual(out.board,pad(expected));assert.equal(out.gain,gain);assert.deepEqual(board,original);
    assert.equal(out.transitions.length,input.filter(Boolean).length);
    for(const t of out.transitions)assert.equal(board[t.from],t.value);
  }
});

test('2048 all four directions lead from the correct edge',()=>{
  const row=pad([2,2,4,4]);
  assert.deepEqual(fusionSlide(row,'right').board,pad([0,0,4,8]));
  const column=[2,0,0,0,2,0,0,0,4,0,0,0,4,0,0,0];
  assert.deepEqual(fusionSlide(column,'up').board,[4,0,0,0,8,0,0,0,0,0,0,0,0,0,0,0]);
  assert.deepEqual(fusionSlide(column,'down').board,[0,0,0,0,0,0,0,0,4,0,0,0,8,0,0,0]);
  assert.equal(fusionSlide(row,'north'),null);
});

test('2048 starts only after payment and duplicate starts do not charge again',()=>{
  const {round:r,wallet}=fixture();assert.equal(r.snapshot(wallet.points).state,'idle');assert.equal(wallet.points,1000);
  assert.equal(r.start(''),true);assert.equal(wallet.points,950);assert.equal(r.board.filter(Boolean).length,2);
  assert.equal(r.start(''),false);assert.equal(r.start(r.id),false);assert.equal(wallet.points,950);
  const poor=fixture(49);assert.equal(poor.round.start(''),false);assert.equal(poor.wallet.points,49);assert.equal(poor.round.counter,0);
});

test('2048 no-op and rejected inputs cannot spawn, change revision, score, or consume randomness',()=>{
  let calls=0;const {round:r,wallet}=fixture(1000,()=>{calls++;return .2;});r.start('');r.board=pad([2,4,8,16]);r.highest=16;
  const before=r.snapshot(wallet.points),count=calls;
  assert.equal(r.move('left',r.id,0),true);
  assert.equal(r.move('right','old',0),false);assert.equal(r.move('right',r.id,3),false);assert.equal(r.move('teleport',r.id,0),false);
  assert.deepEqual(r.snapshot(wallet.points),before);assert.equal(calls,count);
  assert.equal(r.move('right',r.id,0),true); // A second no-op is acknowledged without mutation.
  assert.deepEqual(r.snapshot(wallet.points),before);assert.equal(calls,count);
});

test('2048 spawns uniformly among empty cells, including the early chance of 8',()=>{
  for(let k=0;k<4;k++)for(const [sample,value] of [[0,2],[.749999,2],[.75,4],[.979999,4],[.98,8],[.999999,8]]){
    const seq=[(k+.5)/4,sample],r=new FusionRound({random:()=>seq.shift()});
    r.board=Array(16).fill(8);[1,5,8,15].forEach(i=>r.board[i]=0);
    assert.deepEqual(r.spawn(),{index:[1,5,8,15][k],value});
    assert.equal(r.board.filter(v=>v===0).length,3);
  }
});

test('2048 progressively unlocks larger spawn tiles with the published exact weights',()=>{
  const expected=[
    [0,[[2,75],[4,23],[8,2]]],
    [32,[[2,45],[4,30],[8,20],[16,5]]],
    [128,[[2,25],[4,30],[8,25],[16,15],[32,5]]],
    [256,[[2,18],[4,25],[8,25],[16,20],[32,9],[64,3]]],
    [512,[[2,10],[4,18],[8,25],[16,25],[32,15],[64,6],[128,1]]],
    [1024,[[2,5],[4,10],[8,15],[16,25],[32,25],[64,14],[128,5],[256,1]]]
  ];
  for(let i=0;i<expected.length;i++){
    const [threshold,weights]=expected[i],stage=fusionSpawnStage(threshold);
    assert.equal(stage.minTile,threshold);assert.deepEqual(stage.weights.map(w=>[w.value,w.chance]),weights);
    const counts=new Map();
    for(let ticket=0;ticket<100;ticket++){const value=fusionSpawnValue(threshold,(ticket+.5)/100);counts.set(value,(counts.get(value)||0)+1);}
    assert.deepEqual([...counts],weights);
    if(i)assert.equal(fusionSpawnStage(threshold-1).minTile,expected[i-1][0]);
    let cumulative=0;
    for(let j=0;j<weights.length-1;j++){
      cumulative+=weights[j][1];
      assert.equal(fusionSpawnValue(threshold,(cumulative-.00001)/100),weights[j][0]);
      assert.equal(fusionSpawnValue(threshold,cumulative/100),weights[j+1][0]);
    }
  }
  assert.equal(fusionSpawnValue(2048,.999999),256);
  assert.ok(FUSION_SPAWN_STAGES.every(stage=>stage.weights.every(w=>w.value<512)));
  assert.ok(Object.isFrozen(FUSION_SPAWN_STAGES[1].weights[0]));
});

test('2048 uses the newly merged highest tile for that same move; spawned values do not award score',()=>{
  for(const [pair,roll,spawned] of [[16,.96,16],[64,.98,32],[128,.995,64],[256,.995,128],[512,.995,256]]){
    const {round:r}=fixture();r.start('');r.board=pad([pair,pair]);r.highest=pair;
    const draws=[0,roll];r.random=()=>draws.shift();
    assert.equal(r.move('left',r.id,0),true);
    assert.equal(r.lastMove.spawn.value,spawned);assert.equal(r.score,pair*2);assert.equal(r.highest,pair*2);
    assert.equal(r.board.reduce((a,b)=>a+b,0),pair*2+spawned);
    assert.equal(r.snapshot(950).spawnProfile.minTile,pair*2);
  }
});

test('2048 stage upgrades retain uniform placement and restart returns to the opening pool',()=>{
  for(let slot=0;slot<4;slot++){
    const draws=[(slot+.5)/4,.995],r=new FusionRound({random:()=>draws.shift()});
    r.board=Array(16).fill(1024);[1,5,8,15].forEach(i=>r.board[i]=0);
    assert.deepEqual(r.spawn(),{index:[1,5,8,15][slot],value:256});
  }
  const {round:r}=fixture(1000,()=>.99999);r.start('');r.board=pad([1024]);r.highest=1024;
  assert.equal(r.restart(r.id,0),true);assert.deepEqual(r.board.filter(Boolean),[8,8]);assert.equal(r.highest,8);assert.equal(r.score,0);
  assert.deepEqual(r.snapshot(900).spawnProfile,{minTile:0,nextUnlock:32,outcomes:[{value:2,chance:75},{value:4,chance:23},{value:8,chance:2}]});
});

test('2048 live spawn probabilities are copied into snapshots and never depend on score or wallet balance',()=>{
  const {round:r}=fixture();r.start('');r.board=pad([512]);r.highest=512;r.score=999999;
  const a=r.snapshot(950),b=r.snapshot(1);assert.deepEqual(a.spawnProfile,b.spawnProfile);
  assert.equal(a.spawnProfile.minTile,512);assert.equal(a.spawnProfile.nextUnlock,1024);
  a.spawnProfile.outcomes[0].chance=100;a.spawnProfile.outcomes.push({value:1024,chance:100});
  assert.equal(r.snapshot(950).spawnProfile.outcomes[0].chance,10);assert.equal(r.snapshot(950).spawnProfile.outcomes.length,7);
});

test('2048 only accepted moves add one tile and repeat revision cannot play twice',()=>{
  const {round:r,wallet}=fixture();r.start('');r.board=pad([2,0,2]);r.highest=2;
  assert.equal(r.move('left',r.id,0),true);
  assert.equal(r.score,4);assert.equal(r.moves,1);assert.equal(r.revision,1);
  assert.equal(r.board.reduce((a,b)=>a+b,0),6);assert.deepEqual(r.lastMove.spawn,{index:1,value:2});
  const saved=r.snapshot(wallet.points);assert.equal(r.move('left',r.id,0),false);assert.deepEqual(r.snapshot(wallet.points),saved);
});

test('2048 highest-tile tiers are non-stacking and capped',()=>{
  for(const [value,reward] of [[0,0],[256,0],[511,0],[512,20],[1023,20],[1024,50],[2047,50],[2048,80],[4096,80]])assert.equal(fusionReward(value),reward);
});

test('2048 target ends the round and credits 80 exactly once, separate from score',()=>{
  const {round:r,wallet,results}=fixture();r.start('');r.board=pad([1024,1024]);r.highest=1024;
  r.move('left',r.id,0);assert.equal(r.state,'finished');assert.equal(r.score,2048);assert.equal(r.highest,2048);
  assert.equal(wallet.points,1030);assert.equal(results.length,1);assert.equal(results[0].net,30);assert.equal(results[0].amount,80);
  assert.equal(r.move('right',r.id,1),false);r.finish('target');assert.equal(wallet.points,1030);assert.equal(results.length,1);
});

test('2048 a full board with adjacent pairs is playable; a blocked board settles the correct tier',()=>{
  assert.equal(fusionHasMove(Array(16).fill(2)),true);
  for(const [highest,amount] of [[256,0],[512,20],[1024,50]]){
    const {round:r,wallet,results}=fixture();r.start('');
    r.board=[highest,4,2,4,4,2,4,2,2,4,2,4,4,2,8,8];r.highest=highest;
    assert.equal(r.move('left',r.id,0),true);assert.equal(fusionHasMove(r.board),false);
    assert.equal(r.result.reason,'blocked');assert.equal(r.result.amount,amount);assert.equal(wallet.points,950+amount);assert.equal(results.length,1);
  }
});

test('2048 restart forfeits only on successful new payment and never retains old rewards',()=>{
  const {round:r,wallet,results}=fixture(100);r.start('');r.board=pad([1024,2]);r.highest=1024;
  const oldId=r.id;assert.equal(r.restart(oldId,0),true);assert.notEqual(r.id,oldId);assert.equal(wallet.points,0);
  assert.equal(results.length,1);assert.equal(results[0].amount,0);assert.equal(results[0].reason,'abandoned');assert.equal(r.score,0);assert.equal(r.highest,2);
  const before=r.snapshot(wallet.points);assert.equal(r.restart(r.id,0),false);assert.deepEqual(r.snapshot(wallet.points),before);assert.equal(results.length,1);
});

test('2048 snapshots do not expose mutable board, animation, or result references',()=>{
  const {round:r}=fixture();r.start('');r.board=pad([1024,1024]);r.move('left',r.id,0);
  const s=r.snapshot(1030);s.board.fill(0);s.lastMove.transitions[0].from=99;s.lastMove.merges[0].value=99;s.lastMove.spawn.value=99;s.result.amount=9999;
  assert.equal(r.board[0],2048);assert.equal(r.lastMove.transitions[0].from,0);assert.equal(r.lastMove.merges[0].value,2048);assert.equal(r.lastMove.spawn.value,2);assert.equal(r.result.amount,80);
});

test('2048 seeded rounds conserve tile mass and score, including rapid direction changes',()=>{
  let seed=47291;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let game=0;game<50;game++){
    const r=new FusionRound({random:rng,charge:()=>true});r.start('');
    for(let step=0;step<350&&r.state==='playing';step++){
      const old=r.board.slice(),score=r.score,rev=r.revision,direction=FUSION_DIRECTIONS[Math.floor(rng()*4)];
      const predicted=fusionSlide(old,direction);r.move(direction,r.id,rev);
      assert.ok(r.board.every(v=>v===0||(Number.isInteger(Math.log2(v))&&v>=2)));
      if(predicted.changed){assert.equal(r.revision,rev+1);assert.equal(r.score-score,predicted.gain);assert.equal(r.board.reduce((a,b)=>a+b,0)-old.reduce((a,b)=>a+b,0),r.lastMove.spawn.value);}
      else{assert.deepEqual(r.board,old);assert.equal(r.revision,rev);assert.equal(r.score,score);}
    }
  }
});

test('2048 bridge rejects foreign, stale and spoofed reward messages; resume is free',()=>{
  const wallet=new PointsWallet(),messages=[],results=[],frame={contentWindow:{postMessage:d=>messages.push(d)}};
  let returned=0;
  const bridge=new GameBridge({engines:{'2048':FusionRound},frames:{'2048':frame},loadedGames:new Set(['2048']),wallet,origin:'https://test.local',onFinish:r=>results.push(r),onReturn:()=>returned++});
  const send=(data,source=frame.contentWindow,origin='https://test.local')=>bridge.handle({data,source,origin});
  send({type:'2048-ready'});assert.equal(messages.at(-1).state,'idle');
  send({type:'2048-start',roundId:''},{},'https://test.local');send({type:'2048-start',roundId:''},frame.contentWindow,'https://evil.local');assert.equal(wallet.points,1000);
  send({type:'2048-start',roundId:''});send({type:'2048-start',roundId:''});assert.equal(wallet.points,950);
  const r=bridge.rounds['2048'],id=r.id;send({type:'game-return'});send({type:'2048-ready'});assert.equal(returned,1);assert.equal(r.id,id);assert.equal(wallet.points,950);
  r.board=pad([1024,1024]);r.highest=1024;
  const move={type:'2048-move',roundId:id,revision:0,direction:'left',amount:999999,score:999999};
  send(move);send(move);send({type:'2048-collect',roundId:id,amount:999999});send({type:'2048-ready'});
  assert.equal(wallet.points,1030);assert.equal(results.length,1);assert.equal(results[0].amount,80);assert.equal(messages.at(-1).score,2048);
});

test('2048 is playable in every lobby shell, has an icon and understandable history',()=>{
  for(const file of ['index.html','lobby-demo.html','palette-demo.html']){
    const html=fs.readFileSync(`src/${file}`,'utf8');assert.match(html,/id="2048-frame"/);assert.match(html,/src="2048-engine.js"/);
  }
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('src/platform-catalog.js','utf8')+'\n'+fs.readFileSync('src/platform-view.js','utf8'),ctx);
  assert.equal(vm.runInContext("gameRoutes['2048']",ctx),'2048.html');
  assert.equal(vm.runInContext("catalog.find(g=>g.id==='2048').available",ctx),true);
  assert.equal(vm.runInContext("catalog.find(g=>g.id==='2048').category",ctx),'益智消除');
  assert.equal(vm.runInContext("roundSummary({gameId:'2048',highest:2048,amount:80,net:30})",ctx),'最高数字 2048 · 到账 80 积分 · 净收益 +30');
  assert.ok(fs.existsSync('src/2048-icon.svg'));
});
