const assert=require('node:assert/strict');
const {RocketRound}=require('../src/rocket-engine.js');
function setup(u=.2,initial=1000){
 let now=0,balance=initial,draws=0;const charges=[],credits=[],finished=[];
 const round=new RocketRound({now:()=>now,random:()=>{draws++;return u;},charge:n=>{if(balance<n)return false;balance-=n;charges.push(n);return true;},credit:n=>{balance+=n;credits.push(n);},onFinish:r=>finished.push(r)});
 return {round,charges,credits,finished,setTime:t=>now=t,balance:()=>balance,draws:()=>draws};
}
// Immediate failures are debited once and cannot be cashed out, even at t=0.
for(const u of [.97,.99,1]){
 const h=setup(u);assert.equal(h.round.start(),true);assert.equal(h.round.state,'crashed');
 assert.equal(h.round.collect(),false);h.round.tick();h.round.snapshot(h.balance());
 assert.equal(h.balance(),950);assert.equal(h.round.payout,0);assert.equal(h.draws(),1);
 assert.equal(h.finished.length,1);assert.deepEqual(h.credits,[]);
}
{
 const h=setup(.2,49.99);assert.equal(h.round.start(),false);assert.equal(h.draws(),0);assert.deepEqual(h.charges,[]);
}
// Displayed multiplier is the actual quote, including half-point rewards.
{
 const h=setup();h.round.start();assert.equal(h.round.start(),false);assert.equal(h.draws(),1);
 h.setTime(RocketRound.secondsAt(1.23)*1000+.001);const s=h.round.snapshot(h.balance());
 assert.equal(s.multiplier,1.23);assert.equal(s.payout,61.5);assert.equal(h.round.collect(),true);
 assert.equal(h.round.collect(),false);h.round.tick();assert.equal(h.balance(),1011.5);
 assert.equal(h.finished.length,1);assert.equal(h.finished[0].autoCollected,false);
 assert.deepEqual(h.credits,[61.5]);
}
// No last-moment cash-out can win a crash tie or a delayed browser tick.
{
 const h=setup(.97/2);h.round.start();h.setTime(h.round.crashAt);
 assert.equal(h.round.collect(),false);assert.equal(h.round.state,'crashed');assert.equal(h.balance(),950);
}
for(const u of [0,.05]){
 const h=setup(u);h.round.start();h.setTime(1000000);h.round.tick();
 assert.equal(h.round.state,'collected');assert.equal(h.round.autoCollected,true);
 assert.equal(h.round.multiplier,10);assert.equal(h.round.payout,500);assert.equal(h.balance(),1450);
 h.round.tick();assert.equal(h.round.collect(),false);assert.equal(h.finished.length,1);assert.deepEqual(h.credits,[500]);
}
{
 const h=setup(.2);h.round.start();h.setTime(1000000);h.round.tick();
 assert.equal(h.round.state,'crashed');assert.equal(h.round.payout,0);assert.equal(h.balance(),950);
}
// Two surviving rounds with different futures expose identical UI/audio inputs.
{
 const a=setup(.8),b=setup(.05);a.round.start();b.round.start();
 for(const t of [0,300,900,1200,1400]){
  a.setTime(t);b.setTime(t);
  assert.deepEqual(a.round.snapshot(a.balance()),b.round.snapshot(b.balance()));
 }
 const keys=Object.keys(a.round.snapshot(a.balance()));
 for(const key of ['crashAt','capAt','crashMultiplier','remaining','duration'])assert.equal(keys.includes(key),false);
}
// Exercise actual start/tick/collect across stratified independent uniform draws.
// Quantile sampling avoids flaky Monte Carlo tests, while covering the whole CDF.
const n=100000,targets=[1,1.01,1.2,1.5,2,3,5,8,10],report=[];
for(const target of targets){
 let total=0,wins=0,instant=0;
 for(let i=0;i<n;i++){
  const h=setup((i+.5)/n);h.round.start();if(h.round.state==='crashed')instant++;
  h.setTime(target===1?0:RocketRound.secondsAt(target)*1000+.001);h.round.collect();
  total+=h.round.payout;if(h.round.state==='collected')wins++;
 }
 const average=total/n,net=average-50;
 assert.equal(instant,3000);assert.ok(Math.abs(wins/n-.97/target)<=1/n);
 assert.ok(Math.abs(average-48.5)<.006,`target ${target}: ${average}`);assert.ok(net<0);
 report.push({target,success: wins/n,averageReturn:average,averageNet:net});
}
console.table(report);
console.log('Passed: 97% RTP across 900,000 rounds, immediate crash, one-time settlement, fractional quotes, cap auto-collection, event ordering, no predictive presentation data.');
