'use strict';
class MinesRound {
 static count=54;
 static mines=10;
 static cost=50;
 static rtp=.97;
 static quote(opened){
  if(!Number.isInteger(opened)||opened<1||opened>44)return 0;
  // Exact rational survival probability; truncate once, at hundredths of a point.
  let safe=1n,total=1n;
  for(let k=0;k<opened;k++){safe*=BigInt(44-k);total*=BigInt(54-k);}
  return Number(4850n*total/safe)/100;
 }
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge=()=>false,credit=()=>{},onFinish=()=>{}}={}){
  Object.assign(this,{now,random,charge,credit,onFinish});this.state='idle';this.id='';this.counter=0;this.revision=0;this.opened=0;this.payout=0;this.seconds=0;this.detonated=-1;this.autoCollected=false;this.board=[];
 }
 start(expectedId){
  if(expectedId!==this.id||this.state==='playing'||!this.charge(MinesRound.cost))return false;
  this.id='mines-'+(++this.counter);this.state='playing';this.opened=0;this.payout=0;this.seconds=0;this.startedAt=this.now();this.detonated=-1;this.autoCollected=false;
  this.board=Array.from({length:54},()=>({mine:false,revealed:false,flagged:false}));
  const pool=Array.from({length:54},(_,i)=>i);
  for(let n=0;n<10;n++){const j=n+Math.floor(this.random()*(54-n));[pool[n],pool[j]]=[pool[j],pool[n]];this.board[pool[n]].mine=true;}
  this.revision++;return true;
 }
 active(id){return id===this.id&&this.state==='playing';}
 reveal(index,id){
  if(!this.active(id)||!Number.isInteger(index)||index<0||index>=54)return false;
  const cell=this.board[index];if(cell.revealed||cell.flagged)return false;
  cell.revealed=true;this.revision++;
  if(cell.mine){this.detonated=index;this.state='lost';this.payout=0;this.finish();return true;}
  this.opened++;this.payout=MinesRound.quote(this.opened);
  if(this.opened===44){this.autoCollected=true;this.collect(id);}
  return true;
 }
 flag(index,id){
  if(!this.active(id)||!Number.isInteger(index)||index<0||index>=54)return false;
  const cell=this.board[index];if(cell.revealed||(!cell.flagged&&this.board.filter(c=>c.flagged).length>=10))return false;
  cell.flagged=!cell.flagged;this.revision++;return true;
 }
 collect(id){
  if(!this.active(id)||this.opened===0)return false;
  this.state='collected';this.revision++;this.credit(this.payout);this.finish();return true;
 }
 forfeit(id){
  if(!this.active(id))return false;
  this.state='forfeited';this.payout=0;this.revision++;this.finish();return true;
 }
 finish(){
  this.seconds=Math.max(0,Math.floor((this.now()-this.startedAt)/1000));
  this.onFinish({id:this.id,gameId:'minesweeper',won:this.state==='collected',state:this.state,seconds:this.seconds,amount:this.payout,cost:50,opened:this.opened,multiplier:this.payout/50,claimed:this.state==='collected',autoCollected:this.autoCollected});
 }
 snapshot(balance){
  const cells=(this.board.length?this.board:Array.from({length:54},()=>({}))).map((c,index)=>{
   const revealed=!!c.revealed||(this.state==='lost'&&c.mine);
   return {index,revealed:!!revealed,flagged:!!c.flagged,...(revealed?{mine:!!c.mine}:{})};
  });
  return {type:'mines-state',roundId:this.id,revision:this.revision,state:this.state,opened:this.opened,payout:this.payout,cost:50,rtp:.97,balance,seconds:this.state==='playing'?Math.max(0,Math.floor((this.now()-this.startedAt)/1000)):this.seconds,nextPayout:this.opened<44?MinesRound.quote(this.opened+1):null,nextRisk:this.opened<44?10/(54-this.opened):null,detonated:this.detonated,autoCollected:this.autoCollected,cells};
 }
}
if(typeof module!=='undefined')module.exports={MinesRound};
