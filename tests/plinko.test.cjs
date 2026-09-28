const assert=require('node:assert/strict');
const {PlinkoRound,plinkoPath,plinkoBallAt,PLINKO_PEGS,PLINKO_LANES,PLINKO_DROP_Y,PLINKO_MULT}=require('../dist/plinko-engine.js');
function seeded(seed){return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);}
for(const peg of PLINKO_PEGS){
 assert.ok(PLINKO_PEGS.some(other=>other.x===700-peg.x&&other.y===peg.y),'Every peg must have a mirrored counterpart');
}
let trajectories=0,maxStep=0;
for(let lane=0;lane<5;lane++){
 const random=seeded(20260929+lane);
 for(let run=0;run<200;run++){
  const path=plinkoPath(lane,random),first=path.frames[0],last=path.frames.at(-1);
  assert.equal(first[1],PLINKO_LANES[lane]);
  assert.equal(first[2],PLINKO_DROP_Y);
  assert.equal(last[2],548,'Every path reaches the pocket line');
  assert.ok(path.duration>0&&path.duration<20000);
  assert.equal(path.slot,Math.min(8,Math.floor(last[1]/(700/9))));
  assert.ok(path.frames.some(f=>f[3]>=0),'All entries must reach the peg field');
  for(let i=0;i<path.frames.length;i++){
   const f=path.frames[i];assert.ok(f.every(Number.isFinite));assert.ok(f[1]>=32&&f[1]<=668);
   if(f[3]!==-1)assert.ok(f[4]>=0&&f[4]<=1,'Impact intensity must be bounded');
   if(i){assert.ok(f[0]>=path.frames[i-1][0]);maxStep=Math.max(maxStep,Math.abs(f[1]-path.frames[i-1][1]));}
  }
  const landed=plinkoBallAt(path,path.duration/1000,lane).ball;
  assert.ok(Math.abs(landed[1]-last[1])<1e-7);assert.ok(Math.abs(landed[2]-548)<1e-7);
  trajectories++;
 }
}
assert.ok(maxStep<30,'No sideways teleport between sampled positions');
// A completed left-side result must not pin the next preview to the previous pocket.
const previous=plinkoPath(0,()=>.75);
assert.ok(previous.slot<4);
assert.deepEqual(plinkoBallAt(previous,previous.duration/1000,4,true).ball,[0,550,PLINKO_DROP_Y]);

let now=0,balance=1000,finishes=0,credits=0;
const round=new PlinkoRound({now:()=>now,random:seeded(88),charge:cost=>{if(balance<cost)return false;balance-=cost;return true;},credit:amount=>{balance+=amount;credits++;},onFinish:()=>finishes++});
assert.equal(round.start(5),false);assert.equal(balance,1000);
for(const lane of [0,4]){
 const before=balance;
 assert.equal(round.start(lane),true);assert.equal(round.start(2),false);
 assert.equal(round.path.frames[0][1],PLINKO_LANES[lane]);
 const reward=50*PLINKO_MULT[round.path.slot];
 now+=round.path.duration-1;round.tick();assert.equal(round.state,'dropping');
 now+=1;round.tick();assert.equal(round.state,'finished');
 assert.equal(balance,before-50+reward);
 round.tick();round.snapshot(balance,true);assert.equal(balance,before-50+reward);
}
assert.equal(finishes,2);assert.equal(credits,2);
console.log(`Passed ${trajectories} trajectories, mirrored geometry, entry preview, and two-round settlement; maximum horizontal frame step ${maxStep.toFixed(2)}px.`);
