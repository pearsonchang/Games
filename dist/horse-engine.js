'use strict';
const HORSES=[
 {name:'流星',code:'CYAN',color:'#59d8f5',hue:0},
 {name:'紫电',code:'VIOLET',color:'#b29aff',hue:55},
 {name:'赤焰',code:'CORAL',color:'#ff9c8c',hue:150},
 {name:'极光',code:'MINT',color:'#70e2be',hue:315}
];
const HORSE_PRIZES=[140,40,14,0];
const HORSE_COUNTDOWN=3000;
class HorseRound{
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge=()=>false,credit=()=>{},onFinish=()=>{}}={}){
  Object.assign(this,{now,random,charge,credit,onFinish});this.state='idle';this.id='';this.counter=0;this.selected=0;this.elapsed=0;this.cost=50;this.result=null;
 }
 start(selected,expectedId){
  this.tick();if(expectedId!==this.id||this.state==='racing'||!Number.isInteger(selected)||selected<0||selected>3)return false;
  if(!this.charge(this.cost))return false;
  this.id='horse-'+(++this.counter);this.selected=selected;this.startedAt=this.now();this.elapsed=0;this.state='racing';this.result=null;
  // Every horse has the same 25% chance at each rank; selection never changes the draw.
  this.order=[0,1,2,3];for(let i=3;i>0;i--){const j=Math.min(i,Math.floor(this.random()*(i+1)));[this.order[i],this.order[j]]=[this.order[j],this.order[i]];}
  this.runs=HORSES.map((_,horse)=>{
   const rank=this.order.indexOf(horse),finish=11700+rank*400;
   const weights=Array.from({length:8},()=>.65+this.random()*.9),sum=weights.reduce((a,b)=>a+b,0);
   let total=0;const knots=[0,...weights.map(w=>(total+=w)/sum)];knots[knots.length-1]=1;
   return {finish,knots};
  });
  this.duration=HORSE_COUNTDOWN+12900;return true;
 }
 positions(){
  if(this.state==='idle')return [0,0,0,0];
  const raceTime=Math.max(0,this.elapsed-HORSE_COUNTDOWN);
  return this.runs.map(({finish,knots})=>{const t=Math.min(1,raceTime/finish),segment=Math.min(7,Math.floor(t*8)),f=t*8-segment;return knots[segment]+(knots[segment+1]-knots[segment])*f;});
 }
 tick(){
  if(this.state!=='racing')return;
  this.elapsed=Math.max(0,Math.min(this.duration,this.now()-this.startedAt));
  if(this.elapsed<this.duration)return;
  const rank=this.order.indexOf(this.selected)+1,amount=HORSE_PRIZES[rank-1];
  this.state='finished';this.result={id:this.id,gameId:'horse',selected:this.selected,rank,order:[...this.order],amount,cost:50,won:amount>=50,seconds:Math.ceil(this.duration/1000)};
  if(amount>0)this.credit(amount);this.onFinish(this.result);
 }
 snapshot(balance){
  const positions=this.positions(),raceTime=Math.max(0,this.elapsed-HORSE_COUNTDOWN);
  const finished=this.state==='idle'?[]:this.order.filter(h=>raceTime>=this.runs[h].finish);
  const order=[...finished,...[0,1,2,3].filter(h=>!finished.includes(h)).sort((a,b)=>positions[b]-positions[a]||a-b)];
  return {type:'horse-state',state:this.state,roundId:this.id,selected:this.selected,balance,cost:50,elapsed:this.elapsed,countdown:this.state==='racing'?Math.max(0,Math.ceil((HORSE_COUNTDOWN-this.elapsed)/1000)):0,positions,order,finished,result:this.result};
 }
}
if(typeof module!=='undefined')module.exports={HorseRound,HORSES,HORSE_PRIZES,HORSE_COUNTDOWN};
