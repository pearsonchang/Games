'use strict';
class RocketRound {
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge,credit,onFinish}={}){this.now=now;this.random=random;this.charge=charge;this.credit=credit;this.onFinish=onFinish;this.state='idle';this.counter=0;this.cost=50;this.elapsed=0;this.payout=0;this.multiplier=1;this.id='';}
 start(){this.tick();if(this.state==='flying')return false;if(!this.charge(this.cost))return false;this.id='rocket-'+(++this.counter);this.state='flying';this.startedAt=this.now();const u=Math.max(.000001,Math.min(.999999,this.random()));this.crashAt=this.startedAt+Math.min(35000,1400-Math.log(1-u)*7500);this.elapsed=0;this.multiplier=1;this.payout=50;return true;}
 tick(){if(this.state!=='flying')return;const now=this.now();this.elapsed=Math.max(0,(Math.min(now,this.crashAt)-this.startedAt)/1000);this.multiplier=1+.12*this.elapsed+.004*this.elapsed*this.elapsed;this.payout=Math.floor(this.cost*this.multiplier);if(now>=this.crashAt){this.state='crashed';this.payout=0;this.finish();}}
 collect(){this.tick();if(this.state!=='flying')return false;this.state='collected';this.credit(this.payout);this.finish();return true;}
 finish(){this.onFinish?.({id:this.id,gameId:'rocket',won:this.state==='collected',seconds:Math.floor(this.elapsed),amount:this.payout,cost:this.cost,multiplier:this.multiplier,claimed:this.state==='collected'});}
 thrust(){if(this.state!=='flying')return {power:0,phase:'off'};const duration=(this.crashAt-this.startedAt)/1000,ramp=Math.min(1.2,duration*.25),fade=Math.min(2.8,duration*.35),remaining=duration-this.elapsed;let phase='cruise',power=1;if(this.elapsed<ramp){phase='ignition';power=.12+.88*this.elapsed/ramp}else if(remaining<fade){phase='weakening';power=Math.max(0,remaining/fade)}return {power,phase};}
 snapshot(balance){this.tick();return {type:'rocket-state',state:this.state,roundId:this.id,elapsed:this.elapsed,multiplier:this.multiplier,payout:this.payout,cost:this.cost,balance,thrust:this.thrust()};}
}
if(typeof module!=='undefined')module.exports={RocketRound};
