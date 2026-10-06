'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {matrixRevealedStatus,MatrixLineTour}=require('../src/matrix-interface.js');
test('matrix instruments ignore demo decoration and count only revealed columns, reset every round, and show all crest tiers',()=>{
 const preview=Array.from({length:5},()=>[5,5,5]);
 assert.deepEqual(matrixRevealedStatus({state:'idle',stopped:preview}),{landed:[false,false,false,false,false],count:0,crests:0});
 assert.deepEqual(matrixRevealedStatus({state:'spinning',stopped:[[0,5,2],null,null,null,null],result:{board:preview}}),{landed:[true,false,false,false,false],count:1,crests:1});
 assert.equal(matrixRevealedStatus({state:'spinning',stopped:[null,null,null,null,null]}).crests,0);
 assert.equal(matrixRevealedStatus({state:'finished',stopped:preview}).crests,15);
});
function tourHarness(){
 let seq=0,allowed=true;const timers=new Map(),selections=[],states=[];
 const tour=new MatrixLineTour({select:e=>selections.push(e),change:s=>states.push(s),allowed:()=>allowed,schedule:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id)});
 return {tour,timers,selections,states,disable:()=>allowed=false,step(){const [id,{fn}]=timers.entries().next().value;timers.delete(id);fn();}};
}
test('winning-line tour shows every paid line and bonus exactly once then stops; replay never settles or mutates results',()=>{
 const h=tourHarness(),entries=[3,1,7,'bonus'];h.tour.start(entries);
 assert.deepEqual(h.selections,[3]);assert.equal([...h.timers.values()][0].ms,4400);
 while(h.timers.size)h.step();assert.deepEqual(h.selections,entries);assert.equal(h.tour.running,false);assert.equal(h.tour.index,3);
 h.tour.replay();assert.equal(h.selections.at(-1),3);assert.equal(h.timers.size,1);h.tour.clear();assert.equal(h.timers.size,0);assert.deepEqual(entries,[3,1,7,'bonus']);
});
test('manual selection, new rounds, hidden pages and reduced motion cancel the tour without stale highlights',()=>{
 const h=tourHarness();h.tour.start([0,1,2]);h.tour.choose(2);assert.equal(h.timers.size,0);assert.equal(h.tour.index,2);assert.equal(h.selections.at(-1),2);
 h.tour.choose(9);assert.equal(h.tour.index,-1);assert.equal(h.timers.size,0);
 h.tour.replay();h.disable();h.step();assert.equal(h.timers.size,0);assert.equal(h.selections.at(-1),0);
 h.tour.start([7,8]);assert.equal(h.timers.size,0);assert.equal(h.selections.at(-1),7);
 h.tour.clear();assert.equal(h.tour.entries.length,0);assert.equal(h.states.at(-1).total,0);
 h.tour.start([9],{autoplay:false});assert.equal(h.timers.size,0);assert.equal(h.selections.at(-1),9);
});
