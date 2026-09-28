// Parent snapshots arrive every 100ms, including during the new 220ms charge.
// These interleavings must never unlock a second launch or debit after leaving.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function harness(){
 const elements=new Map(),sent=[],timers=new Map(),listeners={};let seq=0,now=0;
 const classes=()=>{const set=new Set();return {add:s=>set.add(s),remove:s=>set.delete(s),toggle:(s,on)=>on?set.add(s):set.delete(s),contains:s=>set.has(s)}};
 const el=id=>{if(!elements.has(id))elements.set(id,{id,classList:classes(),style:{},dataset:{},setAttribute(k,v){this[k]=String(v)},getContext:()=>({})});return elements.get(id)};
 const entries=Array.from({length:5},(_,i)=>Object.assign(el('entry'+i),{dataset:{lane:String(i)}}));
 const slots=Array.from({length:9},(_,i)=>el('slot'+i));
 const document={getElementById:el,body:el('body'),hidden:false,querySelectorAll:s=>s==='[data-lane]'?entries:slots,querySelector:s=>s==='.arena'?el('arena'):slots[Number(s.match(/\d+/)[0])],addEventListener:(name,f)=>listeners[name]=f};
 const parent={postMessage:d=>sent.push(d)};
 const context=vm.createContext({document,parent,location:{origin:'https://test.local'},window:{addEventListener:(name,f)=>listeners[name]=f},performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:()=>{},setTimeout:f=>{timers.set(++seq,f);return seq},clearTimeout:id=>timers.delete(id),plinkoAudio:new Proxy({toggle:()=>false},{get:(o,k)=>o[k]||(()=>{})})});
 vm.runInContext(fs.readFileSync('dist/plinko-engine.js','utf8'),context);
 vm.runInContext(fs.readFileSync('dist/plinko.js','utf8'),context);
 const snapshot=(data={})=>listeners.message({origin:'https://test.local',source:parent,data:{type:'plinko-state',state:'idle',roundId:'',balance:1000,elapsed:0,lane:2,...data}});
 return {el,sent,entries,document,listeners,snapshot,error:()=>listeners.message({origin:'https://test.local',source:parent,data:{type:'plinko-error',message:'Try again'}}),click:()=>el('launch').onclick(),dropCount:()=>sent.filter(d=>d.type==='plinko-drop').length,advance:()=>{now+=220;for(const [id,fn] of [...timers]){timers.delete(id);fn()}},timerCount:()=>timers.size};
}
{
 const h=harness();h.snapshot();h.click();h.snapshot();h.click();
 assert.equal(h.el('launch').disabled,true);assert.equal(h.timerCount(),1);assert.equal(h.dropCount(),0);
 h.advance();assert.equal(h.dropCount(),1);assert.equal(h.el('launch').disabled,true);
 h.snapshot();h.click();assert.equal(h.dropCount(),1);assert.equal(h.timerCount(),0);
 h.snapshot({state:'dropping',roundId:'a',balance:950});h.click();assert.equal(h.dropCount(),1);
 h.snapshot({state:'finished',roundId:'a',balance:975,result:{slot:3,multiplier:.5,amount:25,cost:50}});
 assert.equal(h.el('launch').disabled,false);assert.match(h.el('result').innerHTML,/净损失.*25/);
 h.click();h.snapshot({state:'finished',roundId:'a',balance:975});h.click();h.advance();assert.equal(h.dropCount(),2);
}
{
 const h=harness();h.snapshot();h.click();h.el('back').onclick();h.advance();
 assert.equal(h.dropCount(),0);assert.equal(h.el('launch').disabled,false);assert.match(h.el('status').textContent,/准备释放/);
 h.click();h.document.hidden=true;h.listeners.visibilitychange();h.advance();assert.equal(h.dropCount(),0);
}
{
 const h=harness();h.snapshot({balance:49});h.click();h.advance();assert.equal(h.dropCount(),0);
 h.snapshot();h.click();h.advance();h.listeners.message({origin:'https://test.local',source:undefined,data:{type:'plinko-error',message:'foreign'}});assert.equal(h.el('launch').disabled,true);
 // An authorized parent error recovers the control; another press may retry once.
 h.error();assert.equal(h.el('launch').disabled,false);assert.equal(h.el('message').textContent,'Try again');
 h.click();h.advance();assert.equal(h.dropCount(),2);
 h.snapshot({state:'dropping',roundId:'b',balance:950});h.snapshot({state:'finished',roundId:'b',balance:960,result:{slot:4,multiplier:.2,amount:10,cost:50}});
 assert.equal(h.el('launch').disabled,false);
}
console.log('Passed: charge/snapshot race, double-click protection, flight lock, consecutive rounds, cancel on leave/hidden, low balance and untrusted message guard.');
