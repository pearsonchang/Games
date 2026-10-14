'use strict';
const diceRules=typeof module!=='undefined'?require('./dice-rules.js'):DiceRules;
const DICE_PAYOUTS=diceRules.payouts;
const dicePrize=diceRules.prize,diceWin=diceRules.win;
class DiceRound{
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge,credit,refund,onFinish,onStateChange,fairness=null}={}){
  Object.assign(this,{now,random,charge,credit,refund,onFinish,onStateChange,fairness,state:'idle',counter:0,cost:50,id:'',result:null,proof:null,error:null});
 }
 start(mode,target){
  if(['preparing','rolling'].includes(this.state)||!diceRules.valid(mode,target))return false;
  if(!this.charge(this.cost))return false;
  this.mode=mode;this.target=target;this.id='dice-'+(++this.counter);this.result=null;this.error=null;this.proof=null;
  if(!this.fairness){this.startedAt=this.now();this.values=Array.from({length:3},()=>1+Math.min(5,Math.max(0,Math.floor(this.random()*6))));this.state='rolling';return true;}
  this.state='preparing';
  this.proof={state:'preparing',assurance:'local-replay-only',rulesVersion:diceRules.manifest.version};
  const id=this.id;
  this.preparation=Promise.resolve().then(()=>this.fairness.prepare({roundId:id,nonce:this.counter,mode,target,cost:this.cost},committed=>{
   this.proof=committed;this.onStateChange?.();
  })).then(prepared=>{
   this.values=[...prepared.record.result.values];this.proof=prepared.public;this.startedAt=this.now();this.state='rolling';this.onStateChange?.();
  }).catch(()=>{
   // Never replace a failed proof with another random draw after charging.
   this.state='error';this.proof={state:'failed',assurance:'local-replay-only',roundId:id};
   (this.refund||this.credit)?.(this.cost);
   this.error='验证记录准备失败，50 模拟积分已退回。';this.onStateChange?.();
  });
  return true;
 }
 tick(){
  if(this.state!=='rolling'||this.now()-this.startedAt<1600)return;
  const won=diceWin(this.values,this.mode,this.target),amount=won?dicePrize(this.mode,this.target):0;
  if(this.fairness)this.proof=this.fairness.complete(this.id);
  this.state='finished';this.result={id:this.id,gameId:'dice',won,amount,cost:this.cost,seconds:2,mode:this.mode,target:this.target,values:[...this.values],sum:this.values.reduce((a,b)=>a+b,0)};
  if(won)this.credit(amount);this.onFinish?.(this.result);
 }
 snapshot(balance){this.tick();return {type:'dice-state',state:this.state,roundId:this.id,balance,cost:this.cost,mode:this.mode,target:this.target,result:this.result,fairness:this.proof,error:this.error,elapsed:this.state==='rolling'?this.now()-this.startedAt:0};}
}
if(typeof module!=='undefined')module.exports={DiceRound,dicePrize,diceWin};
