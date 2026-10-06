'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MatrixRound,MATRIX_SYMBOLS,MATRIX_LINES,MATRIX_STOPS,MATRIX_DURATION,matrixDraw,matrixLinePrize,matrixBonusMultiplier,matrixPrize}=require('../src/matrix-engine.js');
// Exact RTP controls the average; this sample guards the distribution of outcomes.
test('matrix balanced paytable keeps frequent break-even and small wins in a reproducible sample',()=>{
 let seed=0x5ac817d3;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const n=100000,counts={miss:0,partial:0,return:0,win:0};let sum=0;
 for(let i=0;i<n;i++){
  const board=Array.from({length:5},()=>Array.from({length:3},()=>matrixDraw(random)));
  const p=matrixPrize(board);counts[p.kind]++;sum+=p.amount;
 }
 assert.ok(counts.return/n>.095&&counts.return/n<.12,'break-even remains around 10.8%');
 assert.ok(counts.win/n>.32&&counts.win/n<.35,'net wins remain around one in three');
 assert.ok((counts.miss+counts.partial)/n<.57,'net-loss frequency stays below the old 69%');
 assert.ok(Math.abs(sum/n-48.5086)<1,'sample return remains compatible with exact expectation');
 const {MATRIX_EXAMPLES}=require('../src/matrix-examples.js');
 const back=matrixPrize(MATRIX_EXAMPLES[5].board);
 assert.equal(back.amount,50);assert.equal(back.net,0);assert.equal(back.kind,'return');assert.equal(back.won,false);
});
test('matrix paths pay only a left-anchored 3–5 match, with one highest award per line',()=>{
 assert.equal(matrixLinePrize([0,1,0,0,0]),null);
 assert.equal(matrixLinePrize([0,0,5,0,0]),null); // Scatter is never a wild.
 assert.deepEqual(matrixLinePrize([0,4,0,1,2]),{symbol:0,count:3,multiplier:5,amount:25});
 assert.equal(matrixLinePrize([0,0,0,0,0]).amount,60);
 assert.equal(matrixLinePrize([4,4,4,4,4]).amount,125);
 assert.equal(matrixLinePrize([4,4,4,0,1]).amount,50); // Three wilds as crystal beat four planets.
 assert.equal(new Set(MATRIX_LINES.map(l=>l.rows.join(''))).size,10);
 for(const line of MATRIX_LINES)assert.ok(line.rows.length===5&&line.rows.every(r=>r>=0&&r<3));
});
test('matrix sums overlapping lines once each, adds scatter independently, and reports partial returns honestly',()=>{
 const board=Array.from({length:5},()=>[0,0,0]);const full=matrixPrize(board);
 assert.equal(full.lines.length,10);assert.equal(full.amount,600);assert.equal(full.net,550);
 const scatter=matrixPrize(Array.from({length:5},()=>[5,5,5]));
 assert.equal(scatter.lines.length,0);assert.equal(scatter.bonus.count,15);assert.equal(scatter.amount,1000);
 const mix=[[0,5,2],[0,1,5],[0,5,3],[1,2,0],[2,3,1]];
 const both=matrixPrize(mix);assert.equal(both.bonus.amount,100);assert.ok(both.lineAmount>0);assert.equal(both.amount,both.lineAmount+100);
 const partial=matrixPrize([[0,1,2],[0,2,3],[0,3,1],[1,0,2],[2,1,0]]);
 assert.equal(partial.amount,25);assert.equal(partial.kind,'partial');assert.equal(partial.won,false);assert.equal(partial.net,-25);
 assert.throws(()=>matrixPrize([[0,0,0]]),RangeError);
});
test('matrix probability: weighted exhaustive line outcomes plus exact binomial scatter keep RTP near 97%',()=>{
 const tickets=Array.from({length:100},(_,n)=>matrixDraw(()=>(n+.5)/100));
 MATRIX_SYMBOLS.forEach((s,i)=>assert.equal(tickets.filter(v=>v===i).length,s.weight));
 let lineReturn=0,weightSum=0;
 function visit(seq,weight){
  if(seq.length===5){weightSum+=weight;lineReturn+=weight*(matrixLinePrize(seq)?.multiplier||0);return;}
  MATRIX_SYMBOLS.forEach((s,i)=>visit([...seq,i],weight*s.weight));
 }
 visit([],1);assert.equal(weightSum,100**5);
 assert.equal(lineReturn,9480362536);
 const lineRtp=lineReturn/weightSum;
 let bonusRtp=0,comb=1;
 for(let k=0;k<=15;k++){if(k)comb=comb*(16-k)/k;bonusRtp+=comb*.03**k*.97**(15-k)*matrixBonusMultiplier(k);}
 const rtp=lineRtp+bonusRtp;
 assert.ok(rtp>.969&&rtp<.971,`RTP ${rtp}`);
 console.log(`Matrix exact model: line RTP ${lineRtp}; scatter RTP ${bonusRtp}; total ${rtp}; net ${(rtp-1)*50}`);
});
test('matrix teaching boards use the real payout table and explain their exact amounts',()=>{
 const {MATRIX_EXAMPLES}=require('../src/matrix-examples.js');
 assert.deepEqual(MATRIX_EXAMPLES.map(e=>matrixPrize(e.board).amount),[25,110,125,100,250,50]);
 assert.deepEqual(MATRIX_EXAMPLES.map(e=>matrixPrize(e.board).lines.length),[1,1,1,0,10,1]);
});
test('matrix charges once, makes fifteen draws once, conceals unopened columns, and settles once even after leaving',()=>{
 let now=0,balance=1000,draws=0,credits=0,finishes=0;
 const round=new MatrixRound({now:()=>now,random:()=>{draws++;return .01;},charge:n=>{if(balance<n)return false;balance-=n;return true;},credit:n=>{balance+=n;credits++;},onFinish:()=>finishes++});
 assert.equal(round.start('wrong'),false);assert.equal(round.start(''),true);assert.equal(round.start(''),false);
 assert.equal(draws,15);assert.equal(balance,950);assert.deepEqual(round.snapshot(balance).stopped,[null,null,null,null,null]);
 MATRIX_STOPS.forEach((t,i)=>{now=t;const s=round.snapshot(balance);assert.equal(s.stopped.filter(Boolean).length,i+1);assert.equal(s.result,null);});
 now=MATRIX_DURATION+90000;round.tick();round.tick();assert.equal(balance,1550);assert.equal(credits,1);assert.equal(finishes,1);
 assert.equal(round.result.gameId,'matrix');assert.equal(round.result.amount,600);
 assert.equal(round.start(''),false);balance=49;assert.equal(round.start(round.id),false);assert.equal(draws,15);
});
