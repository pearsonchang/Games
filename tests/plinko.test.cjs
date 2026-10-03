const assert=require('node:assert/strict');
const {PlinkoRound,plinkoPath,plinkoBallAt,plinkoSimulate,plinkoSampleSlot,plinkoRandom,PLINKO_PEGS,PLINKO_LANES,PLINKO_DROP_Y,PLINKO_MULT,PLINKO_PROBS,PLINKO_PATH_SEEDS}=require('../server/engines/plinko.cjs');
function seeded(seed){return ()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);}
for(const peg of PLINKO_PEGS){
 assert.ok(PLINKO_PEGS.some(other=>other.x===700-peg.x&&other.y===peg.y),'Every peg must have a mirrored counterpart');
}
assert.ok(Math.abs(PLINKO_PROBS.reduce((a,b)=>a+b,0)-1)<1e-12);
for(let i=0;i<9;i++)assert.ok(Math.abs(PLINKO_PROBS[i]-PLINKO_PROBS[8-i])<1e-8);
for(let i=0;i<4;i++)assert.ok(PLINKO_PROBS[i]<PLINKO_PROBS[i+1]);
let boundary=0;
for(let i=0;i<9;i++){
 assert.equal(plinkoSampleSlot(()=>boundary+PLINKO_PROBS[i]/2),i);
 if(i)assert.equal(plinkoSampleSlot(()=>boundary-1e-10),i-1);
 boundary+=PLINKO_PROBS[i];
}
assert.equal(plinkoSampleSlot(()=>0),0);assert.equal(plinkoSampleSlot(()=>1-Number.EPSILON),8);
function checkDistribution(counts,n){
 for(let i=0;i<9;i++)assert.ok(Math.abs(counts[i]-n*PLINKO_PROBS[i])<6*Math.sqrt(n*PLINKO_PROBS[i]*(1-PLINKO_PROBS[i]))+3,`Pocket ${i+1} exceeds statistical tolerance`);
}
for(let lane=0;lane<5;lane++){
 const random=seeded(828177+lane),counts=Array(9).fill(0);
 for(let i=0;i<100000;i++)counts[plinkoSampleSlot(random)]++;
 checkDistribution(counts,100000);
 console.log(`Entry ${lane+1}, 100,000 outcome samples: ${counts.map(n=>(n/1000).toFixed(2)+'%').join(', ')}`);
 for(let slot=0;slot<9;slot++){
  assert.equal(PLINKO_PATH_SEEDS[lane][slot].length,16);
  for(const seed of PLINKO_PATH_SEEDS[lane][slot]){
   const path=plinkoSimulate(lane,plinkoRandom(seed));
   assert.equal(path.slot,slot,'Fallback must preserve the selected probability outcome');assert.equal(path.frames.at(-1)[2],548);
  }
 }
}
// Each entry consumes the same outcome stream, regardless of animation search.
const sequences=PLINKO_LANES.map((_,lane)=>{const random=seeded(919);return Array.from({length:40},()=>plinkoPath(lane,random).slot);});
for(const sequence of sequences)assert.deepEqual(sequence,sequences[0]);
let trajectories=0,maxStep=0;
for(let lane=0;lane<5;lane++){
 const random=seeded(20260929+lane),counts=Array(9).fill(0);
 for(let run=0;run<1000;run++){
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
  counts[path.slot]++;
 }
 checkDistribution(counts,1000);
}
assert.ok(maxStep<30,'No sideways teleport between sampled positions');
// A completed left-side result must not pin the next preview to the previous pocket.
const previous=plinkoSimulate(0,()=>.75);
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
 now=round.startTime+round.path.duration+.001;round.tick();assert.equal(round.state,'finished');
 assert.equal(balance,before-50+reward);
 round.tick();round.snapshot(balance,true);assert.equal(balance,before-50+reward);
}
assert.equal(finishes,2);assert.equal(credits,2);
console.log(`Target probabilities: ${PLINKO_PROBS.map(p=>(p*100).toFixed(3)+'%').join(', ')}`);
console.log(`Passed 500,000 outcome samples, ${trajectories} complete trajectories, all 720 fallback seeds, entry independence, preview, and two-round settlement; maximum horizontal frame step ${maxStep.toFixed(2)}px.`);
