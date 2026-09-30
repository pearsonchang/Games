const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {MinesRound}=require('../dist/mines-engine.js');
function harness(reduce=false){
 const nodes=new Map(),messages=[],timeouts=new Map(),listeners={},tools={};let sequence=0,balance=1000;
 const classes=()=>{const set=new Set();return {add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),toggle:(x,on)=>on?set.add(x):set.delete(x),contains:x=>set.has(x)}};
 const make=()=>({children:[],style:{},dataset:{},classList:classes(),textContent:'',innerHTML:'',hidden:false,open:false,disabled:false,setAttribute(k,v){this[k]=String(v)},append(n){this.children.push(n)},replaceChildren(){this.children=[]},close(){this.open=false},showModal(){this.open=true},addEventListener(){}});
 const el=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const engine=new MinesRound({random:()=>0,charge:n=>{if(balance<n)return false;balance=(Math.round(balance*100)-n*100)/100;return true},credit:n=>balance=(Math.round(balance*100)+Math.round(n*100))/100});
 const document={hidden:false,getElementById:el,querySelector:()=>el('game'),querySelectorAll:()=>[],createElement:make,addEventListener:(n,f)=>listeners[n]=f,modelContext:{registerTool:t=>tools[t.name]=t}};
 const parent={postMessage(d){messages.push(d);switch(d.type){case 'mines-start':engine.start(d.roundId);break;case 'mines-reveal':engine.reveal(d.index,d.roundId);break;case 'mines-flag':engine.flag(d.index,d.roundId);break;case 'mines-collect':engine.collect(d.roundId);break;case 'mines-forfeit':engine.forfeit(d.roundId);break;}if(d.type!=='game-return')listeners.message({origin:'https://test.local',source:parent,data:engine.snapshot(balance)})}};
 const fx={};for(const name of ['play','clear','flag','reveal','explode','win','dialog'])fx[name]=()=>{};
 const ctx=vm.createContext({document,window:{parent,matchMedia:()=>({matches:reduce}),addEventListener:(n,f)=>listeners[n]=f},location:{origin:'https://test.local'},MinesRound,MineEffects:class{constructor(){Object.assign(this,fx)}},mineAudio:new Proxy({toggle:()=>true},{get:(o,k)=>o[k]||(()=>{})}),setTimeout:f=>{timeouts.set(++sequence,f);return sequence},clearTimeout:id=>timeouts.delete(id),setInterval:()=>{},Date,console});
 vm.runInContext(fs.readFileSync('dist/game.js','utf8'),ctx);const run=s=>vm.runInContext(s,ctx);
 return {el,document,messages,engine,balance:()=>balance,run,tools,flush:()=>{for(const [id,fn] of [...timeouts]){timeouts.delete(id);fn()}},visibility:()=>listeners.visibilitychange(),pause:value=>listeners.message({origin:'https://test.local',source:parent,data:{type:'platform-pause',paused:value}}),click:i=>el('board').onclick({target:{closest:()=>({dataset:{i:String(i)}})}})};
}
{
 const h=harness();assert.equal(h.engine.state,'idle');assert.equal(h.balance(),1000);assert.match(h.el('primary').textContent,/50/);h.el('secondary').onclick();assert.equal(h.balance(),1000);h.el('dialog').close();h.el('primary').onclick();assert.equal(h.balance(),950);assert.equal(h.el('primary').disabled,true);
 h.click(40);assert.equal(h.engine.opened,1);assert.equal(h.el('coins').textContent,'59.52');assert.match(h.el('board').children[40]['aria-label'],/安全金币/);assert.doesNotMatch(h.el('board').children[40].innerHTML,/coin-value">[0-9]/);assert.equal(h.el('primary').disabled,false);
 h.pause(true);h.click(41);assert.equal(h.engine.opened,1);h.pause(false);h.el('primary').onclick();assert.equal(h.balance(),1009.52);assert.equal(h.engine.state,'collected');assert.equal(h.el('dialog').open,false);h.flush();assert.equal(h.el('dialog').open,true);assert.match(h.el('dialogText').textContent,/59.52/);assert.match(h.el('dialogText').textContent,/9.52/);
 const visible=h.tools.read_game.execute();assert.equal('mine' in visible.cells[0],false);assert.equal('neighboringMines' in visible.cells[40],false);
}
{
 const h=harness();h.run('start()');h.click(14);h.click(0);assert.equal(h.engine.state,'lost');assert.equal(h.el('coins').textContent,'0');assert.equal(h.el('dialog').open,false);
 h.pause(true);h.flush();assert.equal(h.el('dialog').open,false);h.pause(false);assert.equal(h.el('dialog').open,true);assert.match(h.el('dialogText').textContent,/归零/);
}
{
 const h=harness();h.run('start()');h.click(0);h.run('start()');h.flush();assert.equal(h.el('dialog').open,false);assert.equal(h.engine.state,'playing');assert.equal(h.el('coins').textContent,'0');assert.equal(h.balance(),900);
 h.click(0);h.document.hidden=true;h.visibility();h.flush();assert.equal(h.el('dialog').open,false);h.document.hidden=false;h.visibility();assert.equal(h.el('dialog').open,true);
}
{
 const h=harness(true);h.run('start()');h.click(0);assert.equal(h.el('dialog').open,true);assert.equal(h.balance(),950);assert.match(h.el('dialogText').textContent,/第一格也可能踩雷/);
}
console.log('Passed: free preview, explicit paid start, quote/collect UI, hidden data, one-cell reveal, paused input, delayed results, pause/visibility recovery, stale dialog cancellation, reduced motion.');
