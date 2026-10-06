'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {SlotsRound,SLOT_SYMBOLS,SLOT_STOPS,SLOT_DURATION,slotDraw,slotPrize}=require('../src/slots-engine.js');

test('slots: all 8,000 equally likely tickets give exactly 97% return',()=>{
  const symbols=Array.from({length:20},(_,ticket)=>slotDraw(()=>(ticket+.5)/20));
  SLOT_SYMBOLS.forEach((s,i)=>assert.equal(symbols.filter(v=>v===i).length,s.weight));
  let returned=0,pairs=0,triples=0,misses=0;
  for(const a of symbols)for(const b of symbols)for(const c of symbols){
    const result=slotPrize([a,b,c]);returned+=result.multiplier*50;
    if(result.kind==='pair'){pairs++;assert.equal(result.multiplier,1);assert.equal(new Set([a,b,c]).size,2);}
    else if(result.kind==='triple'){triples++;assert.equal(a,b);assert.equal(b,c);}
    else {misses++;assert.equal(result.multiplier,0);assert.equal(new Set([a,b,c]).size,3);}
  }
  assert.equal(pairs,4218);assert.equal(triples,674);assert.equal(misses,3108);
  assert.equal(returned/8000,48.5);assert.equal(returned/8000-50,-1.5);
  assert.equal(slotPrize([5,5,5]).multiplier,100);
  assert.equal(slotPrize([0,2,0]).kind,'pair'); // Non-adjacent pairs also count.
});
test('slots: charge once, progressively reveal reels, settle once, reject stale IDs and low balance',()=>{
  let now=1000,balance=1000,charges=0,credits=0,finishes=0,draws=0;
  const round=new SlotsRound({now:()=>now,random:()=>{draws++;return .999;},charge:n=>{if(balance<n)return false;charges++;balance-=n;return true;},credit:n=>{credits++;balance+=n;},onFinish:()=>finishes++});
  assert.equal(round.start('foreign'),false);assert.equal(round.start(''),true);assert.equal(round.start(''),false);
  assert.equal(draws,3);assert.equal(charges,1);assert.equal(balance,950);
  assert.deepEqual(round.snapshot(balance).stopped,[null,null,null]);assert.equal(round.snapshot(balance).result,null);
  assert.equal('values' in round.snapshot(balance),false);
  SLOT_STOPS.forEach((time,index)=>{now=1000+time;const s=round.snapshot(balance);assert.deepEqual(s.stopped,Array.from({length:3},(_,i)=>i<=index?5:null));assert.equal(s.result,null);});
  now=1000+SLOT_DURATION;round.tick();const finished=round.snapshot(balance);
  assert.equal(finished.result.amount,5000);assert.equal(finished.result.won,true);assert.equal(balance,5950);
  now+=100000;round.tick();round.tick();assert.equal(credits,1);assert.equal(finishes,1);
  assert.equal(round.start(''),false);assert.equal(round.start('slots-1'),true);assert.equal(charges,2);
  balance=49;now+=SLOT_DURATION;round.random=()=>0;round.tick();balance=49;
  assert.equal(round.start('slots-2'),false);assert.equal(charges,2);assert.equal(draws,6);
});
test('slots: a pair returns only the stake and a miss pays zero, including hidden-tab completion',()=>{
  for(const [draws,expected,kind] of [[[0,.45,0],50,'pair'],[[0,.45,.7],0,'miss']]){
    let now=0,balance=1000,finished=0;const queue=[...draws];
    const round=new SlotsRound({now:()=>now,random:()=>queue.shift(),charge:n=>{balance-=n;return true;},credit:n=>balance+=n,onFinish:()=>finished++});
    round.start('');now=999999;round.tick();const result=round.snapshot(balance).result;
    assert.equal(result.kind,kind);assert.equal(result.amount,expected);assert.equal(result.won,false);assert.equal(balance,950+expected);
    round.tick();assert.equal(finished,1);
  }
});
