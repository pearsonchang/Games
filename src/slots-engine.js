'use strict';
const SLOT_SYMBOLS = Object.freeze([
  {id:'planet',name:'环星',weight:8,multiplier:4,color:'#ff859a'},
  {id:'thruster',name:'推进器',weight:5,multiplier:7,color:'#62dbff'},
  {id:'crystal',name:'星晶',weight:3,multiplier:12,color:'#86e0cb'},
  {id:'satellite',name:'卫星',weight:2,multiplier:20,color:'#ffd17a'},
  {id:'portal',name:'跃迁门',weight:1,multiplier:35,color:'#bb9bff'},
  {id:'crest',name:'星际徽章',weight:1,multiplier:100,color:'#ff9daf'}
]);
const SLOT_STOPS = Object.freeze([1500,1950,2400]);
const SLOT_DURATION = 3000;
function slotDraw(random = Math.random) {
  const ticket = Math.min(19,Math.max(0,Math.floor(random()*20))); let cumulative=0;
  return SLOT_SYMBOLS.findIndex(symbol => (cumulative+=symbol.weight)>ticket);
}
function slotPrize(values) {
  const triple=values.every(value=>value===values[0]);
  const pair=!triple&&new Set(values).size===2;
  return {kind:triple?'triple':pair?'pair':'miss',multiplier:triple?SLOT_SYMBOLS[values[0]].multiplier:pair?1:0};
}
class SlotsRound {
  constructor({now=()=>Date.now(),random=()=>Math.random(),charge=()=>false,credit=()=>{},onFinish=()=>{}}={}) {
    Object.assign(this,{now,random,charge,credit,onFinish,state:'idle',id:'',counter:0,cost:50,result:null});
  }
  start(expectedId) {
    if(expectedId!==this.id||this.state==='spinning'||!this.charge(this.cost))return false;
    this.id='slots-'+(++this.counter);this.startedAt=this.now();this.values=Array.from({length:3},()=>slotDraw(this.random));
    this.state='spinning';this.result=null;return true;
  }
  tick() {
    if(this.state!=='spinning'||this.now()-this.startedAt<SLOT_DURATION)return;
    const prize=slotPrize(this.values),amount=this.cost*prize.multiplier;
    this.state='finished';
    this.result={id:this.id,gameId:'slots',values:[...this.values],...prize,amount,cost:this.cost,won:amount>this.cost,seconds:3};
    if(amount>0)this.credit(amount);this.onFinish(this.result);
  }
  snapshot(balance) {
    this.tick();const elapsed=this.state==='idle'?0:Math.min(SLOT_DURATION,Math.max(0,this.now()-this.startedAt));
    return {type:'slots-state',state:this.state,roundId:this.id,cost:this.cost,balance,elapsed,
      stopped:SLOT_STOPS.map((time,index)=>this.state!=='idle'&&elapsed>=time?this.values[index]:null),result:this.result};
  }
}
if(typeof module!=='undefined')module.exports={SlotsRound,SLOT_SYMBOLS,SLOT_STOPS,SLOT_DURATION,slotDraw,slotPrize};
