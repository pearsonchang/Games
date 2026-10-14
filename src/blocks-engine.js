'use strict';

// Demo challenge economy. Payouts are capped; these tiers are not a calibrated RTP.
const BLOCK_SIZE = 8;
const BLOCK_COST = 50, BLOCK_MOVE_LIMIT = 30;
const BLOCK_REWARDS = Object.freeze([
  {score:0,amount:0}, {score:500,amount:20}, {score:1000,amount:50}, {score:2000,amount:80}
].map(Object.freeze));
function blockReward(score) {
  if (!Number.isFinite(score) || score<0) return 0;
  return BLOCK_REWARDS.reduce((amount,tier)=>score>=tier.score?tier.amount:amount,0);
}
const BLOCK_SHAPES = [
  ['single', [[0,0]]], ['pair-h', [[0,0],[0,1]]], ['pair-v', [[0,0],[1,0]]],
  ['bar3-h', [[0,0],[0,1],[0,2]]], ['bar3-v', [[0,0],[1,0],[2,0]]],
  ['bar4-h', [[0,0],[0,1],[0,2],[0,3]]], ['bar4-v', [[0,0],[1,0],[2,0],[3,0]]],
  ['bar5-h', [[0,0],[0,1],[0,2],[0,3],[0,4]]], ['bar5-v', [[0,0],[1,0],[2,0],[3,0],[4,0]]],
  ['square', [[0,0],[0,1],[1,0],[1,1]]],
  ['corner-ne', [[0,0],[0,1],[1,1]]], ['corner-nw', [[0,0],[0,1],[1,0]]],
  ['corner-sw', [[0,0],[1,0],[1,1]]], ['corner-se', [[0,1],[1,0],[1,1]]],
  ['tee-down', [[0,0],[0,1],[0,2],[1,1]]], ['tee-up', [[0,1],[1,0],[1,1],[1,2]]],
  ['tee-left', [[0,1],[1,0],[1,1],[2,1]]], ['tee-right', [[0,0],[1,0],[1,1],[2,0]]],
  ['ell-left', [[0,0],[1,0],[2,0],[2,1]]], ['ell-right', [[0,1],[1,1],[2,0],[2,1]]],
  ['ell-top', [[0,0],[0,1],[0,2],[1,0]]], ['ell-bottom', [[0,2],[1,0],[1,1],[1,2]]],
  ['zig-h', [[0,1],[0,2],[1,0],[1,1]]], ['zig-v', [[0,0],[1,0],[1,1],[2,1]]],
  ['zag-h', [[0,0],[0,1],[1,1],[1,2]]], ['zag-v', [[0,1],[1,0],[1,1],[2,0]]],
  ['rect-h', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]],
  ['rect-v', [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]],
  ['square3', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]]
].map(([name, cells]) => Object.freeze({name, cells: Object.freeze(cells.map(cell => Object.freeze(cell))), rows: Math.max(...cells.map(c => c[0])) + 1, cols: Math.max(...cells.map(c => c[1])) + 1}));
Object.freeze(BLOCK_SHAPES);

function blockInBounds(piece, row, col) {
  return !!piece && Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 &&
    row + piece.rows <= BLOCK_SIZE && col + piece.cols <= BLOCK_SIZE;
}
function blockFits(board, piece, row, col) {
  return blockInBounds(piece,row,col) && piece.cells.every(([r,c]) => !board[(row+r)*BLOCK_SIZE+col+c]);
}
function blockHasMove(board, piece) {
  if (!piece) return false;
  for (let r=0; r<BLOCK_SIZE; r++) for (let c=0; c<BLOCK_SIZE; c++) if (blockFits(board,piece,r,c)) return true;
  return false;
}
function blockLines(board) {
  const rows=[], cols=[];
  for (let i=0; i<BLOCK_SIZE; i++) {
    if (Array.from({length:BLOCK_SIZE},(_,j)=>board[i*BLOCK_SIZE+j]).every(Boolean)) rows.push(i);
    if (Array.from({length:BLOCK_SIZE},(_,j)=>board[j*BLOCK_SIZE+i]).every(Boolean)) cols.push(i);
  }
  return {rows,cols};
}
class BlocksRound {
  constructor({random=Math.random, now=Date.now, charge=()=>false, credit=()=>{}, onFinish=()=>{}}={}) {
    Object.assign(this,{random,now,charge,credit,onFinish,cost:BLOCK_COST,counter:0,id:'',state:'idle',revision:0,score:0,lines:0,combo:0,maxCombo:0,moves:0});
    this.board=Array(64).fill(0); this.tray=[null,null,null]; this.lastMove=null; this.result=null;
  }
  piece(shapeIndex,color) { return {...BLOCK_SHAPES[shapeIndex], color}; }
  deal() {
    return Array.from({length:3},()=>this.piece(Math.floor(this.random()*BLOCK_SHAPES.length),1+Math.floor(this.random()*5)));
  }
  start(roundId=this.id) {
    if (roundId!==this.id || this.state==='playing') return false;
    return this.restart(roundId,this.revision);
  }
  restart(roundId,revision) {
    if (roundId!==this.id || revision!==this.revision) return false;
    // Failed payment preserves the live board. An accepted restart forfeits its reward.
    if (!this.charge(this.cost)) return false;
    if (this.state==='playing') this.finish('abandoned');
    this.id=`blocks-${++this.counter}`; this.state='playing'; this.revision=0;
    this.board=Array(64).fill(0);
    // The first hand makes the basic row-clear discoverable; later hands are random.
    this.tray=[this.piece(5,1),this.piece(5,2),this.piece(9,4)];
    this.score=0; this.lines=0; this.combo=0; this.maxCombo=0; this.moves=0;
    this.startedAt=this.now(); this.lastMove=null; this.result=null;
    return true;
  }
  place(slot,row,col,roundId,revision) {
    if (this.state!=='playing' || this.moves>=BLOCK_MOVE_LIMIT || roundId!==this.id || revision!==this.revision || !Number.isInteger(slot) || slot<0 || slot>2) return false;
    const piece=this.tray[slot];
    if (!blockFits(this.board,piece,row,col)) return false;
    const placed=piece.cells.map(([r,c])=>(row+r)*8+col+c);
    placed.forEach(index=>this.board[index]=piece.color);
    const {rows,cols}=blockLines(this.board), count=rows.length+cols.length;
    const cleared=[...new Set([...rows.flatMap(r=>Array.from({length:8},(_,c)=>r*8+c)),...cols.flatMap(c=>Array.from({length:8},(_,r)=>r*8+c))])];
    const colors=cleared.map(index=>this.board[index]);
    this.combo=count ? this.combo+1 : 0;
    this.maxCombo=Math.max(this.maxCombo,this.combo);
    const gain=placed.length*5+100*count*count*this.combo;
    this.score+=gain; this.lines+=count; this.moves++; this.revision++;
    cleared.forEach(index=>this.board[index]=0);
    this.tray[slot]=null;
    const refilled=this.moves<BLOCK_MOVE_LIMIT && this.tray.every(piece=>piece===null);
    if (refilled) this.tray=this.deal();
    this.lastMove={revision:this.revision,placed,cleared,colors,rows,cols,gain,combo:this.combo,lines:count,refilled};
    if (this.moves>=BLOCK_MOVE_LIMIT) this.finish('steps');
    else if (!this.tray.some(piece=>blockHasMove(this.board,piece))) this.finish('blocked');
    return true;
  }
  finish(reason) {
    if (this.state!=='playing') return;
    const amount=reason==='abandoned'?0:blockReward(this.score);
    this.state='finished';
    this.result={id:this.id,gameId:'blocks',state:'finished',reason,won:amount>this.cost,amount,cost:this.cost,net:amount-this.cost,score:this.score,lines:this.lines,maxCombo:this.maxCombo,moves:this.moves,seconds:Math.max(0,Math.round((this.now()-this.startedAt)/1000))};
    if (amount>0) this.credit(amount);
    this.onFinish({...this.result});
  }
  snapshot(balance) {
    return {type:'blocks-state',roundId:this.id,state:this.state,revision:this.revision,balance,cost:this.cost,moveLimit:BLOCK_MOVE_LIMIT,remaining:Math.max(0,BLOCK_MOVE_LIMIT-this.moves),reward:blockReward(this.score),score:this.score,lines:this.lines,combo:this.combo,maxCombo:this.maxCombo,moves:this.moves,
      board:this.board.slice(),tray:this.tray.map(p=>p?{...p,cells:p.cells.map(c=>c.slice()),fits:blockHasMove(this.board,p)}:null),
      lastMove:this.lastMove?{...this.lastMove,placed:this.lastMove.placed.slice(),cleared:this.lastMove.cleared.slice(),colors:this.lastMove.colors.slice(),rows:this.lastMove.rows.slice(),cols:this.lastMove.cols.slice()}:null,
      result:this.result?{...this.result}:null};
  }
}
// Predict only deterministic placement/clearing. New random hands and game-over
// confirmation always come from the owning round, never from a second RNG.
function blockProjectPlacement(snapshot,slot,row,col) {
  const round=new BlocksRound({now:()=>0});
  Object.assign(round,snapshot,{id:snapshot.roundId,startedAt:0,board:snapshot.board.slice(),tray:snapshot.tray.slice(),result:null});
  round.deal=()=>[null,null,null];
  if(!round.place(slot,row,col,snapshot.roundId,snapshot.revision))return null;
  // Lock the last move while the owner confirms payment. A refill still waits for its RNG.
  round.state=round.moves>=BLOCK_MOVE_LIMIT || (!round.lastMove.refilled && round.state==='finished')?'settling':'playing';
  round.result=null;
  return round.snapshot(snapshot.balance);
}
if (typeof module!=='undefined') module.exports={BlocksRound,BLOCK_SHAPES,BLOCK_SIZE,BLOCK_COST,BLOCK_MOVE_LIMIT,BLOCK_REWARDS,blockReward,blockInBounds,blockFits,blockHasMove,blockLines,blockProjectPlacement};
