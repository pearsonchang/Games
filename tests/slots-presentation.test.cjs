'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {test}=require('node:test');
const {SLOT_SYMBOLS,slotPrize}=require('../src/slots-engine.js');
function harness(reduced=false){
  const nodes=new Map(),listeners={},sent=[],sounds=[],timers=new Map();let timerId=0;
  const classes=()=>{const values=new Set();return {add:(...s)=>s.forEach(v=>values.add(v)),remove:(...s)=>s.forEach(v=>values.delete(v)),toggle:(s,on)=>on?values.add(s):values.delete(s),contains:s=>values.has(s)};};
  const node=()=>({innerHTML:'',textContent:'',disabled:false,dataset:{},style:{setProperty(k,v){this[k]=v;}},open:false,showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},querySelectorAll(){return [];},classList:classes(),children:[],events:{},setAttribute(k,v){this[k]=v;},addEventListener(name,fn){this.events[name]=fn;},append(child){this.children.push(child);},replaceChildren(){this.children=[];}});
  const el=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const reels=Array.from({length:3},(_,i)=>Object.assign(node(),{querySelector:()=>el('strip'+i)}));
  const rows=Array.from({length:6},(_,i)=>Object.assign(node(),{dataset:{symbol:String(i)}}));
  class Sound {unlock(){} roll(){sounds.push('roll');} stop(){} land(i){sounds.push('land'+i);} result(cue){sounds.push(cue);} tone(){sounds.push('tone');} leave(){} toggle(){return false;}}
  const parent={postMessage:data=>sent.push(data)};
  const document={hidden:false,body:node(),getElementById:el,querySelectorAll:s=>s==='.reel'?reels:rows,createElement:node,addEventListener:(n,fn)=>listeners[n]=fn};
  const context=vm.createContext({window:{parent,addEventListener:(n,fn)=>listeners[n]=fn},document,location:{origin:'https://demo.test'},matchMedia:()=>({matches:reduced}),SlotsAudio:Sound,SLOT_SYMBOLS,slotPrize,console,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync('src/slots-effects.js','utf8'),context);
  vm.runInContext(fs.readFileSync('src/slots.js','utf8'),context);
  const receive=(data,origin='https://demo.test',source=parent)=>listeners.message({data:{type:'slots-state',state:'idle',roundId:'',balance:1000,stopped:[null,null,null],result:null,...data},origin,source});
  return {el,receive,reels,rows,listeners,document,sent,sounds,parent,timers};
}
test('slots UI: locks spin, respects message source, lands actual symbols and distinguishes stake return from winnings',()=>{
  const h=harness();assert.equal(h.sent[0].type,'slots-ready');
  h.receive({});h.el('spin').onclick();h.el('spin').onclick();assert.equal(h.sent.filter(m=>m.type==='slots-spin').length,1);assert.equal(h.el('spin').disabled,true);
  h.receive({state:'spinning',roundId:'slots-1',balance:950});assert.ok(h.reels.every(r=>r.classList.contains('spinning')));
  h.receive({state:'finished',roundId:'slots-1',stopped:[5,5,5]},'https://foreign.test');assert.ok(h.reels.every(r=>r.classList.contains('spinning')));
  h.receive({state:'spinning',roundId:'slots-1',balance:950,stopped:[0,null,null]});assert.equal(h.reels[0].classList.contains('spinning'),false);assert.match(h.el('strip0').innerHTML,/#planet/);
  const result={id:'slots-1',values:[0,2,0],amount:50,cost:50,multiplier:1,kind:'pair',won:false};
  h.receive({state:'finished',roundId:'slots-1',stopped:result.values,result});
  assert.match(h.el('result').innerHTML,/返还投入/);assert.match(h.el('result').innerHTML,/净收益 0/);assert.equal(h.el('spin').disabled,false);
  assert.equal(h.el('confetti').children.length,0);assert.equal(h.sounds.includes('crest'),false);
  const history=h.el('history').innerHTML;h.receive({state:'finished',roundId:'slots-1',stopped:result.values,result});assert.equal(h.el('history').innerHTML,history);
  h.receive({state:'finished',roundId:'slots-1',balance:49,stopped:result.values,result});assert.equal(h.el('spin').disabled,true);
});
test('slots effects: celebrate a real triple once, clean up on completion or hiding, and never replay on return',()=>{
  const h=harness();h.receive({});h.receive({state:'spinning',roundId:'slots-1',balance:950});
  const result={id:'slots-1',values:[0,0,0],amount:200,cost:50,multiplier:4,kind:'triple',won:true};
  const finish={state:'finished',roundId:'slots-1',balance:1150,stopped:result.values,result};
  h.receive(finish);
  assert.equal(h.el('machine').classList.contains('celebrating'),true);
  assert.equal(h.el('confetti').children.length,32);
  assert.equal(h.el('win-amount').textContent,'+200');
  assert.equal(h.el('machine').dataset.reward,'planet');assert.equal(h.sounds.at(-1),'planet');
  h.receive(finish);assert.equal(h.el('confetti').children.length,32);
  h.el('win-burst').events.animationend({target:h.el('win-burst'),animationName:'reward-burst'});
  assert.equal(h.el('confetti').children.length,0);
  assert.equal(h.el('machine').classList.contains('celebrating'),false);
  assert.equal(h.reels.some(r=>r.classList.contains('win-motion')),false);
  h.receive({state:'spinning',roundId:'slots-2',balance:1100});
  h.receive({...finish,roundId:'slots-2',result:{...result,id:'slots-2'}});
  assert.equal(h.el('confetti').children.length,32);
  h.document.hidden=true;h.listeners.visibilitychange();
  assert.equal(h.el('machine').classList.contains('celebrating'),false);
  assert.equal(h.el('confetti').children.length,0);
  h.document.hidden=false;h.listeners.visibilitychange();
  h.receive({...finish,roundId:'slots-2',result:{...result,id:'slots-2'}});
  assert.equal(h.el('confetti').children.length,0);
  assert.equal(h.el('machine').classList.contains('celebrating'),false);
});
test('slots UI: reduced motion and paused finishes never fire confetti or replay a win',()=>{
  for(const reduced of [false,true]){
    const h=harness(reduced);h.receive({});h.receive({state:'spinning',roundId:'slots-1',balance:950});
    if(!reduced)h.listeners.message({origin:'https://demo.test',source:h.parent,data:{type:'platform-pause',paused:true}});
    const result={id:'slots-1',values:[5,5,5],amount:5000,cost:50,multiplier:100,kind:'triple',won:true};
    h.receive({state:'finished',roundId:'slots-1',balance:5950,stopped:result.values,result});
    assert.equal(h.el('confetti').children.length,0);assert.match(h.el('result').innerHTML,/星际徽章/);
    assert.equal(h.el('spin').disabled,false);assert.equal(h.el('balance').textContent,'5,950');
    const wins=h.sounds.filter(s=>s==='crest').length;h.receive({state:'finished',roundId:'slots-1',balance:5950,stopped:result.values,result});assert.equal(h.sounds.filter(s=>s==='crest').length,wins);
  }
});
test('slots rewards: all six symbols select distinct cues and motifs; stake return stays restrained',()=>{
  for(let i=-1;i<6;i++){
    const h=harness();h.receive({});h.receive({state:'spinning',roundId:'slots-1',balance:950});
    const pair=i<0,values=pair?[0,4,0]:[i,i,i],multiplier=pair?1:SLOT_SYMBOLS[i].multiplier;
    const result={id:'slots-1',kind:pair?'pair':'triple',values,multiplier,amount:multiplier*50};
    h.receive({state:'finished',roundId:'slots-1',stopped:values,result});
    assert.equal(h.sounds.at(-1),pair?'return':SLOT_SYMBOLS[i].id);
    assert.equal(h.el('machine').dataset.reward,pair?'return':SLOT_SYMBOLS[i].id);
    assert.equal(h.el('machine').classList.contains('celebrating'),!pair);
    assert.equal(h.el('machine').classList.contains('returning'),pair);
    assert.equal(h.el('confetti').children.length,[0,32,40,48,56,68,84][i+1]);
    assert.equal(h.timers.size,1);
    [...h.timers.values()][0]();assert.equal(h.el('confetti').children.length,0);
  }
});
test('slots preview never changes the balance, history or round, and cleans up when closed',()=>{
  const h=harness();h.receive({});const before=h.sent.length;
  h.el('examples-open').onclick();assert.equal(h.el('fx-preview').open,true);
  assert.equal(h.el('example-total').textContent,'200');assert.equal(h.el('example-net').textContent,'+150 积分');
  assert.equal(h.sounds.length,0);assert.equal(h.el('preview-confetti').children.length,0);
  const totals=['0','50','200','350','600','1,000','1,750','5,000'];
  const profits=['−50','0','+150','+300','+550','+950','+1,700','+4,950'];
  for(let i=-2;i<6;i++){
    h.el('fx-options').onclick({target:{closest:()=>({dataset:{previewSymbol:String(i)}})}});
    assert.equal(h.el('preview-machine').dataset.reward,i===-2?'miss':i===-1?'return':SLOT_SYMBOLS[i].id);
    assert.equal(h.el('preview-win-caption').textContent,'预览不扣分，不发放积分');
    assert.equal(h.el('example-cost').textContent,'50');assert.equal(h.el('example-total').textContent,totals[i+2]);
    assert.equal(h.el('example-net').textContent,profits[i+2]+' 积分');
    assert.match(h.el('example-note').textContent,i===-2?/投入不返还/:/已包含投入的 50/);
    assert.equal(h.el('balance').textContent,'1,000');assert.equal(h.el('history').innerHTML,'');
    assert.equal(h.sent.length,before);assert.equal(h.timers.size,i===-2?0:1);
  }
  h.el('spin').onclick();assert.equal(h.sent.length,before);
  h.el('fx-close').onclick();assert.equal(h.el('preview-confetti').children.length,0);assert.equal(h.timers.size,0);
  h.receive({state:'spinning',roundId:'slots-1',balance:950});h.el('fx-open').onclick();assert.equal(h.el('fx-preview').open,false);
});
