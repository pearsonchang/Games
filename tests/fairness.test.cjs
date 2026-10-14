'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Fairness=require('../src/fairness-core.js'),rules=require('../src/dice-rules.js');
const {DiceRound}=require('../src/dice-engine.js');
const {PointsWallet}=require('../src/platform-wallet.js');
const {GameBridge}=require('../src/platform-bridge.js');
const input={roundId:'dice-1',nonce:1,mode:'size',target:'small',cost:50};
const make=()=>new Fairness.DemoProvider();

test('published dice odds enumerate all 216 combinations and keep each existing mode return explicit',()=>{
 assert.deepEqual(rules.odds('size','small'),{wins:105,total:216,amount:100,rtpNumerator:10500,rtpDenominator:10800});
 assert.equal(rules.odds('size','big').wins,105);assert.equal(rules.odds('triple',null).wins,6);
 assert.deepEqual(Array.from({length:16},(_,i)=>rules.odds('sum',i+3).wins),[1,3,6,10,15,21,25,27,27,25,21,15,10,6,3,1]);
 assert.throws(()=>rules.odds('sum',19));
});

test('canonical manifests are stable and unsafe numeric or JSON values are rejected',async()=>{
 assert.equal(Fairness.canonical({b:2,a:[true,null,'x']}),'{"a":[true,null,"x"],"b":2}');
 for(const value of [NaN,Infinity,1.1,undefined,2n,new Date(),{bad:undefined}])assert.throws(()=>Fairness.canonical(value));
 assert.equal(await Fairness.rulesHash(),'737a12bac5af9ec73c383a650c74650909ca2c9c7fa8790da1ea6fbfec8cd9fa');
 // Frontend releases include the exact legacy verification input, but not the
 // independently developed contracts workspace or its package dependencies.
 const input=require('../src/dice-vrf-standard-input.json');
 const source=input.sources?.['DiceVRF.sol']?.content;
 assert.equal(typeof source,'string','the published legacy source must be present');
 assert.ok(source.includes('0x'+await Fairness.rulesHash()),'Published Solidity and JS must pin the same manifest');
});

test('commitment is exposed before client entropy; hidden seed and results stay private until complete',async()=>{
 let calls=0,published=false;
 const api={subtle:crypto.webcrypto.subtle,getRandomValues(array){calls++;array.fill(calls);if(calls===3)assert.equal(published,true);return array;}};
 const provider=new Fairness.DemoProvider({crypto:api});
 const prepared=await provider.prepare(input,commit=>{
  published=true;assert.equal(commit.state,'committed');
  for(const name of ['serverSeed','clientSeed','randomWord','result'])assert.equal(commit[name],undefined);
 });
 for(const name of ['serverSeed','randomWord','result'])assert.equal(prepared.public[name],undefined);
 assert.deepEqual(prepared.record.result.values,await Fairness.diceFromWord(prepared.record.randomWord));
 assert.equal((await Fairness.verify(provider.complete('dice-1'))).ok,true);
 assert.throws(()=>provider.complete('dice-1'));
 await assert.rejects(provider.prepare(input));
});

test('independent record recomputation rejects changed seeds, choices, payouts, rules, dice and hash',async()=>{
 const provider=make();await provider.prepare(input);const record=provider.complete('dice-1');
 assert.equal((await Fairness.verify(record)).ok,true);
 const attacks=[r=>r.serverSeed='0'.repeat(64),r=>r.clientSeed='1'.repeat(64),r=>r.randomWord='2'.repeat(64),r=>r.inputs.target='big',r=>r.inputs.mode='invalid',r=>r.cost=0,r=>r.rulesHash='3'.repeat(64),r=>r.rulesVersion='dice-v2',r=>r.roundId='dice-2',r=>r.nonce=2,r=>r.result.amount+=1,r=>r.result.values[0]=r.result.values[0]%6+1,r=>r.recordHash='4'.repeat(64),r=>r.assurance='chain-verified',r=>r.state='prepared'];
 for(const mutate of attacks){const edited=structuredClone(record);mutate(edited);assert.equal((await Fairness.verify(edited)).ok,false,mutate.toString());}
 for(const bad of [null,[],{},'text',17])assert.equal((await Fairness.verify(bad)).ok,false);
});

test('a record hash alone cannot authorize changed payouts, even if attacker recomputes it',async()=>{
 const provider=make();await provider.prepare(input);const record=provider.complete('dice-1');record.result.amount=9999;
 const {recordHash,...payload}=record;record.recordHash=await Fairness.sha256(Fairness.canonical(payload));
 const verified=await Fairness.verify(record);assert.equal(verified.ok,false);
 assert.equal(verified.checks.find(c=>c.name==='完整记录摘要').ok,true);
 assert.equal(verified.checks.find(c=>c.name==='命中与积分结算').ok,false);
});

test('byte rejection mapping skips 252..255 instead of introducing modulo bias',async()=>{
 const api={getRandomValues:crypto.webcrypto.getRandomValues.bind(crypto.webcrypto),subtle:{digest:async()=>Uint8Array.from([252,253,254,255,6,...Array(27).fill(0)]).buffer}};
 assert.deepEqual(await Fairness.diceFromWord('0'.repeat(64),api),[1,1,1]);
 const reject={...api,subtle:{digest:async()=>new Uint8Array(32).fill(255).buffer}};
 await assert.rejects(Fairness.diceFromWord('0'.repeat(64),reject),/exhausted/);
});

test('storage is optional and bounded; discarded old rounds cannot reuse their nonce',async()=>{
 let stored,errors=0;
 const provider=new Fairness.DemoProvider({storage:{getItem(){throw Error('denied')},setItem(key,value){stored=value;throw Error('quota')}},onStorageError(){errors++;}});
 for(let n=1;n<=67;n++){await provider.prepare({...input,roundId:`dice-${n}`,nonce:n});provider.complete(`dice-${n}`);}
 assert.equal(provider.history.length,30);assert.equal(JSON.parse(stored).length,30);assert.ok(provider.rounds.size<=64);assert.equal(errors,68);
 await assert.rejects(provider.prepare(input));
});

test('dice locks choices during proof preparation, uses derived faces and settles once',async()=>{
 const wallet=new PointsWallet();let now=0,finished=0;
 const round=new DiceRound({fairness:make(),now:()=>now,charge:n=>wallet.charge(n,'cost'),credit:n=>wallet.credit(n,'reward'),onFinish(){finished++;}});
 assert.equal(round.start('size','small'),true);assert.equal(wallet.points,950);assert.equal(round.state,'preparing');
 assert.equal(round.start('size','big'),false);assert.equal(wallet.points,950);assert.equal(round.snapshot(wallet.points).result,null);
 await round.preparation;assert.equal(round.state,'rolling');assert.equal(round.snapshot(wallet.points).fairness.serverSeed,undefined);
 now=1600;round.tick();assert.equal(round.state,'finished');assert.equal(finished,1);
 const proof=round.snapshot(wallet.points).fairness;assert.equal((await Fairness.verify(proof)).ok,true);
 assert.deepEqual(round.result.values,proof.result.values);assert.equal(round.result.amount,proof.result.amount);assert.equal(wallet.points,950+round.result.amount);
 round.tick();assert.equal(finished,1);
});

test('crypto failure refunds once and cannot fall back to another draw',async()=>{
 const wallet=new PointsWallet();let draws=0,finished=0;
 const round=new DiceRound({fairness:{prepare:async()=>{throw Error('crypto failed')}},random:()=>{draws++;return .5},charge:n=>wallet.charge(n,'cost'),credit:n=>wallet.credit(n,'reward'),refund:n=>wallet.credit(n,'refund'),onFinish(){finished++;}});
 assert.equal(round.start('sum',12),true);await round.preparation;
 assert.equal(wallet.points,1000);assert.equal(round.state,'error');assert.equal(draws,0);assert.equal(finished,0);assert.equal(round.result,null);
 for(let i=0;i<5;i++)round.tick();assert.equal(wallet.points,1000);
 for(const [mode,target]of [['triple','anything'],['sum','12'],['size','other']])assert.equal(round.start(mode,target),false);
});

test('bridge keeps ready snapshots and balance correct while proof preparation finishes offscreen',async()=>{
 const wallet=new PointsWallet(),source={messages:[],postMessage(x){this.messages.push(x)}};
 const bridge=new GameBridge({engines:{dice:DiceRound},fairnessProviders:{dice:make()},wallet,frames:{dice:{contentWindow:source}},loadedGames:new Set(['dice']),origin:'https://test.local'});
 const event={source,origin:'https://test.local',data:{type:'dice-roll',mode:'size',target:'small',roundId:''}};
 bridge.handle(event);bridge.handle(event);assert.equal(wallet.points,950);
 const round=bridge.rounds.dice;await round.preparation;
 assert.equal(source.messages.at(-1).state,'rolling');assert.equal(source.messages.at(-1).balance,950);
 round.now=()=>round.startedAt+1600;bridge.pulse();bridge.sync('dice',true);
 assert.equal(source.messages.at(-1).fairness.state,'revealed');assert.equal(source.messages.at(-1).balance,wallet.points);
});
