'use strict';
class RocketRound {
 static cost=50;
 static rtp=.97;
 static maxMultiplier=10;
 static multiplierAt(seconds){return 1+.12*seconds+.004*seconds*seconds;}
 static secondsAt(multiplier){const gain=Math.max(0,multiplier-1);return 2*gain/(.12+Math.sqrt(.0144+.016*gain));}
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge,credit,onFinish}={}){
  this.now=now;this.random=random;this.charge=charge;this.credit=credit;this.onFinish=onFinish;
  this.state='idle';this.counter=0;this.cost=RocketRound.cost;this.elapsed=0;this.payout=0;this.multiplier=1;this.id='';this.autoCollected=false;
 }
 start(){
  this.tick();if(this.state==='flying'||!this.charge(this.cost))return false;
  this.id='rocket-'+(++this.counter);this.startedAt=this.now();
  // One independent draw per round. For 1 <= m <= 10:
  // P(crashMultiplier > m) = .97 / m; gross EV = 50 * .97.
  // The 3% mass below 1 crashes before any cash-out is possible.
  const u=Math.max(Number.EPSILON,Math.min(1,this.random()));
  const crashMultiplier=RocketRound.rtp/u;
  this.crashAt=this.startedAt+RocketRound.secondsAt(crashMultiplier)*1000;
  this.capAt=this.startedAt+RocketRound.secondsAt(RocketRound.maxMultiplier)*1000;
  this.state='flying';this.elapsed=0;this.multiplier=1;this.payout=this.cost;this.autoCollected=false;
  this.tick();return true;
 }
 tick(){
  if(this.state!=='flying')return;
  const now=this.now(),endAt=Math.min(this.crashAt,this.capAt);
  this.elapsed=Math.max(0,(Math.min(now,endAt)-this.startedAt)/1000);
  const hundredths=Math.min(RocketRound.maxMultiplier*100,Math.floor(RocketRound.multiplierAt(this.elapsed)*100));
  this.multiplier=hundredths/100;this.payout=this.cost*hundredths/100;
  // Resolve event order even when the browser wakes after both timestamps.
  // A crash wins a tie; collecting never overrides an already-due crash.
  if(this.crashAt<=this.capAt&&now>=this.crashAt){this.state='crashed';this.payout=0;this.finish();}
  else if(now>=this.capAt){this.multiplier=RocketRound.maxMultiplier;this.payout=this.cost*RocketRound.maxMultiplier;this.settle(true);}
 }
 settle(auto){this.state='collected';this.autoCollected=auto;this.credit(this.payout);this.finish();}
 collect(){this.tick();if(this.state!=='flying')return false;this.settle(false);return true;}
 finish(){this.onFinish?.({id:this.id,gameId:'rocket',won:this.state==='collected',seconds:Math.floor(this.elapsed),amount:this.payout,cost:this.cost,multiplier:this.multiplier,claimed:this.state==='collected',autoCollected:this.autoCollected});}
 thrust(){
  if(this.state!=='flying')return {power:0,phase:'off'};
  // Cosmetic only: neither flame nor engine sound depends on the crash time.
  if(this.elapsed<1.2)return {power:.12+.88*this.elapsed/1.2,phase:'ignition'};
  return {power:.86+.14*Math.cos((this.elapsed-1.2)*7.5),phase:'cruise'};
 }
 snapshot(balance){this.tick();return {type:'rocket-state',state:this.state,roundId:this.id,elapsed:this.elapsed,multiplier:this.multiplier,payout:this.payout,cost:this.cost,balance,rtp:RocketRound.rtp,maxMultiplier:RocketRound.maxMultiplier,autoCollected:this.autoCollected,thrust:this.thrust()};}
}
if(typeof module!=='undefined')module.exports={RocketRound};
