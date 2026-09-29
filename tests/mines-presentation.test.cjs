const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(reduce=false){
 const nodes=new Map(),messages=[],timeouts=new Map(),listeners={};let sequence=0;
 const classes=()=>{const set=new Set();return {add:(...xs)=>xs.forEach(x=>set.add(x)),remove:(...xs)=>xs.forEach(x=>set.delete(x)),toggle:(x,on)=>on?set.add(x):set.delete(x),contains:x=>set.has(x)}};
 const make=()=>({children:[],style:{},dataset:{},classList:classes(),textContent:'',innerHTML:'',hidden:false,open:false,disabled:false,setAttribute(k,v){this[k]=String(v)},append(n){this.children.push(n)},replaceChildren(){this.children=[]},close(){this.open=false},showModal(){this.open=true},addEventListener(){}});
 const el=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const document={hidden:false,getElementById:el,querySelector:()=>el('game'),querySelectorAll:()=>[],createElement:make,addEventListener:(n,f)=>listeners[n]=f};
 const parent={postMessage:m=>messages.push(m)};
 const fx={};for(const name of ['play','clear','flag','reveal','explode','win','dialog'])fx[name]=()=>{};
 const ctx=vm.createContext({document,parent,window:{parent,matchMedia:()=>({matches:reduce}),addEventListener:(n,f)=>listeners[n]=f},location:{origin:'https://test.local'},MineEffects:class{constructor(){Object.assign(this,fx)}},mineAudio:new Proxy({toggle:()=>true},{get:(o,k)=>o[k]||(()=>{})}),setTimeout:f=>{timeouts.set(++sequence,f);return sequence},clearTimeout:id=>timeouts.delete(id),setInterval:()=>{},Date,console});
 vm.runInContext(fs.readFileSync('dist/game.js','utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 return {el,document,messages,run,flush:()=>{for(const [id,fn] of [...timeouts]){timeouts.delete(id);fn()}},visibility:()=>listeners.visibilitychange(),pause:value=>listeners.message({origin:'https://test.local',source:parent,data:{type:'platform-pause',paused:value}}),click:i=>el('board').onclick({target:{closest:()=>({dataset:{i:String(i)}})}})};
}
// All launch cells, including corners, preserve the first-click safe zone.
for(let i=0;i<54;i++){
 const h=harness(true);h.el('secondary').onclick();h.click(i);
 assert.equal(h.run('state'),'playing');assert.equal(h.run('board.filter(c=>c.mine).length'),10);
 assert.equal(h.run(`[${i},...neighbors(${i})].every(j=>!board[j].mine&&board[j].revealed)`),true);
 assert.equal(Number(h.el('coins').textContent),h.run('board.filter(c=>c.revealed&&!c.mine).length*10'));
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
 h.run('act(board.findIndex(c=>c.mine&&!c.flagged))');if(h.run('state')==='lost')assert.equal(h.el('dialog').open,true);
}
console.log('Passed: 54 safe openings, flag limits, immediate zero on loss, delayed dialogs, pause/resume, hidden-tab recovery, stale-result cancellation, 440-point win and one-time claim.');
