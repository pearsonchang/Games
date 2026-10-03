const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {HorseRound,HORSE_PRIZES}=require('../src/horse-engine.js');
// The 4 × 3 × 2 equally likely shuffle branches exhaust all 24 rankings.
const seen=new Set(),ranks=Array.from({length:4},()=>[0,0,0,0]);
for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){
 for(let selected=0;selected<4;selected++){
  const draws=[(a+.5)/4,(b+.5)/3,(c+.5)/2];let now=0,points=1000,debits=0,credits=0,finishes=0;
  const round=new HorseRound({now:()=>now,random:()=>draws.shift()??.5,charge:n=>{debits++;points-=n;return true},credit:n=>{credits++;points+=n},onFinish:()=>finishes++});
  assert.equal(round.start(selected,''),true);assert.equal(round.start(selected,''),false);assert.equal(debits,1);assert.equal(points,950);
  assert.equal(round.snapshot(points).countdown,3);assert.equal(round.snapshot(points).result,null);assert.equal('runs' in round.snapshot(points),false);assert.deepEqual(round.snapshot(points).positions,[0,0,0,0]);
  seen.add(round.order.join(','));let previous=[0,0,0,0];
  for(now=3000;now<15900;now+=80){round.tick();const s=round.snapshot(points);s.positions.forEach((p,i)=>assert.ok(p>=previous[i]-1e-12&&p>=0&&p<=1));previous=s.positions;assert.equal(s.result,null);assert.equal(s.order.length,4);assert.equal(new Set(s.order).size,4);}
  now=15900;round.tick();const s=round.snapshot(points),rank=s.result.rank;ranks[selected][rank-1]++;
  assert.equal(s.state,'finished');assert.equal(s.result.selected,selected);assert.equal(s.result.amount,HORSE_PRIZES[rank-1]);assert.equal(points,950+HORSE_PRIZES[rank-1]);assert.deepEqual(s.positions,[1,1,1,1]);assert.deepEqual(s.order,s.result.order);assert.deepEqual(s.finished,s.result.order);
  now=999999;round.tick();round.tick();assert.equal(finishes,1);assert.equal(credits,s.result.amount>0?1:0);assert.equal(round.start(selected,''),false);
 }
}
assert.equal(seen.size,24);for(const row of ranks){assert.deepEqual(row,[6,6,6,6]);const expected=row.reduce((total,n,i)=>total+n*HORSE_PRIZES[i],0)/24;assert.equal(expected,48.5);assert.equal(expected-50,-1.5);}
{
 let charges=0;const low=new HorseRound({charge:()=>{charges++;return false}});
 for(const value of [-1,4,.5,'1',null,NaN])assert.equal(low.start(value,''),false);assert.equal(charges,0);assert.equal(low.start(0,''),false);assert.equal(low.state,'idle');assert.equal(charges,1);
}
{
 const elements=new Map(),listeners={};function el(id){if(!elements.has(id))elements.set(id,{hidden:false,innerHTML:'',textContent:'',contentWindow:{messages:[],postMessage(d){this.messages.push(d)}},close(){},showModal(){}});return elements.get(id)}
 const ctx=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},window:{scrollTo(){},addEventListener:(n,f)=>listeners[n]=f},location:{origin:'https://test.local',hash:''},HorseRound,...require('../src/mines-engine.js'),...require('../src/rocket-engine.js'),...require('../src/dice-engine.js'),...require('../src/plinko-engine.js'),setInterval(){},Date,console});
 vm.runInContext(['platform-catalog','platform-wallet','platform-view','platform-bridge','platform'].map(name=>fs.readFileSync('src/'+name+'.js','utf8')).join('\n'),ctx);const run=code=>vm.runInContext(code,ctx);
 const send=(data,source=el('horse-frame').contentWindow,origin='https://test.local')=>listeners.message({data,source,origin});
 run("let testTime=0;bridge.rounds.horse.now=()=>testTime;bridge.rounds.horse.random=()=>.999;play('horse')");
 send({type:'horse-ready'});assert.equal(run('session.points'),1000);
 send({type:'horse-start',selected:0,roundId:''},el('game-frame').contentWindow);send({type:'horse-start',selected:0,roundId:''},el('horse-frame').contentWindow,'https://wrong.local');assert.equal(run('session.points'),1000);
 send({type:'horse-start',selected:0,roundId:''});send({type:'horse-start',selected:1,roundId:''});assert.equal(run('session.points'),950);assert.equal(run('bridge.rounds.horse.selected'),0);
 run("showPage('games');testTime=17000;bridge.sync('horse')");assert.equal(run('session.points'),1090);assert.equal(run('session.rounds.length'),1);assert.equal(run('session.ledger.length'),3);assert.equal(el('horse-frame').contentWindow.messages.at(-1).balance,1090);
 run("play('horse');bridge.sync('horse')");assert.equal(run('session.points'),1090);send({type:'game-reward',amount:999999});assert.equal(run('session.points'),1090);
 run("showPage('me')");assert.match(el('content').innerHTML,/星际赛马/);assert.match(el('content').innerHTML,/第 1 名 · 140/);
 run("wallet.charge(wallet.points-49.99, 'test spend');play('horse')");send({type:'horse-start',selected:2,roundId:'horse-1'});assert.equal(run('session.points'),49.99);assert.equal(run('bridge.rounds.horse.state'),'finished');
}
console.log('Passed: all 24 rankings × 4 selections, exact 97% expected return, visible order/finish agreement, monotonic motion, one-time charge/credit, invalid/stale requests, insufficient points, parent message guards and background settlement.');
