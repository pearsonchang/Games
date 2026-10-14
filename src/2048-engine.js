'use strict';

const FUSION_COST = 50;
const FUSION_REWARDS = Object.freeze([{tile:512,amount:20},{tile:1024,amount:50},{tile:2048,amount:80}].map(Object.freeze));
const FUSION_DIRECTIONS = Object.freeze(['left','right','up','down']);
// Fixed, public stage weights. The board after merging determines the next draw.
const FUSION_SPAWN_STAGES = Object.freeze([
  {minTile:0,weights:[[2,75],[4,23],[8,2]]},
  {minTile:32,weights:[[2,45],[4,30],[8,20],[16,5]]},
  {minTile:128,weights:[[2,25],[4,30],[8,25],[16,15],[32,5]]},
  {minTile:256,weights:[[2,18],[4,25],[8,25],[16,20],[32,9],[64,3]]},
  {minTile:512,weights:[[2,10],[4,18],[8,25],[16,25],[32,15],[64,6],[128,1]]},
  {minTile:1024,weights:[[2,5],[4,10],[8,15],[16,25],[32,25],[64,14],[128,5],[256,1]]}
].map(stage=>Object.freeze({...stage,weights:Object.freeze(stage.weights.map(([value,chance])=>Object.freeze({value,chance})))})));
function fusionSpawnStage(highest) {
  return FUSION_SPAWN_STAGES.reduce((stage,next)=>highest>=next.minTile?next:stage,FUSION_SPAWN_STAGES[0]);
}
function fusionSpawnValue(highest,roll) {
  const weights=fusionSpawnStage(highest).weights,ticket=roll*100;
  let cumulative=0;
  for(const outcome of weights){cumulative+=outcome.chance;if(ticket<cumulative)return outcome.value;}
  return weights.at(-1).value;
}
function fusionReward(highest) {
  return FUSION_REWARDS.reduce((amount,tier)=>highest>=tier.tile?tier.amount:amount,0);
}

// Traverse from the leading edge so a newly merged tile cannot merge again.
function fusionSlide(board,direction) {
  if (!FUSION_DIRECTIONS.includes(direction)) return null;
  const next=Array(16).fill(0),transitions=[],merges=[];
  let gain=0;
  for(let line=0;line<4;line++) {
    const indices=Array.from({length:4},(_,i)=>direction==='left'?line*4+i:direction==='right'?line*4+3-i:direction==='up'?i*4+line:(3-i)*4+line);
    const occupied=indices.filter(i=>board[i]);
    let target=0;
    for(let i=0;i<occupied.length;i++) {
      const from=occupied[i],to=indices[target++],value=board[from];
      const pair=i+1<occupied.length&&board[occupied[i+1]]===value;
      next[to]=pair?value*2:value;
      transitions.push({from,to,value});
      if(pair) {
        transitions.push({from:occupied[++i],to,value});
        merges.push({index:to,value:value*2});
        gain+=value*2;
      }
    }
  }
  return {board:next,changed:next.some((v,i)=>v!==board[i]),gain,transitions,merges};
}
function fusionHasMove(board) {
  return board.some((v,i)=>!v||(i%4<3&&v===board[i+1])||(i<12&&v===board[i+4]));
}
class FusionRound {
  constructor({random=Math.random,now=Date.now,charge=()=>false,credit=()=>{},onFinish=()=>{}}={}) {
    Object.assign(this,{random,now,charge,credit,onFinish,cost:FUSION_COST,counter:0,id:'',state:'idle',revision:0,score:0,moves:0,highest:0});
    this.board=Array(16).fill(0);this.lastMove=null;this.result=null;
  }
  spawn() {
    const empty=this.board.flatMap((v,i)=>v?[]:[i]);
    if(!empty.length)return null;
    const index=empty[Math.floor(this.random()*empty.length)],value=fusionSpawnValue(Math.max(...this.board),this.random());
    this.board[index]=value;
    return {index,value};
  }
  start(roundId=this.id) {
    if(roundId!==this.id||this.state==='playing')return false;
    return this.restart(roundId,this.revision);
  }
  restart(roundId,revision) {
    if(roundId!==this.id||revision!==this.revision)return false;
    // Charge first: a rejected payment must not destroy the current round.
    if(!this.charge(this.cost))return false;
    if(this.state==='playing')this.finish('abandoned');
    this.id=`2048-${++this.counter}`;this.state='playing';this.revision=0;
    this.board=Array(16).fill(0);this.score=0;this.moves=0;this.highest=0;
    this.startedAt=this.now();this.lastMove=null;this.result=null;
    this.spawn();this.spawn();this.highest=Math.max(...this.board);
    return true;
  }
  move(direction,roundId,revision) {
    if(this.state!=='playing'||roundId!==this.id||revision!==this.revision)return false;
    const slide=fusionSlide(this.board,direction);
    if(!slide)return false;
    // A no-op acknowledges the input without consuming randomness or changing state.
    if(!slide.changed)return true;
    this.board=slide.board;this.score+=slide.gain;this.moves++;this.revision++;
    const spawn=this.spawn();this.highest=Math.max(...this.board);
    this.lastMove={revision:this.revision,direction,gain:slide.gain,transitions:slide.transitions,merges:slide.merges,spawn};
    if(this.highest>=2048)this.finish('target');
    else if(!fusionHasMove(this.board))this.finish('blocked');
    return true;
  }
  finish(reason) {
    if(this.state!=='playing')return;
    const amount=reason==='abandoned'?0:fusionReward(this.highest);
    this.state='finished';
    this.result={id:this.id,gameId:'2048',state:'finished',reason,won:amount>this.cost,amount,cost:this.cost,net:amount-this.cost,highest:this.highest,score:this.score,moves:this.moves,seconds:Math.max(0,Math.round((this.now()-this.startedAt)/1000))};
    if(amount>0)this.credit(amount);
    this.onFinish({...this.result});
  }
  snapshot(balance) {
    const m=this.lastMove,stage=fusionSpawnStage(this.highest),nextStage=FUSION_SPAWN_STAGES.find(s=>s.minTile>this.highest);
    return {type:'2048-state',roundId:this.id,state:this.state,revision:this.revision,balance,cost:this.cost,board:this.board.slice(),score:this.score,moves:this.moves,highest:this.highest,reward:fusionReward(this.highest),
      spawnProfile:{minTile:stage.minTile,nextUnlock:nextStage?.minTile??null,outcomes:stage.weights.map(outcome=>({...outcome}))},
      lastMove:m?{...m,transitions:m.transitions.map(t=>({...t})),merges:m.merges.map(t=>({...t})),spawn:m.spawn?{...m.spawn}:null}:null,result:this.result?{...this.result}:null};
  }
}
if(typeof module!=='undefined')module.exports={FusionRound,FUSION_COST,FUSION_REWARDS,FUSION_DIRECTIONS,FUSION_SPAWN_STAGES,fusionSpawnStage,fusionSpawnValue,fusionReward,fusionSlide,fusionHasMove};
