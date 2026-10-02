const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {RocketRound}=require('../dist/rocket-engine.js');
function harness(reduced=false,randomValue=.2){
 let now=0,balance=1000,sequence=0;const nodes=new Map(),listeners={},timers=new Map(),sounds=[],effects=[];
 const make=()=>({children:[],style:{setProperty(k,v){this[k]=v}},classList:{toggle(){}},textContent:'',innerHTML:'',disabled:false,open:false,
 setAttribute(k,v){this[k]=v},append(n){this.children.push(n)},replaceChildren(){this.children=[]},showModal(){this.open=true},close(){this.open=false},
 getBoundingClientRect(){return {left:50,top:100,width:100,height:100}},animate(){effects.push('animation');return {cancel(){}}}});
 const el=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id)};
 const engine=new RocketRound({now:()=>now,random:()=>randomValue,charge:n=>{if(balance<n)return false;balance-=n;return true},credit:n=>balance+=n});
 const document={hidden:false,getElementById:el,querySelector:()=>el('root'),createElement:make,addEventListener:(n,f)=>listeners[n]=f};
 const parent={postMessage(d){if(d.type==='rocket-launch')engine.start();if(d.type==='rocket-collect')engine.collect();if(d.type!=='game-return')sync()}};
 const audio=new Proxy({toggle:()=>true},{get:(o,k)=>o[k]||(()=>sounds.push(k))});
 const ctx=vm.createContext({document,window:{parent,matchMedia:()=>({matches:reduced,addEventListener(){}}),addEventListener:(n,f)=>listeners[n]=f},location:{origin:'https://test.local'},rocketAudio:audio,rocketScenery:{setFlight(){},setPaused(){}},setTimeout:f=>{timers.set(++sequence,f);return sequence},clearTimeout:n=>timers.delete(n),console});
 const message=data=>listeners.message({origin:'https://test.local',source:parent,data});
 function sync(){message(engine.snapshot(balance))}
 vm.runInContext(fs.readFileSync('dist/rocket.js','utf8'),ctx);
 return {el,engine,document,sounds,effects,sync,balance:()=>balance,advance:t=>{now+=t;sync()},pause:p=>message({type:'platform-pause',paused:p}),flush(){for(const f of [...timers.values()])f();timers.clear()},untrusted(){listeners.message({origin:'https://other.local',source:parent,data:{type:'rocket-state',state:'crashed'}})},visibility:()=>listeners.visibilitychange()};
}
{
 const h=harness();assert.match(h.el('root').className,/idle thrust-off/);assert.equal(h.balance(),1000);h.el('action').onclick();assert.equal(h.balance(),950);h.advance(2200);const quote=h.engine.payout;assert.match(h.el('action').textContent,/立即收取/);h.el('action').onclick();assert.equal(h.balance(),950+quote);assert.equal(h.el('payout-caption').textContent,'本局已到账');assert.equal(h.el('reward-particles').children.length,9);const count=h.effects.length;h.sync();h.sync();assert.equal(h.effects.length,count);assert.equal(h.engine.collect(),false);assert.equal(h.balance(),950+quote);h.flush();assert.equal(h.el('reward-particles').children.length,0);h.untrusted();assert.match(h.el('root').className,/collected/);
}
{
 const h=harness();h.el('action').onclick();h.pause(true);const count=h.effects.length,crashes=h.sounds.filter(x=>x==='crash').length;h.advance(40000);assert.equal(h.engine.state,'crashed');assert.equal(h.balance(),950);assert.equal(h.el('payout').textContent,'0 积分');assert.equal(h.effects.length,count);assert.equal(h.sounds.filter(x=>x==='crash').length,crashes);h.pause(false);h.sync();assert.match(h.el('root').className,/crashed thrust-off/);assert.equal(h.effects.length,count);assert.equal(h.engine.collect(),false);
}
{
 const h=harness(true);h.el('action').onclick();h.advance(1000);h.el('action').onclick();assert.equal(h.effects.length,0);assert.equal(h.el('reward-particles').children.length,0);assert.equal(h.engine.state,'collected');
}
{
 const h=harness();h.el('action').onclick();h.advance(40000);assert.equal(h.el('burst').children.length,33);h.document.hidden=true;h.visibility();assert.equal(h.el('burst').children.length,0);h.document.hidden=false;h.visibility();h.sync();assert.equal(h.el('burst').children.length,0);
}
{
 const h=harness(false,.99);h.el('action').onclick();assert.equal(h.balance(),950);
 assert.equal(h.el('status').textContent,'火箭坠毁');assert.equal(h.el('payout').textContent,'0 积分');
 assert.match(h.el('root').className,/crashed thrust-off/);assert.equal(h.el('action').disabled,false);
}
{
 const h=harness(false,.05);h.el('action').onclick();h.pause(true);h.advance(40000);
 assert.equal(h.balance(),1450);assert.equal(h.el('status').textContent,'达到上限 · 自动收取');
 assert.equal(h.el('payout').textContent,'500 积分');assert.match(h.el('message').textContent,/已自动到账/);
 const count=h.effects.length;h.pause(false);h.sync();assert.equal(h.effects.length,count);
 assert.equal(h.engine.collect(),false);assert.equal(h.balance(),1450);
}
console.log('Passed: idle engine off, charge/collect once, result labels, finite reward effects, hidden flight settlement, immediate crash, cap auto-collection, no replay, trusted messages, reduced motion.');
