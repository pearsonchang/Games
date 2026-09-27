'use strict';
const DICE_PAYOUTS=[0,0,0,5000,1600,800,500,350,250,200,180,180,200,250,350,500,800,1600,5000];
function dicePrize(mode,target){if(mode==='size'&&['small','big'].includes(target))return 100;if(mode==='sum'&&Number.isInteger(target)&&target>=3&&target<=18)return DICE_PAYOUTS[target];if(mode==='triple')return 1500;return 0}
function diceWin(values,mode,target){const sum=values.reduce((a,b)=>a+b,0),triple=values.every(v=>v===values[0]);return mode==='triple'?triple:mode==='sum'?sum===target:!triple&&(target==='small'?sum>=4&&sum<=10:sum>=11&&sum<=17)}
class DiceRound{
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge,credit,onFinish}={}){Object.assign(this,{now,random,charge,credit,onFinish,state:'idle',counter:0,cost:50,id:'',result:null});}
 start(mode,target){if(this.state==='rolling'||!dicePrize(mode,target))return false;if(!this.charge(this.cost))return false;this.mode=mode;this.target=target;this.id='dice-'+(++this.counter);this.startedAt=this.now();this.values=Array.from({length:3},()=>1+Math.min(5,Math.max(0,Math.floor(this.random()*6))));this.state='rolling';this.result=null;return true;}
 tick(){if(this.state!=='rolling'||this.now()-this.startedAt<1600)return;const won=diceWin(this.values,this.mode,this.target),amount=won?dicePrize(this.mode,this.target):0;this.state='finished';this.result={id:this.id,gameId:'dice',won,amount,cost:this.cost,seconds:2,mode:this.mode,target:this.target,values:[...this.values],sum:this.values.reduce((a,b)=>a+b,0)};if(won)this.credit(amount);this.onFinish?.(this.result);}
 snapshot(balance){this.tick();return {type:'dice-state',state:this.state,roundId:this.id,balance,cost:this.cost,mode:this.mode,target:this.target,result:this.result,elapsed:this.state==='rolling'?this.now()-this.startedAt:0};}
}
if(typeof module!=='undefined')module.exports={DiceRound,dicePrize,diceWin};
