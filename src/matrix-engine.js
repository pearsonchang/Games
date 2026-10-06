'use strict';
// Fifteen independent weighted draws. Paths describe visible row indices, left to right.
const MATRIX_SYMBOLS=Object.freeze([
 {id:'planet',name:'环星',weight:30,pays:[5,8,12]},
 {id:'thruster',name:'推进器',weight:25,pays:[6,10,16]},
 {id:'crystal',name:'星晶',weight:20,pays:[10,15,22]},
 {id:'satellite',name:'卫星',weight:15,pays:[10,17,25]},
 {id:'portal',name:'跃迁百搭',weight:7,pays:null},
 {id:'crest',name:'星际徽章',weight:3,pays:null}
].map(s=>Object.freeze({...s,pays:s.pays?Object.freeze(s.pays):null})));
const MATRIX_LINES=Object.freeze([
 {name:'中线',rows:[1,1,1,1,1]}, {name:'上轨',rows:[0,0,0,0,0]},
 {name:'下轨',rows:[2,2,2,2,2]}, {name:'V 形',rows:[0,1,2,1,0]},
 {name:'倒 V',rows:[2,1,0,1,2]}, {name:'上行',rows:[2,2,1,0,0]},
 {name:'下行',rows:[0,0,1,2,2]}, {name:'闪电',rows:[1,0,1,2,1]},
 {name:'反闪电',rows:[1,2,1,0,1]}, {name:'天桥',rows:[1,0,0,0,1]}
].map((l,id)=>Object.freeze({...l,id,rows:Object.freeze(l.rows)})));
const MATRIX_COST=50,MATRIX_LINE_BET=5,MATRIX_STOPS=Object.freeze([1050,1350,1650,1950,2250]),MATRIX_DURATION=2600;
function matrixDraw(random=Math.random){
 const ticket=Math.min(99,Math.max(0,Math.floor(random()*100)));let sum=0;
 return MATRIX_SYMBOLS.findIndex(s=>(sum+=s.weight)>ticket);
}
function matrixLinePrize(values){
 let best=null;
 for(let symbol=0;symbol<4;symbol++){
  let count=0;for(const value of values){if(value===symbol||value===4)count++;else break;}
  if(count<3)continue;
  const multiplier=MATRIX_SYMBOLS[symbol].pays[count-3];
  if(!best||multiplier>best.multiplier||(multiplier===best.multiplier&&count>best.count))best={symbol,count,multiplier,amount:multiplier*MATRIX_LINE_BET};
 }
 return best;
}
function matrixBonusMultiplier(count){return count>=5?20:count===4?5:count===3?2:0;}
function matrixPrize(board){
 if(!Array.isArray(board)||board.length!==5||board.some(col=>!Array.isArray(col)||col.length!==3||col.some(v=>!Number.isInteger(v)||v<0||v>=MATRIX_SYMBOLS.length)))throw new RangeError('Expected a 5 × 3 symbol board');
 const lines=[];
 for(const line of MATRIX_LINES){
  const prize=matrixLinePrize(line.rows.map((row,col)=>board[col][row]));
  if(prize)lines.push({...prize,lineId:line.id,cells:line.rows.slice(0,prize.count).map((row,col)=>[col,row])});
 }
 const bonusCells=[];board.forEach((col,x)=>col.forEach((v,y)=>{if(v===5)bonusCells.push([x,y]);}));
 const bonus={count:bonusCells.length,multiplier:matrixBonusMultiplier(bonusCells.length),cells:bonusCells};
 bonus.amount=bonus.multiplier*MATRIX_COST;
 const lineAmount=lines.reduce((total,line)=>total+line.amount,0),amount=lineAmount+bonus.amount;
 return {lines,bonus,lineAmount,amount,multiplier:amount/MATRIX_COST,net:amount-MATRIX_COST,won:amount>MATRIX_COST,kind:amount>MATRIX_COST?'win':amount===MATRIX_COST?'return':amount>0?'partial':'miss'};
}
class MatrixRound{
 constructor({now=()=>Date.now(),random=()=>Math.random(),charge=()=>false,credit=()=>{},onFinish=()=>{}}={}){
  Object.assign(this,{now,random,charge,credit,onFinish,cost:MATRIX_COST,state:'idle',id:'',counter:0,result:null});
 }
 start(expectedId){
  if(expectedId!==this.id||this.state==='spinning'||!this.charge(this.cost))return false;
  this.id='matrix-'+(++this.counter);this.startedAt=this.now();
  this.board=Array.from({length:5},()=>Array.from({length:3},()=>matrixDraw(this.random)));
  this.state='spinning';this.result=null;return true;
 }
 tick(){
  if(this.state!=='spinning'||this.now()-this.startedAt<MATRIX_DURATION)return;
  this.state='finished';this.result={id:this.id,gameId:'matrix',...matrixPrize(this.board),board:this.board.map(c=>[...c]),cost:this.cost,seconds:MATRIX_DURATION/1000};
  if(this.result.amount>0)this.credit(this.result.amount);this.onFinish(this.result);
 }
 snapshot(balance){
  this.tick();const elapsed=this.state==='idle'?0:Math.max(0,Math.min(MATRIX_DURATION,this.now()-this.startedAt));
  return {type:'matrix-state',state:this.state,roundId:this.id,cost:this.cost,balance,elapsed,stopped:MATRIX_STOPS.map((t,i)=>this.state!=='idle'&&elapsed>=t?[...this.board[i]]:null),result:this.result};
 }
}
if(typeof module!=='undefined')module.exports={MatrixRound,MATRIX_SYMBOLS,MATRIX_LINES,MATRIX_COST,MATRIX_LINE_BET,MATRIX_STOPS,MATRIX_DURATION,matrixDraw,matrixLinePrize,matrixBonusMultiplier,matrixPrize};
