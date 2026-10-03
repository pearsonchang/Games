const assert=require('node:assert/strict');
const {MinesRound}=require('../server/engines/mines.cjs');
function setup(balance=1000,random=()=>0){let clock=0,credits=[],charges=[],rounds=[];const engine=new MinesRound({now:()=>clock,random,charge(n){if(balance<n)return false;balance=(Math.round(balance*100)-n*100)/100;charges.push(n);return true},credit(n){balance=(Math.round(balance*100)+Math.round(n*100))/100;credits.push(n)},onFinish:r=>rounds.push(r)});return {engine,charges,credits,rounds,balance:()=>balance,time:n=>clock=n};}
assert.equal(MinesRound.quote(0),0);assert.equal(MinesRound.quote(1),59.52);assert.equal(MinesRound.quote(5),141.23);assert.equal(MinesRound.quote(10),467.76);assert.equal(MinesRound.quote(44),1160639588745);
let survival=1;for(let k=1;k<=44;k++){survival*=(45-k)/(55-k);const gross=survival*MinesRound.quote(k);assert.ok(gross<=48.5+1e-10);assert.ok(gross>=48.49-1e-10);}
for(let i=0;i<54;i++){
 let draw=0;const h=setup(1000,()=>draw++===0?(i+.25)/54:0),e=h.engine;assert.ok(e.start(''));const layout=e.board.map(c=>c.mine).join();assert.equal(e.board.filter(c=>c.mine).length,10);assert.equal(e.board[i].mine,true);
 assert.ok(e.reveal(i,e.id));assert.equal(e.state,'lost');assert.equal(e.payout,0);assert.equal(h.balance(),950);assert.equal(e.board.map(c=>c.mine).join(),layout);assert.equal(h.rounds.length,1);assert.equal(e.collect(e.id),false);
}
{
 const h=setup(),e=h.engine;assert.ok(e.start(''));const id=e.id;assert.equal(e.start(''),false);assert.equal(e.start(id),false);assert.deepEqual(h.charges,[50]);assert.equal(e.collect(id),false);
 assert.ok(e.reveal(40,id));assert.equal(e.opened,1);assert.equal(e.payout,59.52);assert.equal(e.board.filter(c=>c.revealed).length,1);assert.equal(e.reveal(40,id),false);assert.equal(e.reveal(41,'stale'),false);
 const snap=e.snapshot(h.balance());assert.equal(snap.cells[40].mine,false);assert.equal('mine' in snap.cells[0],false);assert.equal('neighboringMines' in snap.cells[40],false);assert.equal(snap.nextRisk,10/53);
 h.time(12000);assert.ok(e.collect(id));assert.equal(h.balance(),1009.52);assert.deepEqual(h.credits,[59.52]);assert.equal(h.rounds[0].seconds,12);assert.equal(e.collect(id),false);assert.equal(e.reveal(41,id),false);
 assert.ok(e.start(id));assert.equal(e.collect(id),false);assert.equal(e.start(id),false);assert.equal(h.balance(),959.52);
}
{
 const h=setup(49.99),e=h.engine;assert.equal(e.start(''),false);assert.equal(h.balance(),49.99);assert.equal(e.state,'idle');assert.equal(e.board.length,0);
}
{
 const h=setup(),e=h.engine;e.start('');for(let i=10;i<20;i++)assert.ok(e.flag(i,e.id));assert.equal(e.flag(20,e.id),false);assert.equal(e.reveal(10,e.id),false);assert.equal(e.opened,0);assert.ok(e.flag(10,e.id));assert.ok(e.reveal(10,e.id));assert.ok(e.forfeit(e.id));assert.equal(h.balance(),950);assert.equal(e.payout,0);assert.equal(h.rounds[0].state,'forfeited');assert.equal(e.forfeit(e.id),false);
}
{
 const h=setup(),e=h.engine;e.start('');for(let i=10;i<54;i++)assert.ok(e.reveal(i,e.id));assert.equal(e.state,'collected');assert.equal(e.opened,44);assert.equal(e.autoCollected,true);assert.equal(h.credits.length,1);assert.equal(e.collect(e.id),false);assert.equal(h.rounds.length,1);
}
console.log('Passed: exact cash-out quotes, all 44 RTP bounds, all 54 first-click losses, fixed mines, single reveal, no hidden clues, entry cost, insufficient funds, duplicate/stale actions, one-time payout, forfeit, full-board auto-collection.');
