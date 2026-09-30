const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(reduce=false,random=()=>0){
 const nodes=new Map(),messages=[],timeouts=new Map(),listeners={},tools={};let sequence=0;
 const classes=()=>{const set=new Set();return {add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),toggle:(x,on)=>on?set.add(x):set.delete(x),contains:x=>set.has(x)}};
 const make=()=>({children:[],style:{},dataset:{},classList:classes(),textContent:'',innerHTML:'',hidden:false,open:false,disabled:false,setAttribute(k,v){this[k]=String(v)},append(n){this.children.push(n)},replaceChildren(){this.children=[]},close(){this.open=false},showModal(){this.open=true},addEventListener(){}});
 const el=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const document={hidden:false,getElementById:el,querySelector:()=>el('game'),querySelectorAll:()=>[],createElement:make,addEventListener:(n,f)=>listeners[n]=f,modelContext:{registerTool:t=>tools[t.name]=t}};
 const parent={postMessage:m=>messages.push(m)};
 const fx={};for(const name of ['play','clear','flag','reveal','explode','win','dialog'])fx[name]=()=>{};
 const ctx=vm.createContext({document,parent,Math:Object.assign(Object.create(Math),{random}),window:{parent,matchMedia:()=>({matches:reduce}),addEventListener:(n,f)=>listeners[n]=f},location:{origin:'https://test.local'},MineEffects:class{constructor(){Object.assign(this,fx)}},mineAudio:new Proxy({toggle:()=>true},{get:(o,k)=>o[k]||(()=>{})}),setTimeout:f=>{timeouts.set(++sequence,f);return sequence},clearTimeout:id=>timeouts.delete(id),setInterval:()=>{},Date,console});
 vm.runInContext(fs.readFileSync('dist/game.js','utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {el,document,messages,run,tools,flush:()=>{for(const [id,fn] of [...timeouts]){timeouts.delete(id);fn()}},visibility:()=>listeners.visibilitychange(),pause:value=>listeners.message({origin:'https://test.local',source:parent,data:{type:'platform-pause',paused:value}}),click:i=>el('board').onclick({target:{closest:()=>({dataset:{i:String(i)}})}})};
}
// Every location can hold a mine before any click, including the first pick.
for(let i=0;i<54;i++){
 let draw=0;const h=harness(true,()=>draw++===0?(i+.25)/54:0);h.el('secondary').onclick();
 assert.equal(h.run('board.filter(c=>c.mine).length'),10);assert.equal(h.run(`board[${i}].mine`),true);
 const layout=h.run('board.map(c=>c.mine).join()');h.click(i);
 assert.equal(h.run('state'),'lost');assert.equal(h.run('board.map(c=>c.mine).join()'),layout);assert.equal(Number(h.el('coins').textContent),0);
 assert.equal(h.el('dialog').open,true);assert.doesNotMatch(h.el('dialogText').textContent,/始终安全/);
}
{
 const h=harness();h.run('start()');const layout=h.run('board.map(c=>c.mine).join()');
 // These adjacent, mine-free cells would previously have caused a flood reveal.
 for(const [step,i] of [40,41,42,43].entries()){
  h.click(i);assert.equal(h.run('board.filter(c=>c.revealed).length'),step+1);assert.equal(Number(h.el('coins').textContent),(step+1)*10);
 }
 h.click(40);assert.equal(Number(h.el('coins').textContent),40);assert.equal(h.run('board.map(c=>c.mine).join()'),layout);
 h.pause(true);h.click(44);assert.equal(Number(h.el('coins').textContent),40);h.pause(false);
 const visible=h.tools.read_game.execute();assert.equal(visible.cells[40].mine,false);assert.equal('mine' in visible.cells[0],false);
 assert.equal(visible.cells.some(c=>'neighboringMines' in c),false);assert.equal(h.run('board.some(c=>"n" in c)'),false);
 for(const i of [40,41,42,43]){const cell=h.el('board').children[i];assert.match(cell['aria-label'],/安全金币/);assert.doesNotMatch(cell.innerHTML,/coin-value">[0-9]/);}
}
{
 const h=harness();h.el('secondary').onclick();h.click(14);const mine=h.run('board.findIndex(c=>c.mine)');
 h.click(mine);assert.equal(h.run('state'),'lost');assert.equal(Number(h.el('coins').textContent),0);assert.equal(h.el('dialog').open,false);
 assert.equal(h.messages.filter(m=>m.type==='game-finished'&&!m.won).length,1);h.run('claim()');assert.equal(h.messages.filter(m=>m.type==='game-reward').length,0);
 h.pause(true);h.flush();assert.equal(h.el('dialog').open,false);h.pause(false);assert.equal(h.el('dialog').open,true);assert.match(h.el('dialogText').textContent,/归零/);
}
{
 const h=harness();h.run('start();act(14);act(board.findIndex(c=>c.mine));start()');h.flush();assert.equal(h.el('dialog').open,false);assert.equal(h.run('state'),'playing');assert.equal(Number(h.el('coins').textContent),0);
 h.click(14);h.run('act(board.findIndex(c=>c.mine))');h.document.hidden=true;h.visibility();h.flush();assert.equal(h.el('dialog').open,false);h.document.hidden=false;h.visibility();assert.equal(h.el('dialog').open,true);
}
{
 const h=harness();h.run('start();act(14);for(let i=0;i<COUNT;i++)if(!board[i].mine)act(i)');
 assert.equal(h.run('state'),'won');assert.equal(Number(h.el('coins').textContent),440);assert.equal(Number(h.el('opened').textContent),44);
 assert.equal(h.messages.filter(m=>m.type==='game-finished'&&m.won).length,1);assert.equal(h.el('dialog').open,false);
 h.flush();assert.equal(h.el('dialog').open,true);h.el('dialogActions').children[0].onclick();h.run('claim()');
 assert.equal(h.messages.filter(m=>m.type==='game-reward').length,1);assert.equal(h.run('claimed'),true);assert.match(h.el('dialogTitle').textContent,/已领取/);
}
{
 const h=harness(true);h.run('start();for(let i=0;i<11;i++)act(i,true)');assert.equal(h.run('board.filter(c=>c.flagged).length'),10);assert.equal(Number(h.el('mines').textContent),0);
 h.run('act(0)');assert.equal(h.run('started'),false);h.run('act(0,true);act(0)');assert.equal(h.run('started'),true);
 assert.equal(h.run('state'),'lost');assert.equal(h.el('dialog').open,true);
}
console.log('Passed: all 54 cells can lose on the first click, 10 fixed mines generated before play, single-cell reveal, no adjacency clues, flag limits, immediate zero on loss, delayed dialogs, pause/resume, hidden-tab recovery, stale-result cancellation, 440-point win and one-time claim.');
