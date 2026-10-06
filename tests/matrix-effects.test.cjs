'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MatrixEffects}=require('../src/matrix-effects.js');
const {matrixPrize}=require('../src/matrix-engine.js');
const {MATRIX_EXAMPLES}=require('../src/matrix-examples.js');
function harness(){
 let sequence=0,enabled=true;const timers=new Map();
 const document={createElement:()=>node(),createElementNS:()=>node()};
 function node(){const classes=new Set();return {ownerDocument:document,children:[],dataset:{},style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},append(...values){for(const value of values){value.parent=this;this.children.push(value);}},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}};}
 const host=node(),layer=node();const effects=new MatrixEffects({host,layer,allowed:()=>enabled,schedule:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},cancel:id=>timers.delete(id)});
 return {effects,host,layer,timers,disable:()=>enabled=false,flush(){for(const [id,t]of [...timers]){if(timers.has(id)){timers.delete(id);t.fn();}}},count(){const walk=n=>1+n.children.reduce((sum,c)=>sum+walk(c),0);return walk(layer)-1;}};
}
test('matrix effects distinguish five-match, multi-line and bonus; partial returns never play a celebration banner',()=>{
 const h=harness();
 MATRIX_EXAMPLES.forEach((example,i)=>{
  const prize=matrixPrize(example.board),before=JSON.stringify(prize);h.effects.play(prize);
  assert.equal(h.host.dataset.fx,['return','five','five','bonus','multi','return'][i]);
  assert.equal(h.layer.children.some(n=>n.className==='matrix-fx-banner'),i>0&&i<5);
  assert.ok(h.count()<130,'bounded effect elements even for ten overlapping wins');
  assert.equal(h.timers.size,1,'replaying replaces the previous cleanup timer');
  assert.equal(JSON.stringify(prize),before,'presentation never changes the result');
 });
 h.flush();assert.equal(h.count(),0);assert.equal(h.timers.size,0);assert.equal(h.host.classList.contains('matrix-fx-active'),false);assert.equal(h.host.dataset.fx,undefined);
});
test('launch, repeated stops, result replacement and reduced motion all release transient particles and timers',()=>{
 const h=harness();h.effects.launch();assert.equal(h.host.dataset.fx,'launch');h.flush();
 for(let c=0;c<5;c++)h.effects.land(c);assert.equal(h.count(),25);assert.equal(h.timers.size,25);
 h.effects.play(matrixPrize(MATRIX_EXAMPLES[1].board));assert.equal(h.timers.size,1);
 h.effects.clear();assert.equal(h.count(),0);assert.equal(h.timers.size,0);
 h.disable();h.effects.launch();h.effects.land(0);h.effects.play(matrixPrize(MATRIX_EXAMPLES[3].board));
 assert.equal(h.count(),0);assert.equal(h.timers.size,0);assert.equal(h.host.dataset.fx,undefined);
});
